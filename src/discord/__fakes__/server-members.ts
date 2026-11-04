import type { MemberId } from "../../domain/rank-approval.js";
import type { ServerMember, ServerMembers } from "../name-and-roles.js";
import type { FakeRolesGuild, FakeRolesMember } from "./roles-guild.js";

/** A lookup held back: `reached` resolves when the lookup is made, and the answer comes only once `release` is called. */
export interface HeldLookup {
  readonly reached: Promise<void>;
  readonly release: () => void;
}

/** The members of the server as the name and roles reach them: a member is on the server only when joined. */
export class FakeServerMembers implements ServerMembers {
  /** Every lookup of a Member on the server, in order: a test counts how often a Member was fetched. */
  readonly lookups: MemberId[] = [];
  private readonly members = new Map<MemberId, ServerMember>();
  private readonly failures = new Map<MemberId, Error>();
  private failure: Error | undefined = undefined;
  private listingFailure: Error | undefined = undefined;
  private hold: { readonly reached: () => void; readonly released: Promise<void> } | undefined = undefined;

  join(memberId: MemberId, guild: FakeRolesGuild, member: FakeRolesMember): void {
    this.members.set(memberId, { guild, member });
  }

  failWith(error: Error): void {
    this.failure = error;
  }

  /** Makes listing every Member fail with the error, as an outage of Discord would. */
  failListing(error: Error): void {
    this.listingFailure = error;
  }

  /** Every Member on the server, in the order they joined. Rejects after `failListing`. */
  all(): Promise<readonly ServerMember[]> {
    if (this.listingFailure !== undefined) return Promise.reject(this.listingFailure);
    return Promise.resolve([...this.members.values()]);
  }

  /** Makes the lookup of this one Member fail; the other Members are reached as usual. */
  failFor(memberId: MemberId, error: Error): void {
    this.failures.set(memberId, error);
  }

  /** Holds the next lookup of a Member until the test releases it; the Member is then answered as usual. */
  holdNextLookup(): HeldLookup {
    let reached: () => void = () => undefined;
    const reachedPromise = new Promise<void>((done) => {
      reached = done;
    });
    let release: () => void = () => undefined;
    const released = new Promise<void>((done) => {
      release = done;
    });
    this.hold = { reached, released };
    return { reached: reachedPromise, release };
  }

  memberOf(memberId: MemberId): Promise<ServerMember | undefined> {
    this.lookups.push(memberId);
    if (this.failure !== undefined) return Promise.reject(this.failure);
    const failure = this.failures.get(memberId);
    if (failure !== undefined) return Promise.reject(failure);
    const answer = this.members.get(memberId);
    const hold = this.hold;
    if (hold === undefined) return Promise.resolve(answer);
    this.hold = undefined;
    hold.reached();
    return hold.released.then(() => answer);
  }
}
