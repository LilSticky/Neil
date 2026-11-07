import type { BaseMessageOptions } from "discord.js";
import type { MemberId } from "../../domain/rank-approval.js";
import type { EventInvitationServer, EventRole } from "../events.js";

/** One message the server posted, with the link Discord would give it. */
export interface PostedEventMessage {
  readonly channelId: string;
  readonly message: BaseMessageOptions;
  readonly link: string;
}

/** The id of #event-announcements, as the fake server has it. */
export const ANNOUNCEMENTS_CHANNEL_ID = "700000000000000010";

const GUILD_ID = "100000000000000000";

/**
 * The server as Event invitations use it: role holders and a Member's roles, the channels of the kingdom and of an
 * Alliance, posts, #neil-log lines, and the scheduled events Discord lists. Nothing reaches Discord. A post made to
 * fail with `failNextPost` rejects once and is not recorded.
 */
export class FakeEventInvitationServer implements EventInvitationServer {
  readonly posts: PostedEventMessage[] = [];
  readonly logs: string[] = [];
  private readonly holders = new Map<string, MemberId[]>();
  private readonly roles = new Map<MemberId, EventRole[]>();
  private readonly allianceChats = new Map<string, string>();
  private scheduled: readonly unknown[] = [];
  private postFailure: Error | undefined = undefined;

  /** The Member holds the role, by its name (such as `Events` or `[NML]`). */
  grantRole(roleName: string, memberId: MemberId): void {
    this.holders.set(roleName, [...(this.holders.get(roleName) ?? []), memberId]);
  }

  /** The roles the Member holds, by id and name. */
  giveRoles(memberId: MemberId, roles: readonly EventRole[]): void {
    this.roles.set(memberId, [...roles]);
  }

  /** The Alliance with this tag has its role and its alliance-chat, which has this id. */
  grantAllianceChat(tag: string, channelId: string): void {
    this.allianceChats.set(tag, channelId);
  }

  /** The scheduled events Discord lists when Neil starts, as Discord gives them. */
  setScheduledEvents(events: readonly unknown[]): void {
    this.scheduled = [...events];
  }

  /** The next post rejects with the error, as Discord does when it refuses a message. */
  failNextPost(error: Error): void {
    this.postFailure = error;
  }

  holdersOf(roleName: string): Promise<readonly MemberId[]> {
    return Promise.resolve([...(this.holders.get(roleName) ?? [])]);
  }

  rolesOf(memberId: MemberId): Promise<readonly EventRole[]> {
    return Promise.resolve([...(this.roles.get(memberId) ?? [])]);
  }

  announcementsChannelId(): string | undefined {
    return ANNOUNCEMENTS_CHANNEL_ID;
  }

  allianceChatId(tag: string): string | undefined {
    return this.allianceChats.get(tag);
  }

  post(channelId: string, message: BaseMessageOptions): Promise<string> {
    if (this.postFailure !== undefined) {
      const failure = this.postFailure;
      this.postFailure = undefined;
      return Promise.reject(failure);
    }
    const link = `https://discord.com/channels/${GUILD_ID}/${channelId}/${(this.posts.length + 1).toString()}`;
    this.posts.push({ channelId, message, link });
    return Promise.resolve(link);
  }

  log(line: string): Promise<void> {
    this.logs.push(line);
    return Promise.resolve();
  }

  scheduledEvents(): Promise<readonly unknown[]> {
    return Promise.resolve([...this.scheduled]);
  }
}
