import { MessageFlags, type InteractionReplyOptions } from "discord.js";
import { sameTag } from "../domain/city-rotation.js";
import type { Editor } from "../domain/exile.js";
import type { KingdomNumber } from "../domain/lookup-input.js";
import { linkedR5AllianceOf, napMembers, type NapEvent, type NapMember } from "../domain/nap.js";
import {
  alliancesWithoutVote,
  isMotionHours,
  mayOpenMotion,
  motionEndsAt,
  motionReminderAt,
  motionResult,
  NAP_MOTION_DEFAULT_HOURS,
  NAP_MOTION_MAX_TEXT,
  votesByAlliance,
  type NapMotion,
} from "../domain/nap-motion.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { KnownAllianceStore } from "../storage/known-alliance-store.js";
import type { NapMotionStore } from "../storage/nap-motion-store.js";
import type { CityRotationServer } from "./city-rotation.js";
import { allianceLabel } from "./city-rotation-texts.js";
import { allowedMentions } from "./lookup.js";
import { textWithMentions } from "./mentions.js";
import {
  decisionLogLines,
  napMotionMessages as messages,
  napMotionVoteOf,
  napMotionVoteRow,
  splitBetweenLines,
} from "./nap-motion-texts.js";

/** The Discord server as NaP Motions use it: #nap-leaders, #nap-announcements, Neil's own posts and edits, and #neil-log. */
export type NapMotionServer = Pick<CityRotationServer, "leadersChannelId" | "announcementsChannelId" | "post" | "edit" | "log">;

/** The part of a discord.js chat-input interaction of /nap motion that it uses. */
export interface NapMotionCommand {
  readonly user: { readonly id: string };
  readonly options: {
    getString(name: string, required?: boolean): string | null;
    getInteger(name: string, required?: boolean): number | null;
  };
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/** The part of a discord.js press of a NaP Motion's Approve or Decline button that the vote uses. */
export interface NapMotionButton {
  readonly customId: string;
  readonly user: { readonly id: string };
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

export interface NapMotionsDeps {
  readonly store: Pick<
    NapMotionStore,
    "add" | "setMessage" | "remove" | "open" | "get" | "castVote" | "votes" | "markReminded" | "close"
  >;
  /** The NaP's history of joins, declines and leaves, oldest first: who is on the NaP Council now. */
  readonly napHistory: () => readonly NapEvent[];
  /** Every Linked Member, for the reminder. */
  readonly links: { all(): readonly { readonly memberId: MemberId }[] };
  readonly knownAlliances: Pick<KnownAllianceStore, "all">;
  /** The Member as the R5 check sees them: their rank, and the Kingdom and tag of their Alliance. */
  readonly editorOf: (memberId: MemberId) => Editor | undefined;
  readonly server: NapMotionServer;
  readonly homeKingdom: KingdomNumber;
  readonly now: () => Date;
  readonly logError: (message: string) => void;
}

/**
 * How opening a NaP Motion for another part of Neil went: opened with its id and deadline, refused because the opener is
 * not on the NaP Council, or not posted because #nap-leaders is missing or refused the post (nothing is kept then).
 */
export type NapMotionOpening =
  | { readonly kind: "opened"; readonly id: number; readonly endsAt: Date }
  | { readonly kind: "refused" }
  | { readonly kind: "no-leaders" }
  | { readonly kind: "post-failed"; readonly reason: string };

export interface NapMotions {
  /** /nap motion: a member of the NaP Council opens a NaP Motion, posted in #nap-leaders with its buttons. */
  open(command: NapMotionCommand): Promise<void>;
  /** Whether the Member may open a NaP Motion now: the same rule as /nap motion. */
  mayOpen(memberId: MemberId): boolean;
  /**
   * Opens a NaP Motion with this text for the Member, as /nap motion does, with the default vote length, for another part
   * of Neil (the NaP Rules). A failure is returned, not logged or answered: the caller does both.
   */
  openFor(memberId: MemberId, text: string): Promise<NapMotionOpening>;
  /** A press of a NaP Motion's Approve or Decline button: the vote of the presser's Alliance, changeable until the deadline. */
  vote(button: NapMotionButton): Promise<void>;
  /**
   * The one-minute tick: reminds the Linked R5s who have not voted once, and closes the motions whose deadline has come,
   * posting their result in the decision log in #nap-announcements. Never throws.
   */
  tick(): Promise<void>;
}

/**
 * NaP Motions (ADR 25): the NaP Council decides a matter by vote, one vote per Alliance in the NaP. Votes stay hidden while
 * a motion runs (they are only in #neil-log and neil.db); at the deadline the result and each Alliance's vote go to the
 * decision log in #nap-announcements, which names no Member. No Game API requests; mentions are off everywhere except
 * the reminder, which mentions only the Linked R5s it reminds.
 */
export function createNapMotions(deps: NapMotionsDeps): NapMotions {
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
      deps.logError(`Logging a NaP Motion line failed: ${reasonOf(error)}`);
    }
  }

  async function replyPrivately(
    to: { reply(options: InteractionReplyOptions): Promise<unknown> },
    content: string,
  ): Promise<void> {
    await to.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions });
  }

  /** The NaP Council member's Alliance in the NaP; undefined when the Member may not open a NaP Motion. */
  function councilOf(memberId: MemberId): NapMember | undefined {
    const tag = r5AllianceOf(memberId);
    const history = deps.napHistory();
    const council = napMembers(history).find((member) => tag !== undefined && sameTag(member.tag, tag));
    return council !== undefined && mayOpenMotion(tag, history) ? council : undefined;
  }

  /** Stores the motion and posts it in #nap-leaders; a motion that could not be posted is removed again. */
  async function openMotion(opener: MemberId, council: NapMember, text: string, hours: number): Promise<NapMotionOpening> {
    const openedAt = deps.now();
    const endsAt = motionEndsAt(openedAt, hours);
    const id = store.add({ text, openedBy: opener, openerTag: council.tag, openedAt, endsAt });
    const channelId = server.leadersChannelId();
    if (channelId === undefined) {
      store.remove(id);
      return { kind: "no-leaders" };
    }
    try {
      const messageId = await server.post(channelId, {
        content: messages.motion(id, opener, labeller()(council.tag), text, endsAt),
        components: [napMotionVoteRow(id)],
        allowedMentions,
      });
      store.setMessage(id, channelId, messageId);
    } catch (error) {
      store.remove(id);
      return { kind: "post-failed", reason: reasonOf(error) };
    }
    await log(messages.logOpened(opener, council.tag, id, endsAt));
    return { kind: "opened", id, endsAt };
  }

  async function openFor(memberId: MemberId, text: string): Promise<NapMotionOpening> {
    const council = councilOf(memberId);
    if (council === undefined) return { kind: "refused" };
    return openMotion(memberId, council, text, NAP_MOTION_DEFAULT_HOURS);
  }

  async function open(command: NapMotionCommand): Promise<void> {
    const opener = command.user.id;
    const council = councilOf(opener);
    if (council === undefined) {
      await replyPrivately(command, messages.refusedOpen);
      return;
    }
    const text = (command.options.getString("text", true) ?? "").trim();
    if (text === "") {
      await replyPrivately(command, messages.blankText);
      return;
    }
    if (text.length > NAP_MOTION_MAX_TEXT) {
      await replyPrivately(command, messages.tooLong);
      return;
    }
    const hours = command.options.getInteger("hours") ?? NAP_MOTION_DEFAULT_HOURS;
    if (!isMotionHours(hours)) {
      await replyPrivately(command, messages.badHours);
      return;
    }
    const opening = await openMotion(opener, council, text, hours);
    switch (opening.kind) {
      case "opened":
        await replyPrivately(command, messages.opened(opening.id, opening.endsAt));
        return;
      case "no-leaders":
        await replyPrivately(command, messages.noLeaders);
        await log(messages.logNoLeaders(opener));
        return;
      case "post-failed":
        await replyPrivately(command, messages.postFailed);
        await log(messages.logPostFailed(opener, opening.reason));
        return;
      case "refused":
        await replyPrivately(command, messages.refusedOpen);
        return;
    }
  }

  async function vote(button: NapMotionButton): Promise<void> {
    const pressed = napMotionVoteOf(button.customId);
    const motion = pressed === undefined ? undefined : store.get(pressed.id);
    if (pressed === undefined || motion === undefined || motion.closed !== undefined) {
      await replyPrivately(button, messages.notOpen);
      return;
    }
    const presser = button.user.id;
    const now = deps.now();
    // The checks and the write below run without an await in between, so a press and the tick never interleave.
    const voterTag = r5AllianceOf(presser);
    const council = napMembers(deps.napHistory()).find((member) => voterTag !== undefined && sameTag(member.tag, voterTag));
    if (council === undefined) {
      await replyPrivately(button, messages.refusedVote);
      return;
    }
    if (now.getTime() >= motion.endsAt.getTime()) {
      await replyPrivately(button, messages.voteEnded);
      return;
    }
    const earlier = store.votes(motion.id).find((cast) => sameTag(cast.allianceTag, council.tag))?.vote;
    store.castVote(motion.id, { allianceTag: council.tag, voterId: presser, vote: pressed.vote, at: now });
    const changedFrom = earlier !== undefined && earlier !== pressed.vote ? earlier : undefined;
    await replyPrivately(button, messages.voted(motion.id, pressed.vote, labeller()(council.tag), motion.endsAt, changedFrom));
    await log(messages.logVoted(presser, pressed.vote, council.tag, motion.id, changedFrom));
  }

  async function tick(): Promise<void> {
    try {
      for (const { id } of store.open()) await tickMotion(id);
    } catch (error) {
      deps.logError(`The NaP Motion tick failed: ${reasonOf(error)}`);
    }
  }

  /** Closes one open motion whose deadline has come, or reminds once when its reminder time has come. */
  async function tickMotion(id: number): Promise<void> {
    // Read again after the awaits of the motions before: the checks and the writes run with no await in between.
    const motion = store.get(id);
    if (motion === undefined || motion.closed !== undefined) return;
    const now = deps.now();
    if (now.getTime() >= motion.endsAt.getTime()) {
      await close(motion, now);
      return;
    }
    if (motion.remindedAt !== undefined) return;
    if (now.getTime() < motionReminderAt(motion.openedAt, motion.endsAt).getTime()) return;
    store.markReminded(motion.id, now);
    await remind(motion);
  }

  /** Reminds, in #nap-leaders, the Linked R5s of the NaP Alliances that have not voted, naming nobody's vote. */
  async function remind(motion: NapMotion): Promise<void> {
    const missing = alliancesWithoutVote(napMembers(deps.napHistory()), store.votes(motion.id));
    const reminded = deps.links
      .all()
      .map((link) => link.memberId)
      .filter((memberId) => {
        const tag = r5AllianceOf(memberId);
        return tag !== undefined && missing.some((member) => sameTag(member.tag, tag));
      });
    if (reminded.length === 0) {
      await log(messages.logNoReminder(motion.id));
      return;
    }
    const channelId = server.leadersChannelId();
    if (channelId === undefined) {
      await log(messages.logReminderNoLeaders(motion.id));
      return;
    }
    try {
      const text = messages.reminder(motion.id, labeller()(motion.openerTag), motion.endsAt);
      for (const message of textWithMentions(text, reminded)) await server.post(channelId, message);
    } catch (error) {
      await log(messages.logReminderFailed(motion.id, reasonOf(error)));
      return;
    }
    await log(messages.logReminded(motion.id, reminded));
  }

  /**
   * Counts the votes of the Alliances in the NaP now and closes the motion in one synchronous block, so it closes once;
   * then logs the result, edits the motion in #nap-leaders and posts the decision-log entry in #nap-announcements.
   */
  async function close(motion: NapMotion, now: Date): Promise<void> {
    const members = napMembers(deps.napHistory());
    const votes = store.votes(motion.id);
    const result = motionResult(votes, members);
    store.close(motion.id, { ...result, at: now });
    const label = labeller();
    await log(messages.logClosed(motion.id, result));
    await editMotion(motion, messages.closed(motion.id, motion.openedBy, label(motion.openerTag), motion.text, result, now));
    const lines = decisionLogLines({
      id: motion.id,
      text: motion.text,
      openerAlliance: label(motion.openerTag),
      openedAt: motion.openedAt,
      closedAt: now,
      result,
      votes: votesByAlliance(members, votes).map((entry) => ({ alliance: label(entry.tag), vote: entry.vote })),
    });
    await postDecision(motion.id, lines);
  }

  /** Edits the motion in #nap-leaders to its result, without buttons; a gone message or failed edit only logs a line. */
  async function editMotion(motion: NapMotion, content: string): Promise<void> {
    if (motion.channelId === undefined || motion.messageId === undefined) return;
    try {
      if (!(await server.edit(motion.channelId, motion.messageId, { content, components: [], allowedMentions }))) {
        await log(messages.logEditFailed(motion.id, "the message is gone"));
      }
    } catch (error) {
      await log(messages.logEditFailed(motion.id, reasonOf(error)));
    }
  }

  /**
   * Posts the decision-log entry in the original #nap-announcements, which the Interaction Bot translates, as plain
   * content split between lines; a missing channel or a failed post only logs a line and never undoes the result.
   */
  async function postDecision(id: number, lines: readonly string[]): Promise<void> {
    const channelId = server.announcementsChannelId();
    if (channelId === undefined) {
      await log(messages.logNoAnnouncements(id));
      return;
    }
    try {
      for (const content of splitBetweenLines(lines)) await server.post(channelId, { content, allowedMentions });
    } catch (error) {
      await log(messages.logAnnouncementFailed(id, reasonOf(error)));
    }
  }

  return { open, mayOpen: (memberId) => councilOf(memberId) !== undefined, openFor, vote, tick };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
