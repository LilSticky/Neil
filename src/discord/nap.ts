import { MessageFlags, type InteractionReplyOptions, type MessageMentionOptions } from "discord.js";
import { sameTag } from "../domain/city-rotation.js";
import type { Editor } from "../domain/exile.js";
import type { KingdomNumber } from "../domain/lookup-input.js";
import {
  isNapCouncilMember,
  isNapMember,
  linkedR5AllianceOf,
  mayApprove,
  mayAskToJoin,
  mayLeave,
  napFormerMembers,
  napMembers,
} from "../domain/nap.js";
import { isOfficer } from "../domain/officer.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { KnownAllianceStore } from "../storage/known-alliance-store.js";
import type { NapJoinRequest, NapStore } from "../storage/nap-store.js";
import type { CityRotationServer } from "./city-rotation.js";
import { allianceLabel } from "./city-rotation-texts.js";
import { allowedMentions } from "./lookup.js";
import {
  napApproveOf,
  napApproveRow,
  napHistoryEmbed,
  napListEmbed,
  napMessages as messages,
  napShowEmbed,
} from "./nap-texts.js";

/**
 * The Discord server as the NaP register uses it: #nap-leaders, #nap-announcements, Neil's own posts, edits and pins
 * there, and #neil-log.
 */
export type NapServer = Pick<
  CityRotationServer,
  "leadersChannelId" | "announcementsChannelId" | "post" | "edit" | "pin" | "log"
>;

/** The part of a discord.js chat-input interaction of /nap that its subcommands use. */
export interface NapCommand {
  readonly user: { readonly id: string };
  memberRoleIds(): readonly string[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/** The part of a discord.js press of an Approve button that the approval uses. */
export interface NapButton {
  readonly customId: string;
  readonly user: { readonly id: string };
  memberRoleIds(): readonly string[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
  /** Replaces the pressed message: its content, and no buttons. */
  update(options: { readonly content: string; readonly components: []; readonly allowedMentions: MessageMentionOptions }): Promise<unknown>;
}

export interface NapDeps {
  readonly store: Pick<
    NapStore,
    | "history"
    | "append"
    | "openRequests"
    | "request"
    | "addRequest"
    | "setRequestMessage"
    | "removeRequest"
    | "listMessageId"
    | "setListMessageId"
  >;
  readonly knownAlliances: Pick<KnownAllianceStore, "all">;
  /** The Member as the R5 check sees them: their rank, and the Kingdom and tag of their Alliance. */
  readonly editorOf: (memberId: MemberId) => Editor | undefined;
  readonly server: NapServer;
  readonly homeKingdom: KingdomNumber;
  readonly officerRoleIds: readonly string[];
  readonly now: () => Date;
  readonly logError: (message: string) => void;
}

export interface Nap {
  /** /nap show: the Alliances in the NaP and the open join requests, privately, to any Member. */
  show(command: NapCommand): Promise<void>;
  /** /nap join: a Linked R5 asks for their Alliance to join; the NaP Council is asked in #nap-leaders. */
  join(command: NapCommand): Promise<void>;
  /** /nap leave: the Linked R5 of an Alliance in the NaP takes it out. */
  leave(command: NapCommand): Promise<void>;
  /** /nap history: every join and leave, privately, to the NaP Council and Officers. */
  history(command: NapCommand): Promise<void>;
  /** A press of the Approve button of a join request. */
  approve(button: NapButton): Promise<void>;
  /**
   * Brings the NaP list pinned in #nap-announcements up to date, posting and pinning it again when it is gone; run after
   * every join and leave and once at startup. Refreshes run one at a time. Nothing here throws.
   */
  refreshList(): Promise<void>;
}

/**
 * The NaP register: which Alliances are in the NaP, the open join requests, and the history of joins and leaves with
 * who asked, who approved or left, and when. No Game API requests. Every request, approval and leave writes one
 * #neil-log line, and no message of Neil's about the NaP mentions anybody.
 */
/** How long a saved join request may wait for its post before /nap join treats it as lost. */
const UNPOSTED_REQUEST_MS = 60_000;

export function createNap(deps: NapDeps): Nap {
  const { store, server } = deps;
  /** The tags (case-folded) of the open requests whose message /nap join is checking or posting again right now. */
  const checking = new Set<string>();

  function labeller(): (tag: string) => string {
    const known = deps.knownAlliances.all(deps.now()).filter((alliance) => alliance.kingdom === deps.homeKingdom);
    const byTag = new Map(known.map((alliance) => [alliance.tag.toLowerCase(), alliance.name]));
    return (tag) => allianceLabel(tag, byTag.get(tag.toLowerCase()));
  }

  /** The tag of the Home Kingdom Alliance the Member is Linked R5 of; undefined when they are none. */
  function r5AllianceOf(memberId: MemberId): string | undefined {
    const editor = deps.editorOf(memberId);
    return editor === undefined ? undefined : linkedR5AllianceOf(editor, deps.homeKingdom);
  }

  /** One #neil-log line; a refused log is written to the error log instead. */
  async function log(line: string): Promise<void> {
    try {
      await server.log(line);
    } catch (error) {
      deps.logError(`Logging a NaP line failed: ${reasonOf(error)}`);
    }
  }

  async function replyPrivately(
    to: { reply(options: InteractionReplyOptions): Promise<unknown> },
    content: string,
  ): Promise<void> {
    await to.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions });
  }

  async function show(command: NapCommand): Promise<void> {
    const events = store.history();
    const embed = napShowEmbed(napMembers(events), napFormerMembers(events), store.openRequests(), labeller());
    await command.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions });
  }

  async function join(command: NapCommand): Promise<void> {
    const asker = command.user.id;
    const tag = r5AllianceOf(asker);
    if (tag === undefined) {
      await replyPrivately(command, messages.refusedNotR5);
      return;
    }
    const label = labeller()(tag);
    // The checks and the stored request run without an await in between, so two requests never both pass.
    const history = store.history();
    if (isNapMember(history, tag)) {
      await replyPrivately(command, messages.alreadyMember(label));
      return;
    }
    if (checking.has(tag.toLowerCase())) {
      await replyPrivately(command, messages.requestOpen(label));
      return;
    }
    // A request never posted (Neil stopped between saving and posting it) has no button; after a minute it is asked again.
    const stuck = store.request(tag);
    if (
      stuck !== undefined &&
      stuck.messageId === undefined &&
      deps.now().getTime() - stuck.requestedAt.getTime() > UNPOSTED_REQUEST_MS
    ) {
      store.removeRequest(tag);
    }
    // A posted request whose message was deleted could never be approved (#148): check it, and post it again if gone.
    if (stuck !== undefined && stuck.messageId !== undefined) {
      await checkRequestMessage(command, stuck, stuck.messageId, label, napMembers(history).length === 0);
      return;
    }
    if (!mayAskToJoin(tag, history, store.openRequests().map((request) => request.tag))) {
      await replyPrivately(command, messages.requestOpen(label));
      return;
    }
    const requestedAt = deps.now();
    store.addRequest({ tag, requestedBy: asker, requestedAt });
    const channelId = server.leadersChannelId();
    if (channelId === undefined) {
      store.removeRequest(tag);
      await replyPrivately(command, messages.noLeaders);
      await log(messages.logNoLeaders(tag));
      return;
    }
    try {
      const messageId = await server.post(channelId, {
        content: messages.joinRequest(label, asker, napMembers(history).length === 0),
        components: [napApproveRow(tag, requestedAt)],
        allowedMentions,
      });
      store.setRequestMessage(tag, requestedAt, channelId, messageId);
    } catch (error) {
      store.removeRequest(tag);
      await replyPrivately(command, messages.postFailed);
      await log(messages.logRequestPostFailed(tag, reasonOf(error)));
      return;
    }
    await replyPrivately(command, messages.asked(label));
    await log(messages.logRequested(asker, tag));
  }

  /**
   * Refreshes the message of an open join request, or posts the same request again (same asker, time and button) when
   * the message is gone or not in the current #nap-leaders. The request stays open whatever happens.
   */
  async function checkRequestMessage(
    command: NapCommand,
    request: NapJoinRequest,
    messageId: string,
    label: string,
    napEmpty: boolean,
  ): Promise<void> {
    const key = request.tag.toLowerCase();
    checking.add(key);
    try {
      const channelId = server.leadersChannelId();
      if (channelId === undefined) {
        await replyPrivately(command, messages.noLeaders);
        await log(messages.logRepostNoLeaders(request.tag));
        return;
      }
      const message = {
        content: messages.joinRequest(label, request.requestedBy, napEmpty),
        components: [napApproveRow(request.tag, request.requestedAt)],
        allowedMentions,
      };
      let stillThere: boolean;
      try {
        stillThere = request.channelId === channelId && (await server.edit(channelId, messageId, message));
        if (!stillThere) {
          const newId = await server.post(channelId, message);
          store.setRequestMessage(request.tag, request.requestedAt, channelId, newId);
        }
      } catch (error) {
        await replyPrivately(command, messages.postFailed);
        await log(messages.logRepostFailed(request.tag, reasonOf(error)));
        return;
      }
      if (stillThere) {
        await replyPrivately(command, messages.requestOpen(label));
        return;
      }
      await replyPrivately(command, messages.reposted(label));
      await log(messages.logReposted(command.user.id, request.tag));
    } finally {
      checking.delete(key);
    }
  }

  async function approve(button: NapButton): Promise<void> {
    const pressed = napApproveOf(button.customId);
    const request = pressed === undefined ? undefined : store.request(pressed.tag);
    if (pressed === undefined || request === undefined || request.requestedAt.getTime() !== pressed.requestedAt) {
      await replyPrivately(button, messages.notOpen);
      return;
    }
    const approver = button.user.id;
    // The check and the write below run without an await in between, so two presses approve once.
    const history = store.history();
    const as = mayApprove(
      { allianceTag: r5AllianceOf(approver), officer: isOfficer(button.memberRoleIds(), deps.officerRoleIds) },
      history,
    );
    if (as === undefined) {
      await replyPrivately(button, messages.refusedApprove);
      return;
    }
    store.removeRequest(request.tag);
    const at = deps.now();
    store.append({
      kind: "joined",
      tag: request.tag,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
      approvedBy: approver,
      approvedAs: as,
      at,
    });
    const label = labeller()(request.tag);
    await button.update({
      content: messages.approved(label, request.requestedBy, approver, as),
      components: [],
      allowedMentions,
    });
    await log(messages.logApproved(approver, as, request.tag, request.requestedBy));
    await announce(request.tag, messages.joinedAnnouncement(label, at));
  }

  async function leave(command: NapCommand): Promise<void> {
    const member = command.user.id;
    const tag = r5AllianceOf(member);
    const history = store.history();
    const inNap = tag === undefined ? undefined : napMembers(history).find((entry) => sameTag(entry.tag, tag));
    if (inNap === undefined || !mayLeave(tag, history)) {
      await replyPrivately(command, messages.refusedLeave);
      return;
    }
    const at = deps.now();
    store.append({ kind: "left", tag: inNap.tag, leftBy: member, at });
    const label = labeller()(inNap.tag);
    await replyPrivately(command, messages.leftReply(label));
    await log(messages.logLeft(member, inNap.tag));
    await noticeLeaders(inNap.tag, messages.leftNotice(label, member));
    await announce(inNap.tag, messages.leftAnnouncement(label, at));
  }

  /** Tells the NaP Council in #nap-leaders that an Alliance left; a missing channel or failed post only logs a line. */
  async function noticeLeaders(tag: string, content: string): Promise<void> {
    const channelId = server.leadersChannelId();
    if (channelId === undefined) {
      await log(messages.logLeaveNoLeaders(tag));
      return;
    }
    try {
      await server.post(channelId, { content, allowedMentions });
    } catch (error) {
      await log(messages.logLeavePostFailed(tag, reasonOf(error)));
    }
  }

  /**
   * Announces a join or leave in #nap-announcements, then brings the NaP list there up to date. Runs after the change is
   * stored and answered: a missing channel or a failure only logs a line, and the list is left alone without a channel.
   */
  async function announce(tag: string, content: string): Promise<void> {
    const channelId = server.announcementsChannelId();
    if (channelId === undefined) {
      await log(messages.logNoAnnouncements(tag));
      return;
    }
    try {
      await server.post(channelId, { content, allowedMentions });
    } catch (error) {
      await log(messages.logAnnouncementFailed(tag, reasonOf(error)));
    }
    await refreshList();
  }

  /** The refreshes of the NaP list, chained so they run one at a time and two quick changes never post two lists. */
  let listRefreshes: Promise<void> = Promise.resolve();

  function refreshList(): Promise<void> {
    const next = listRefreshes.then(updateList);
    listRefreshes = next;
    return next;
  }

  async function updateList(): Promise<void> {
    try {
      const channelId = server.announcementsChannelId();
      if (channelId === undefined) {
        await log(messages.logListNoAnnouncements);
        return;
      }
      const events = store.history();
      const list = {
        embeds: [napListEmbed(napMembers(events), napFormerMembers(events), labeller())],
        allowedMentions,
      };
      const messageId = store.listMessageId();
      if (messageId !== undefined && (await server.edit(channelId, messageId, list))) return;
      const newId = await server.post(channelId, list);
      store.setListMessageId(newId);
      try {
        await server.pin(channelId, newId);
      } catch (error) {
        await log(messages.logListPinFailed(reasonOf(error)));
      }
    } catch (error) {
      await log(messages.logListFailed(reasonOf(error)));
    }
  }

  async function history(command: NapCommand): Promise<void> {
    const events = store.history();
    const council = isNapCouncilMember(r5AllianceOf(command.user.id), events);
    if (!council && !isOfficer(command.memberRoleIds(), deps.officerRoleIds)) {
      await replyPrivately(command, messages.refusedHistory);
      return;
    }
    await command.reply({ embeds: [napHistoryEmbed(events)], flags: MessageFlags.Ephemeral, allowedMentions });
  }

  return { show, join, leave, history, approve, refreshList };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
