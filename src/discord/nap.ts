import { MessageFlags, type InteractionReplyOptions, type MessageMentionOptions } from "discord.js";
import { sameTag } from "../domain/city-rotation.js";
import type { Editor } from "../domain/exile.js";
import type { KingdomNumber } from "../domain/lookup-input.js";
import {
  isNapCouncilMember,
  isNapMember,
  linkedR5AllianceOf,
  mayAskToJoin,
  mayDecide,
  mayLeave,
  NAP_COOLDOWN_MS,
  NAP_VOTE_MS,
  napFormerMembers,
  napMembers,
  runningCooldownOf,
  voteResult,
  type NapVoteChoice,
} from "../domain/nap.js";
import { isOfficer } from "../domain/officer.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { KnownAllianceStore } from "../storage/known-alliance-store.js";
import type { NapJoinRequest, NapStore } from "../storage/nap-store.js";
import type { CityRotationServer } from "./city-rotation.js";
import { allianceLabel } from "./city-rotation-texts.js";
import { allowedMentions } from "./lookup.js";
import {
  napHistoryEmbed,
  napListEmbed,
  napMessages as messages,
  napShowEmbed,
  napVoteOf,
  napVoteRow,
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

/** The part of a discord.js press of an Approve or Decline button that the vote uses. */
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
    | "setVoteEnd"
    | "castVote"
    | "votes"
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
  /**
   * Takes the Alliance out of the NaP as a NaP Report's approved expulsion (ADR 28): a leave recorded with the proposer of
   * the outcome, told in #nap-leaders and #nap-announcements as decided by the NaP Motion, naming no Member. Nothing
   * changes, and one line is logged, when the Alliance is no longer in the NaP. Nothing here throws.
   */
  expel(tag: string, by: MemberId, motionId: number): Promise<void>;
  /** /nap history: every join, decline and leave, privately, to the NaP Council and Officers. */
  history(command: NapCommand): Promise<void>;
  /**
   * A press of the Approve or Decline button of a join request: a vote of the NaP Council in the NaP Vote, or, while the
   * NaP has no members, an Officer's decision at once.
   */
  vote(button: NapButton): Promise<void>;
  /**
   * The one-minute tick: opens the NaP Vote on requests made while the NaP had no members, once it has one, and counts
   * the votes whose end has come. Never throws.
   */
  tick(): Promise<void>;
  /**
   * Brings the NaP list pinned in #nap-announcements up to date, posting and pinning it again when it is gone; run after
   * every join and leave and once at startup. Refreshes run one at a time. Nothing here throws.
   */
  refreshList(): Promise<void>;
}

/** How long a saved join request may wait for its post before /nap join treats it as lost. */
const UNPOSTED_REQUEST_MS = 60_000;

/**
 * The NaP register: which Alliances are in the NaP, the open join requests and their NaP Votes, and the history of
 * joins, declines and leaves with who asked, how it was decided, and when. No Game API requests. Every request, vote,
 * result and leave writes one #neil-log line, and no message of Neil's about the NaP mentions anybody.
 */
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
    const cooldown = runningCooldownOf(history, tag, deps.now());
    if (cooldown !== undefined) {
      await replyPrivately(command, messages.cooldown(label, cooldown.declinedAt, cooldown.endsAt));
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
      const vote = napMembers(history).length === 0 ? undefined : openVote(stuck);
      await checkRequestMessage(command, stuck, stuck.messageId, label, vote?.endsAt);
      if (vote?.opened === true) await log(messages.logVoteOpened(stuck.tag, vote.endsAt));
      return;
    }
    if (!mayAskToJoin(tag, history, store.openRequests().map((request) => request.tag), deps.now())) {
      await replyPrivately(command, messages.requestOpen(label));
      return;
    }
    const requestedAt = deps.now();
    const voteEndsAt =
      napMembers(history).length === 0 ? undefined : new Date(requestedAt.getTime() + NAP_VOTE_MS);
    store.addRequest({ tag, requestedBy: asker, requestedAt, voteEndsAt });
    const channelId = server.leadersChannelId();
    if (channelId === undefined) {
      store.removeRequest(tag);
      await replyPrivately(command, messages.noLeaders);
      await log(messages.logNoLeaders(tag));
      return;
    }
    try {
      const messageId = await server.post(channelId, {
        content: messages.joinRequest(label, asker, voteEndsAt),
        components: [napVoteRow(tag, requestedAt)],
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
   * The end of the NaP Vote on an open request, opening the vote now when it is not open yet (the request was made while
   * the NaP had no members). Synchronous, so it runs in the same block as the caller's checks.
   */
  function openVote(request: NapJoinRequest): { readonly endsAt: Date; readonly opened: boolean } {
    if (request.voteEndsAt !== undefined) return { endsAt: request.voteEndsAt, opened: false };
    const endsAt = new Date(deps.now().getTime() + NAP_VOTE_MS);
    store.setVoteEnd(request.tag, request.requestedAt, endsAt);
    return { endsAt, opened: true };
  }

  /**
   * Refreshes the message of an open join request, or posts the same request again (same asker, time and buttons) when
   * the message is gone or not in the current #nap-leaders. The request stays open whatever happens. Without a vote end,
   * the text says an Officer decides.
   */
  async function checkRequestMessage(
    command: NapCommand,
    request: NapJoinRequest,
    messageId: string,
    label: string,
    voteEndsAt: Date | undefined,
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
        content: messages.joinRequest(label, request.requestedBy, voteEndsAt),
        components: [napVoteRow(request.tag, request.requestedAt)],
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

  async function vote(button: NapButton): Promise<void> {
    const pressed = napVoteOf(button.customId);
    const request = pressed === undefined ? undefined : store.request(pressed.tag);
    if (pressed === undefined || request === undefined || request.requestedAt.getTime() !== pressed.requestedAt) {
      await replyPrivately(button, messages.notOpen);
      return;
    }
    const presser = button.user.id;
    const now = deps.now();
    // The checks and the writes below run without an await in between, so two presses, or a press and the tick, never
    // both decide.
    const history = store.history();
    const voterTag = r5AllianceOf(presser);
    const as = mayDecide(
      { allianceTag: voterTag, officer: isOfficer(button.memberRoleIds(), deps.officerRoleIds) },
      history,
    );
    if (as === "officer") {
      await decideAsOfficer(button, request, pressed.vote, presser, now);
      return;
    }
    const council = napMembers(history).find((member) => voterTag !== undefined && sameTag(member.tag, voterTag));
    if (as === undefined || council === undefined) {
      await replyPrivately(button, messages.refusedVote);
      return;
    }
    const endsAt = request.voteEndsAt ?? new Date(now.getTime() + NAP_VOTE_MS);
    if (now.getTime() >= endsAt.getTime()) {
      await replyPrivately(button, messages.voteEnded);
      return;
    }
    const opened = request.voteEndsAt === undefined;
    if (opened) store.setVoteEnd(request.tag, request.requestedAt, endsAt);
    const earlier = store
      .votes(request.tag, request.requestedAt)
      .find((cast) => sameTag(cast.allianceTag, council.tag))?.vote;
    store.castVote(request.tag, request.requestedAt, {
      allianceTag: council.tag,
      voterId: presser,
      vote: pressed.vote,
      at: now,
    });
    const changedFrom = earlier !== undefined && earlier !== pressed.vote ? earlier : undefined;
    const label = labeller();
    await replyPrivately(button, messages.voted(pressed.vote, label(council.tag), label(request.tag), endsAt, changedFrom));
    await log(messages.logVoted(presser, pressed.vote, council.tag, request.tag, changedFrom));
    if (opened) await announceVote(request, endsAt);
  }

  /** While the NaP has no members, an Officer approves or declines at once; a decline starts the NaP Cooldown. */
  async function decideAsOfficer(
    button: NapButton,
    request: NapJoinRequest,
    choice: NapVoteChoice,
    officer: MemberId,
    now: Date,
  ): Promise<void> {
    store.removeRequest(request.tag);
    store.append({
      kind: choice === "approve" ? "joined" : "declined",
      tag: request.tag,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
      decision: { as: "officer", by: officer },
      at: now,
    });
    const label = labeller()(request.tag);
    const askAgain = new Date(now.getTime() + NAP_COOLDOWN_MS);
    await button.update({
      content:
        choice === "approve"
          ? messages.approved(label, request.requestedBy, officer)
          : messages.declinedByOfficer(label, request.requestedBy, officer, askAgain),
      components: [],
      allowedMentions,
    });
    await log(
      choice === "approve"
        ? messages.logApproved(officer, request.tag, request.requestedBy)
        : messages.logDeclined(officer, request.tag, request.requestedBy, askAgain),
    );
    if (choice === "approve") await announce(request.tag, messages.joinedAnnouncement(label, now));
  }

  /** Logs that the NaP Vote on a request opened later than the request, and edits its message to say until when. */
  async function announceVote(request: NapJoinRequest, endsAt: Date): Promise<void> {
    await log(messages.logVoteOpened(request.tag, endsAt));
    await editRequest(request, {
      content: messages.joinRequest(labeller()(request.tag), request.requestedBy, endsAt),
      components: [napVoteRow(request.tag, request.requestedAt)],
      allowedMentions,
    });
  }

  /** Edits the message of a request in #nap-leaders; a gone message or a failed edit only writes a #neil-log line. */
  async function editRequest(request: NapJoinRequest, message: Parameters<NapServer["edit"]>[2]): Promise<void> {
    if (request.channelId === undefined || request.messageId === undefined) return;
    try {
      if (!(await server.edit(request.channelId, request.messageId, message))) {
        await log(messages.logEditFailed(request.tag, "the message is gone"));
      }
    } catch (error) {
      await log(messages.logEditFailed(request.tag, reasonOf(error)));
    }
  }

  async function tick(): Promise<void> {
    try {
      for (const { tag } of store.openRequests()) await tickRequest(tag);
    } catch (error) {
      deps.logError(`The NaP tick failed: ${reasonOf(error)}`);
    }
  }

  /** Opens or counts the NaP Vote on one open, posted request, while the NaP has members. */
  async function tickRequest(tag: string): Promise<void> {
    // Read again after the awaits of the requests before: the checks and the writes run with no await in between.
    const request = store.request(tag);
    if (request?.messageId === undefined) return;
    const members = napMembers(store.history());
    if (members.length === 0) return;
    const now = deps.now();
    if (request.voteEndsAt === undefined) {
      const { endsAt } = openVote(request);
      await announceVote(request, endsAt);
      return;
    }
    if (request.voteEndsAt.getTime() > now.getTime()) return;
    const result = voteResult(store.votes(request.tag, request.requestedAt), members);
    store.removeRequest(request.tag);
    store.append({
      kind: result.outcome === "approved" ? "joined" : "declined",
      tag: request.tag,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
      decision: { as: "vote", approve: result.approve, decline: result.decline },
      at: now,
    });
    const label = labeller()(request.tag);
    const askAgain = new Date(now.getTime() + NAP_COOLDOWN_MS);
    await log(messages.logVoteResult(request.tag, request.requestedBy, result, askAgain));
    await editRequest(request, {
      content:
        result.outcome === "approved"
          ? messages.approvedByVote(label, request.requestedBy, result.approve, result.decline)
          : messages.declinedByVote(label, request.requestedBy, result.approve, result.decline, askAgain),
      components: [],
      allowedMentions,
    });
    if (result.outcome === "approved") await announce(request.tag, messages.joinedAnnouncement(label, now));
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

  async function expel(tag: string, by: MemberId, motionId: number): Promise<void> {
    try {
      const inNap = napMembers(store.history()).find((entry) => sameTag(entry.tag, tag));
      if (inNap === undefined) {
        await log(messages.logExpelSkipped(tag, motionId));
        return;
      }
      const at = deps.now();
      store.append({ kind: "left", tag: inNap.tag, leftBy: by, at });
      const label = labeller()(inNap.tag);
      await log(messages.logExpelled(inNap.tag, motionId, by));
      await noticeLeaders(inNap.tag, messages.expelledNotice(label, motionId));
      await announce(inNap.tag, messages.expelledAnnouncement(label, motionId, at));
    } catch (error) {
      deps.logError(`Removing [${tag}] from the NaP by NaP Motion #${motionId.toString()} failed: ${reasonOf(error)}`);
    }
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

  return { show, join, leave, expel, history, vote, tick, refreshList };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
