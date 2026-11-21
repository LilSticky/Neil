import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageFlags, type BaseMessageOptions, type InteractionReplyOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Uid } from "../domain/lookup-input.js";
import type { Alliance, LookupResult, RosterEntry } from "../domain/player.js";
import { kingdomOf, uidOf } from "../domain/__fixtures__/players.js";
import { openDatabase } from "../storage/database.js";
import { KingMoveStore } from "../storage/king-move-store.js";
import { createKingMoves, type KingMoveButton, type KingMoveServer, type KingMoves } from "./king-move.js";

const HOME = kingdomOf(330);
const NOW = new Date("2026-11-20T20:05:00.000Z");
const MODERATOR_ROLE = "900000000000000001";
const KING_ROLE = "900000000000000002";
const OFFICER = "500000000000000005";
const NEW_KING = "100000000000000001";
const OLD_KING = "100000000000000002";
const LATE_KING = "100000000000000003";
const MEMBER = "100000000000000004";
const LEADER = uidOf("145563254785");
const MISSING_PERMISSIONS = 50013;

class DiscordError extends Error {
  constructor(readonly code: number) {
    super(`Discord error ${code.toString()}`);
  }
}

function rosterEntry(uid: Uid): RosterEntry {
  return {
    uid,
    name: "Zedd",
    allianceRank: "R5",
    kingdom: HOME,
    sanctuaryLevel: undefined,
    weeklyActivity: undefined,
    dailyHonor: undefined,
    dailyTech: undefined,
  };
}

function alliance(leaderUid: Uid | undefined): Alliance {
  return {
    tag: "XYZ",
    name: "Ex Why Zed",
    kingdom: HOME,
    might: 1,
    memberCount: 1,
    capacity: 100,
    leaderName: "Zed",
    leaderUid,
    roster: leaderUid === undefined ? [] : [rosterEntry(leaderUid)],
  };
}

/** The server of the fakes: who holds King (and every other role), the cards and lines in #neil-log. */
class FakeServer implements KingMoveServer {
  /** The roles each Member holds, by Member id. */
  readonly roles = new Map<string, Set<string>>([
    [NEW_KING, new Set(["R5"])],
    [OLD_KING, new Set([KING_ROLE, "R5"])],
    [MEMBER, new Set(["R4"])],
  ]);
  readonly cards: { id: string; message: BaseMessageOptions }[] = [];
  readonly edits: { messageId: string; message: BaseMessageOptions }[] = [];
  readonly logs: string[] = [];
  readonly away = new Set<string>();
  /** Members Discord refuses to change, with the error code. */
  readonly refuse = new Map<string, number>();
  refuseCard = false;
  private nextId = 800000000000000001n;

  kingHolders(): Promise<readonly string[]> {
    return Promise.resolve([...this.roles].filter(([, held]) => held.has(KING_ROLE)).map(([id]) => id));
  }
  isOnServer(memberId: string): Promise<boolean> {
    return Promise.resolve(!this.away.has(memberId));
  }
  giveKing(memberId: string): Promise<void> {
    return this.change(memberId, (held) => held.add(KING_ROLE));
  }
  takeKing(memberId: string): Promise<void> {
    return this.change(memberId, (held) => held.delete(KING_ROLE));
  }
  postCard(message: BaseMessageOptions): Promise<string> {
    if (this.refuseCard) return Promise.reject(new Error("Missing Access"));
    const id = this.nextId.toString();
    this.nextId += 1n;
    this.cards.push({ id, message });
    return Promise.resolve(id);
  }
  editCard(messageId: string, message: BaseMessageOptions): Promise<boolean> {
    this.edits.push({ messageId, message });
    return Promise.resolve(true);
  }
  log(line: string): Promise<void> {
    this.logs.push(line);
    return Promise.resolve();
  }
  holdsKing(memberId: string): boolean {
    return this.roles.get(memberId)?.has(KING_ROLE) ?? false;
  }
  private change(memberId: string, edit: (held: Set<string>) => unknown): Promise<void> {
    const code = this.refuse.get(memberId);
    if (code !== undefined) return Promise.reject(new DiscordError(code));
    const held = this.roles.get(memberId) ?? new Set<string>();
    edit(held);
    this.roles.set(memberId, held);
    return Promise.resolve();
  }
}

class FakeButton implements KingMoveButton {
  readonly replies: InteractionReplyOptions[] = [];
  readonly user: { readonly id: string };

  constructor(
    readonly customId: string,
    memberId: string,
    private readonly roles: readonly string[] = [],
  ) {
    this.user = { id: memberId };
  }
  memberRoleIds(): readonly string[] {
    return this.roles;
  }
  reply(options: InteractionReplyOptions): Promise<unknown> {
    this.replies.push(options);
    return Promise.resolve();
  }
  get text(): string {
    const content = this.replies[0]?.content;
    return typeof content === "string" ? content : "";
  }
}

describe("the King Move", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let server: FakeServer;
  let reads: { key: string; purpose: string; freshness: string | undefined }[];
  let readResult: LookupResult<Alliance>;
  let linked: Map<string, string>;
  let now: Date;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-king-move-"));
    db = openDatabase(dataDir);
    server = new FakeServer();
    reads = [];
    readResult = { kind: "found", value: alliance(LEADER), asOf: undefined };
    linked = new Map([[LEADER, NEW_KING]]);
    now = NOW;
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function service(): KingMoves {
    return createKingMoves({
      store: new KingMoveStore(db),
      links: { memberForUid: (uid) => linked.get(uid) },
      gameApi: {
        getAlliance: (_kingdom, key, purpose, ...rest) => {
          reads.push({ key, purpose, freshness: rest[0] });
          return Promise.resolve(readResult);
        },
      },
      server,
      homeKingdom: HOME,
      officerRoleIds: [MODERATOR_ROLE, KING_ROLE],
      now: () => now,
      logError: () => undefined,
    });
  }

  function cardText(index = 0): string {
    const content = server.cards[index]?.message.content;
    return typeof content === "string" ? content : "";
  }

  function applyId(index = 0): string {
    const row = server.cards[index]?.message.components?.[0];
    const button = row !== undefined && "components" in row ? row.components[0] : undefined;
    return button !== undefined && "custom_id" in button && typeof button.custom_id === "string" ? button.custom_id : "";
  }

  describe("after a Handover", () => {
    test("reads the receiving Alliance's R5 once, live, for the sync, and prepares the move to their Linked Member", async () => {
      await service().afterHandover("XYZ");

      expect(reads).toEqual([{ key: "XYZ", purpose: "sync", freshness: "live" }]);
      const move = new KingMoveStore(db).load();
      expect(move).toMatchObject({
        holdingTag: "XYZ",
        leaderUid: LEADER,
        leaderName: "Zedd",
        newKing: NEW_KING,
        previousKings: [OLD_KING],
        state: { kind: "prepared" },
        messageId: server.cards[0]?.id,
      });
    });

    test("posts the card with the Alliance, the R5, the new King, the holders and an Apply button, pinging nobody", async () => {
      await service().afterHandover("XYZ");

      expect(server.cards).toHaveLength(1);
      const text = cardText();
      expect(text).toContain("[XYZ]");
      expect(text).toContain(`Zedd (uid ${LEADER})`);
      expect(text).toContain(`New King: <@${NEW_KING}>`);
      expect(text).toContain(`Holding King now: <@${OLD_KING}>`);
      expect(text).toContain(`Loses King: <@${OLD_KING}>`);
      expect(text).toContain(`<t:${Math.floor(NOW.getTime() / 1000).toString()}:f>`);
      expect(applyId()).toBe(`king:${NOW.getTime().toString()}`);
      expect(server.cards[0]?.message.allowedMentions).toEqual({ parse: [] });
      expect(server.logs).toEqual([
        `King Move prepared for [XYZ]: <@${NEW_KING}> (R5 uid ${LEADER}) gets King; <@${OLD_KING}> lose it. Waiting for an Officer's Apply.`,
      ]);
      expect(server.holdsKing(OLD_KING)).toBe(true);
      expect(server.holdsKing(NEW_KING)).toBe(false);
    });

    test.each([
      ["the quota is spent", () => {
        readResult = { kind: "quota-spent", resetsAt: NOW };
      }, "the Game API gave no answer (quota-spent)"],
      ["the Game API fails", () => {
        readResult = { kind: "unavailable", reason: "unexpected" };
      }, "the Game API gave no answer (unavailable)"],
      ["the Alliance names no R5", () => {
        readResult = { kind: "found", value: alliance(undefined), asOf: undefined };
      }, "the Game API names no R5 for the Alliance"],
      ["the R5 has no Linked Member", () => {
        linked.clear();
      }, `the R5 (uid ${LEADER}) has no Linked Member`],
      ["the R5's Member left the server", () => {
        server.away.add(NEW_KING);
      }, `the R5's Member <@${NEW_KING}> (uid ${LEADER}) is not on the server`],
    ])("when %s, logs one line that an Officer moves King by hand, and posts no card", async (_case, arrange, reason) => {
      arrange();

      await service().afterHandover("XYZ");

      expect(server.cards).toEqual([]);
      expect(server.logs).toEqual([`No King Move for [XYZ]: ${reason}. An Officer moves King by hand.`]);
      expect(reads).toHaveLength(1);
      expect(new KingMoveStore(db).load()).toBeUndefined();
    });

    test("when the new King already is the only King, logs that there is nothing to move", async () => {
      server.roles.set(OLD_KING, new Set(["R5"]));
      server.roles.set(NEW_KING, new Set([KING_ROLE]));

      await service().afterHandover("XYZ");

      expect(server.cards).toEqual([]);
      expect(server.logs).toEqual([`King Move for [XYZ]: nothing to move, <@${NEW_KING}> already is the only King.`]);
    });

    test("when the card cannot be posted, logs that an Officer moves King by hand", async () => {
      server.refuseCard = true;

      await service().afterHandover("XYZ");

      expect(server.logs).toEqual([
        "King Move for [XYZ] prepared, but its card could not be posted (Missing Access). An Officer moves King by hand.",
      ]);
    });

    test("a newer Handover supersedes a waiting move: its card loses the button, a line is logged, its Apply changes nothing", async () => {
      const kingMoves = service();
      await kingMoves.afterHandover("XYZ");
      const first = applyId();
      now = new Date(NOW.getTime() + 7 * 86_400_000);

      await kingMoves.afterHandover("XYZ");

      expect(server.edits[0]?.messageId).toBe(server.cards[0]?.id);
      expect(server.edits[0]?.message.components).toEqual([]);
      expect(server.logs).toContainEqual(
        `King Move for [XYZ] (<@${NEW_KING}>) replaced by a newer Handover; it can no longer be applied.`,
      );
      const press = new FakeButton(first, OFFICER, [MODERATOR_ROLE]);
      await kingMoves.apply(press);
      expect(press.text).toContain("already applied or replaced");
      expect(server.holdsKing(NEW_KING)).toBe(false);
    });
  });

  describe("the Apply button", () => {
    test("an Officer's press takes King from the listed holders, gives it to the new King and touches no other role", async () => {
      await service().afterHandover("XYZ");
      server.roles.set(LATE_KING, new Set([KING_ROLE]));
      const press = new FakeButton(applyId(), OFFICER, [MODERATOR_ROLE]);
      now = new Date(NOW.getTime() + 3_600_000);

      await service().apply(press);

      expect(server.holdsKing(NEW_KING)).toBe(true);
      expect(server.holdsKing(OLD_KING)).toBe(false);
      expect(server.holdsKing(LATE_KING)).toBe(true);
      expect([...(server.roles.get(NEW_KING) ?? [])].sort()).toEqual([KING_ROLE, "R5"].sort());
      expect([...(server.roles.get(OLD_KING) ?? [])]).toEqual(["R5"]);
      expect([...(server.roles.get(MEMBER) ?? [])]).toEqual(["R4"]);
      expect(press.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(press.text).toContain(`<@${NEW_KING}> got King`);
      const edit = server.edits[0];
      expect(edit?.messageId).toBe(server.cards[0]?.id);
      expect(edit?.message.components).toEqual([]);
      expect(edit?.message.content).toContain(`Applied by <@${OFFICER}> <t:${Math.floor(now.getTime() / 1000).toString()}:f>`);
      expect(server.logs).toContainEqual(
        `King Move for [XYZ] applied by <@${OFFICER}>: <@${NEW_KING}> got King; taken from <@${OLD_KING}>.`,
      );
      expect(new KingMoveStore(db).load()?.state).toEqual({ kind: "applied", appliedBy: OFFICER, appliedAt: now });
    });

    test("still works after a restart of Neil", async () => {
      await service().afterHandover("XYZ");
      const id = applyId();
      db.close();
      db = openDatabase(dataDir);

      await service().apply(new FakeButton(id, OFFICER, [KING_ROLE]));

      expect(server.holdsKing(NEW_KING)).toBe(true);
      expect(server.holdsKing(OLD_KING)).toBe(false);
    });

    test("a press by a Member who is not an Officer changes nothing and logs nothing", async () => {
      await service().afterHandover("XYZ");
      const logged = server.logs.length;
      const press = new FakeButton(applyId(), MEMBER, ["R4"]);

      await service().apply(press);

      expect(press.text).toBe("Only Officers can apply a King Move.");
      expect(press.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(server.holdsKing(OLD_KING)).toBe(true);
      expect(server.holdsKing(NEW_KING)).toBe(false);
      expect(server.logs).toHaveLength(logged);
    });

    test("a second press on an applied move changes nothing", async () => {
      await service().afterHandover("XYZ");
      await service().apply(new FakeButton(applyId(), OFFICER, [MODERATOR_ROLE]));
      server.roles.set(OLD_KING, new Set([KING_ROLE]));
      const again = new FakeButton(applyId(), OFFICER, [MODERATOR_ROLE]);

      await service().apply(again);

      expect(again.text).toContain("already applied or replaced");
      expect(server.holdsKing(OLD_KING)).toBe(true);
    });

    test("a Discord refusal for permissions names the failed step and the fix, and leaves the move applicable", async () => {
      await service().afterHandover("XYZ");
      server.refuse.set(OLD_KING, MISSING_PERMISSIONS);
      const press = new FakeButton(applyId(), OFFICER, [MODERATOR_ROLE]);

      await service().apply(press);

      expect(press.text).toContain(`take King from <@${OLD_KING}> (missing permissions)`);
      expect(press.text).toContain(`Done: give King to <@${NEW_KING}>.`);
      expect(press.text).toContain("Drag Neil's role above King (and below Moderator)");
      expect(server.logs).toContainEqual(
        `King Move for [XYZ] pressed by <@${OFFICER}>, refused by Discord: take King from <@${OLD_KING}> (missing permissions). ` +
          "Drag Neil's role above King (and below Moderator) in Server Settings → Roles, then press Apply again.",
      );
      expect(new KingMoveStore(db).load()?.state).toEqual({ kind: "prepared" });

      server.refuse.clear();
      const second = new FakeButton(applyId(), OFFICER, [MODERATOR_ROLE]);
      await service().apply(second);
      expect(server.holdsKing(OLD_KING)).toBe(false);
      expect(second.text).toContain(`<@${NEW_KING}> already held King`);
      expect(new KingMoveStore(db).load()?.state.kind).toBe("applied");
    });

    test("another Discord error is reported without the role hint", async () => {
      await service().afterHandover("XYZ");
      server.refuse.set(NEW_KING, 50001);
      const press = new FakeButton(applyId(), OFFICER, [MODERATOR_ROLE]);

      await service().apply(press);

      expect(press.text).toContain(`give King to <@${NEW_KING}>.`);
      expect(press.text).toContain("Press Apply again to finish it.");
      expect(server.holdsKing(NEW_KING)).toBe(false);
    });
  });
});
