import type { MemberId } from "../../domain/rank-approval.js";
import type { ServerMember, ServerMembers } from "../name-and-roles.js";
import type { FakeRolesGuild, FakeRolesMember } from "./roles-guild.js";

/** The members of the server as the name and roles reach them: a member is on the server only when joined. */
export class FakeServerMembers implements ServerMembers {
  private readonly members = new Map<MemberId, ServerMember>();
  private readonly failures = new Map<MemberId, Error>();
  private failure: Error | undefined = undefined;

  join(memberId: MemberId, guild: FakeRolesGuild, member: FakeRolesMember): void {
    this.members.set(memberId, { guild, member });
  }

  failWith(error: Error): void {
    this.failure = error;
  }

  /** Makes the lookup of this one Member fail; the other Members are reached as usual. */
  failFor(memberId: MemberId, error: Error): void {
    this.failures.set(memberId, error);
  }

  memberOf(memberId: MemberId): Promise<ServerMember | undefined> {
    if (this.failure !== undefined) return Promise.reject(this.failure);
    const failure = this.failures.get(memberId);
    if (failure !== undefined) return Promise.reject(failure);
    return Promise.resolve(this.members.get(memberId));
  }
}
