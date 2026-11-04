import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  MessageFlags,
  type APIEmbed,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
} from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { utcDayOf } from "../domain/daily-quota.js";
import { exileReasonOf, type Exile, type ExileReason } from "../domain/exile.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import { openDatabase } from "../storage/database.js";
import { ReaperStore } from "../storage/reaper-store.js";
import { FakeReaperInteraction } from "./__fakes__/reaper-interaction.js";
import { FakeReaperPageInteraction } from "./__fakes__/reaper-page-interaction.js";
import { ReaperPages, type ReaperPageContent } from "./reaper-pages.js";
import { handleReaperList, handleReaperPage } from "./reaper.js";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`the test Kingdom ${number.toString()} is not a valid Kingdom`);
  return parsed.value;
}

function reasonOf(text: string): ExileReason {
  const parsed = exileReasonOf(text);
  if (!parsed.ok) throw new Error(`the test reason "${text}" must be accepted`);
  return parsed.value;
}

const HOME = kingdomOf(330);
const OTHER_KINGDOM = kingdomOf(12);
const VIEWER_ID = "222222222222222222";
const OTHER_VIEWER_ID = "333333333333333333";
const ADDER_ID = "310000000000000001";
const NOW = new Date("2026-11-04T16:00:00Z");
const EARLIER = new Date("2026-11-01T12:00:00Z");
const ONE_HOUR_MS = 60 * 60_000;
const LIST_PAGE_SIZE = 20;

/** An Exile as the store keeps it: no position, added by an R5 who is never shown. */
function exileOf(uid: Uid, name: string, kingdom: KingdomNumber, addedAt: Date, reason: string): Exile {
  return {
    uid,
    name,
    kingdom,
    position: undefined,
    positionAt: undefined,
    reason: reasonOf(reason),
    addedAt,
    addedBy: ADDER_ID,
  };
}

/** The Exile numbered index in the 25 stored by the paging tests, added an hour after the one before it. */
function numberedExile(index: number): Exile {
  const padded = index.toString().padStart(2, "0");
  const uid = uidOf(`145563254${padded}1`);
  return exileOf(uid, `Exile ${padded}`, HOME, new Date(EARLIER.getTime() + index * ONE_HOUR_MS), `Reason ${padded}`);
}

/** The context of the list: the store, the listings and the clock, and a Game API that must not be asked anything. */
function listContext(store: ReaperStore, pages: ReaperPages<ReaperPageContent>) {
  const getPlayer = vi.fn<(uid: Uid) => Promise<never>>(() =>
    Promise.reject(new Error("no Game API request was expected")),
  );
  return { context: { reaper: store, pages, now: () => NOW, gameApi: { getPlayer } }, getPlayer };
}

/** The context a page button is handled with: the listings opened, and the clock the press is answered at. */
function pageContext(pages: ReaperPages<ReaperPageContent>, now: Date) {
  return { pages, now: () => now };
}

/** Every answer the handler sent with reply or editReply, in order. */
function answersOf(interaction: FakeReaperInteraction): (InteractionReplyOptions | InteractionEditReplyOptions)[] {
  return interaction.calls.flatMap((call) =>
    call.method === "reply" || call.method === "editReply" ? [call.options] : [],
  );
}

/** The last answer the handler sent with reply or editReply. */
function lastAnswerOf(interaction: FakeReaperInteraction): InteractionReplyOptions | InteractionEditReplyOptions {
  const last = answersOf(interaction).at(-1);
  if (last === undefined) throw new Error("the handler did not answer");
  return last;
}

/** The embeds of an answer, as Discord receives them. */
function embedsOf(embeds: InteractionEditReplyOptions["embeds"] | undefined): APIEmbed[] {
  return (embeds ?? []).map((embed) => ("toJSON" in embed ? embed.toJSON() : embed));
}

/** The lines of the list's embed: one line per Exile on the page. */
function listLinesOf(embeds: InteractionEditReplyOptions["embeds"] | undefined): string[] {
  const [list] = embedsOf(embeds);
  return list?.description?.split("\n") ?? [];
}

/** The line of the list that names the Exile; a test fails when there is none. */
function lineOf(lines: readonly string[], name: string): string {
  const line = lines.find((candidate) => candidate.includes(name));
  if (line === undefined) throw new Error(`no line of the list names ${name}`);
  return line;
}

/** The text of every answer that is not a deferral. */
function textsOf(interaction: FakeReaperInteraction): string[] {
  return interaction.calls.flatMap((call) => (call.method === "deferReply" ? [] : [call.options.content ?? ""]));
}

/** The session id of the page buttons of the list, read from the custom id of its Next button. */
function sessionIdOf(answer: InteractionReplyOptions | InteractionEditReplyOptions): string {
  const match = /"custom_id":"reaper:([^:"]+):page:1"/.exec(JSON.stringify(answer.components ?? []));
  const sessionId = match?.[1];
  if (sessionId === undefined) throw new Error("the list has no Next button to page to");
  return sessionId;
}

/** The last redraw of a page button: the list the Member sees after the press. */
function updateOf(press: FakeReaperPageInteraction): InteractionUpdateOptions {
  const updates = press.calls.flatMap((call) => (call.method === "update" ? [call.options] : []));
  const last = updates[updates.length - 1];
  if (last === undefined) throw new Error("the page button did not redraw the list");
  return last;
}

describe("handleReaperList", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: ReaperStore;
  let pages: ReaperPages<ReaperPageContent>;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-reaper-list-"));
    db = openDatabase(dataDir);
    store = new ReaperStore(db);
    pages = new ReaperPages<ReaperPageContent>();
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("answers privately, with an ephemeral reply or deferral first", async () => {
    store.add(exileOf(uidOf("145563254701"), "Far", OTHER_KINGDOM, EARLIER, "Greedy"));
    const { context } = listContext(store, pages);
    const interaction = new FakeReaperInteraction({}, VIEWER_ID);

    await handleReaperList(interaction, context);

    expect(interaction.calls[0]).toMatchObject({ options: { flags: MessageFlags.Ephemeral } });
  });

  test("makes no Game API request", async () => {
    store.add(exileOf(uidOf("145563254701"), "Far", OTHER_KINGDOM, EARLIER, "Greedy"));
    const { context, getPlayer } = listContext(store, pages);
    const interaction = new FakeReaperInteraction({}, VIEWER_ID);

    await handleReaperList(interaction, context);

    expect(getPlayer).not.toHaveBeenCalled();
  });

  test("gives each Exile a line with its name, Kingdom, reason and the day it was added", async () => {
    store.add(exileOf(uidOf("145563254701"), "Far", OTHER_KINGDOM, EARLIER, "Greedy"));
    const { context } = listContext(store, pages);
    const interaction = new FakeReaperInteraction({}, VIEWER_ID);

    await handleReaperList(interaction, context);

    const line = lineOf(listLinesOf(lastAnswerOf(interaction).embeds), "Far");
    expect(line).toContain("Far");
    expect(line).toContain("12");
    expect(line).toContain("Greedy");
    expect(line).toContain(utcDayOf(EARLIER));
  });

  test("lists the newest Exile first", async () => {
    store.add(exileOf(uidOf("145563254701"), "Oldest", HOME, EARLIER, "Reason"));
    store.add(exileOf(uidOf("145563254702"), "Middle", HOME, new Date(EARLIER.getTime() + ONE_HOUR_MS), "Reason"));
    store.add(exileOf(uidOf("145563254703"), "Newest", HOME, new Date(EARLIER.getTime() + 2 * ONE_HOUR_MS), "Reason"));
    const { context } = listContext(store, pages);
    const interaction = new FakeReaperInteraction({}, VIEWER_ID);

    await handleReaperList(interaction, context);

    const lines = listLinesOf(lastAnswerOf(interaction).embeds);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Newest");
    expect(lines[1]).toContain("Middle");
    expect(lines[2]).toContain("Oldest");
  });

  test("never shows the Member who added an Exile", async () => {
    store.add(exileOf(uidOf("145563254701"), "Far", OTHER_KINGDOM, EARLIER, "Greedy"));
    const { context } = listContext(store, pages);
    const interaction = new FakeReaperInteraction({}, VIEWER_ID);

    await handleReaperList(interaction, context);

    expect(JSON.stringify(interaction.calls)).not.toContain(ADDER_ID);
  });

  test("says REAPER is empty when no Exile is stored", async () => {
    const { context } = listContext(store, pages);
    const interaction = new FakeReaperInteraction({}, VIEWER_ID);

    await handleReaperList(interaction, context);

    expect(textsOf(interaction)).toContain("REAPER is empty.");
  });

  test("shows 20 lines per page and offers a Next button to the rest", async () => {
    for (let index = 0; index < 25; index += 1) store.add(numberedExile(index));
    const { context } = listContext(store, pages);
    const interaction = new FakeReaperInteraction({}, VIEWER_ID);

    await handleReaperList(interaction, context);

    const lines = listLinesOf(lastAnswerOf(interaction).embeds);
    expect(lines).toHaveLength(LIST_PAGE_SIZE);
    expect(lines[0]).toContain("Exile 24");
    expect(lines[LIST_PAGE_SIZE - 1]).toContain("Exile 05");
    expect(JSON.stringify(lastAnswerOf(interaction).components ?? [])).toMatch(
      /"custom_id":"reaper:[^"]+:page:1"/,
    );
  });

  test("a page button by the viewer shows the rest of the list, with no Game API request", async () => {
    for (let index = 0; index < 25; index += 1) store.add(numberedExile(index));
    const { context, getPlayer } = listContext(store, pages);
    const interaction = new FakeReaperInteraction({}, VIEWER_ID);
    await handleReaperList(interaction, context);
    const press = new FakeReaperPageInteraction({
      customId: `reaper:${sessionIdOf(lastAnswerOf(interaction))}:page:1`,
      userId: VIEWER_ID,
    });

    await handleReaperPage(press, pageContext(pages, NOW));

    const lines = listLinesOf(updateOf(press).embeds);
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("Exile 04");
    expect(lines[4]).toContain("Exile 00");
    expect(getPlayer).not.toHaveBeenCalled();
  });

  test("a page button by any other Member is refused privately and changes nothing", async () => {
    for (let index = 0; index < 25; index += 1) store.add(numberedExile(index));
    const { context } = listContext(store, pages);
    const interaction = new FakeReaperInteraction({}, VIEWER_ID);
    await handleReaperList(interaction, context);
    const press = new FakeReaperPageInteraction({
      customId: `reaper:${sessionIdOf(lastAnswerOf(interaction))}:page:1`,
      userId: OTHER_VIEWER_ID,
    });

    await handleReaperPage(press, pageContext(pages, NOW));

    expect(press.calls).toHaveLength(1);
    expect(press.calls[0]).toMatchObject({ method: "reply", options: { flags: MessageFlags.Ephemeral } });
  });
});
