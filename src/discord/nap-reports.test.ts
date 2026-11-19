import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageFlags, type BaseMessageOptions, type InteractionReplyOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { exileReasonOf, type Editor, type ExileReason } from "../domain/exile.js";
import type { NapEvent } from "../domain/nap.js";
import type { ChargedResult } from "../game-api/client.js";
import type { Player } from "../domain/player.js";
import { allied, kingdomOf, uidOf } from "../domain/__fixtures__/players.js";
import { openDatabase } from "../storage/database.js";
import { NapMotionStore } from "../storage/nap-motion-store.js";
import { NapReportStore } from "../storage/nap-report-store.js";
import { NapStore } from "../storage/nap-store.js";
import { ReaperStore } from "../storage/reaper-store.js";
import { createNapMotions, type NapMotions } from "./nap-motions.js";
import { NAP_MOTION_APPROVE_PREFIX } from "./nap-motion-texts.js";
import { createNapReports, type NapReportCommand, type NapReports, type NapReportServer } from "./nap-reports.js";

const HOME = kingdomOf(330);
const NOW = new Date("2026-11-19T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const OFFICER = "500000000000000005";
const R5_NML = "100000000000000001";
const R5_ABC = "100000000000000002";
const R5_XYZ = "100000000000000003";
const R4_NML = "100000000000000004";
const OUTSIDER = "100000000000000010";
const LEADERS = "700000000000000002";
const ANNOUNCEMENTS = "700000000000000003";
const THREAD = "900000000000000001";
const ACCUSED_UID = "145563254785";
const WHAT = "They burned our farms at 512:640 during the shield break.";

function r5(tag: string): Editor {
  return { allianceRank: { source: "game-api", rank: "R5" }, allianceKingdom: HOME, allianceTag: tag };
}

const EDITORS: Readonly<Record<string, Editor>> = {
  [R5_NML]: r5("NML"),
  [R5_ABC]: r5("ABC"),
  [R5_XYZ]: r5("XYZ"),
  [R4_NML]: { allianceRank: { source: "game-api", rank: "R4" }, allianceKingdom: HOME, allianceTag: "NML" },
  [OUTSIDER]: r5("QQQ"),
};

class FakeServer implements NapReportServer {
  leaders: string | undefined = LEADERS;
  announcements: string | undefined = ANNOUNCEMENTS;
  refusePostIn: string | undefined;
  refuseThread = false;
  readonly posts: { channelId: string; message: BaseMessageOptions; id: string }[] = [];
  readonly threads: { parentId: string; name: string; memberIds: readonly string[] }[] = [];
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
  openPrivateThread(
    parentId: string,
    name: string,
    memberIds: readonly string[],
  ): Promise<{ readonly threadId: string; readonly notAdded: readonly string[] }> {
    if (this.refuseThread) return Promise.reject(new Error("Missing Permissions"));
    this.threads.push({ parentId, name, memberIds });
    return Promise.resolve({ threadId: THREAD, notAdded: [] });
  }
  postsIn(channelId: string): { channelId: string; message: BaseMessageOptions; id: string }[] {
    return this.posts.filter((post) => post.channelId === channelId);
  }
  log(line: string): Promise<void> {
    this.logs.push(line);
    return Promise.resolve();
  }
}

type Options = Readonly<Record<string, string | number | null>>;

function command(userId: string, options: Options): NapReportCommand & { readonly replies: InteractionReplyOptions[] } {
  const replies: InteractionReplyOptions[] = [];
  const value = (name: string): string | number | null => options[name] ?? null;
  return {
    user: { id: userId },
    options: {
      getString: (name) => {
        const found = value(name);
        return typeof found === "string" ? found : null;
      },
      getInteger: (name) => {
        const found = value(name);
        return typeof found === "number" ? found : null;
      },
    },
    reply: (reply) => {
      replies.push(reply);
      return Promise.resolve();
    },
    deferReply: () => Promise.resolve(),
    editReply: (reply) => {
      replies.push({
        content: typeof reply.content === "string" ? reply.content : "",
        flags: MessageFlags.Ephemeral,
        ...(reply.allowedMentions === undefined ? {} : { allowedMentions: reply.allowedMentions }),
      });
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

function reasonOf(text: string): ExileReason {
  const parsed = exileReasonOf(text);
  if (!parsed.ok) throw new Error("not a reason");
  return parsed.value;
}

function unix(moment: Date): string {
  return Math.floor(moment.getTime() / 1000).toString();
}

describe("createNapReports", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let nap: NapStore;
  let motionStore: NapMotionStore;
  let store: NapReportStore;
  let reaper: ReaperStore;
  let server: FakeServer;
  let now: Date;
  let errors: string[];
  let reaperLogs: string[];
  let expelled: { tag: string; by: string; motionId: number }[];
  let reads: string[];
  let readResult: ChargedResult<Player>;
  let motions: NapMotions;
  let reports: NapReports;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-nap-reports-"));
    db = openDatabase(dataDir);
    nap = new NapStore(db);
    motionStore = new NapMotionStore(db);
    store = new NapReportStore(db);
    reaper = new ReaperStore(db);
    server = new FakeServer();
    now = NOW;
    errors = [];
    reaperLogs = [];
    expelled = [];
    reads = [];
    readResult = {
      kind: "found",
      value: { ...allied({ name: "Burner", kingdom: 330, sanctuaryLevel: 20, tag: "XYZ", rank: "R3" }), uid: uidOf(ACCUSED_UID) },
      asOf: NOW,
    };
    for (const tag of ["NML", "ABC", "XYZ"]) nap.append(joinedEvent(tag, new Date(NOW.getTime() - 10 * 24 * HOUR)));
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
    reports = createNapReports({
      store,
      motions,
      motionOf: (id) => motionStore.get(id),
      napHistory: () => nap.history(),
      links: { all: () => Object.keys(EDITORS).map((memberId) => ({ memberId })) },
      editorOf: (memberId) => EDITORS[memberId],
      homeKingdom: HOME,
      server,
      expel: (tag, by, motionId) => {
        expelled.push({ tag, by, motionId });
        return Promise.resolve();
      },
      readPlayer: (uid) => {
        reads.push(uid);
        return Promise.resolve(readResult);
      },
      exiles: {
        reaper,
        channels: {
          log: (message) => {
            reaperLogs.push(contentOf(message));
            return Promise.resolve();
          },
        },
        now: () => now,
        logError: (line) => errors.push(line),
      },
      now: () => now,
      logError: (line) => errors.push(line),
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** Files a report by R5_NML on XYZ, with the accused Player unless told otherwise. */
  async function fileOne(player: number | null = Number(ACCUSED_UID)): Promise<void> {
    await reports.report(command(R5_NML, { alliance: "xyz", what: WHAT, player }));
  }

  /** Proposes an outcome for report 1 as R5_ABC and gives the id of its NaP Motion. */
  async function proposeOne(outcome: string, note: string | null = null): Promise<number> {
    await reports.proposeOutcome(command(R5_ABC, { report: 1, outcome, note }));
    const motion = store.proposals().at(-1)?.motion;
    if (motion === undefined) throw new Error("no proposal was put to a motion");
    return motion;
  }

  /** Lets the motion's vote run out, approved by two Alliances or not voted, and ticks the motions and the reports. */
  async function closeMotion(id: number, approve: boolean): Promise<void> {
    if (approve) {
      for (const voter of [R5_NML, R5_ABC]) {
        await motions.vote({ customId: `${NAP_MOTION_APPROVE_PREFIX}${id.toString()}`, user: { id: voter }, reply: () => Promise.resolve() });
      }
    }
    now = new Date(now.getTime() + 49 * HOUR);
    await motions.tick();
    await reports.tick();
  }

  describe("/nap report", () => {
    test.each([
      ["an R4", R4_NML, "XYZ", WHAT, null, "NaP Council"],
      ["an R5 outside the NaP", OUTSIDER, "XYZ", WHAT, null, "NaP Council"],
      ["their own Alliance", R5_NML, "nml", WHAT, null, "own Alliance"],
      ["an Alliance outside the NaP", R5_NML, "QQQ", WHAT, null, "not in the NaP"],
      ["a blank text", R5_NML, "XYZ", "   ", null, "what happened"],
      ["a too-long text", R5_NML, "XYZ", "x".repeat(1001), null, "1000"],
      ["an invalid uid", R5_NML, "XYZ", WHAT, -5, "uid"],
    ])("%s is refused privately, with nothing stored, posted or logged", async (_what, userId, alliance, what, player, says) => {
      const asked = command(userId, { alliance, what, player });
      await reports.report(asked);

      expect(asked.replies).toHaveLength(1);
      expect(asked.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(asked.replies[0]?.allowedMentions).toEqual({ parse: [] });
      expect(contentOf(asked.replies[0])).toContain(says);
      expect(store.reports()).toEqual([]);
      expect(server.threads).toEqual([]);
      expect(server.posts).toEqual([]);
      expect(server.logs).toEqual([]);
    });

    test("stores report 1, opens a private thread under #nap-leaders with the NaP Council and the reporter, and posts the report", async () => {
      const asked = command(R5_NML, { alliance: "xyz", what: `  ${WHAT}  `, player: Number(ACCUSED_UID) });
      await reports.report(asked);

      expect(store.reports()).toEqual([
        {
          number: 1,
          accusedTag: "XYZ",
          accusedUid: ACCUSED_UID,
          what: WHAT,
          reportedBy: R5_NML,
          reporterTag: "NML",
          reportedAt: NOW,
          threadId: THREAD,
        },
      ]);
      expect(server.threads).toEqual([{ parentId: LEADERS, name: "NaP report 1 · [XYZ]", memberIds: [R5_NML, R5_ABC, R5_XYZ] }]);
      const [intro] = server.postsIn(THREAD);
      expect(intro?.message.allowedMentions).toEqual({ parse: [] });
      expect(contentOf(intro?.message)).toContain("NaP report 1");
      expect(contentOf(intro?.message)).toContain(WHAT);
      expect(contentOf(intro?.message)).toContain("evidence");
      expect(server.postsIn(LEADERS)).toEqual([]);
      expect(server.postsIn(ANNOUNCEMENTS)).toEqual([]);
      expect(asked.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(contentOf(asked.replies[0])).toContain(`<#${THREAD}>`);
      expect(server.logs).toEqual([`<@${R5_NML}> filed NaP report 1 on [XYZ].`]);
    });

    test("numbers the next report one higher", async () => {
      await fileOne();
      await reports.report(command(R5_ABC, { alliance: "NML", what: WHAT }));
      expect(store.reports().map((report) => [report.number, report.accusedTag, report.accusedUid])).toEqual([
        [1, "XYZ", ACCUSED_UID],
        [2, "NML", undefined],
      ]);
    });

    test("without #nap-leaders, or when the thread cannot be opened, the report is removed, refused privately and logged", async () => {
      server.leaders = undefined;
      const first = command(R5_NML, { alliance: "XYZ", what: WHAT });
      await reports.report(first);
      server.leaders = LEADERS;
      server.refuseThread = true;
      const second = command(R5_NML, { alliance: "XYZ", what: WHAT });
      await reports.report(second);

      expect(store.reports()).toEqual([]);
      expect(contentOf(first.replies[0])).toContain("#nap-leaders");
      expect(contentOf(second.replies[0])).toContain("private thread");
      expect(server.logs).toEqual([
        `The NaP report by <@${R5_NML}> on [XYZ] was not filed: the server has no #nap-leaders.`,
        `The NaP report by <@${R5_NML}> on [XYZ] was not filed: the thread could not be opened (Missing Permissions).`,
      ]);
    });
  });

  describe("/nap report-outcome", () => {
    test("opens a NaP Motion naming only the number, the accused Alliance and the outcome, and posts the note in the thread", async () => {
      await fileOne();
      const asked = command(R5_ABC, { report: 1, outcome: "warning", note: "  First time, be gentle.  " });
      await reports.proposeOutcome(asked);

      const [proposal] = store.proposals();
      expect(proposal).toMatchObject({ report: 1, outcome: "warning", note: "First time, be gentle.", proposedBy: R5_ABC });
      const motion = proposal?.motion === undefined ? undefined : motionStore.get(proposal.motion);
      expect(motion?.text).toBe("NaP report 1 on [XYZ]: proposed outcome Warning.");
      const leaders = JSON.stringify(server.postsIn(LEADERS));
      for (const secret of ["First time", WHAT, `<@${R5_NML}>`]) expect(leaders).not.toContain(secret);
      expect(contentOf(asked.replies[0])).toContain("NaP Motion #1");
      expect(asked.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      const threadPosts = server.postsIn(THREAD);
      expect(contentOf(threadPosts.at(-1)?.message)).toContain("First time, be gentle.");
      expect(threadPosts.at(-1)?.message.allowedMentions).toEqual({ parse: [] });
      expect(server.logs.at(-1)).toBe(
        `NaP Council member <@${R5_ABC}> proposed the outcome Warning for NaP report 1, put to NaP Motion #1.`,
      );
    });

    test("is refused for a Member outside the NaP Council, an unknown report, and a second waiting proposal", async () => {
      await fileOne();
      const outsider = command(OUTSIDER, { report: 1, outcome: "warning" });
      await reports.proposeOutcome(outsider);
      expect(contentOf(outsider.replies[0])).toContain("NaP Council");
      const unknown = command(R5_ABC, { report: 9, outcome: "warning" });
      await reports.proposeOutcome(unknown);
      expect(contentOf(unknown.replies[0])).toContain("no NaP report 9");
      await proposeOne("warning");
      const second = command(R5_NML, { report: 1, outcome: "dismissed" });
      await reports.proposeOutcome(second);
      expect(contentOf(second.replies[0])).toContain("still waits");
      expect(store.proposals()).toHaveLength(1);
    });

    test("refuses Exile for a report without an accused Player, and any outcome for a decided report", async () => {
      await fileOne(null);
      const exile = command(R5_ABC, { report: 1, outcome: "exile" });
      await reports.proposeOutcome(exile);
      expect(contentOf(exile.replies[0])).toContain("no accused Player");
      await closeMotion(await proposeOne("dismissed"), true);
      const again = command(R5_ABC, { report: 1, outcome: "warning" });
      await reports.proposeOutcome(again);
      expect(contentOf(again.replies[0])).toContain("already decided");
    });

    test("a NaP Motion that cannot be posted removes the proposal, refuses privately and logs", async () => {
      await fileOne();
      server.refusePostIn = LEADERS;
      const asked = command(R5_ABC, { report: 1, outcome: "warning" });
      await reports.proposeOutcome(asked);

      expect(store.proposals()).toEqual([]);
      expect(contentOf(asked.replies[0])).toContain("nothing was proposed");
      expect(server.logs.at(-1)).toBe(
        `The outcome for NaP report 1 proposed by <@${R5_ABC}> was not saved: the NaP Motion could not be opened (Missing Permissions).`,
      );
    });
  });

  describe("the tick", () => {
    test("a rejected outcome leaves the report open, posts in the thread, logs, and announces nothing", async () => {
      await fileOne();
      const motion = await proposeOne("warning");
      const before = server.postsIn(ANNOUNCEMENTS).length;
      await closeMotion(motion, false);

      expect(store.proposals()[0]?.status.kind).toBe("rejected");
      expect(contentOf(server.postsIn(THREAD).at(-1)?.message)).toContain("rejected");
      expect(server.logs).toContain(
        `The outcome Warning for NaP report 1 was rejected by NaP Motion #${motion.toString()}; the report stays open.`,
      );
      // Only the motion's own decision-log entry, nothing from the report.
      expect(server.postsIn(ANNOUNCEMENTS)).toHaveLength(before + 1);
      await proposeOne("dismissed");
      expect(store.proposals()).toHaveLength(2);
    });

    test("an approved outcome decides the report once, posts in the thread and announces only number, Alliance, outcome and date", async () => {
      await fileOne();
      const motion = await proposeOne("compensation", "Pay back 10M food.");
      await closeMotion(motion, true);
      const decidedAt = now;

      expect(store.proposals()[0]?.status).toEqual({ kind: "approved", decidedAt });
      expect(contentOf(server.postsIn(THREAD).at(-1)?.message)).toContain("approved");
      const announced = server.postsIn(ANNOUNCEMENTS).at(-1);
      expect(announced?.message).toEqual({
        content: `⚖️ **NaP report 1** on [XYZ]: Compensation (decided by the NaP Council, <t:${unix(decidedAt)}:D>).`,
        allowedMentions: { parse: [] },
      });
      const everything = JSON.stringify(server.postsIn(ANNOUNCEMENTS));
      for (const secret of ["Pay back", WHAT, "<@"]) expect(everything).not.toContain(secret);
      expect(server.logs).toContain(`NaP report 1 was decided by NaP Motion #${motion.toString()}: Compensation.`);

      const posts = server.posts.length;
      const logs = server.logs.length;
      await reports.tick();
      await reports.settle(motion, "approved");
      expect(server.posts).toHaveLength(posts);
      expect(server.logs).toHaveLength(logs);
    });

    test("an approved expulsion takes the accused Alliance out through the NaP register, with the proposer and the motion", async () => {
      await fileOne();
      const motion = await proposeOne("expelled");
      await closeMotion(motion, true);
      expect(expelled).toEqual([{ tag: "XYZ", by: R5_ABC, motionId: motion }]);
    });

    test("an approved Exile adds the accused Player to REAPER with the report as reason", async () => {
      await fileOne();
      const motion = await proposeOne("exile");
      await closeMotion(motion, true);

      expect(reads).toEqual([ACCUSED_UID]);
      expect(reaper.find(uidOf(ACCUSED_UID))).toMatchObject({ name: "Burner", reason: "NaP report 1: Exile", addedBy: R5_ABC });
      expect(reaperLogs).toHaveLength(1);
      expect(contentOf(server.postsIn(THREAD).at(-1)?.message)).toContain("is now an Exile");
    });

    test("an approved Exile keeps a Player who already is an Exile as stored", async () => {
      reaper.add({
        uid: uidOf(ACCUSED_UID),
        name: "Burner",
        kingdom: HOME,
        lastPosition: undefined,
        reason: reasonOf("Old reason"),
        addedAt: NOW,
        addedBy: OFFICER,
      });
      await fileOne();
      await closeMotion(await proposeOne("exile"), true);

      expect(reaper.find(uidOf(ACCUSED_UID))).toMatchObject({ addedBy: OFFICER });
      expect(reaperLogs).toEqual([]);
      expect(contentOf(server.postsIn(THREAD).at(-1)?.message)).toContain("stays as it was");
    });

    test("when the Player cannot be read, the thread and the log say so and the report stays decided", async () => {
      readResult = { kind: "quota-spent", resetsAt: NOW };
      await fileOne();
      const motion = await proposeOne("exile");
      await closeMotion(motion, true);

      expect(store.proposals()[0]?.status.kind).toBe("approved");
      expect(reaper.find(uidOf(ACCUSED_UID))).toBeUndefined();
      expect(contentOf(server.postsIn(THREAD).at(-1)?.message)).toContain("/reaper add");
      expect(server.logs.some((line) => line.includes("was not added") && line.includes(ACCUSED_UID))).toBe(true);
    });

    test("a missing #nap-announcements only logs a line, and the decision stands", async () => {
      await fileOne();
      const motion = await proposeOne("warning");
      server.announcements = undefined;
      await closeMotion(motion, true);

      expect(store.proposals()[0]?.status.kind).toBe("approved");
      expect(server.logs).toContain("The outcome of NaP report 1 was not announced: the server has no #nap-announcements.");
    });

    test("never throws", async () => {
      await fileOne();
      await proposeOne("warning");
      db.exec("UPDATE nap_report_proposals SET proposed_at = 'broken'");
      await reports.tick();
      expect(errors.some((line) => line.includes("The NaP Report tick failed"))).toBe(true);
    });
  });

  test("no code path deletes, archives or locks a report thread, and report rows are never deleted at Unlink", () => {
    const source = readFileSync(join(import.meta.dirname, "nap-reports.ts"), "utf8");
    for (const forbidden of ["deleteThread", ".delete(", "setArchived", "setLocked", "archived", "locked"]) {
      expect(source).not.toContain(forbidden);
    }
    const unlink = readFileSync(join(import.meta.dirname, "unlink.ts"), "utf8");
    expect(unlink).not.toContain("nap_report");
    expect(unlink).not.toContain("NapReport");
  });
});
