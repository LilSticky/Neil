import type { Link } from "../../domain/link.js";
import type { RequestPurpose } from "../../domain/daily-quota.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../../domain/lookup-input.js";
import type { MemberId } from "../../domain/rank-approval.js";
import type { LookupResult, Player, RosterEntry, RosterPresence } from "../../domain/player.js";
import type { LinkStore } from "../../storage/link-store.js";

/** A refusal or failure of the lookup: anything but a found Player. */
export type LookupRefusal = Exclude<LookupResult<Player>, { readonly kind: "found" }>;

/** What the test says about one roster row: the game's online flag and its Last Online, each missing when undefined. */
export interface RosterState {
  readonly online?: boolean | undefined;
  readonly lastOnlineAt?: Date | undefined;
}

/** A roster row of the Alliance, as the Game API gives it. */
export function rosterEntry(uid: string, name: string, state: RosterState): RosterEntry {
  return {
    uid: uidOf(uid),
    name,
    allianceRank: "R1",
    kingdom: kingdomOf(330),
    sanctuaryLevel: 10,
    weeklyActivity: undefined,
    dailyHonor: undefined,
    dailyTech: undefined,
    online: state.online,
    lastOnlineAt: state.lastOnlineAt,
  };
}

/**
 * The uncharged Player lookup a Booty Call makes for the caller's uid. It records every lookup, with its purpose, and
 * answers with the roster set by the test (or with no roster, after `withoutRoster`); `failWith` makes every lookup
 * refuse instead (quota out, unavailable).
 */
export class FakeBootyCallGameApi {
  readonly lookups: { readonly uid: Uid; readonly purpose: RequestPurpose }[] = [];
  private roster: readonly RosterPresence[] | undefined = [];
  private refusal: LookupRefusal | undefined = undefined;

  setRoster(roster: readonly RosterPresence[]): void {
    this.roster = roster;
  }

  /** The answer carries no roster at all: the Game gave none readable. */
  withoutRoster(): void {
    this.roster = undefined;
  }

  failWith(refusal: LookupRefusal): void {
    this.refusal = refusal;
  }

  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> {
    this.lookups.push({ uid, purpose });
    if (this.refusal !== undefined) return Promise.resolve(this.refusal);
    const value: Player = {
      uid,
      name: "Caller Game Name",
      kingdom: kingdomOf(330),
      might: 15_902_728,
      sanctuaryLevel: 42,
      alliance: { tag: "NML", name: "No Man's Land", leaderUid: undefined },
      allianceRank: "R4",
      ...(this.roster === undefined ? {} : { roster: this.roster }),
    };
    return Promise.resolve({ kind: "found", value, fetchedAt: new Date("2026-11-07T12:00:00Z") });
  }
}

/** The Links the Booty Call reads: the caller's Link, and the Member a roster uid is Linked to. */
export class FakeBootyCallLinks implements Pick<LinkStore, "linkFor" | "memberForUid"> {
  private readonly linked = new Map<MemberId, Link>();
  private memberFailure: Error | undefined = undefined;

  link(memberId: MemberId, uid: string): void {
    this.linked.set(memberId, {
      memberId,
      uid: uidOf(uid),
      linkedAt: new Date("2026-11-04T10:00:00Z"),
      allianceRank: { source: "unknown" },
      madeBy: { kind: "in-game-proof" },
    });
  }

  unlink(memberId: MemberId): void {
    this.linked.delete(memberId);
  }

  linkFor(memberId: MemberId): Link | undefined {
    return this.linked.get(memberId);
  }

  /** The next memberForUid throws the error, as the Link store does when it cannot read its rows. */
  failNextMemberForUid(error: Error): void {
    this.memberFailure = error;
  }

  memberForUid(uid: Uid): MemberId | undefined {
    if (this.memberFailure !== undefined) {
      const failure = this.memberFailure;
      this.memberFailure = undefined;
      throw failure;
    }
    for (const link of this.linked.values()) {
      if (link.uid === uid) return link.memberId;
    }
    return undefined;
  }
}

function uidOf(input: string): Uid {
  const parsed = parseUid(input);
  if (!parsed.ok) throw new Error(`the fake uid ${input} is not a valid uid`);
  return parsed.value;
}

function kingdomOf(input: number): KingdomNumber {
  const parsed = parseKingdom(input);
  if (!parsed.ok) throw new Error(`the fake Kingdom ${input.toString()} is not a valid Kingdom`);
  return parsed.value;
}
