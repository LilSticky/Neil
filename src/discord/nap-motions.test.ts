import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageFlags, type BaseMessageOptions, type InteractionReplyOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { KnownAlliance } from "../domain/alliance-match.js";
import type { Editor } from "../domain/exile.js";
import type { KingdomNumber } from "../domain/lookup-input.js";
import type { NapEvent } from "../domain/nap.js";
import { kingdomOf } from "../domain/__fixtures__/players.js";
import { openDatabase } from "../storage/database.js";
import { NapMotionStore } from "../storage/nap-motion-store.js";
import { NapStore } from "../storage/nap-store.js";
import { createNapMotions, type NapMotionButton, type NapMotionCommand, type NapMotions, type NapMotionServer } from "./nap-motions.js";
import { NAP_MOTION_APPROVE_PREFIX, NAP_MOTION_DECLINE_PREFIX } from "./nap-motion-texts.js";
import { NAP_APPROVE_PREFIX, NAP_DECLINE_PREFIX } from "./nap-texts.js";

const HOME = kingdomOf(330);
const NOW = new Date("2026-11-18T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const OFFICER = "500000000000000005";
const R5_NML = "100000000000000001";
const R5_ABC = "100000000000000002";
const R5_XYZ = "100000000000000003";
const R5_ABC_TOO = "100000000000000004";
const R4_NML = "100000000000000006";
const STRANGER = "100000000000000008";
const OUTSIDER = "100000000000000010";
const LEADERS = "700000000000000002";
const ANNOUNCEMENTS = "700000000000000003";
const TEXT = "Nobody hits the farms of NaP Alliances.";

function known(tag: string, name: string, kingdom: KingdomNumber = HOME): KnownAlliance {
  return { kingdom, tag, name, lastSeen: NOW };
}

const KNOWN = [known("NML", "No Man's Land"), known("ABC", "Alpha Bravo"), known("XYZ", "Ex Why Zed")];

function r5(tag: string, kingdom: KingdomNumber = HOME): Editor {
  return { allianceRank: { source: "game-api", rank: "R5" }, allianceKingdom: kingdom, allianceTag: tag };
}

const EDITORS: Readonly<Record<string, Editor>> = {
  [R5_NML]: r5("NML"),
  [R5_ABC]: r5("ABC"),
  [R5_ABC_TOO]: { ...r5("ABC"), allianceRank: { source: "rank-approval", rank: "R5", approvedBy: OFFICER, approvedAt: NOW } },
  [R5_XYZ]: r5("XYZ"),
  [R4_NML]: { ...r5("NML"), allianceRank: { source: "game-api", rank: "R4" } },
  [OUTSIDER]: r5("QQQ"),
};

class FakeServer implements NapMotionServer {
  leaders: string | undefined = LEADERS;
  announcements: string | undefined = ANNOUNCEMENTS;
  refusePost = false;
  refusePostIn: string | undefined;
  refuseEdit = false;
  readonly posts: { channelId: string; message: BaseMessageOptions; id: string }[] = [];
  readonly edits: { channelId: string; messageId: string; message: BaseMessageOptions }[] = [];
  readonly deleted = new Set<string>();
  readonly logs: string[] = [];
  private nextId = 800000000000000001n;

  leadersChannelId(): string | undefined {
    return this.leaders;
  }
  announcementsChannelId(): string | undefined {
    return this.announcements;
  }
  post(channelId: string, message: BaseMessageOptions): Promise<string> {
    if (this.refusePost || this.refusePostIn === channelId) return Promise.reject(new Error("Missing Permissions"));
    const id = this.nextId.toString();
    this.nextId += 1n;
    this.posts.push({ channelId, message, id });
    return Promise.resolve(id);
  }
  edit(channelId: string, messageId: string, message: BaseMessageOptions): Promise<boolean> {
    if (this.refuseEdit) return Promise.reject(new Error("Missing Access"));
    const exists = this.posts.some((post) => post.channelId === channelId && post.id === messageId);
    if (!exists || this.deleted.has(messageId)) return Promise.resolve(false);
    this.edits.push({ channelId, messageId, message });
    return Promise.resolve(true);
  }
  postsIn(channelId: string): { channelId: string; message: BaseMessageOptions; id: string }[] {
    return this.posts.filter((post) => post.channelId === channelId);
  }
  log(line: string): Promise<void> {
    this.logs.push(line);
    return Promise.resolve();
  }
}

interface Replies {
  readonly replies: InteractionReplyOptions[];
}

function command(
  userId: string,
  text: string | null = TEXT,
  hours: number | null = null,
): NapMotionCommand & Replies {
  const replies: InteractionReplyOptions[] = [];
  return {
    user: { id: userId },
    options: {
      getString: (name) => (name === "text" ? text : null),
      getInteger: (name) => (name === "hours" ? hours : null),
    },
    reply: (options) => {
      replies.push(options);
      return Promise.resolve();
    },
    replies,
  };
}

function button(customId: string, userId: string): NapMotionButton & Replies {
  const replies: InteractionReplyOptions[] = [];
  return {
    customId,
    user: { id: userId },
    reply: (options) => {
      replies.push(options);
      return Promise.resolve();
    },
    replies,
  };
}

function joinedEvent(tag: string, at: Date): NapEvent {
  return {
    kind: "joined",
    tag,
    requestedBy: R5_NML,
    requestedAt: at,
    decision: { as: "officer", by: OFFICER },
    at,
  };
}

function contentOf(reply: InteractionReplyOptions | BaseMessageOptions | undefined): string {
  return typeof reply?.content === "string" ? reply.content : "";
}

describe("createNapMotions", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let nap: NapStore;
  let store: NapMotionStore;
  let server: FakeServer;
  let now: Date;
  let errors: string[];
  let knownList: KnownAlliance[];
  let motions: NapMotions;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-nap-motions-"));
    db = openDatabase(dataDir);
    nap = new NapStore(db);
    store = new NapMotionStore(db);
    server = new FakeServer();
    now = NOW;
    errors = [];
    knownList = [...KNOWN];
    for (const tag of ["NML", "ABC", "XYZ"]) nap.append(joinedEvent(tag, new Date(NOW.getTime() - 10 * 24 * HOUR)));
    motions = createNapMotions({
      store,
      napHistory: () => nap.history(),
      links: { all: () => Object.keys(EDITORS).map((memberId) => ({ memberId })) },
      knownAlliances: { all: () => knownList },
      editorOf: (memberId) => EDITORS[memberId],
      server,
      homeKingdom: HOME,
      now: () => now,
      logError: (line) => errors.push(line),
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function openOne(hours: number | null = null): Promise<number> {
    await motions.open(command(R5_NML, TEXT, hours));
    const id = store.open().at(-1)?.id;
    if (id === undefined) throw new Error("no motion was opened");
    return id;
  }

  async function press(id: number, vote: "approve" | "decline", userId: string): Promise<NapMotionButton & Replies> {
    const pressed = button(`${vote === "approve" ? NAP_MOTION_APPROVE_PREFIX : NAP_MOTION_DECLINE_PREFIX}${id.toString()}`, userId);
    await motions.vote(pressed);
    return pressed;
  }

  describe("open", () => {
    test("a NaP Council member opens a motion: stored, posted in #nap-leaders with both buttons and the deadline, answered privately", async () => {
      const opener = command(R5_NML, `  ${TEXT}  `, 10);
      await motions.open(opener);

      const [motion] = store.open();
      const endsAt = new Date(NOW.getTime() + 10 * HOUR);
      expect(motion).toMatchObject({ text: TEXT, openedBy: R5_NML, openerTag: "NML", openedAt: NOW, endsAt });
      const [post] = server.postsIn(LEADERS);
      expect(post?.message.allowedMentions).toEqual({ parse: [] });
      expect(contentOf(post?.message)).toContain(TEXT);
      expect(contentOf(post?.message)).toContain("[NML] No Man's Land");
      expect(contentOf(post?.message)).toContain(`<t:${(endsAt.getTime() / 1000).toString()}:f>`);
      expect(contentOf(post?.message)).toContain("tie");
      const ids = JSON.stringify(post?.message.components);
      expect(ids).toContain(`${NAP_MOTION_APPROVE_PREFIX}${String(motion?.id)}`);
      expect(ids).toContain(`${NAP_MOTION_DECLINE_PREFIX}${String(motion?.id)}`);
      expect(motion?.messageId).toBe(post?.id);
      expect(motion?.channelId).toBe(LEADERS);
      expect(opener.replies).toHaveLength(1);
      expect(opener.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(contentOf(opener.replies[0])).toContain(`<t:${(endsAt.getTime() / 1000).toString()}:`);
      expect(server.logs).toHaveLength(1);
      expect(server.postsIn(ANNOUNCEMENTS)).toEqual([]);
    });

    test("the vote runs 48 hours when no hours are given", async () => {
      await motions.open(command(R5_NML));
      expect(store.open()[0]?.endsAt).toEqual(new Date(NOW.getTime() + 48 * HOUR));
    });

    test("the motion buttons never start like the join-request buttons", () => {
      expect(NAP_MOTION_APPROVE_PREFIX.startsWith(NAP_APPROVE_PREFIX)).toBe(false);
      expect(NAP_MOTION_DECLINE_PREFIX.startsWith(NAP_DECLINE_PREFIX)).toBe(false);
    });

    test.each([
      ["an R4", R4_NML],
      ["a Member with no Link", STRANGER],
      ["the R5 of an Alliance outside the NaP", OUTSIDER],
      ["an Officer outside the NaP Council", OFFICER],
    ])("%s is refused privately, with nothing stored, posted or logged", async (_who, userId) => {
      const refused = command(userId);
      await motions.open(refused);
      expect(store.open()).toEqual([]);
      expect(server.posts).toEqual([]);
      expect(server.logs).toEqual([]);
      expect(refused.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(refused.replies[0]?.allowedMentions).toEqual({ parse: [] });
      expect(contentOf(refused.replies[0])).toContain("NaP Council");
    });

    test("nobody may open a motion while the NaP is empty", async () => {
      for (const tag of ["NML", "ABC", "XYZ"]) nap.append({ kind: "left", tag, leftBy: R5_NML, at: NOW });
      const refused = command(R5_NML);
      await motions.open(refused);
      expect(store.open()).toEqual([]);
      expect(server.posts).toEqual([]);
      expect(refused.replies).toHaveLength(1);
    });

    test.each([
      ["a blank text", "   ", null],
      ["a text over 500 characters", "x".repeat(501), null],
      ["0 hours", TEXT, 0],
      ["more than a week", TEXT, 169],
    ])("%s is refused privately and nothing is opened", async (_what, text, hours) => {
      const refused = command(R5_NML, text, hours);
      await motions.open(refused);
      expect(store.open()).toEqual([]);
      expect(server.posts).toEqual([]);
      expect(server.logs).toEqual([]);
      expect(refused.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });

    test("a missing #nap-leaders removes the motion, tells the opener and writes one log line", async () => {
      server.leaders = undefined;
      const opener = command(R5_NML);
      await motions.open(opener);
      expect(store.open()).toEqual([]);
      expect(store.get(1)).toBeUndefined();
      expect(contentOf(opener.replies[0])).toContain("#nap-leaders");
      expect(server.logs).toHaveLength(1);
    });

    test("a failed post removes the motion, tells the opener and writes one log line", async () => {
      server.refusePost = true;
      const opener = command(R5_NML);
      await motions.open(opener);
      expect(store.open()).toEqual([]);
      expect(store.get(1)).toBeUndefined();
      expect(opener.replies).toHaveLength(1);
      expect(server.logs).toHaveLength(1);
      expect(server.logs[0]).toContain("Missing Permissions");
    });
  });

  describe("mayOpen and openFor", () => {
    test("follow the rule of /nap motion: only a member of the NaP Council", () => {
      expect(motions.mayOpen(R5_NML)).toBe(true);
      expect(motions.mayOpen(R4_NML)).toBe(false);
      expect(motions.mayOpen(OUTSIDER)).toBe(false);
      expect(motions.mayOpen(OFFICER)).toBe(false);
    });

    test("openFor opens a motion of the default length, posted in #nap-leaders and logged, and gives its id", async () => {
      const opening = await motions.openFor(R5_NML, "A longer text than a command allows. ".repeat(20));
      const [motion] = store.open();
      expect(opening).toEqual({ kind: "opened", id: motion?.id, endsAt: new Date(NOW.getTime() + 48 * HOUR) });
      expect(server.postsIn(LEADERS)).toHaveLength(1);
      expect(server.logs).toHaveLength(1);
    });

    test("openFor refuses someone outside the NaP Council, and keeps nothing when #nap-leaders is missing or refuses", async () => {
      expect(await motions.openFor(OUTSIDER, TEXT)).toEqual({ kind: "refused" });
      server.leaders = undefined;
      expect(await motions.openFor(R5_NML, TEXT)).toEqual({ kind: "no-leaders" });
      server.leaders = LEADERS;
      server.refusePost = true;
      expect(await motions.openFor(R5_NML, TEXT)).toEqual({ kind: "post-failed", reason: "Missing Permissions" });
      expect(store.open()).toEqual([]);
      expect(server.logs).toEqual([]);
    });
  });

  describe("vote", () => {
    test("records one vote per Alliance, cast by any of its Linked R5s, the latest press counting", async () => {
      const id = await openOne();
      server.logs.length = 0;
      const first = await press(id, "approve", R5_ABC);
      expect(first.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(contentOf(first.replies[0])).toContain("Approve");
      expect(contentOf(first.replies[0])).toContain("[ABC] Alpha Bravo");

      now = new Date(NOW.getTime() + HOUR);
      const changed = await press(id, "decline", R5_ABC_TOO);
      expect(contentOf(changed.replies[0])).toContain("Decline");
      expect(contentOf(changed.replies[0])).toContain("was Approve");

      expect(store.votes(id)).toEqual([{ allianceTag: "ABC", voterId: R5_ABC_TOO, vote: "decline", at: now }]);
      expect(server.logs).toHaveLength(2);
      expect(server.logs[1]).toContain("changed from Approve");
      expect(server.posts).toHaveLength(1);
    });

    test.each([
      ["an R4", R4_NML],
      ["a Member with no Link", STRANGER],
      ["the R5 of an Alliance outside the NaP", OUTSIDER],
      ["an Officer outside the NaP Council", OFFICER],
    ])("refuses %s privately, storing and logging nothing", async (_who, userId) => {
      const id = await openOne();
      server.logs.length = 0;
      const pressed = await press(id, "approve", userId);
      expect(store.votes(id)).toEqual([]);
      expect(server.logs).toEqual([]);
      expect(pressed.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(contentOf(pressed.replies[0])).toContain("NaP Council");
    });

    test("refuses a press for an unknown motion or a custom id Neil did not make", async () => {
      await openOne();
      server.logs.length = 0;
      for (const customId of [`${NAP_MOTION_APPROVE_PREFIX}99`, `${NAP_MOTION_APPROVE_PREFIX}abc`, NAP_MOTION_DECLINE_PREFIX]) {
        const pressed = button(customId, R5_ABC);
        await motions.vote(pressed);
        expect(pressed.replies).toHaveLength(1);
        expect(pressed.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      }
      expect(server.logs).toEqual([]);
    });

    test("refuses a press at the deadline and on a closed motion", async () => {
      const id = await openOne(2);
      server.logs.length = 0;
      now = new Date(NOW.getTime() + 2 * HOUR);
      const late = await press(id, "approve", R5_ABC);
      expect(contentOf(late.replies[0])).toContain("ended");
      await motions.tick();
      const logs = server.logs.length;
      const closed = await press(id, "approve", R5_ABC);
      expect(contentOf(closed.replies[0])).toContain("no longer open");
      expect(store.votes(id)).toEqual([]);
      expect(server.logs).toHaveLength(logs);
    });
  });

  describe("tick", () => {
    test("reminds once, 24 hours before the deadline, mentioning exactly the Linked R5s of NaP Alliances that have not voted", async () => {
      const id = await openOne();
      await press(id, "approve", R5_ABC);
      server.logs.length = 0;
      now = new Date(NOW.getTime() + 24 * HOUR - 60_000);
      await motions.tick();
      expect(server.postsIn(LEADERS)).toHaveLength(1);

      now = new Date(NOW.getTime() + 24 * HOUR);
      await motions.tick();
      const reminders = server.postsIn(LEADERS).slice(1);
      expect(reminders).toHaveLength(1);
      const [reminder] = reminders;
      expect(reminder?.message.allowedMentions).toEqual({ parse: [], users: [R5_NML, R5_XYZ] });
      expect(contentOf(reminder?.message)).toContain(`<@${R5_NML}>`);
      expect(contentOf(reminder?.message)).toContain(`<@${R5_XYZ}>`);
      expect(contentOf(reminder?.message)).not.toContain(R5_ABC);
      expect(contentOf(reminder?.message)).not.toContain("Approve");
      expect(store.get(id)?.remindedAt).toEqual(now);
      expect(server.logs).toHaveLength(1);

      now = new Date(NOW.getTime() + 30 * HOUR);
      await motions.tick();
      expect(server.postsIn(LEADERS)).toHaveLength(2);
    });

    test("reminds halfway through a motion shorter than 48 hours", async () => {
      await openOne(10);
      now = new Date(NOW.getTime() + 5 * HOUR - 60_000);
      await motions.tick();
      expect(server.postsIn(LEADERS)).toHaveLength(1);
      now = new Date(NOW.getTime() + 5 * HOUR);
      await motions.tick();
      expect(server.postsIn(LEADERS)).toHaveLength(2);
    });

    test("a reminder missed while Neil was off goes out late, but never at or after the deadline", async () => {
      const late = await openOne(10);
      now = new Date(NOW.getTime() + 9 * HOUR);
      await motions.tick();
      expect(server.postsIn(LEADERS)).toHaveLength(2);
      expect(store.get(late)?.closed).toBeUndefined();

      const missed = await openOne(10);
      now = new Date(now.getTime() + 10 * HOUR);
      await motions.tick();
      expect(store.get(missed)?.remindedAt).toBeUndefined();
      expect(store.get(missed)?.closed).toBeDefined();
      expect(server.posts.filter((post) => contentOf(post.message).includes("Reminder"))).toHaveLength(1);
    });

    test("sends no reminder when every Alliance voted, and writes one log line", async () => {
      const id = await openOne();
      for (const [voter, vote] of [[R5_NML, "approve"], [R5_ABC, "decline"], [R5_XYZ, "approve"]] as const) {
        await press(id, vote, voter);
      }
      server.logs.length = 0;
      now = new Date(NOW.getTime() + 24 * HOUR);
      await motions.tick();
      expect(server.postsIn(LEADERS)).toHaveLength(1);
      expect(server.logs).toHaveLength(1);
      expect(store.get(id)?.remindedAt).toEqual(now);
    });

    test("a missing #nap-leaders at the reminder only logs a line", async () => {
      const id = await openOne();
      server.leaders = undefined;
      server.logs.length = 0;
      now = new Date(NOW.getTime() + 24 * HOUR);
      await motions.tick();
      expect(server.logs).toHaveLength(1);
      expect(store.get(id)?.remindedAt).toEqual(now);
      expect(errors).toEqual([]);
    });

    test("approves at the deadline with more Approve than Decline votes, closing once and editing the motion without buttons", async () => {
      const id = await openOne();
      await press(id, "approve", R5_NML);
      await press(id, "approve", R5_ABC);
      await press(id, "decline", R5_XYZ);
      now = new Date(NOW.getTime() + 48 * HOUR - 60_000);
      await motions.tick();
      expect(store.get(id)?.closed).toBeUndefined();

      now = new Date(NOW.getTime() + 48 * HOUR);
      await motions.tick();
      expect(store.get(id)?.closed).toEqual({ outcome: "approved", approve: 2, decline: 1, at: now });
      const [edit] = server.edits;
      expect(edit?.messageId).toBe(store.get(id)?.messageId);
      expect(edit?.message.components).toEqual([]);
      expect(contentOf(edit?.message)).toContain("approved");
      expect(contentOf(edit?.message)).toContain("2 Approve, 1 Decline");
      expect(server.logs.filter((line) => line.includes("approved"))).toHaveLength(1);

      const posted = server.posts.length;
      now = new Date(NOW.getTime() + 49 * HOUR);
      await motions.tick();
      expect(server.posts).toHaveLength(posted);
      expect(server.edits).toHaveLength(1);
    });

    test.each([
      ["a tie", [[R5_NML, "approve"], [R5_ABC, "decline"]] as const, 1, 1],
      ["no votes", [] as const, 0, 0],
    ])("rejects %s", async (_what, cast, approve, decline) => {
      const id = await openOne();
      for (const [voter, vote] of cast) await press(id, vote, voter);
      now = new Date(NOW.getTime() + 48 * HOUR);
      await motions.tick();
      expect(store.get(id)?.closed).toEqual({ outcome: "rejected", approve, decline, at: now });
    });

    test("counts no vote of an Alliance that left the NaP before the deadline", async () => {
      const id = await openOne();
      await press(id, "approve", R5_ABC);
      await press(id, "decline", R5_NML);
      await press(id, "approve", R5_XYZ);
      nap.append({ kind: "left", tag: "XYZ", leftBy: R5_XYZ, at: new Date(NOW.getTime() + HOUR) });
      now = new Date(NOW.getTime() + 48 * HOUR);
      await motions.tick();
      expect(store.get(id)?.closed).toMatchObject({ outcome: "rejected", approve: 1, decline: 1 });
      const entry = server.postsIn(ANNOUNCEMENTS).map((post) => contentOf(post.message)).join("\n");
      expect(entry).not.toContain("[XYZ]");
    });

    test("posts the decision-log entry in #nap-announcements as plain content naming Alliances, not Members", async () => {
      const id = await openOne();
      await press(id, "approve", R5_NML);
      await press(id, "decline", R5_ABC);
      now = new Date(NOW.getTime() + 48 * HOUR);
      await motions.tick();

      const entries = server.postsIn(ANNOUNCEMENTS);
      expect(entries).toHaveLength(1);
      const [entry] = entries;
      expect(entry?.message.embeds ?? []).toEqual([]);
      expect(entry?.message.allowedMentions).toEqual({ parse: [] });
      const content = contentOf(entry?.message);
      expect(content).toContain(TEXT);
      expect(content).toContain("rejected");
      expect(content).toContain("1 Approve, 1 Decline");
      expect(content).toContain(`<t:${(NOW.getTime() / 1000).toString()}:f>`);
      expect(content).toContain(`<t:${(now.getTime() / 1000).toString()}:f>`);
      expect(content).toContain("Opened by [NML] No Man's Land");
      expect(content).toContain("[NML] No Man's Land: Approve");
      expect(content).toContain("[ABC] Alpha Bravo: Decline");
      expect(content).toContain("[XYZ] Ex Why Zed: did not vote");
      expect(content).not.toMatch(/<@|\d{17,20}/u);
      expect(String(id)).not.toBe("");
    });

    test("hides a Member mentioned in the motion text from the public entry", async () => {
      await motions.open(command(R5_NML, `Thank <@${R5_ABC}> for the farms`));
      now = new Date(NOW.getTime() + 48 * HOUR);
      await motions.tick();
      const content = contentOf(server.postsIn(ANNOUNCEMENTS)[0]?.message);
      expect(content).toContain("Thank");
      expect(content).not.toContain(R5_ABC);
    });

    test("continues an entry longer than 2,000 characters in follow-up messages, cut only between lines", async () => {
      for (let index = 0; index < 40; index += 1) {
        const tag = `A${index.toString().padStart(2, "0")}`;
        nap.append(joinedEvent(tag, new Date(NOW.getTime() - HOUR)));
        knownList.push(known(tag, `The Alliance With A Rather Long Name ${index.toString()}`));
      }
      await openOne();
      now = new Date(NOW.getTime() + 48 * HOUR);
      await motions.tick();

      const parts = server.postsIn(ANNOUNCEMENTS).map((post) => contentOf(post.message));
      expect(parts.length).toBeGreaterThan(1);
      for (const part of parts) expect(part.length).toBeLessThanOrEqual(2000);
      const lines = parts.join("\n").split("\n");
      expect(lines).toContain("- [A39] The Alliance With A Rather Long Name 39: did not vote");
      expect(lines).toContain("- [A00] The Alliance With A Rather Long Name 0: did not vote");
      for (const post of server.postsIn(ANNOUNCEMENTS)) expect(post.message.allowedMentions).toEqual({ parse: [] });
    });

    test("rejects with 0 and 0 when the NaP has no members at the deadline", async () => {
      const id = await openOne();
      for (const tag of ["NML", "ABC", "XYZ"]) nap.append({ kind: "left", tag, leftBy: R5_NML, at: NOW });
      now = new Date(NOW.getTime() + 48 * HOUR);
      await motions.tick();
      expect(store.get(id)?.closed).toMatchObject({ outcome: "rejected", approve: 0, decline: 0 });
    });

    test("a missing #nap-announcements or a gone #nap-leaders message only log lines; the result stays", async () => {
      const id = await openOne();
      server.announcements = undefined;
      server.deleted.add(store.get(id)?.messageId ?? "");
      server.logs.length = 0;
      now = new Date(NOW.getTime() + 48 * HOUR);
      await motions.tick();
      expect(store.get(id)?.closed?.outcome).toBe("rejected");
      expect(server.logs).toHaveLength(3);
      expect(server.logs.some((line) => line.includes("#nap-announcements"))).toBe(true);
      expect(errors).toEqual([]);
    });

    test("never throws", async () => {
      await openOne();
      const broken = createNapMotions({
        store,
        napHistory: () => {
          throw new Error("disk full");
        },
        links: { all: () => [] },
        knownAlliances: { all: () => knownList },
        editorOf: (memberId) => EDITORS[memberId],
        server,
        homeKingdom: HOME,
        now: () => new Date(NOW.getTime() + 48 * HOUR),
        logError: (line) => errors.push(line),
      });
      await expect(broken.tick()).resolves.toBeUndefined();
      expect(errors).toHaveLength(1);
    });
  });
});
