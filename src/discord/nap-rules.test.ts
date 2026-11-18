import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MessageFlags,
  type APIEmbed,
  type APIModalInteractionResponseCallbackData,
  type BaseMessageOptions,
  type InteractionReplyOptions,
} from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Editor } from "../domain/exile.js";
import type { NapEvent } from "../domain/nap.js";
import { kingdomOf } from "../domain/__fixtures__/players.js";
import { openDatabase } from "../storage/database.js";
import { NapMotionStore } from "../storage/nap-motion-store.js";
import { NapRulesStore } from "../storage/nap-rules-store.js";
import { NapStore } from "../storage/nap-store.js";
import { createNapMotions, type NapMotions, type NapMotionServer } from "./nap-motions.js";
import { NAP_MOTION_APPROVE_PREFIX } from "./nap-motion-texts.js";
import { createNapRules, type NapRules, type NapRulesCommand, type NapRulesModal } from "./nap-rules.js";
import { NAP_RULES_MODAL_ID, NAP_RULES_PREFIX } from "./nap-rules-texts.js";

const HOME = kingdomOf(330);
const NOW = new Date("2026-11-18T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const OFFICER = "500000000000000005";
const R5_NML = "100000000000000001";
const R5_ABC = "100000000000000002";
const OUTSIDER = "100000000000000010";
const LEADERS = "700000000000000002";
const ANNOUNCEMENTS = "700000000000000003";
const RULES = "1. Nobody hits the farms of NaP Alliances.\n2. Disputes go to #nap-leaders.";
const CHANGE = "First rules.";

function r5(tag: string): Editor {
  return { allianceRank: { source: "game-api", rank: "R5" }, allianceKingdom: HOME, allianceTag: tag };
}

const EDITORS: Readonly<Record<string, Editor>> = { [R5_NML]: r5("NML"), [R5_ABC]: r5("ABC"), [OUTSIDER]: r5("QQQ") };

class FakeServer implements NapMotionServer {
  leaders: string | undefined = LEADERS;
  announcements: string | undefined = ANNOUNCEMENTS;
  refusePostIn: string | undefined;
  refuseLog = false;
  readonly posts: { channelId: string; message: BaseMessageOptions; id: string }[] = [];
  readonly logs: string[] = [];
  private nextId = 800000000000000001n;

  leadersChannelId(): string | undefined {
    return this.leaders;
  }
  announcementsChannelId(): string | undefined {
    return this.announcements;
  }
  post(channelId: string, message: BaseMessageOptions): Promise<string> {
    if (this.refusePostIn === channelId) return Promise.reject(new Error("Missing Permissions"));
    const id = this.nextId.toString();
    this.nextId += 1n;
    this.posts.push({ channelId, message, id });
    return Promise.resolve(id);
  }
  edit(): Promise<boolean> {
    return Promise.resolve(true);
  }
  postsIn(channelId: string): { channelId: string; message: BaseMessageOptions; id: string }[] {
    return this.posts.filter((post) => post.channelId === channelId);
  }
  log(line: string): Promise<void> {
    if (this.refuseLog) return Promise.reject(new Error("Missing Access"));
    this.logs.push(line);
    return Promise.resolve();
  }
}

interface Replies {
  readonly replies: InteractionReplyOptions[];
  readonly modals: APIModalInteractionResponseCallbackData[];
}

function command(userId: string, version: number | null = null): NapRulesCommand & Replies {
  const replies: InteractionReplyOptions[] = [];
  const modals: APIModalInteractionResponseCallbackData[] = [];
  return {
    user: { id: userId },
    options: { getInteger: (name) => (name === "version" ? version : null) },
    reply: (options) => {
      replies.push(options);
      return Promise.resolve();
    },
    showModal: (modal) => {
      modals.push(modal);
      return Promise.resolve();
    },
    replies,
    modals,
  };
}

function modal(userId: string, text: string, change: string): NapRulesModal & { readonly replies: InteractionReplyOptions[] } {
  const replies: InteractionReplyOptions[] = [];
  return {
    customId: NAP_RULES_MODAL_ID,
    user: { id: userId },
    fields: { getTextInputValue: (id) => (id === "text" ? text : id === "change" ? change : "") },
    reply: (options) => {
      replies.push(options);
      return Promise.resolve();
    },
    replies,
  };
}

function joinedEvent(tag: string, at: Date): NapEvent {
  return { kind: "joined", tag, requestedBy: R5_NML, requestedAt: at, decision: { as: "officer", by: OFFICER }, at };
}

function contentOf(reply: InteractionReplyOptions | BaseMessageOptions | undefined): string {
  return typeof reply?.content === "string" ? reply.content : "";
}

function embedOf(reply: InteractionReplyOptions | undefined): APIEmbed {
  const [embed] = (reply?.embeds ?? []) as APIEmbed[];
  if (embed === undefined) throw new Error("no embed");
  return embed;
}

describe("createNapRules", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let nap: NapStore;
  let motionStore: NapMotionStore;
  let store: NapRulesStore;
  let server: FakeServer;
  let now: Date;
  let errors: string[];
  let motions: NapMotions;
  let rules: NapRules;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-nap-rules-"));
    db = openDatabase(dataDir);
    nap = new NapStore(db);
    motionStore = new NapMotionStore(db);
    store = new NapRulesStore(db);
    server = new FakeServer();
    now = NOW;
    errors = [];
    for (const tag of ["NML", "ABC"]) nap.append(joinedEvent(tag, new Date(NOW.getTime() - 10 * 24 * HOUR)));
    motions = createNapMotions({
      store: motionStore,
      napHistory: () => nap.history(),
      links: { all: () => Object.keys(EDITORS).map((memberId) => ({ memberId })) },
      knownAlliances: { all: () => [] },
      editorOf: (memberId) => EDITORS[memberId],
      server,
      homeKingdom: HOME,
      now: () => now,
      logError: (line) => errors.push(line),
    });
    rules = createNapRules({
      store,
      motions,
      motionOf: (id) => motionStore.get(id),
      server,
      now: () => now,
      logError: (line) => errors.push(line),
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** Proposes a version as R5_NML and gives the id of its NaP Motion. */
  async function proposeOne(text = RULES, change = CHANGE): Promise<number> {
    await rules.submit(modal(R5_NML, text, change));
    const motion = store.versions().at(-1)?.motion;
    if (motion === undefined) throw new Error("no version was put to a motion");
    return motion;
  }

  /** Lets the motion's vote run out with the given votes, and ticks the motions and then the rules. */
  async function closeMotion(id: number, approve: boolean): Promise<void> {
    if (approve) {
      await motions.vote({ customId: `${NAP_MOTION_APPROVE_PREFIX}${id.toString()}`, user: { id: R5_NML }, reply: () => Promise.resolve() });
    }
    now = new Date(NOW.getTime() + 49 * HOUR);
    await motions.tick();
    await rules.tick();
  }

  describe("propose", () => {
    test("a NaP Council member gets the form, prefilled with the rules in effect", async () => {
      const first = command(R5_NML);
      await rules.propose(first);
      expect(first.modals[0]?.custom_id.startsWith(NAP_RULES_PREFIX)).toBe(true);
      expect(JSON.stringify(first.modals[0])).not.toContain('"value"');

      await closeMotion(await proposeOne(), true);
      const second = command(R5_ABC);
      await rules.propose(second);
      expect(JSON.stringify(second.modals[0])).toContain(JSON.stringify(RULES));
    });

    test("someone outside the NaP Council is refused privately, at the command and at the form", async () => {
      const refused = command(OUTSIDER);
      await rules.propose(refused);
      expect(refused.modals).toEqual([]);
      expect(refused.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(contentOf(refused.replies[0])).toContain("NaP Council");

      const submitted = modal(OUTSIDER, RULES, CHANGE);
      await rules.submit(submitted);
      expect(store.versions()).toEqual([]);
      expect(contentOf(submitted.replies[0])).toContain("NaP Council");
    });

    test("saves version 1 and opens a NaP Motion naming it and what changed, answered privately and logged with the proposer", async () => {
      const submitted = modal(R5_NML, `  ${RULES}  `, `  ${CHANGE}  `);
      await rules.submit(submitted);

      const [version] = store.versions();
      expect(version).toMatchObject({ number: 1, text: RULES, change: CHANGE, proposedBy: R5_NML, status: { kind: "proposed" } });
      const motion = version?.motion === undefined ? undefined : motionStore.get(version.motion);
      expect(motion?.text).toContain("NaP Rules version 1");
      expect(motion?.text).toContain(CHANGE);
      expect(motion?.text).toContain("/nap rules-history version:1");
      expect(server.postsIn(LEADERS)).toHaveLength(1);
      expect(submitted.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(contentOf(submitted.replies[0])).toContain("version 1");
      expect(server.logs.some((line) => line.includes(`<@${R5_NML}>`) && line.includes("version 1"))).toBe(true);
      expect(server.postsIn(ANNOUNCEMENTS)).toEqual([]);
    });

    test.each([
      ["an empty text", "   ", CHANGE],
      ["an empty change note", RULES, "  "],
    ])("%s is refused privately", async (_what, text, change) => {
      const submitted = modal(R5_NML, text, change);
      await rules.submit(submitted);
      expect(store.versions()).toEqual([]);
      expect(submitted.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(server.posts).toEqual([]);
    });

    test("a text equal to the rules in effect is refused", async () => {
      await closeMotion(await proposeOne(), true);
      const same = modal(R5_ABC, ` ${RULES} `, "Nothing really.");
      await rules.submit(same);
      expect(store.versions()).toHaveLength(1);
      expect(contentOf(same.replies[0])).toContain("same");
    });

    test("a second proposal is refused while one is open, naming the open version", async () => {
      await proposeOne();
      const asked = command(R5_ABC);
      await rules.propose(asked);
      expect(asked.modals).toEqual([]);
      expect(contentOf(asked.replies[0])).toContain("version 1");

      const submitted = modal(R5_ABC, "Other rules", "Other.");
      await rules.submit(submitted);
      expect(store.versions()).toHaveLength(1);
      expect(contentOf(submitted.replies[0])).toContain("version 1");
    });

    test.each([
      ["#nap-leaders is missing", (server: FakeServer) => (server.leaders = undefined)],
      ["#nap-leaders refuses the post", (server: FakeServer) => (server.refusePostIn = LEADERS)],
    ])("a NaP Motion that cannot be opened because %s leaves no open version and logs one line", async (_why, breakIt) => {
      breakIt(server);
      const submitted = modal(R5_NML, RULES, CHANGE);
      await rules.submit(submitted);
      expect(store.versions()).toEqual([]);
      expect(motionStore.open()).toEqual([]);
      expect(submitted.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(server.logs).toHaveLength(1);
      expect(server.logs[0]).toContain(`<@${R5_NML}>`);
    });
  });

  describe("the outcome of the NaP Motion", () => {
    test("approved: the version takes effect and is announced in #nap-announcements, plain, mentions off, naming nobody", async () => {
      await closeMotion(await proposeOne(), true);

      const [version] = store.versions();
      expect(version?.status).toEqual({ kind: "approved", decidedAt: now });
      // The NaP Motion's own decision log (ADR 25) is posted there too; the rules announcement is the one saying "now in effect".
      const posts = server.postsIn(ANNOUNCEMENTS).filter((post) => contentOf(post.message).includes("now in effect"));
      expect(posts).toHaveLength(1);
      const content = contentOf(posts[0]?.message);
      expect(content).toContain("now in effect");
      expect(content).toContain("What changed");
      expect(content).toContain(CHANGE);
      expect(content).toContain(RULES);
      expect(content).not.toContain(R5_NML);
      expect(posts[0]?.message.embeds).toBeUndefined();
      expect(posts[0]?.message.allowedMentions).toEqual({ parse: [] });
      expect(server.logs.some((line) => line.includes("version 1") && line.includes("approved"))).toBe(true);
    });

    test("an announcement over 2000 characters is split into several messages", async () => {
      const long = Array.from({ length: 60 }, (_, index) => `${(index + 1).toString()}. ${"Rule text ".repeat(6)}`).join("\n").trim();
      await closeMotion(await proposeOne(long), true);
      const posts = server.postsIn(ANNOUNCEMENTS).filter((post) => !contentOf(post.message).includes("NaP Motion #"));
      expect(posts.length).toBeGreaterThan(1);
      for (const post of posts) expect(contentOf(post.message).length).toBeLessThanOrEqual(2000);
      expect(posts.map((post) => contentOf(post.message)).join("\n")).toContain(long);
    });

    test.each([
      ["missing", (server: FakeServer) => (server.announcements = undefined)],
      ["refusing", (server: FakeServer) => (server.refusePostIn = ANNOUNCEMENTS)],
    ])("a %s #nap-announcements still leaves the version in effect and writes a #neil-log line", async (_how, breakIt) => {
      const motion = await proposeOne();
      breakIt(server);
      await closeMotion(motion, true);
      expect(store.versions()[0]?.status.kind).toBe("approved");
      expect(server.logs.some((line) => line.includes("NaP Rules version 1") && line.includes("#nap-announcements"))).toBe(true);
    });

    test("rejected: kept as rejected, the old rules stay, and no rules announcement is posted in #nap-announcements", async () => {
      await closeMotion(await proposeOne(), true);
      now = NOW;
      const second = await proposeOne("New rules", "Everything new.");
      await closeMotion(second, false);

      expect(store.versions()[1]?.status.kind).toBe("rejected");
      const shown = command(R5_ABC);
      await rules.show(shown);
      expect(embedOf(shown.replies[0]).title).toContain("version 1");
      expect(server.postsIn(ANNOUNCEMENTS).some((post) => contentOf(post.message).includes("version 2 are now in effect"))).toBe(false);
      expect(server.logs.some((line) => line.includes("version 2") && line.includes("rejected"))).toBe(true);
    });

    test("a repeated outcome changes nothing", async () => {
      const motion = await proposeOne();
      await closeMotion(motion, true);
      const posts = server.posts.length;
      const logs = server.logs.length;
      await rules.settle(motion, "rejected");
      await rules.settle(motion, "approved");
      await rules.tick();
      expect(store.versions()[0]?.status.kind).toBe("approved");
      expect(server.posts).toHaveLength(posts);
      expect(server.logs).toHaveLength(logs);
    });

    test("a refused #neil-log goes to the error log and never stops the decision", async () => {
      const motion = await proposeOne();
      server.refuseLog = true;
      await closeMotion(motion, true);
      expect(store.versions()[0]?.status.kind).toBe("approved");
      expect(errors.some((line) => line.includes("NaP Rules"))).toBe(true);
    });
  });

  describe("show", () => {
    test("says privately that there are no rules yet", async () => {
      const shown = command(OUTSIDER);
      await rules.show(shown);
      expect(shown.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(contentOf(shown.replies[0])).toContain("no rules yet");
    });

    test("shows the version in effect privately with since when, and the open proposal's number", async () => {
      await closeMotion(await proposeOne(), true);
      const decidedAt = now;
      await proposeOne("New rules", "Everything new.");
      const shown = command(OUTSIDER);
      await rules.show(shown);
      expect(shown.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      const embed = embedOf(shown.replies[0]);
      expect(embed.title).toContain("version 1");
      expect(embed.description).toBe(RULES);
      expect(JSON.stringify(embed.fields)).toContain(`<t:${(decidedAt.getTime() / 1000).toString()}:f>`);
      expect(JSON.stringify(embed.fields)).toContain("Version 2");
    });
  });

  describe("history", () => {
    test("lists every version newest first with its state, and names no Member", async () => {
      await closeMotion(await proposeOne(), true);
      now = NOW;
      await closeMotion(await proposeOne("Second rules", "Second."), true);
      now = NOW;
      await closeMotion(await proposeOne("Third rules", "Third."), false);
      now = NOW;
      await proposeOne("Fourth rules", "Fourth.");

      const listed = command(OUTSIDER);
      await rules.history(listed);
      expect(listed.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      const description = embedOf(listed.replies[0]).description ?? "";
      const order = ["Version 4", "Version 3", "Version 2", "Version 1"].map((label) => description.indexOf(label));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(description).toMatch(/Version 4\*\* · proposed/u);
      expect(description).toMatch(/Version 3\*\* · rejected/u);
      expect(description).toMatch(/Version 2\*\* · in effect/u);
      expect(description).toMatch(/Version 1\*\* · replaced/u);
      expect(description).not.toContain(R5_NML);
      expect(description).not.toContain("<@");
    });

    test("cuts a long history to fit the embed, saying how many are left out", async () => {
      for (let index = 1; index <= 12; index += 1) {
        now = NOW;
        await closeMotion(await proposeOne(`Rules ${index.toString()}`, "x".repeat(480)), false);
      }
      const listed = command(OUTSIDER);
      await rules.history(listed);
      const description = embedOf(listed.replies[0]).description ?? "";
      expect(description.length).toBeLessThanOrEqual(4096);
      expect(description).toContain("older versions are not shown");
    });

    test("shows one version's full text by number, also a proposed one, or says there is no such version", async () => {
      await proposeOne();
      const one = command(OUTSIDER, 1);
      await rules.history(one);
      const embed = embedOf(one.replies[0]);
      expect(embed.description).toBe(RULES);
      expect(embed.title).toContain("proposed");
      expect(JSON.stringify(embed)).not.toContain(R5_NML);

      const none = command(OUTSIDER, 9);
      await rules.history(none);
      expect(none.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(contentOf(none.replies[0])).toContain("no NaP Rules version 9");
    });
  });
});
