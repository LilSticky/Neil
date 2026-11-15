import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  MessageFlags,
  type APIEmbed,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { exileReasonOf, type Exile, type Position } from "../domain/exile.js";
import type { Link } from "../domain/link.js";
import {
  parseAllianceKey,
  parseKingdom,
  parseUid,
  type AllianceKey,
  type KingdomNumber,
  type Uid,
} from "../domain/lookup-input.js";
import type { MemberId } from "../domain/rank-approval.js";
import { type Alliance, type LookupResult, type Player, type RosterEntry } from "../domain/player.js";
import type { LookupCaller } from "../game-api/allowance-keeper.js";
import type { ChargedResult } from "../game-api/client.js";
import { openDatabase } from "../storage/database.js";
import { ReaperStore } from "../storage/reaper-store.js";
import { FakeGameApi } from "./__fakes__/game-api.js";
import { FakeLookAgainInteraction } from "./__fakes__/look-again-interaction.js";
import { FakeUsage, FAKE_USED_BEFORE, usageLineFor } from "./__fakes__/usage.js";
import { lookAgainRow, lookupMessages } from "./lookup-cards.js";
import {
  handleLookAgain,
  lookAgainCustomId,
  parseLookAgainCustomId,
  type LookAgainContext,
  type LookAgainTarget,
} from "./look-again.js";
import { PickSessions } from "./pick-sessions.js";
import { ReaperPages, type ReaperPageContent } from "./reaper-pages.js";
import { refusalMessage } from "./usage-texts.js";

const OWNER_ID = "310000000000000001";
/** The largest owner id Discord gives: a snowflake of 20 digits. */
const TWENTY_DIGIT_OWNER_ID = "12345678901234567890";
const UID = "145563254785";
const CUSTOM_ID_MAX_LENGTH = 100;

function uid(text: string): Uid {
  const parsed = parseUid(text);
  if (!parsed.ok) throw new Error(`test uid "${text}" is not a valid uid`);
  return parsed.value;
}

function kingdom(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} is not valid`);
  return parsed.value;
}

function tag(text: string): AllianceKey {
  const parsed = parseAllianceKey(text);
  if (!parsed.ok) throw new Error(`test Alliance key "${text}" is not valid`);
  return parsed.value;
}

/** One target of every kind the Look again button can repeat. */
const TARGETS: readonly { readonly label: string; readonly target: LookAgainTarget }[] = [
  { label: "a Player card", target: { kind: "player", uid: uid(UID) } },
  { label: "an Alliance card", target: { kind: "alliance", kingdom: kingdom(330), tag: tag("NML") } },
  { label: "an Alliance Overview", target: { kind: "overview", kingdom: kingdom(330), tag: tag("NML") } },
  { label: "/reaper closest without coordinates", target: { kind: "reaper" } },
  { label: "/reaper closest with coordinates", target: { kind: "reaper", origin: { x: 12, y: 34 } } },
  { label: "/reaper closest with all:true without coordinates", target: { kind: "reaper", all: true } },
  { label: "/reaper closest with all:true and coordinates", target: { kind: "reaper", all: true, origin: { x: 12, y: 34 } } },
];

describe("lookAgainCustomId", () => {
  test("writes a Player card's target as the owner, then p and the uid", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "player", uid: uid(UID) })).toBe(`again:${OWNER_ID}:p:${UID}`);
  });

  test("writes an Alliance card's target as the owner, then a, the Kingdom and the tag", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "alliance", kingdom: kingdom(330), tag: tag("NML") })).toBe(
      `again:${OWNER_ID}:a:330:NML`,
    );
  });

  test("writes an Alliance Overview's target as the owner, then o, the Kingdom and the tag", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "overview", kingdom: kingdom(330), tag: tag("NML") })).toBe(
      `again:${OWNER_ID}:o:330:NML`,
    );
  });

  test("writes /reaper closest without coordinates as the owner, then r alone", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "reaper" })).toBe(`again:${OWNER_ID}:r`);
  });

  test("writes /reaper closest with coordinates as the owner, then r, x and y", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "reaper", origin: { x: 12, y: 34 } })).toBe(`again:${OWNER_ID}:r:12:34`);
  });

  test("writes /reaper closest with all:true without coordinates as the owner, then ra alone", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "reaper", all: true })).toBe(`again:${OWNER_ID}:ra`);
  });

  test("writes /reaper closest with all:true and coordinates as the owner, then ra, x and y", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "reaper", all: true, origin: { x: 12, y: 34 } })).toBe(
      `again:${OWNER_ID}:ra:12:34`,
    );
  });
});

describe("parseLookAgainCustomId", () => {
  test.each(TARGETS)("reads back the id of $label, with the owner who pressed it", ({ target }) => {
    const customId = lookAgainCustomId(OWNER_ID, target);

    expect(parseLookAgainCustomId(customId)).toEqual({ ownerId: OWNER_ID, target });
  });

  test.each([
    { label: "a pick list id", customId: "pick:a1b2c3d4:select" },
    { label: "an Overview id", customId: "overview:a1b2c3d4e5f60718:m:0" },
    { label: "a prefix other than again", customId: `agen:${OWNER_ID}:p:${UID}` },
    { label: "no prefix at all", customId: `${OWNER_ID}:p:${UID}` },
    { label: "an unknown kind", customId: `again:${OWNER_ID}:x:${UID}` },
    { label: "no kind", customId: `again:${OWNER_ID}` },
    { label: "a Player card without a uid", customId: `again:${OWNER_ID}:p` },
    { label: "a Player card with an empty uid", customId: `again:${OWNER_ID}:p:` },
    { label: "an Alliance card without a tag", customId: `again:${OWNER_ID}:a:330` },
    { label: "an Alliance card with an empty tag", customId: `again:${OWNER_ID}:a:330:` },
    { label: "a /reaper closest with only x", customId: `again:${OWNER_ID}:r:12` },
    { label: "a /reaper closest with all:true and only x", customId: `again:${OWNER_ID}:ra:12` },
    { label: "a /reaper closest with all:true and an x that is not a number", customId: `again:${OWNER_ID}:ra:x:34` },
    { label: "a Player card with a uid that is not digits", customId: `again:${OWNER_ID}:p:14556abc` },
    { label: "an Alliance card with a Kingdom that is not a number", customId: `again:${OWNER_ID}:a:kingdom:NML` },
    { label: "an Overview with a Kingdom that is not a number", customId: `again:${OWNER_ID}:o:x3:NML` },
    { label: "/reaper closest with an x that is not a number", customId: `again:${OWNER_ID}:r:x:34` },
    { label: "/reaper closest with a y that is not a number", customId: `again:${OWNER_ID}:r:12:y` },
  ])("returns undefined for $label", ({ customId }) => {
    expect(parseLookAgainCustomId(customId)).toBeUndefined();
  });
});

describe("Look again custom ids", () => {
  test.each(TARGETS)(
    "stay within Discord's 100 characters for $label, with a 20-digit owner and a 12-digit uid",
    ({ target }) => {
      const customId = lookAgainCustomId(TWENTY_DIGIT_OWNER_ID, target);

      expect(customId.length).toBeLessThanOrEqual(CUSTOM_ID_MAX_LENGTH);
    },
  );
});

// ---- handleLookAgain: the press of a Look again button ----

/** One Player read of the Look again press on /reaper closest, as the Game API answers a charged read. */
type ReadPlayer = (uid: Uid) => Promise<ChargedResult<Player>>;

const HOME = kingdom(330);
const ALLIANCE_KEY = tag("NML");
const OTHER_MEMBER_ID = "310000000000000002";
const ADDER_ID = "310000000000000003";
const NOW = new Date("2026-11-15T12:00:00Z");
/** A map time 44 minutes before NOW: old. */
const OLD_AS_OF = new Date("2026-11-15T11:16:00Z");
/** A map time 2 minutes before NOW: fresh. */
const FRESH_AS_OF = new Date("2026-11-15T11:58:00Z");
const EARLIER = new Date("2026-11-01T12:00:00Z");
const RESETS_AT = new Date("2026-11-16T00:00:00Z");
const ALLOWANCE = 3;
const CALLER_UID = uid("145563254700");
const NEAR = uid("145563254781");
const NOT_OWNER_TEXT = "Only the Member who ran this command can use this button. Run it yourself.";
const OWNER: LookupCaller = { memberId: OWNER_ID, officer: false };
const LINE = usageLineFor(OWNER, FAKE_USED_BEFORE);

const PLAYER: Player = {
  uid: uid(UID),
  name: "DrLOL",
  kingdom: HOME,
  might: 15902728,
  sanctuaryLevel: 42,
  alliance: undefined,
  allianceRank: undefined,
};

const ROSTER: readonly RosterEntry[] = [
  {
    uid: uid("100000000001"),
    name: "M01",
    allianceRank: "R4",
    kingdom: undefined,
    sanctuaryLevel: undefined,
    weeklyActivity: undefined,
    dailyHonor: undefined,
    dailyTech: undefined,
    online: undefined,
    lastOnlineAt: undefined,
  },
];

const NML: Alliance = {
  tag: "NML",
  name: "No Man's Land",
  kingdom: HOME,
  might: 208815434,
  memberCount: 1,
  capacity: 100,
  leaderName: "M01",
  roster: ROSTER,
};

const PLAYER_ID = lookAgainCustomId(OWNER_ID, { kind: "player", uid: uid(UID) });
const ALLIANCE_ID = lookAgainCustomId(OWNER_ID, { kind: "alliance", kingdom: HOME, tag: ALLIANCE_KEY });
const OVERVIEW_ID = lookAgainCustomId(OWNER_ID, { kind: "overview", kingdom: HOME, tag: ALLIANCE_KEY });
const REAPER_ID = lookAgainCustomId(OWNER_ID, { kind: "reaper" });

interface Answers {
  readonly player?: LookupResult<Player>;
  readonly alliance?: LookupResult<Alliance>;
  readonly refusedUntil?: Date;
}

/** A context over a fake Game API that answers the given results, with a Daily Allowance of ALLOWANCE and a usage line. */
function contextWith(answers: Answers = {}) {
  const logged: string[] = [];
  const gameApi = new FakeGameApi({
    ...(answers.player === undefined ? {} : { player: answers.player }),
    ...(answers.alliance === undefined ? {} : { alliance: answers.alliance }),
    refusedUntil: answers.refusedUntil,
  });
  const usage = new FakeUsage();
  const pickSessions = new PickSessions();
  const context: LookAgainContext = {
    gameApi,
    pickSessions,
    now: () => NOW,
    logError: (message: string) => {
      logged.push(message);
    },
    officerRoleIds: [],
    allowance: () => ALLOWANCE,
    usage: usage.usage,
    links: { linkFor: vi.fn<(memberId: MemberId) => Link | undefined>(() => undefined) },
    reaper: { inKingdom: () => [], refresh: () => undefined },
    pages: new ReaperPages<ReaperPageContent>(),
    homeKingdom: HOME,
  };
  return { context, gameApi, pickSessions, logged };
}

function pressOf(customId: string, userId: string = OWNER_ID): FakeLookAgainInteraction {
  return new FakeLookAgainInteraction({ customId, userId });
}

function methodsOf(press: FakeLookAgainInteraction): string[] {
  return press.calls.map((call) => call.method);
}

/** The last edit of the pressed message: the card the Member sees after the press. */
function editOf(press: FakeLookAgainInteraction): InteractionEditReplyOptions {
  const edits = press.calls.flatMap((call) => (call.method === "editReply" ? [call.options] : []));
  const last = edits[edits.length - 1];
  if (last === undefined) throw new Error("the handler did not edit the pressed message");
  return last;
}

/** The last private follow-up the handler sent. */
function followUpOf(press: FakeLookAgainInteraction): InteractionReplyOptions {
  const follow = press.calls.flatMap((call) => (call.method === "followUp" ? [call.options] : []));
  const last = follow[follow.length - 1];
  if (last === undefined) throw new Error("the handler did not send a private follow-up");
  return last;
}

function embedsOf(options: { readonly embeds?: InteractionEditReplyOptions["embeds"] }): APIEmbed[] {
  return (options.embeds ?? []).map((embed) => ("toJSON" in embed ? embed.toJSON() : embed));
}

function playerFound(player: Player, asOf: Date | undefined): LookupResult<Player> {
  return { kind: "found", value: player, asOf };
}

function allianceFound(alliance: Alliance, asOf: Date | undefined): LookupResult<Alliance> {
  return { kind: "found", value: alliance, asOf };
}

describe("handleLookAgain for a Member who did not run the lookup", () => {
  test("answers privately that only the Member who ran the command can press, without asking the Game API", async () => {
    const { context, gameApi } = contextWith({ player: playerFound(PLAYER, OLD_AS_OF) });
    const press = pressOf(PLAYER_ID, OTHER_MEMBER_ID);

    await handleLookAgain(press, context);

    expect(press.calls).toHaveLength(1);
    expect(press.calls[0]).toMatchObject({
      method: "reply",
      options: { content: NOT_OWNER_TEXT, flags: MessageFlags.Ephemeral },
    });
    expect(gameApi.chargedTo).not.toHaveBeenCalled();
  });
});

describe("handleLookAgain for a custom id it cannot read", () => {
  test.each([
    { label: "an unknown kind", customId: `again:${OWNER_ID}:x:${UID}` },
    { label: "a Player card without a uid", customId: `again:${OWNER_ID}:p` },
    { label: "an Alliance card without a tag", customId: `again:${OWNER_ID}:a:330` },
    { label: "the custom id of another button", customId: "pick:a1b2c3d4:select" },
  ])("answers privately that lookups are not working for $label, without asking the Game API", async ({ customId }) => {
    const { context, gameApi } = contextWith({ player: playerFound(PLAYER, OLD_AS_OF) });
    const press = pressOf(customId);

    await handleLookAgain(press, context);

    expect(press.calls).toHaveLength(1);
    expect(press.calls[0]).toMatchObject({
      method: "reply",
      options: { content: lookupMessages.unavailable, flags: MessageFlags.Ephemeral },
    });
    expect(gameApi.chargedTo).not.toHaveBeenCalled();
    expect(gameApi.getPlayer).not.toHaveBeenCalled();
  });
});

describe("handleLookAgain on a Player card", () => {
  test("defers the update, then asks the Game API live for the Player, charged to the Member who pressed", async () => {
    const { context, gameApi } = contextWith({ player: playerFound(PLAYER, OLD_AS_OF) });
    const press = pressOf(PLAYER_ID);

    await handleLookAgain(press, context);

    expect(methodsOf(press)).toEqual(["deferUpdate", "editReply"]);
    expect(gameApi.chargedTo).toHaveBeenCalledWith(OWNER);
    expect(gameApi.charged.getPlayer).toHaveBeenCalledWith(uid(UID), "live");
    expect(gameApi.getPlayer).not.toHaveBeenCalled();
  });

  test("edits the card in place without the Newer data field or the button once the new map time is fresh", async () => {
    const { context } = contextWith({ player: playerFound(PLAYER, FRESH_AS_OF) });
    const press = pressOf(PLAYER_ID);

    await handleLookAgain(press, context);

    const edit = editOf(press);
    expect(JSON.stringify(embedsOf(edit))).toContain("DrLOL");
    expect(JSON.stringify(embedsOf(edit))).not.toContain("Newer data");
    expect(edit.components ?? []).toEqual([]);
  });

  test("keeps the Newer data field with the Kingdom's map, and the Look again button, while the new map time is still old", async () => {
    const { context } = contextWith({ player: playerFound(PLAYER, OLD_AS_OF) });
    const press = pressOf(PLAYER_ID);

    await handleLookAgain(press, context);

    const edit = editOf(press);
    expect(JSON.stringify(embedsOf(edit))).toContain("Newer data");
    expect(JSON.stringify(embedsOf(edit))).toContain("[Kingdom 330 map](https://lastasylumtracker.com/map?kid=330)");
    expect(edit.components).toEqual([lookAgainRow(PLAYER_ID)]);
  });

  test("ends the card's footer with the usage line of the Member who pressed", async () => {
    const { context } = contextWith({ player: playerFound(PLAYER, FRESH_AS_OF) });
    const press = pressOf(PLAYER_ID);

    await handleLookAgain(press, context);

    const [card] = embedsOf(editOf(press));
    expect(card?.footer?.text).toContain(LINE);
  });

  test.each([
    {
      label: "the Daily Quota is spent",
      result: { kind: "quota-spent", resetsAt: RESETS_AT },
      text: lookupMessages.quotaSpent(RESETS_AT),
    },
    { label: "the Player is not found", result: { kind: "not-found" }, text: lookupMessages.playerNotFound(UID) },
    { label: "the tracker is busy", result: { kind: "try-again" }, text: lookupMessages.tryAgain },
  ] as const)(
    "answers privately with the lookup's text when $label, and leaves the card as it was",
    async ({ result, text }) => {
      const { context } = contextWith({ player: result });
      const press = pressOf(PLAYER_ID);

      await handleLookAgain(press, context);

      expect(methodsOf(press)).toEqual(["deferUpdate", "followUp"]);
      expect(followUpOf(press)).toMatchObject({ content: `${text}\n${LINE}`, flags: MessageFlags.Ephemeral });
    },
  );

  test("answers privately with the refusal when the Daily Allowance is spent, and leaves the card as it was", async () => {
    const { context } = contextWith({ player: playerFound(PLAYER, OLD_AS_OF), refusedUntil: RESETS_AT });
    const press = pressOf(PLAYER_ID);

    await handleLookAgain(press, context);

    expect(methodsOf(press)).toEqual(["deferUpdate", "followUp"]);
    expect(followUpOf(press)).toMatchObject({
      content: refusalMessage(RESETS_AT, ALLOWANCE),
      flags: MessageFlags.Ephemeral,
    });
  });

  test("answers privately that lookups are not working when the Game API call throws, and logs it", async () => {
    const { context, gameApi, logged } = contextWith({ player: playerFound(PLAYER, OLD_AS_OF) });
    gameApi.charged.getPlayer.mockRejectedValueOnce(new Error("the Game API timed out"));
    const press = pressOf(PLAYER_ID);

    await handleLookAgain(press, context);

    expect(methodsOf(press)).toEqual(["deferUpdate", "followUp"]);
    expect(followUpOf(press)).toMatchObject({
      content: `${lookupMessages.unavailable}\n${LINE}`,
      flags: MessageFlags.Ephemeral,
    });
    expect(logged).toHaveLength(1);
  });
});

describe("handleLookAgain on an Alliance card", () => {
  test("defers the update, then asks the Game API live for the Alliance, charged to the Member who pressed", async () => {
    const { context, gameApi } = contextWith({ alliance: allianceFound(NML, undefined) });
    const press = pressOf(ALLIANCE_ID);

    await handleLookAgain(press, context);

    expect(methodsOf(press)).toEqual(["deferUpdate", "editReply"]);
    expect(gameApi.chargedTo).toHaveBeenCalledWith(OWNER);
    expect(gameApi.charged.getAlliance).toHaveBeenCalledWith(HOME, ALLIANCE_KEY, "live");
  });

  test("edits the card with a new roster menu for the Member, on its first page", async () => {
    const { context, pickSessions } = contextWith({ alliance: allianceFound(NML, undefined) });
    const press = pressOf(ALLIANCE_ID);

    await handleLookAgain(press, context);

    const sessionId = /"custom_id":"pick:([^:"]+):select/.exec(JSON.stringify(editOf(press).components ?? []))?.[1];
    expect(sessionId).toBeDefined();
    if (sessionId === undefined) return;
    expect(pickSessions.get(sessionId, NOW)).toMatchObject({
      ownerId: OWNER_ID,
      page: 0,
      choice: { kind: "roster", alliance: { tag: "NML" } },
    });
  });

  test("keeps the Look again button of the Member under the card's other rows", async () => {
    const { context } = contextWith({ alliance: allianceFound(NML, undefined) });
    const press = pressOf(ALLIANCE_ID);

    await handleLookAgain(press, context);

    expect(JSON.stringify(editOf(press).components ?? [])).toContain(`"custom_id":"${ALLIANCE_ID}"`);
  });

  test("answers privately that lookups are not working when the Game API call throws, and edits nothing", async () => {
    const { context, gameApi, logged } = contextWith({ alliance: allianceFound(NML, undefined) });
    gameApi.charged.getAlliance.mockRejectedValueOnce(new Error("the Game API timed out"));
    const press = pressOf(ALLIANCE_ID);

    await handleLookAgain(press, context);

    expect(methodsOf(press)).toEqual(["deferUpdate", "followUp"]);
    expect(followUpOf(press)).toMatchObject({
      content: `${lookupMessages.unavailable}\n${LINE}`,
      flags: MessageFlags.Ephemeral,
    });
    expect(logged).toHaveLength(1);
  });

  test("answers privately with the Alliance's not-found text, and leaves the card as it was", async () => {
    const { context } = contextWith({ alliance: { kind: "not-found" } });
    const press = pressOf(ALLIANCE_ID);

    await handleLookAgain(press, context);

    expect(methodsOf(press)).toEqual(["deferUpdate", "followUp"]);
    expect(followUpOf(press)).toMatchObject({
      content: `${lookupMessages.allianceNotFound(ALLIANCE_KEY, HOME)}\n${LINE}`,
      flags: MessageFlags.Ephemeral,
    });
  });

  test("answers privately with the refusal when the Daily Allowance is spent, and leaves the card as it was", async () => {
    const { context } = contextWith({ alliance: allianceFound(NML, undefined), refusedUntil: RESETS_AT });
    const press = pressOf(ALLIANCE_ID);

    await handleLookAgain(press, context);

    expect(methodsOf(press)).toEqual(["deferUpdate", "followUp"]);
    expect(followUpOf(press)).toMatchObject({
      content: refusalMessage(RESETS_AT, ALLOWANCE),
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe("handleLookAgain on an Alliance Overview", () => {
  test("defers the update, then asks the Game API live for the Alliance and edits the message with its Overview", async () => {
    const { context, gameApi } = contextWith({ alliance: allianceFound(NML, undefined) });
    const press = pressOf(OVERVIEW_ID);

    await handleLookAgain(press, context);

    expect(methodsOf(press)).toEqual(["deferUpdate", "editReply"]);
    expect(gameApi.chargedTo).toHaveBeenCalledWith(OWNER);
    expect(gameApi.charged.getAlliance).toHaveBeenCalledWith(HOME, ALLIANCE_KEY, "live");
    expect(JSON.stringify(embedsOf(editOf(press)))).toContain("Overview");
  });

  test("keeps the Look again button of the Member under the Overview", async () => {
    const { context } = contextWith({ alliance: allianceFound(NML, undefined) });
    const press = pressOf(OVERVIEW_ID);

    await handleLookAgain(press, context);

    expect(JSON.stringify(editOf(press).components ?? [])).toContain(`"custom_id":"${OVERVIEW_ID}"`);
  });

  test("answers privately that lookups are not working when the Game API call throws, and edits nothing", async () => {
    const { context, gameApi, logged } = contextWith({ alliance: allianceFound(NML, undefined) });
    gameApi.charged.getAlliance.mockRejectedValueOnce(new Error("the Game API timed out"));
    const press = pressOf(OVERVIEW_ID);

    await handleLookAgain(press, context);

    expect(methodsOf(press)).toEqual(["deferUpdate", "followUp"]);
    expect(followUpOf(press)).toMatchObject({
      content: `${lookupMessages.unavailable}\n${LINE}`,
      flags: MessageFlags.Ephemeral,
    });
    expect(logged).toHaveLength(1);
  });

  test("answers privately with the Alliance's not-found text, and leaves the Overview as it was", async () => {
    const { context } = contextWith({ alliance: { kind: "not-found" } });
    const press = pressOf(OVERVIEW_ID);

    await handleLookAgain(press, context);

    expect(methodsOf(press)).toEqual(["deferUpdate", "followUp"]);
    expect(followUpOf(press)).toMatchObject({
      content: `${lookupMessages.allianceNotFound(ALLIANCE_KEY, HOME)}\n${LINE}`,
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe("handleLookAgain on /reaper closest", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: ReaperStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-look-again-"));
    db = openDatabase(dataDir);
    store = new ReaperStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** An Exile of the Home Kingdom, stored at a position of its own. */
  function exileAt(exiled: Uid, name: string, position: Position): Exile {
    const reason = exileReasonOf(`Reason of ${name}`);
    if (!reason.ok) throw new Error(`the test reason of ${name} must be accepted`);
    return {
      uid: exiled,
      name,
      kingdom: HOME,
      lastPosition: { position, at: EARLIER },
      reason: reason.value,
      addedAt: EARLIER,
      addedBy: ADDER_ID,
    };
  }

  function playerAt(player: Uid, name: string, location: Position): Player {
    return {
      uid: player,
      name,
      kingdom: HOME,
      might: 1000,
      sanctuaryLevel: 10,
      alliance: undefined,
      allianceRank: undefined,
      details: {
        kills: undefined,
        vipLevel: undefined,
        likes: undefined,
        lastOnlineAt: undefined,
        language: undefined,
        location,
        avatarPath: undefined,
        kingdomBadgePath: undefined,
      },
    };
  }

  /**
   * The context of a press on /reaper closest: REAPER is the test store, and every Player read is a charged read of the
   * Member who pressed (`charged`), with the paged answers a press of all:true keeps.
   */
  function reaperContextOf(options: { readonly link?: Link; readonly read: ReadPlayer }) {
    const { context: base, gameApi } = contextWith();
    gameApi.charged.getPlayer.mockImplementation(options.read);
    const linkFor = vi.fn<(memberId: MemberId) => Link | undefined>((memberId) =>
      memberId === OWNER_ID ? options.link : undefined,
    );
    const context: LookAgainContext = {
      ...base,
      gameApi: { getPlayer: gameApi.getPlayer, getAlliance: gameApi.getAlliance, chargedTo: gameApi.chargedTo },
      links: { linkFor },
      reaper: store,
      pages: new ReaperPages<ReaperPageContent>(),
    };
    return { context, charged: gameApi.charged, chargedTo: gameApi.chargedTo, uncharged: gameApi.getPlayer };
  }

  test("defers the update, then ranks the Exiles again with live reads, each charged to the Member who pressed", async () => {
    store.add(exileAt(NEAR, "Near", { x: 1, y: 0 }));
    const { context, charged, chargedTo, uncharged } = reaperContextOf({
      read: () => Promise.resolve(playerFound(playerAt(NEAR, "Near", { x: 1, y: 0 }), FRESH_AS_OF)),
    });
    const press = pressOf(lookAgainCustomId(OWNER_ID, { kind: "reaper", origin: { x: 0, y: 0 } }));

    await handleLookAgain(press, context);

    expect(methodsOf(press)).toEqual(["deferUpdate", "editReply"]);
    expect(chargedTo).toHaveBeenCalledWith(OWNER);
    expect(charged.getPlayer).toHaveBeenCalledWith(NEAR, "live");
    expect(uncharged).not.toHaveBeenCalled();
    expect(JSON.stringify(embedsOf(editOf(press)))).toContain("Near");
  });

  test("reads the caller's own Linked Player live and charged too, when the press gives no coordinates", async () => {
    const link: Link = {
      memberId: OWNER_ID,
      uid: CALLER_UID,
      linkedAt: EARLIER,
      allianceRank: { source: "game-api", rank: "R4" },
      madeBy: { kind: "in-game-proof" },
    };
    store.add(exileAt(NEAR, "Near", { x: 1, y: 0 }));
    const { context, charged, uncharged } = reaperContextOf({
      link,
      read: (uidValue) =>
        Promise.resolve(
          uidValue === CALLER_UID
            ? playerFound(playerAt(CALLER_UID, "Caller", { x: 0, y: 0 }), FRESH_AS_OF)
            : playerFound(playerAt(NEAR, "Near", { x: 1, y: 0 }), FRESH_AS_OF),
        ),
    });
    const press = pressOf(REAPER_ID);

    await handleLookAgain(press, context);

    expect(charged.getPlayer).toHaveBeenCalledWith(CALLER_UID, "live");
    expect(uncharged).not.toHaveBeenCalled();
  });

  test("stops the reads once the Daily Allowance refuses one, so the Exiles not read are not asked for", async () => {
    const LAST_EXILE = uid("145563254789");
    const exiles = [
      uid("145563254780"),
      uid("145563254781"),
      uid("145563254782"),
      uid("145563254783"),
      uid("145563254784"),
      LAST_EXILE,
    ];
    exiles.forEach((exiled, index) => {
      store.add(exileAt(exiled, `Exile ${index.toString()}`, { x: index, y: 0 }));
    });
    const { context, charged } = reaperContextOf({
      read: () => Promise.resolve({ kind: "allowance-spent", resetsAt: RESETS_AT }),
    });
    const press = pressOf(lookAgainCustomId(OWNER_ID, { kind: "reaper", origin: { x: 0, y: 0 } }));

    await handleLookAgain(press, context);

    expect(charged.getPlayer.mock.calls.length).toBeGreaterThan(0);
    expect(charged.getPlayer.mock.calls.length).toBeLessThan(exiles.length);
    expect(store.find(LAST_EXILE)?.lastPosition).toEqual({ position: { x: 5, y: 0 }, at: EARLIER });
  });

  test("shows the usage line of the Member who pressed on the redrawn answer", async () => {
    store.add(exileAt(NEAR, "Near", { x: 1, y: 0 }));
    const { context } = reaperContextOf({
      read: () => Promise.resolve(playerFound(playerAt(NEAR, "Near", { x: 1, y: 0 }), FRESH_AS_OF)),
    });
    const press = pressOf(lookAgainCustomId(OWNER_ID, { kind: "reaper", origin: { x: 0, y: 0 } }));

    await handleLookAgain(press, context);

    expect(JSON.stringify(editOf(press))).toContain(LINE);
  });

  test("keeps the paging of an all:true answer: the redrawn first page has its page buttons", async () => {
    [0, 1, 2, 3].forEach((index) => {
      store.add(exileAt(uid(`14556325479${index.toString()}`), `Exile ${index.toString()}`, { x: index + 1, y: 0 }));
    });
    const { context } = reaperContextOf({
      read: () => Promise.resolve({ kind: "not-found" }),
    });
    const press = pressOf(lookAgainCustomId(OWNER_ID, { kind: "reaper", all: true, origin: { x: 0, y: 0 } }));

    await handleLookAgain(press, context);

    expect(JSON.stringify(editOf(press).components ?? [])).toMatch(/"custom_id":"reaper:[^"]+:page:1"/);
  });

  test("keeps the Newer data field with the measured Kingdom, and the button, while a shown position is still old", async () => {
    store.add(exileAt(NEAR, "Near", { x: 1, y: 0 }));
    const { context } = reaperContextOf({
      read: () => Promise.resolve(playerFound(playerAt(NEAR, "Near", { x: 1, y: 0 }), OLD_AS_OF)),
    });
    const origin = { x: 0, y: 0 };
    const press = pressOf(lookAgainCustomId(OWNER_ID, { kind: "reaper", origin }));

    await handleLookAgain(press, context);

    const edit = editOf(press);
    expect(JSON.stringify(edit.embeds)).toContain("Newer data");
    expect(JSON.stringify(edit.embeds)).toContain("[Kingdom 330 map](https://lastasylumtracker.com/map?kid=330)");
    expect(JSON.stringify(edit.components ?? [])).toContain(
      `"custom_id":"${lookAgainCustomId(OWNER_ID, { kind: "reaper", origin })}"`,
    );
  });

  test("drops the Newer data field and the button once every shown position is fresh", async () => {
    store.add(exileAt(NEAR, "Near", { x: 1, y: 0 }));
    const { context } = reaperContextOf({
      read: () => Promise.resolve(playerFound(playerAt(NEAR, "Near", { x: 1, y: 0 }), FRESH_AS_OF)),
    });
    const press = pressOf(REAPER_ID);

    await handleLookAgain(press, context);

    const edit = editOf(press);
    expect(JSON.stringify(edit.embeds)).not.toContain("Newer data");
    expect(edit.components ?? []).toEqual([]);
  });
});
