import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageFlags, type APIEmbed, type BaseMessageOptions, type InteractionReplyOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { KnownAlliance } from "../domain/alliance-match.js";
import type { Editor } from "../domain/exile.js";
import type { KingdomNumber } from "../domain/lookup-input.js";
import type { NapEvent } from "../domain/nap.js";
import { kingdomOf } from "../domain/__fixtures__/players.js";
import { openDatabase } from "../storage/database.js";
import { NapStore } from "../storage/nap-store.js";
import { createNap, type Nap, type NapButton, type NapCommand, type NapServer } from "./nap.js";
import { NAP_APPROVE_PREFIX, napApproveRow } from "./nap-texts.js";

const HOME = kingdomOf(330);
const NOW = new Date("2026-11-16T20:00:00.000Z");
const MODERATOR_ROLE = "900000000000000001";
const OFFICER = "500000000000000005";
const R5_NML = "100000000000000001";
const R5_ABC = "100000000000000002";
const R5_XYZ = "100000000000000003";
const R4_NML = "100000000000000006";
const FAR_R5 = "100000000000000007";
const STRANGER = "100000000000000008";
const LEADERS = "700000000000000002";

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
  [R5_XYZ]: r5("XYZ"),
  [R4_NML]: { ...r5("NML"), allianceRank: { source: "game-api", rank: "R4" } },
  [FAR_R5]: r5("FAR", kingdomOf(331)),
};

class FakeServer implements NapServer {
  leaders: string | undefined = LEADERS;
  refusePost = false;
  refuseEdit = false;
  refuseLog = false;
  readonly posts: { channelId: string; message: BaseMessageOptions; id: string }[] = [];
  readonly edits: { channelId: string; messageId: string; message: BaseMessageOptions }[] = [];
  readonly deleted = new Set<string>();
  readonly logs: string[] = [];
  private nextId = 800000000000000001n;

  leadersChannelId(): string | undefined {
    return this.leaders;
  }
  post(channelId: string, message: BaseMessageOptions): Promise<string> {
    if (this.refusePost) return Promise.reject(new Error("Missing Permissions"));
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
  log(line: string): Promise<void> {
    if (this.refuseLog) return Promise.reject(new Error("Missing Access"));
    this.logs.push(line);
    return Promise.resolve();
  }
}

interface Replies {
  readonly replies: InteractionReplyOptions[];
}

function command(userId: string, roles: readonly string[] = []): NapCommand & Replies {
  const replies: InteractionReplyOptions[] = [];
  return {
    user: { id: userId },
    memberRoleIds: () => roles,
    reply: (options) => {
      replies.push(options);
      return Promise.resolve();
    },
    replies,
  };
}

type Update = Parameters<NapButton["update"]>[0];

function button(customId: string, userId: string, roles: readonly string[] = []): NapButton & Replies & { readonly updates: Update[] } {
  const replies: InteractionReplyOptions[] = [];
  const updates: Update[] = [];
  return {
    customId,
    user: { id: userId },
    memberRoleIds: () => roles,
    reply: (options) => {
      replies.push(options);
      return Promise.resolve();
    },
    update: (options) => {
      updates.push(options);
      return Promise.resolve();
    },
    replies,
    updates,
  };
}

function embedOf(reply: InteractionReplyOptions | undefined): APIEmbed {
  const embed = reply?.embeds?.[0];
  if (embed === undefined) throw new Error("no embed");
  return "toJSON" in embed ? embed.toJSON() : embed;
}

function unix(moment: Date): string {
  return Math.floor(moment.getTime() / 1000).toString();
}

function approveIdOf(post: { message: BaseMessageOptions } | undefined): string {
  const row = post?.message.components?.[0];
  const json = row !== undefined && "toJSON" in row ? row.toJSON() : row;
  const first = json !== undefined && "components" in json ? json.components[0] : undefined;
  if (first === undefined || !("custom_id" in first) || typeof first.custom_id !== "string") throw new Error("no button");
  return first.custom_id;
}

describe("createNap", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: NapStore;
  let server: FakeServer;
  let now: Date;
  let errors: string[];
  let nap: Nap;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-nap-adapter-"));
    db = openDatabase(dataDir);
    store = new NapStore(db);
    server = new FakeServer();
    now = NOW;
    errors = [];
    nap = createNap({
      store,
      knownAlliances: { all: () => KNOWN },
      editorOf: (memberId) => EDITORS[memberId],
      server,
      homeKingdom: HOME,
      officerRoleIds: [MODERATOR_ROLE, "900000000000000002"],
      now: () => now,
      logError: (line) => errors.push(line),
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function seedMember(tag: string, at = new Date("2026-11-01T10:00:00.000Z")): void {
    store.append({
      kind: "joined",
      tag,
      requestedBy: R5_NML,
      requestedAt: at,
      approvedBy: OFFICER,
      approvedAs: "officer",
      at,
    });
  }

  describe("/nap show", () => {
    test("says no Alliance is in the NaP yet, privately", async () => {
      const show = command(STRANGER);
      await nap.show(show);

      expect(show.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(embedOf(show.replies[0]).description).toContain("No Alliance is in the NaP yet");
    });

    test("lists the members with their join times and the open requests by tag, to anyone, naming no Member", async () => {
      const since = new Date("2026-11-01T10:00:00.000Z");
      seedMember("NML", since);
      store.addRequest({ tag: "ABC", requestedBy: R5_ABC, requestedAt: NOW });

      const show = command(STRANGER);
      await nap.show(show);

      const description = embedOf(show.replies[0]).description ?? "";
      expect(show.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(show.replies[0]?.allowedMentions).toEqual({ parse: [] });
      expect(description).toContain(`[NML] No Man's Land, since <t:${unix(since)}:D>`);
      expect(description).toContain("[ABC]");
      expect(description).not.toContain("<@");
    });
  });

  describe("/nap join", () => {
    test("posts the request with an Approve button in #nap-leaders, mentioning nobody, and logs one line", async () => {
      const join = command(R5_ABC);
      await nap.join(join);

      expect(server.posts).toHaveLength(1);
      const post = server.posts[0];
      expect(post?.channelId).toBe(LEADERS);
      expect(post?.message.content).toContain(`<@${R5_ABC}>`);
      expect(post?.message.content).toContain("[ABC] Alpha Bravo");
      expect(post?.message.allowedMentions).toEqual({ parse: [] });
      expect(approveIdOf(post)).toBe(`${NAP_APPROVE_PREFIX}ABC:${NOW.getTime().toString()}`);
      expect(store.request("ABC")).toEqual({
        tag: "ABC",
        requestedBy: R5_ABC,
        requestedAt: NOW,
        channelId: LEADERS,
        messageId: post?.id,
      });
      expect(join.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(join.replies[0]?.content).toContain("#nap-leaders");
      expect(server.logs).toEqual([`<@${R5_ABC}> asked for [ABC] to join the NaP.`]);
    });

    test("refuses a Member who is not a Linked R5 of a Home Kingdom Alliance", async () => {
      for (const memberId of [R4_NML, FAR_R5, STRANGER]) {
        const join = command(memberId);
        await nap.join(join);
        expect(join.replies[0]?.content).toContain("Only a Member Linked to the R5");
      }
      expect(server.posts).toEqual([]);
      expect(store.openRequests()).toEqual([]);
    });

    test("refuses the R5 of an Alliance already in the NaP", async () => {
      seedMember("NML");
      const join = command(R5_NML);
      await nap.join(join);

      expect(join.replies[0]?.content).toContain("already in the NaP");
      expect(server.posts).toEqual([]);
    });

    test("refuses a second request while one for the same Alliance is open", async () => {
      await nap.join(command(R5_ABC));
      const again = command(R5_ABC);
      await nap.join(again);

      expect(again.replies[0]?.content).toContain("already waits for approval");
      expect(server.posts).toHaveLength(1);
    });

    test("a request left unposted by a restart for over a minute is asked again, with a new button", async () => {
      store.addRequest({ tag: "ABC", requestedBy: R5_ABC, requestedAt: new Date(NOW.getTime() - 61_000) });
      const join = command(R5_ABC);
      await nap.join(join);

      expect(server.posts).toHaveLength(1);
      expect(approveIdOf(server.posts[0])).toBe(`${NAP_APPROVE_PREFIX}ABC:${NOW.getTime().toString()}`);
      expect(store.request("ABC")?.messageId).toBe(server.posts[0]?.id);
      expect(join.replies[0]?.content).toContain("#nap-leaders");
    });

    test("a request still being posted, within a minute, is not asked twice", async () => {
      store.addRequest({ tag: "ABC", requestedBy: R5_ABC, requestedAt: new Date(NOW.getTime() - 30_000) });
      const join = command(R5_ABC);
      await nap.join(join);

      expect(join.replies[0]?.content).toContain("already waits for approval");
      expect(server.posts).toEqual([]);
    });

    test("without #nap-leaders, drops the request, tells the R5 and logs one line", async () => {
      server.leaders = undefined;
      const join = command(R5_ABC);
      await nap.join(join);

      expect(store.openRequests()).toEqual([]);
      expect(join.replies[0]?.content).toContain("no #nap-leaders");
      expect(server.logs).toEqual(["The NaP join request for [ABC] was not posted: the server has no #nap-leaders."]);
    });

    test("when the post fails, drops the request, tells the R5 and logs one line", async () => {
      server.refusePost = true;
      const join = command(R5_ABC);
      await nap.join(join);

      expect(store.openRequests()).toEqual([]);
      expect(join.replies[0]?.content).toContain("could not post");
      expect(server.logs).toEqual(["Posting the NaP join request for [ABC] in #nap-leaders failed: Missing Permissions"]);
    });

    describe("an open request whose message is gone (#148)", () => {
      async function openThenDelete(): Promise<string> {
        await nap.join(command(R5_ABC));
        const first = server.posts[0];
        if (first === undefined) throw new Error("not posted");
        server.deleted.add(first.id);
        server.logs.length = 0;
        return first.id;
      }

      test("posts the same request again with the same Approve button, and the reposted button approves it", async () => {
        const oldId = await openThenDelete();
        now = new Date(NOW.getTime() + 3_600_000);
        const again = command(R5_ABC);
        await nap.join(again);

        expect(server.posts).toHaveLength(2);
        const repost = server.posts[1];
        expect(repost?.channelId).toBe(LEADERS);
        expect(repost?.id).not.toBe(oldId);
        expect(repost?.message.content).toContain(`<@${R5_ABC}>`);
        expect(repost?.message.allowedMentions).toEqual({ parse: [] });
        expect(approveIdOf(repost)).toBe(`${NAP_APPROVE_PREFIX}ABC:${NOW.getTime().toString()}`);
        expect(store.request("ABC")).toEqual({
          tag: "ABC",
          requestedBy: R5_ABC,
          requestedAt: NOW,
          channelId: LEADERS,
          messageId: repost?.id,
        });
        expect(again.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
        expect(again.replies[0]?.content).toBe(
          "The join request for [ABC] Alpha Bravo was missing in #nap-leaders, so Neil posted it again.",
        );
        expect(server.logs).toEqual([`<@${R5_ABC}> had the NaP join request for [ABC] posted again in #nap-leaders.`]);

        const press = button(approveIdOf(repost), OFFICER, [MODERATOR_ROLE]);
        await nap.approve(press);
        expect(press.updates).toHaveLength(1);
        expect(store.request("ABC")).toBeUndefined();
      });

      test("a request posted in a channel that is no longer #nap-leaders is posted in the current #nap-leaders", async () => {
        await nap.join(command(R5_ABC));
        server.leaders = "700000000000000009";
        const again = command(R5_ABC);
        await nap.join(again);

        expect(server.posts).toHaveLength(2);
        expect(server.posts[1]?.channelId).toBe("700000000000000009");
        expect(store.request("ABC")?.channelId).toBe("700000000000000009");
        expect(store.request("ABC")?.messageId).toBe(server.posts[1]?.id);
        expect(again.replies[0]?.content).toContain("posted it again");
      });

      test("a message still there is refreshed with the current text and button, and nothing new is posted", async () => {
        await nap.join(command(R5_ABC));
        seedMember("NML");
        server.logs.length = 0;
        const again = command(R5_ABC);
        await nap.join(again);

        expect(again.replies[0]?.content).toContain("already waits for approval");
        expect(server.posts).toHaveLength(1);
        expect(server.logs).toEqual([]);
        expect(server.edits).toHaveLength(1);
        const edit = server.edits[0];
        expect(edit?.messageId).toBe(server.posts[0]?.id);
        expect(edit?.message.content).toContain("A member of the NaP Council approves it");
        expect(edit?.message.allowedMentions).toEqual({ parse: [] });
        expect(approveIdOf(edit)).toBe(`${NAP_APPROVE_PREFIX}ABC:${NOW.getTime().toString()}`);
      });

      test("without #nap-leaders, the request stays open, the R5 is told and one line is logged", async () => {
        await openThenDelete();
        server.leaders = undefined;
        const again = command(R5_ABC);
        await nap.join(again);

        expect(store.request("ABC")).toBeDefined();
        expect(again.replies[0]?.content).toContain("no #nap-leaders");
        expect(server.logs).toEqual([
          "The NaP join request for [ABC] was not posted again: the server has no #nap-leaders.",
        ]);
      });

      test("when the repost fails, the request stays open, the R5 is told and one line is logged", async () => {
        await openThenDelete();
        server.refusePost = true;
        const again = command(R5_ABC);
        await nap.join(again);

        expect(store.request("ABC")).toBeDefined();
        expect(again.replies[0]?.content).toContain("could not post");
        expect(server.logs).toEqual([
          "Posting the NaP join request for [ABC] in #nap-leaders again failed: Missing Permissions",
        ]);
      });

      test("when the edit fails, the request stays open, the R5 is told and one line is logged", async () => {
        await nap.join(command(R5_ABC));
        server.logs.length = 0;
        server.refuseEdit = true;
        const again = command(R5_ABC);
        await nap.join(again);

        expect(store.request("ABC")?.messageId).toBe(server.posts[0]?.id);
        expect(again.replies[0]?.content).toContain("could not post");
        expect(server.logs).toEqual(["Posting the NaP join request for [ABC] in #nap-leaders again failed: Missing Access"]);
      });

      test("two /nap join at the same time repost the request once", async () => {
        await openThenDelete();
        const first = command(R5_ABC);
        const second = command(R5_ABC);
        await Promise.all([nap.join(first), nap.join(second)]);

        expect(server.posts).toHaveLength(2);
        expect(second.replies[0]?.content).toContain("already waits for approval");
        expect(first.replies[0]?.content).toContain("posted it again");
      });
    });

    test("a failed log line goes to the error log and never throws", async () => {
      server.refuseLog = true;
      await nap.join(command(R5_ABC));

      expect(errors).toEqual(["Logging a NaP line failed: Missing Access"]);
    });
  });

  describe("the Approve button", () => {
    async function ask(memberId: string): Promise<string> {
      await nap.join(command(memberId));
      return approveIdOf(server.posts.at(-1));
    }

    test("an Officer approves while the NaP is empty, recording asker, approver and times", async () => {
      const customId = await ask(R5_NML);
      now = new Date("2026-11-16T21:00:00.000Z");
      const press = button(customId, OFFICER, [MODERATOR_ROLE]);
      await nap.approve(press);

      const expected: NapEvent = {
        kind: "joined",
        tag: "NML",
        requestedBy: R5_NML,
        requestedAt: NOW,
        approvedBy: OFFICER,
        approvedAs: "officer",
        at: now,
      };
      expect(store.history()).toEqual([expected]);
      expect(store.openRequests()).toEqual([]);
      expect(press.updates).toEqual([
        {
          content: `[NML] No Man's Land is now in the NaP: asked by <@${R5_NML}>, approved by <@${OFFICER}> (Officer).`,
          components: [],
          allowedMentions: { parse: [] },
        },
      ]);
      expect(server.logs.at(-1)).toBe(`Officer <@${OFFICER}> approved [NML] joining the NaP (asked by <@${R5_NML}>).`);
    });

    test("a member of the NaP Council approves, and the Alliance is then in the NaP", async () => {
      seedMember("NML");
      const customId = await ask(R5_ABC);
      const press = button(customId, R5_NML);
      await nap.approve(press);

      expect(store.history().at(-1)).toMatchObject({ kind: "joined", tag: "ABC", approvedBy: R5_NML, approvedAs: "council" });
      expect(press.updates).toHaveLength(1);
      expect(server.logs.at(-1)).toBe(`NaP Council member <@${R5_NML}> approved [ABC] joining the NaP (asked by <@${R5_ABC}>).`);
    });

    test("an Officer's press changes nothing once an Alliance is in the NaP", async () => {
      seedMember("NML");
      const customId = await ask(R5_ABC);
      const press = button(customId, OFFICER, [MODERATOR_ROLE]);
      await nap.approve(press);

      expect(press.replies[0]?.content).toContain("Only a member of the NaP Council");
      expect(press.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(store.history()).toHaveLength(1);
      expect(store.request("ABC")).toBeDefined();
    });

    test("others change nothing: the asker, an R5 outside the NaP, an R4 of a member", async () => {
      seedMember("NML");
      const customId = await ask(R5_ABC);
      for (const memberId of [R5_ABC, R5_XYZ, R4_NML, STRANGER]) {
        const press = button(customId, memberId);
        await nap.approve(press);
        expect(press.replies[0]?.content).toContain("Only a member of the NaP Council");
        expect(press.updates).toEqual([]);
      }
      expect(store.history()).toHaveLength(1);
    });

    test("a second press approves once", async () => {
      seedMember("NML");
      const customId = await ask(R5_ABC);
      const first = button(customId, R5_NML);
      const second = button(customId, R5_NML);
      await Promise.all([nap.approve(first), nap.approve(second)]);

      expect(store.history()).toHaveLength(2);
      expect(first.updates).toHaveLength(1);
      expect(second.replies[0]?.content).toBe("This join request is no longer open.");
    });

    test("a stale button, of an earlier request of the same Alliance, changes nothing", async () => {
      seedMember("NML");
      store.addRequest({ tag: "ABC", requestedBy: R5_ABC, requestedAt: NOW });
      const stale = napApproveRow("ABC", new Date(NOW.getTime() - 60_000)).components[0]?.custom_id ?? "";
      const press = button(stale, R5_NML);
      await nap.approve(press);

      expect(press.replies[0]?.content).toBe("This join request is no longer open.");
      expect(store.history()).toHaveLength(1);
    });

    test("a button of a request that is gone changes nothing", async () => {
      const press = button(`${NAP_APPROVE_PREFIX}ABC:${NOW.getTime().toString()}`, OFFICER, [MODERATOR_ROLE]);
      await nap.approve(press);

      expect(press.replies[0]?.content).toBe("This join request is no longer open.");
      expect(store.history()).toEqual([]);
    });
  });

  describe("/nap leave", () => {
    test("the R5 of a member takes it out, privately, and the council is told in #nap-leaders", async () => {
      seedMember("NML");
      now = new Date("2026-11-17T08:00:00.000Z");
      const leave = command(R5_NML);
      await nap.leave(leave);

      expect(store.history().at(-1)).toEqual({ kind: "left", tag: "NML", leftBy: R5_NML, at: now });
      expect(leave.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(leave.replies[0]?.content).toContain("has left the NaP");
      expect(server.posts).toHaveLength(1);
      expect(server.posts[0]?.channelId).toBe(LEADERS);
      expect(server.posts[0]?.message.allowedMentions).toEqual({ parse: [] });
      expect(server.logs).toEqual([`<@${R5_NML}> took [NML] out of the NaP.`]);
    });

    test("others are refused: an R4 of a member, an R5 outside the NaP, an Officer", async () => {
      seedMember("NML");
      for (const [memberId, roles] of [
        [R4_NML, []],
        [R5_ABC, []],
        [OFFICER, [MODERATOR_ROLE]],
      ] as const) {
        const leave = command(memberId, roles);
        await nap.leave(leave);
        expect(leave.replies[0]?.content).toContain("Only a Member Linked to the R5 of an Alliance in the NaP");
      }
      expect(store.history()).toHaveLength(1);
      expect(server.posts).toEqual([]);
    });

    test("without #nap-leaders or with a failed post, it still leaves and only logs a line", async () => {
      seedMember("NML");
      seedMember("ABC");
      server.leaders = undefined;
      await nap.leave(command(R5_NML));
      server.leaders = LEADERS;
      server.refusePost = true;
      await nap.leave(command(R5_ABC));

      expect(store.history().filter((event) => event.kind === "left")).toHaveLength(2);
      expect(server.logs).toContain("The NaP leave of [NML] was not posted: the server has no #nap-leaders.");
      expect(server.logs).toContain("Posting the NaP leave of [ABC] in #nap-leaders failed: Missing Permissions");
    });
  });

  describe("/nap history", () => {
    test("shows council members the history, newest first, with the Members as mentions and mentioning nobody", async () => {
      const joinedAt = new Date("2026-11-01T10:00:00.000Z");
      seedMember("NML", joinedAt);
      store.append({
        kind: "joined",
        tag: "ABC",
        requestedBy: R5_ABC,
        requestedAt: new Date("2026-11-02T09:00:00.000Z"),
        approvedBy: R5_NML,
        approvedAs: "council",
        at: new Date("2026-11-02T10:00:00.000Z"),
      });
      store.append({ kind: "left", tag: "ABC", leftBy: R5_ABC, at: new Date("2026-11-03T10:00:00.000Z") });

      const history = command(R5_NML);
      await nap.history(history);

      expect(history.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(history.replies[0]?.allowedMentions).toEqual({ parse: [] });
      const lines = (embedOf(history.replies[0]).description ?? "").split("\n");
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe(`<t:${unix(new Date("2026-11-03T10:00:00.000Z"))}:f> [ABC] left, by <@${R5_ABC}>`);
      expect(lines[1]).toContain(`[ABC] joined, asked by <@${R5_ABC}>`);
      expect(lines[1]).toContain(`approved by <@${R5_NML}>`);
      expect(lines[1]).not.toContain("Officer");
      expect(lines[2]).toContain(`<t:${unix(joinedAt)}:f> [NML] joined`);
      expect(lines[2]).toContain(`approved by <@${OFFICER}> (Officer)`);
    });

    test("shows Officers the history, at most 20 entries", async () => {
      for (let day = 1; day <= 12; day += 1) {
        const at = new Date(Date.UTC(2026, 10, day, 10));
        seedMember("NML", at);
        store.append({ kind: "left", tag: "NML", leftBy: R5_NML, at: new Date(at.getTime() + 3_600_000) });
      }
      const history = command(OFFICER, [MODERATOR_ROLE]);
      await nap.history(history);

      expect((embedOf(history.replies[0]).description ?? "").split("\n")).toHaveLength(20);
    });

    test("refuses everyone else privately", async () => {
      seedMember("NML");
      for (const memberId of [R5_ABC, R4_NML, STRANGER]) {
        const history = command(memberId);
        await nap.history(history);
        expect(history.replies[0]?.content).toBe("Only the NaP Council and Officers may see the NaP history.");
        expect(history.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      }
    });
  });
});
