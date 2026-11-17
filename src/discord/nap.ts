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
  napMembers,
} from "../domain/nap.js";
import { isOfficer } from "../domain/officer.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { KnownAllianceStore } from "../storage/known-alliance-store.js";
import type { NapStore } from "../storage/nap-store.js";
import type { CityRotationServer } from "./city-rotation.js";
import { allianceLabel } from "./city-rotation-texts.js";
import { allowedMentions } from "./lookup.js";
import { napApproveOf, napApproveRow, napHistoryEmbed, napMessages as messages, napShowEmbed } from "./nap-texts.js";

/** The Discord server as the NaP register uses it: #nap-leaders, Neil's own posts there, and #neil-log. */
export type NapServer = Pick<CityRotationServer, "leadersChannelId" | "post" | "log">;

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
    "history" | "append" | "openRequests" | "request" | "addRequest" | "setRequestMessage" | "removeRequest"
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
}

/**
 * The NaP register: which Alliances are in the NaP, the open join requests, and the history of joins and leaves with
 * who asked, who approved or left, and when. No Game API requests. Every request, approval and leave writes one
 * #neil-log line, and no message of Neil's about the NaP mentions anybody.
 */
export function createNap(deps: NapDeps): Nap {
  const { store, server } = deps;

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
    const embed = napShowEmbed(napMembers(store.history()), store.openRequests(), labeller());
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
    store.append({
      kind: "joined",
      tag: request.tag,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
      approvedBy: approver,
      approvedAs: as,
      at: deps.now(),
    });
    const label = labeller()(request.tag);
    await button.update({
      content: messages.approved(label, request.requestedBy, approver, as),
      components: [],
      allowedMentions,
    });
    await log(messages.logApproved(approver, as, request.tag, request.requestedBy));
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
    store.append({ kind: "left", tag: inNap.tag, leftBy: member, at: deps.now() });
    const label = labeller()(inNap.tag);
    await replyPrivately(command, messages.leftReply(label));
    await log(messages.logLeft(member, inNap.tag));
    const channelId = server.leadersChannelId();
    if (channelId === undefined) {
      await log(messages.logLeaveNoLeaders(inNap.tag));
      return;
    }
    try {
      await server.post(channelId, { content: messages.leftNotice(label, member), allowedMentions });
    } catch (error) {
      await log(messages.logLeavePostFailed(inNap.tag, reasonOf(error)));
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

  return { show, join, leave, history, approve };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
