import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageFlags, type APIEmbed, type BaseMessageOptions, type InteractionReplyOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { KnownAlliance } from "../domain/alliance-match.js";
import type { Editor } from "../domain/exile.js";
import type { KingdomNumber } from "../domain/lookup-input.js";
import { NAP_COOLDOWN_MS, NAP_VOTE_MS, type NapEvent } from "../domain/nap.js";
import { kingdomOf } from "../domain/__fixtures__/players.js";
import { openDatabase } from "../storage/database.js";
import { NapStore } from "../storage/nap-store.js";
import { createNap, type Nap, type NapButton, type NapCommand, type NapServer } from "./nap.js";
import { NAP_APPROVE_PREFIX, NAP_DECLINE_PREFIX, napVoteRow } from "./nap-texts.js";

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
const OUTSIDER = "100000000000000010";
const LEADERS = "700000000000000002";
const ANNOUNCEMENTS = "700000000000000003";

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
  [OUTSIDER]: r5("QQQ"),
};

class FakeServer implements NapServer {
  leaders: string | undefined = LEADERS;
  announcements: string | undefined = ANNOUNCEMENTS;
  refusePost = false;
  /** Refuses posts in this channel only. */
  refusePostIn: string | undefined;
  refuseEdit = false;
  refusePin = false;
  refuseLog = false;
  readonly pins: { channelId: string; messageId: string }[] = [];
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
  pin(channelId: string, messageId: string): Promise<void> {
    if (this.refusePin) return Promise.reject(new Error("Missing Permissions"));
    this.pins.push({ channelId, messageId });
    return Promise.resolve();
  }
  /** The posts in one channel. */
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

function buttonIdOf(post: { message: BaseMessageOptions } | undefined, index: number): string {
  const row = post?.message.components?.[0];
  const json = row !== undefined && "toJSON" in row ? row.toJSON() : row;
  const found = json !== undefined && "components" in json ? json.components[index] : undefined;
  if (found === undefined || !("custom_id" in found) || typeof found.custom_id !== "string") throw new Error("no button");
  return found.custom_id;
}

function approveIdOf(post: { message: BaseMessageOptions } | undefined): string {
  return buttonIdOf(post, 0);
}

function declineIdOf(post: { message: BaseMessageOptions } | undefined): string {
  return buttonIdOf(post, 1);
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
      decision: { as: "officer", by: OFFICER },
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

    test("lists the former members with when each left, then the waiting requests", async () => {
      const since = new Date("2026-11-01T10:00:00.000Z");
      const leftAt = new Date("2026-11-05T10:00:00.000Z");
      seedMember("NML", since);
      seedMember("XYZ", since);
      store.append({ kind: "left", tag: "XYZ", leftBy: R5_XYZ, at: leftAt });
      const endsAt = new Date(NOW.getTime() + NAP_VOTE_MS);
      store.addRequest({ tag: "ABC", requestedBy: R5_ABC, requestedAt: NOW, voteEndsAt: endsAt });

      const show = command(STRANGER);
      await nap.show(show);

      expect(show.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(embedOf(show.replies[0]).description).toBe(
        [
          "**Members**",
          `- [NML] No Man's Land, since <t:${unix(since)}:D>`,
          "",
          "**Former members**",
          `- [XYZ] Ex Why Zed, left <t:${unix(leftAt)}:D>`,
          "",
          "**Waiting for a decision**",
          `- [ABC], vote ends <t:${unix(endsAt)}:R>`,
        ].join("\n"),
      );
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
      expect(description).toContain("**Waiting for a decision**");
      expect(description).toContain("- [ABC], the vote opens within a minute");
      expect(description).not.toContain("<@");
    });

    test("shows when each waiting request's vote ends, or that an Officer decides while the NaP is empty", async () => {
      await nap.join(command(R5_ABC));
      const empty = command(STRANGER);
      await nap.show(empty);
      expect(embedOf(empty.replies[0]).description).toContain("- [ABC], an Officer decides");

      seedMember("NML");
      await nap.join(command(R5_XYZ));
      const show = command(STRANGER);
      await nap.show(show);
      const end = new Date(NOW.getTime() + NAP_VOTE_MS);
      expect(embedOf(show.replies[0]).description).toContain(`- [XYZ], vote ends <t:${unix(end)}:R>`);
    });
  });

  describe("/nap join", () => {
    test("posts the request with Approve and Decline in #nap-leaders, mentioning nobody, and logs one line", async () => {
      const join = command(R5_ABC);
      await nap.join(join);

      expect(server.posts).toHaveLength(1);
      const post = server.posts[0];
      expect(post?.channelId).toBe(LEADERS);
      expect(post?.message.content).toContain(`<@${R5_ABC}>`);
      expect(post?.message.content).toContain("[ABC] Alpha Bravo");
      expect(post?.message.allowedMentions).toEqual({ parse: [] });
      expect(approveIdOf(post)).toBe(`${NAP_APPROVE_PREFIX}ABC:${NOW.getTime().toString()}`);
      expect(declineIdOf(post)).toBe(`${NAP_DECLINE_PREFIX}ABC:${NOW.getTime().toString()}`);
      expect(post?.message.content).toContain("The NaP has no members yet, so an Officer approves or declines it");
      expect(store.request("ABC")).toEqual({
        tag: "ABC",
        requestedBy: R5_ABC,
        requestedAt: NOW,
        channelId: LEADERS,
        messageId: post?.id,
        voteEndsAt: undefined,
      });
      expect(join.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(join.replies[0]?.content).toContain("#nap-leaders");
      expect(server.logs).toEqual([`<@${R5_ABC}> asked for [ABC] to join the NaP.`]);
    });

    test("while the NaP has members, opens a 48-hour NaP Vote and says until when", async () => {
      seedMember("NML");
      await nap.join(command(R5_ABC));

      const end = new Date(NOW.getTime() + NAP_VOTE_MS);
      expect(store.request("ABC")?.voteEndsAt).toEqual(end);
      const content = server.posts[0]?.message.content ?? "";
      expect(content).toContain(`The NaP Council votes with the buttons until <t:${unix(end)}:f> (<t:${unix(end)}:R>)`);
      expect(content).toContain("one vote per Alliance in the NaP, which can be changed until then");
      expect(content).toContain("may ask again after 30 days");
    });

    test("refuses an Alliance declined less than 30 days ago, saying when it may ask again, and lets it ask after", async () => {
      const declinedAt = new Date(NOW.getTime() - 10 * 24 * 3_600_000);
      store.append({
        kind: "declined",
        tag: "ABC",
        requestedBy: R5_ABC,
        requestedAt: new Date(declinedAt.getTime() - NAP_VOTE_MS),
        decision: { as: "vote", approve: 0, decline: 0 },
        at: declinedAt,
      });
      const join = command(R5_ABC);
      await nap.join(join);

      const end = new Date(declinedAt.getTime() + NAP_COOLDOWN_MS);
      expect(join.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(join.replies[0]?.content).toBe(
        `[ABC] Alpha Bravo was declined on <t:${unix(declinedAt)}:D> and may ask to join the NaP again <t:${unix(end)}:f> (<t:${unix(end)}:R>).`,
      );
      expect(server.posts).toEqual([]);
      expect(store.openRequests()).toEqual([]);

      now = end;
      await nap.join(command(R5_ABC));
      expect(server.posts).toHaveLength(1);
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

      expect(again.replies[0]?.content).toContain("already waits for a decision");
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

      expect(join.replies[0]?.content).toContain("already waits for a decision");
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

      test("posts the same request again with the same buttons, and the reposted button decides it", async () => {
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
          voteEndsAt: undefined,
        });
        expect(again.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
        expect(again.replies[0]?.content).toBe(
          "The join request for [ABC] Alpha Bravo was missing in #nap-leaders, so Neil posted it again.",
        );
        expect(server.logs).toEqual([`<@${R5_ABC}> had the NaP join request for [ABC] posted again in #nap-leaders.`]);

        expect(declineIdOf(repost)).toBe(`${NAP_DECLINE_PREFIX}ABC:${NOW.getTime().toString()}`);
        const press = button(approveIdOf(repost), OFFICER, [MODERATOR_ROLE]);
        await nap.vote(press);
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

      test("a message still there is refreshed with the current text and buttons, and nothing new is posted", async () => {
        await nap.join(command(R5_ABC));
        seedMember("NML");
        server.logs.length = 0;
        now = new Date(NOW.getTime() + 60_000);
        const again = command(R5_ABC);
        await nap.join(again);

        const end = new Date(now.getTime() + NAP_VOTE_MS);
        expect(again.replies[0]?.content).toContain("already waits for a decision");
        expect(server.posts).toHaveLength(1);
        expect(store.request("ABC")?.voteEndsAt).toEqual(end);
        expect(server.logs).toEqual([`The NaP Council's vote on [ABC] joining the NaP is open until <t:${unix(end)}:f>.`]);
        expect(server.edits).toHaveLength(1);
        const edit = server.edits[0];
        expect(edit?.messageId).toBe(server.posts[0]?.id);
        expect(edit?.message.content).toContain(`The NaP Council votes with the buttons until <t:${unix(end)}:f>`);
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
        expect(second.replies[0]?.content).toContain("already waits for a decision");
        expect(first.replies[0]?.content).toContain("posted it again");
      });
    });

    test("a failed log line goes to the error log and never throws", async () => {
      server.refuseLog = true;
      await nap.join(command(R5_ABC));

      expect(errors).toEqual(["Logging a NaP line failed: Missing Access"]);
    });
  });

  describe("the Approve and Decline buttons", () => {
    async function ask(memberId: string): Promise<{ readonly approve: string; readonly decline: string }> {
      await nap.join(command(memberId));
      const post = server.posts.at(-1);
      return { approve: approveIdOf(post), decline: declineIdOf(post) };
    }

    test("an Officer approves while the NaP is empty, recording asker, Officer and times", async () => {
      const { approve } = await ask(R5_NML);
      now = new Date("2026-11-16T21:00:00.000Z");
      const press = button(approve, OFFICER, [MODERATOR_ROLE]);
      await nap.vote(press);

      const expected: NapEvent = {
        kind: "joined",
        tag: "NML",
        requestedBy: R5_NML,
        requestedAt: NOW,
        decision: { as: "officer", by: OFFICER },
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

    test("an Officer declines while the NaP is empty, at once, with the 30-day NaP Cooldown", async () => {
      const { decline } = await ask(R5_NML);
      now = new Date("2026-11-16T21:00:00.000Z");
      const press = button(decline, OFFICER, [MODERATOR_ROLE]);
      await nap.vote(press);

      const askAgain = new Date(now.getTime() + NAP_COOLDOWN_MS);
      expect(store.history()).toEqual([
        {
          kind: "declined",
          tag: "NML",
          requestedBy: R5_NML,
          requestedAt: NOW,
          decision: { as: "officer", by: OFFICER },
          at: now,
        },
      ]);
      expect(store.openRequests()).toEqual([]);
      expect(press.updates).toEqual([
        {
          content: `[NML] No Man's Land was declined: asked by <@${R5_NML}>, declined by <@${OFFICER}> (Officer). It may ask again <t:${unix(askAgain)}:f>.`,
          components: [],
          allowedMentions: { parse: [] },
        },
      ]);
      expect(server.logs.at(-1)).toBe(
        `Officer <@${OFFICER}> declined [NML] joining the NaP (asked by <@${R5_NML}>); it may ask again <t:${unix(askAgain)}:f>.`,
      );
      const join = command(R5_NML);
      await nap.join(join);
      expect(join.replies[0]?.content).toContain("may ask to join the NaP again");
    });

    test("a council member's vote is stored for their Alliance and told privately, and the message is not changed", async () => {
      seedMember("NML");
      const { approve } = await ask(R5_ABC);
      now = new Date(NOW.getTime() + 3_600_000);
      const press = button(approve, R5_NML);
      await nap.vote(press);

      const end = new Date(NOW.getTime() + NAP_VOTE_MS);
      expect(store.votes("ABC", NOW)).toEqual([{ allianceTag: "NML", voterId: R5_NML, vote: "approve", at: now }]);
      expect(store.request("ABC")).toBeDefined();
      expect(store.history()).toHaveLength(1);
      expect(press.updates).toEqual([]);
      expect(server.edits).toEqual([]);
      expect(press.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(press.replies[0]?.content).toBe(
        `Neil recorded Approve as the vote of [NML] No Man's Land on [ABC] Alpha Bravo joining the NaP. You can change it until <t:${unix(end)}:f>.`,
      );
      expect(server.logs.at(-1)).toBe(`NaP Council member <@${R5_NML}> voted Approve for [NML] on [ABC] joining the NaP.`);
    });

    test("a second press changes the Alliance's vote, also by its other Linked R5, and the change is logged", async () => {
      seedMember("NML");
      const { approve, decline } = await ask(R5_ABC);
      await nap.vote(button(approve, R5_NML));
      const OTHER_R5_NML = "100000000000000009";
      const editors: Readonly<Record<string, Editor>> = { ...EDITORS, [OTHER_R5_NML]: r5("nml") };
      nap = createNap({
        store,
        knownAlliances: { all: () => KNOWN },
        editorOf: (memberId) => editors[memberId],
        server,
        homeKingdom: HOME,
        officerRoleIds: [MODERATOR_ROLE],
        now: () => now,
        logError: (line) => errors.push(line),
      });
      const press = button(decline, OTHER_R5_NML);
      await nap.vote(press);

      expect(store.votes("ABC", NOW)).toEqual([{ allianceTag: "NML", voterId: OTHER_R5_NML, vote: "decline", at: now }]);
      expect(press.replies[0]?.content).toContain("Neil recorded Decline as the vote of [NML] No Man's Land");
      expect(press.replies[0]?.content).toContain("(it was Approve)");
      expect(server.logs.at(-1)).toBe(
        `NaP Council member <@${OTHER_R5_NML}> voted Decline for [NML] on [ABC] joining the NaP, changed from Approve.`,
      );
    });

    test("others are refused privately with nothing stored: the asker, an R5 outside the NaP, an R4, an Officer", async () => {
      seedMember("NML");
      const { approve, decline } = await ask(R5_ABC);
      for (const [memberId, roles] of [
        [R5_ABC, []],
        [R5_XYZ, []],
        [R4_NML, []],
        [STRANGER, []],
        [OFFICER, [MODERATOR_ROLE]],
      ] as const) {
        for (const customId of [approve, decline]) {
          const press = button(customId, memberId, roles);
          await nap.vote(press);
          expect(press.replies[0]?.content).toContain("Only a member of the NaP Council");
          expect(press.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
          expect(press.updates).toEqual([]);
        }
      }
      expect(store.votes("ABC", NOW)).toEqual([]);
      expect(store.history()).toHaveLength(1);
      expect(store.request("ABC")).toBeDefined();
    });

    test("a press at or after the vote's end is refused with nothing stored", async () => {
      seedMember("NML");
      const { approve } = await ask(R5_ABC);
      now = new Date(NOW.getTime() + NAP_VOTE_MS);
      const press = button(approve, R5_NML);
      await nap.vote(press);

      expect(press.replies[0]?.content).toBe("The vote on this join request has ended; Neil counts it within a minute.");
      expect(store.votes("ABC", NOW)).toEqual([]);
    });

    test("a press on a request made while the NaP was empty opens its vote first", async () => {
      const { approve } = await ask(R5_ABC);
      seedMember("NML");
      now = new Date(NOW.getTime() + 600_000);
      await nap.vote(button(approve, R5_NML));

      const end = new Date(now.getTime() + NAP_VOTE_MS);
      expect(store.request("ABC")?.voteEndsAt).toEqual(end);
      expect(store.votes("ABC", NOW)).toHaveLength(1);
      expect(server.edits.at(-1)?.message.content).toContain(`votes with the buttons until <t:${unix(end)}:f>`);
      expect(server.logs).toContain(`The NaP Council's vote on [ABC] joining the NaP is open until <t:${unix(end)}:f>.`);
    });

    test("two Officer presses at once decide once", async () => {
      const { approve, decline } = await ask(R5_ABC);
      const first = button(approve, OFFICER, [MODERATOR_ROLE]);
      const second = button(decline, OFFICER, [MODERATOR_ROLE]);
      await Promise.all([nap.vote(first), nap.vote(second)]);

      expect(store.history()).toHaveLength(1);
      expect(first.updates).toHaveLength(1);
      expect(second.replies[0]?.content).toBe("This join request is no longer open.");
    });

    test("a stale button, of an earlier request of the same Alliance, changes nothing", async () => {
      seedMember("NML");
      store.addRequest({ tag: "ABC", requestedBy: R5_ABC, requestedAt: NOW });
      const stale = napVoteRow("ABC", new Date(NOW.getTime() - 60_000)).components[1]?.custom_id ?? "";
      const press = button(stale, R5_NML);
      await nap.vote(press);

      expect(press.replies[0]?.content).toBe("This join request is no longer open.");
      expect(store.votes("ABC", NOW)).toEqual([]);
    });

    test("a button of a request that is gone changes nothing", async () => {
      const press = button(`${NAP_DECLINE_PREFIX}ABC:${NOW.getTime().toString()}`, OFFICER, [MODERATOR_ROLE]);
      await nap.vote(press);

      expect(press.replies[0]?.content).toBe("This join request is no longer open.");
      expect(store.history()).toEqual([]);
    });
  });

  describe("the tick", () => {
    async function voteOn(tag: string, votes: readonly (readonly [string, "approve" | "decline"])[]): Promise<void> {
      const post = server.posts.find((candidate) => approveIdOf(candidate).includes(`:${tag}:`));
      for (const [memberId, choice] of votes) {
        await nap.vote(button(choice === "approve" ? approveIdOf(post) : declineIdOf(post), memberId));
      }
    }

    function council(): void {
      seedMember("NML");
      seedMember("ABC");
      seedMember("XYZ");
    }

    test("2 Approve to 1 Decline approve at the deadline; the message shows the result without buttons", async () => {
      council();
      await nap.join(command(OUTSIDER));
      await voteOn("QQQ", [
        [R5_NML, "approve"],
        [R5_ABC, "approve"],
        [R5_XYZ, "decline"],
      ]);
      now = new Date(NOW.getTime() + NAP_VOTE_MS - 1);
      await nap.tick();
      expect(store.request("QQQ")).toBeDefined();

      now = new Date(NOW.getTime() + NAP_VOTE_MS);
      await nap.tick();

      expect(store.request("QQQ")).toBeUndefined();
      expect(store.history().at(-1)).toEqual({
        kind: "joined",
        tag: "QQQ",
        requestedBy: OUTSIDER,
        requestedAt: NOW,
        decision: { as: "vote", approve: 2, decline: 1 },
        at: now,
      });
      const edit = server.edits.at(-1);
      expect(edit?.messageId).toBe(server.posts[0]?.id);
      expect(edit?.message.content).toBe(
        `[QQQ] is now in the NaP: asked by <@${OUTSIDER}>, approved by the NaP Council's vote (2 Approve, 1 Decline).`,
      );
      expect(edit?.message.components).toEqual([]);
      expect(edit?.message.allowedMentions).toEqual({ parse: [] });
      expect(server.logs.at(-1)).toBe(
        `The NaP Council's vote approved [QQQ] joining the NaP (asked by <@${OUTSIDER}>): 2 Approve, 1 Decline.`,
      );
      expect(store.votes("QQQ", NOW)).toHaveLength(3);
    });

    test("a tie declines, with the NaP Cooldown in the message and the log", async () => {
      council();
      await nap.join(command(OUTSIDER));
      await voteOn("QQQ", [
        [R5_NML, "approve"],
        [R5_ABC, "decline"],
      ]);
      now = new Date(NOW.getTime() + NAP_VOTE_MS + 30_000);
      await nap.tick();

      const askAgain = new Date(now.getTime() + NAP_COOLDOWN_MS);
      expect(store.history().at(-1)).toMatchObject({ kind: "declined", decision: { as: "vote", approve: 1, decline: 1 } });
      expect(server.edits.at(-1)?.message.content).toBe(
        `[QQQ] was declined by the NaP Council's vote (1 Approve, 1 Decline): asked by <@${OUTSIDER}>. It may ask again <t:${unix(askAgain)}:f>.`,
      );
      expect(server.logs.at(-1)).toBe(
        `The NaP Council's vote declined [QQQ] joining the NaP (asked by <@${OUTSIDER}>): 1 Approve, 1 Decline; it may ask again <t:${unix(askAgain)}:f>.`,
      );
    });

    test("no votes at all decline", async () => {
      council();
      await nap.join(command(OUTSIDER));
      now = new Date(NOW.getTime() + 3 * NAP_VOTE_MS);
      await nap.tick();

      expect(store.history().at(-1)).toMatchObject({ kind: "declined", decision: { as: "vote", approve: 0, decline: 0 } });
    });

    test("votes of Alliances that left the NaP do not count", async () => {
      council();
      await nap.join(command(OUTSIDER));
      await voteOn("QQQ", [
        [R5_NML, "approve"],
        [R5_ABC, "approve"],
        [R5_XYZ, "decline"],
      ]);
      await nap.leave(command(R5_NML));
      await nap.leave(command(R5_ABC));
      now = new Date(NOW.getTime() + NAP_VOTE_MS);
      await nap.tick();

      expect(store.history().at(-1)).toMatchObject({ kind: "declined", decision: { as: "vote", approve: 0, decline: 1 } });
    });

    test("nothing closes while the NaP is empty", async () => {
      seedMember("NML");
      await nap.join(command(R5_ABC));
      await nap.leave(command(R5_NML));
      now = new Date(NOW.getTime() + 2 * NAP_VOTE_MS);
      await nap.tick();

      expect(store.request("ABC")).toBeDefined();
    });

    test("a request made while the NaP was empty gets its 48-hour vote on the first tick once the NaP has a member", async () => {
      await nap.join(command(R5_ABC));
      now = new Date(NOW.getTime() + 60_000);
      await nap.tick();
      expect(store.request("ABC")?.voteEndsAt).toBeUndefined();

      seedMember("NML");
      server.logs.length = 0;
      await nap.tick();

      const end = new Date(now.getTime() + NAP_VOTE_MS);
      expect(store.request("ABC")?.voteEndsAt).toEqual(end);
      expect(server.edits).toHaveLength(1);
      expect(server.edits[0]?.messageId).toBe(server.posts[0]?.id);
      expect(server.edits[0]?.message.content).toContain(`The NaP Council votes with the buttons until <t:${unix(end)}:f>`);
      expect(approveIdOf(server.edits[0])).toBe(`${NAP_APPROVE_PREFIX}ABC:${NOW.getTime().toString()}`);
      expect(server.logs).toEqual([`The NaP Council's vote on [ABC] joining the NaP is open until <t:${unix(end)}:f>.`]);

      await nap.tick();
      expect(server.edits).toHaveLength(1);
    });

    test("a gone message or a failed edit only writes a #neil-log line, and the result stands", async () => {
      council();
      await nap.join(command(OUTSIDER));
      const first = server.posts[0];
      if (first === undefined) throw new Error("not posted");
      server.deleted.add(first.id);
      now = new Date(NOW.getTime() + NAP_VOTE_MS);
      await nap.tick();

      expect(store.history().at(-1)).toMatchObject({ kind: "declined", tag: "QQQ" });
      expect(server.logs.at(-1)).toBe("Editing the NaP join request for [QQQ] in #nap-leaders failed: the message is gone");

      now = new Date(now.getTime() + NAP_COOLDOWN_MS);
      await nap.join(command(OUTSIDER));
      server.refuseEdit = true;
      now = new Date(now.getTime() + NAP_VOTE_MS);
      await nap.tick();
      expect(server.logs.at(-1)).toBe("Editing the NaP join request for [QQQ] in #nap-leaders failed: Missing Access");
      expect(errors).toEqual([]);
    });

    test("never throws: a failing store goes to the error log", async () => {
      store.addRequest({ tag: "ABC", requestedBy: R5_ABC, requestedAt: NOW });
      db.exec("DROP TABLE nap_votes");
      seedMember("NML");
      store.setRequestMessage("ABC", NOW, LEADERS, "800000000000000099");
      store.setVoteEnd("ABC", NOW, NOW);
      await expect(nap.tick()).resolves.toBeUndefined();
      expect(errors[0]).toContain("The NaP tick failed");
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
      const notices = server.postsIn(LEADERS);
      expect(notices).toHaveLength(1);
      expect(notices[0]?.message.content).toBe(`[NML] No Man's Land has left the NaP, by its R5 <@${R5_NML}>.`);
      expect(notices[0]?.message.allowedMentions).toEqual({ parse: [] });
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

  describe("#nap-announcements", () => {
    function listOf(post: { message: BaseMessageOptions } | undefined): string {
      const embed = post?.message.embeds?.[0];
      if (embed === undefined) throw new Error("no list");
      const json = "toJSON" in embed ? embed.toJSON() : embed;
      return json.description ?? "";
    }

    /** The asker's request, approved by an Officer at `at` while the NaP is empty. */
    async function approveAt(asker: string, at: Date): Promise<void> {
      await nap.join(command(asker));
      now = at;
      await nap.vote(button(approveIdOf(server.postsIn(LEADERS).at(-1)), OFFICER, [MODERATOR_ROLE]));
    }

    test("a join is announced with only the Alliance and the time, mentions off, and the list is posted and pinned", async () => {
      const at = new Date("2026-11-16T21:00:00.000Z");
      await approveAt(R5_NML, at);

      const posts = server.postsIn(ANNOUNCEMENTS);
      expect(posts).toHaveLength(2);
      expect(posts[0]?.message).toEqual({
        content: `🤝 [NML] No Man's Land has joined the NaP (<t:${unix(at)}:f>).`,
        allowedMentions: { parse: [] },
      });
      expect(posts[1]?.message.allowedMentions).toEqual({ parse: [] });
      expect(listOf(posts[1])).toBe(`**Members**\n- [NML] No Man's Land, since <t:${unix(at)}:D>`);
      expect(server.pins).toEqual([{ channelId: ANNOUNCEMENTS, messageId: posts[1]?.id }]);
      expect(store.listMessageId()).toBe(posts[1]?.id);
      expect(JSON.stringify(posts)).not.toContain("<@");
    });

    test("a leave is announced with only the Alliance and the time, after the #nap-leaders notice, and the list is edited", async () => {
      const joinedAt = new Date("2026-11-16T21:00:00.000Z");
      await approveAt(R5_NML, joinedAt);
      const leftAt = new Date("2026-11-17T08:00:00.000Z");
      now = leftAt;
      await nap.leave(command(R5_NML));

      const posts = server.postsIn(ANNOUNCEMENTS);
      expect(posts).toHaveLength(3);
      expect(posts[2]?.message).toEqual({
        content: `[NML] No Man's Land has left the NaP (<t:${unix(leftAt)}:f>).`,
        allowedMentions: { parse: [] },
      });
      expect(store.history().at(-1)?.at).toEqual(leftAt);
      expect(server.edits).toHaveLength(1);
      const edit = server.edits[0];
      expect(edit?.messageId).toBe(posts[1]?.id);
      expect(listOf(edit)).toBe(
        `No Alliance is in the NaP yet.\n\n**Former members**\n- [NML] No Man's Land, left <t:${unix(leftAt)}:D>`,
      );
      expect(JSON.stringify(edit)).not.toContain("<@");
      expect(server.pins).toHaveLength(1);
    });

    test("the list lists members, then former members newest first, at most 20 of them", async () => {
      seedMember("NML", new Date("2026-11-01T10:00:00.000Z"));
      for (let index = 0; index < 22; index += 1) {
        const tag = `T${index.toString().padStart(2, "0")}`;
        seedMember(tag, new Date(Date.UTC(2026, 9, 1 + index)));
        store.append({ kind: "left", tag, leftBy: R5_ABC, at: new Date(Date.UTC(2026, 9, 2 + index)) });
      }
      await nap.refreshList();

      const lines = listOf(server.postsIn(ANNOUNCEMENTS)[0]).split("\n");
      expect(lines.slice(0, 4)).toEqual([
        "**Members**",
        `- [NML] No Man's Land, since <t:${unix(new Date("2026-11-01T10:00:00.000Z"))}:D>`,
        "",
        "**Former members**",
      ]);
      expect(lines[4]).toBe(`- [T21], left <t:${unix(new Date(Date.UTC(2026, 9, 23)))}:D>`);
      expect(lines).toHaveLength(4 + 20 + 1);
      expect(lines.at(-1)).toBe("…and 2 more.");
    });

    test("a list someone deleted is posted and pinned again", async () => {
      await nap.refreshList();
      const first = server.postsIn(ANNOUNCEMENTS)[0];
      if (first === undefined) throw new Error("not posted");
      server.deleted.add(first.id);
      await nap.refreshList();

      const posts = server.postsIn(ANNOUNCEMENTS);
      expect(posts).toHaveLength(2);
      expect(store.listMessageId()).toBe(posts[1]?.id);
      expect(server.pins.map((pin) => pin.messageId)).toEqual([first.id, posts[1]?.id]);
    });

    test("two quick refreshes post one list", async () => {
      await Promise.all([nap.refreshList(), nap.refreshList()]);

      expect(server.postsIn(ANNOUNCEMENTS)).toHaveLength(1);
      expect(server.edits).toHaveLength(1);
    });

    test("a join decided by the NaP Council's vote is announced with only the Alliance and the time", async () => {
      seedMember("NML");
      await nap.join(command(OUTSIDER));
      await nap.vote(button(approveIdOf(server.postsIn(LEADERS).at(-1)), R5_NML));
      now = new Date(NOW.getTime() + NAP_VOTE_MS);
      await nap.tick();

      const posts = server.postsIn(ANNOUNCEMENTS);
      expect(posts[0]?.message).toEqual({
        content: `🤝 [QQQ] has joined the NaP (<t:${unix(now)}:f>).`,
        allowedMentions: { parse: [] },
      });
      expect(listOf(posts[1])).toContain("[QQQ]");
      expect(JSON.stringify(posts)).not.toContain("<@");
    });

    test("a decline, by vote or by an Officer, is not announced", async () => {
      await nap.join(command(R5_NML));
      await nap.vote(button(declineIdOf(server.postsIn(LEADERS).at(-1)), OFFICER, [MODERATOR_ROLE]));
      seedMember("ABC");
      await nap.join(command(OUTSIDER));
      now = new Date(NOW.getTime() + NAP_VOTE_MS);
      await nap.tick();

      expect(store.history().filter((event) => event.kind === "declined")).toHaveLength(2);
      expect(server.postsIn(ANNOUNCEMENTS)).toEqual([]);
    });

    test("without #nap-announcements, the join still counts, the R5 gets the usual answer and one line is logged", async () => {
      server.announcements = undefined;
      await nap.join(command(R5_NML));
      server.logs.length = 0;
      const press = button(approveIdOf(server.postsIn(LEADERS).at(-1)), OFFICER, [MODERATOR_ROLE]);
      await nap.vote(press);

      expect(store.history()).toHaveLength(1);
      expect(press.updates).toHaveLength(1);
      expect(server.logs).toEqual([
        `Officer <@${OFFICER}> approved [NML] joining the NaP (asked by <@${R5_NML}>).`,
        "The NaP change of [NML] was not announced: the server has no #nap-announcements.",
      ]);
    });

    test("when the announcement fails, the leave still counts, the R5 gets the usual answer and one line is logged", async () => {
      seedMember("NML");
      await nap.refreshList();
      server.refusePostIn = ANNOUNCEMENTS;
      const leave = command(R5_NML);
      await nap.leave(leave);

      expect(store.history().at(-1)?.kind).toBe("left");
      expect(leave.replies[0]?.content).toContain("has left the NaP");
      expect(server.logs).toEqual([
        `<@${R5_NML}> took [NML] out of the NaP.`,
        "Announcing the NaP change of [NML] in #nap-announcements failed: Missing Permissions",
      ]);
      expect(server.edits).toHaveLength(1);
    });

    test("when the list cannot be posted, the join still counts and one line is logged for it", async () => {
      await nap.join(command(R5_NML));
      server.logs.length = 0;
      server.refuseEdit = true;
      store.setListMessageId("800000000000000099");
      const press = button(approveIdOf(server.postsIn(LEADERS).at(-1)), OFFICER, [MODERATOR_ROLE]);
      await nap.vote(press);

      expect(store.history()).toHaveLength(1);
      expect(press.updates).toHaveLength(1);
      expect(server.postsIn(ANNOUNCEMENTS)).toHaveLength(1);
      expect(server.logs.at(-1)).toBe("Updating the NaP list in #nap-announcements failed: Missing Access");
    });

    test("when the pin fails, the list is still posted and kept, and one line is logged", async () => {
      server.refusePin = true;
      await nap.refreshList();

      expect(store.listMessageId()).toBe(server.postsIn(ANNOUNCEMENTS)[0]?.id);
      expect(server.logs).toEqual(["Pinning the NaP list in #nap-announcements failed: Missing Permissions"]);
    });

    test("at startup without #nap-announcements, one line is logged", async () => {
      server.announcements = undefined;
      await nap.refreshList();

      expect(server.posts).toEqual([]);
      expect(server.logs).toEqual(["The NaP list was not posted: the server has no #nap-announcements."]);
    });
  });

  describe("/nap history", () => {
    async function joinAndPost(memberId: string): Promise<{ message: BaseMessageOptions } | undefined> {
      await nap.join(command(memberId));
      return server.posts.at(-1);
    }

    test("shows council members the history, newest first, with the Members as mentions and mentioning nobody", async () => {
      const joinedAt = new Date("2026-11-01T10:00:00.000Z");
      seedMember("NML", joinedAt);
      store.append({
        kind: "joined",
        tag: "ABC",
        requestedBy: R5_ABC,
        requestedAt: new Date("2026-11-02T09:00:00.000Z"),
        decision: { as: "council", by: R5_NML },
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

    test("shows declines and the counts of a vote, naming no voter", async () => {
      seedMember("NML");
      await nap.vote(button(approveIdOf(await joinAndPost(R5_ABC)), R5_NML));
      now = new Date(NOW.getTime() + NAP_VOTE_MS);
      await nap.tick();
      await nap.join(command(R5_XYZ));
      await nap.vote(button(declineIdOf(server.posts.at(-1)), R5_NML));
      now = new Date(now.getTime() + NAP_VOTE_MS);
      await nap.tick();

      const history = command(R5_NML);
      await nap.history(history);
      const lines = (embedOf(history.replies[0]).description ?? "").split("\n");
      const askAgain = new Date(now.getTime() + NAP_COOLDOWN_MS);
      expect(lines[0]).toBe(
        `<t:${unix(now)}:f> [XYZ] declined, asked by <@${R5_XYZ}> <t:${unix(new Date(NOW.getTime() + NAP_VOTE_MS))}:f>, by vote (0 Approve, 1 Decline), may ask again <t:${unix(askAgain)}:D>`,
      );
      expect(lines[1]).toContain("[ABC] joined, asked by");
      expect(lines[1]).toContain("approved by vote (1 Approve, 0 Decline)");
      expect(lines.slice(0, 2).join("\n")).not.toContain(`<@${R5_NML}>`);
    });

    test("shows a decline by an Officer", async () => {
      await nap.join(command(R5_ABC));
      await nap.vote(button(declineIdOf(server.posts.at(-1)), OFFICER, [MODERATOR_ROLE]));

      const history = command(OFFICER, [MODERATOR_ROLE]);
      await nap.history(history);
      expect(embedOf(history.replies[0]).description).toContain(`[ABC] declined, asked by <@${R5_ABC}>`);
      expect(embedOf(history.replies[0]).description).toContain(`by <@${OFFICER}> (Officer), may ask again`);
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
