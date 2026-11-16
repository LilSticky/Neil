import {
  MessageFlags,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
} from "discord.js";
import {
  answerRefusal,
  suggestFighterClass,
  type Availability,
  type FighterClassThresholds,
} from "../domain/availability.js";
import type { RequestPurpose } from "../domain/daily-quota.js";
import type { Uid } from "../domain/lookup-input.js";
import { allianceRoleName } from "../domain/managed-roles.js";
import type { LookupResult, Player } from "../domain/player.js";
import { newRaid, type Raid } from "../domain/raid.js";
import { serverTimeInstant } from "../domain/server-time.js";
import { bracketFor } from "../domain/troop-bracket.js";
import type { AvailabilityStore, StoredPoll } from "../storage/availability-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { RaidStore } from "../storage/raid-store.js";
import { createAvailabilityBoard, type AvailabilityBoard } from "./availability-board.js";
import {
  availabilityMessages,
  classRows,
  parseAvailabilityButton,
  type AvailabilityButton,
  type SuggestionBasis,
} from "./availability-texts.js";
import type { EventRole } from "./events.js";
import type { RaidSettings } from "./raid-plan.js";
import type { RaidServer } from "./raid-server.js";

/** A press of an Availability Poll button: on a poll card, or a class button in the private reply. */
export interface AvailabilityPress {
  readonly customId: string;
  readonly user: { readonly id: string };
  memberRoles(): readonly EventRole[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
  deferReply(options: { readonly flags: MessageFlags.Ephemeral }): Promise<unknown>;
  editReply(options: InteractionEditReplyOptions): Promise<unknown>;
  /** Edits the private reply the class button sits on. */
  update(options: InteractionUpdateOptions): Promise<unknown>;
}

export interface AvailabilityPollDeps {
  readonly availability: Pick<AvailabilityStore, "poll" | "answers" | "answerOf" | "record">;
  readonly raids: Pick<RaidStore, "find">;
  readonly links: Pick<LinkStore, "linkFor">;
  /** The uncharged Player lookup: Neil's cached copy, as a Booty Call reads it. */
  readonly game: { getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> };
  readonly server: Pick<RaidServer, "edit" | "log">;
  readonly settings: Pick<RaidSettings, "warCouncilRoleId" | "startMinutes">;
  readonly thresholds: FighterClassThresholds;
  readonly troopBracketLevels: readonly number[];
  readonly now: () => Date;
  readonly logError: (line: string) => void;
  /** The cards as the Availability clock edits them too; one is made when none is given. */
  readonly board?: AvailabilityBoard;
}

export interface AvailabilityPoll {
  onButton(press: AvailabilityPress): Promise<void>;
}

/**
 * The Availability Poll's buttons. Only a Linked Member holding the Alliance's `[TAG]` role answers; every refusal is
 * private. Available opens a private reply with Neil's suggested Fighter Class and the four class buttons; a class press
 * or Not available records the answer, replacing the Member's earlier one, and edits the cards. Nothing here throws.
 */
export function createAvailabilityPoll(deps: AvailabilityPollDeps): AvailabilityPoll {
  const { availability, server } = deps;
  const board = deps.board ?? createAvailabilityBoard({ availability, server });

  async function replyPrivately(press: AvailabilityPress, content: string): Promise<void> {
    await press.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }

  /** The poll and its Raid, or the refusal to answer with. */
  function pollOf(button: AvailabilityButton, startMinutes: number): { readonly poll: StoredPoll; readonly raid: Raid } | string {
    const poll = availability.poll(button.raidId);
    if (poll === undefined) return availabilityMessages.unknownPoll;
    const raid = deps.raids.find(button.raidId)?.raid ?? newRaid(button.raidId, serverTimeInstant(button.raidId, startMinutes));
    const refusal = answerRefusal(raid, poll.state, deps.now());
    if (refusal === "cancelled") return availabilityMessages.cancelled;
    if (refusal === "closed") return availabilityMessages.closed;
    if (refusal === "not-opened") return availabilityMessages.unknownPoll;
    return { poll, raid };
  }

  async function basisOf(uid: Uid): Promise<SuggestionBasis> {
    try {
      const result = await deps.game.getPlayer(uid, "lookup");
      if (result.kind !== "found") return { read: false, bracket: undefined, might: undefined };
      return {
        read: true,
        bracket: bracketFor(result.value.sanctuaryLevel, deps.troopBracketLevels),
        might: result.value.might,
      };
    } catch (error) {
      deps.logError(`The Game API lookup for the Availability Poll failed: ${errorMessage(error)}`);
      return { read: false, bracket: undefined, might: undefined };
    }
  }

  /** Keeps the answer, replacing the Member's earlier one; the tags whose cards show it: the new one and a left one. */
  function record(memberId: string, raid: Raid, tag: string, value: Availability): readonly string[] {
    const earlier = availability.answerOf(raid.id, memberId);
    availability.record(raid.id, { memberId, tag, availability: value }, deps.now());
    return earlier === undefined || earlier.tag === tag ? [tag] : [tag, earlier.tag];
  }

  async function refresh(raid: Raid, tags: readonly string[]): Promise<void> {
    const poll = availability.poll(raid.id);
    if (poll !== undefined) await board.refresh(raid, poll, tags);
  }

  async function answer(press: AvailabilityPress, button: AvailabilityButton, raid: Raid, uid: Uid): Promise<void> {
    const memberId = press.user.id;
    switch (button.kind) {
      case "available": {
        await press.deferReply({ flags: MessageFlags.Ephemeral });
        const basis = await basisOf(uid);
        const suggested = suggestFighterClass(basis.bracket, basis.might, deps.thresholds);
        const current = availability.answerOf(raid.id, memberId);
        await press.editReply({
          content: availabilityMessages.suggestion(button.tag, suggested, basis, current),
          components: classRows(raid.id, button.tag, suggested),
          allowedMentions: { parse: [] },
        });
        return;
      }
      case "not-available": {
        const tags = record(memberId, raid, button.tag, { kind: "not-available" });
        await replyPrivately(press, availabilityMessages.recordedNotAvailable(button.tag, raid.start));
        await refresh(raid, tags);
        return;
      }
      case "class": {
        const tags = record(memberId, raid, button.tag, { kind: "available", fighterClass: button.fighterClass });
        await press.update({
          content: availabilityMessages.recordedAvailable(button.tag, button.fighterClass, raid.start),
          components: [],
          allowedMentions: { parse: [] },
        });
        await refresh(raid, tags);
        return;
      }
    }
  }

  return {
    async onButton(press) {
      try {
        const button = parseAvailabilityButton(press.customId);
        const { warCouncilRoleId, startMinutes } = deps.settings;
        if (warCouncilRoleId === undefined || startMinutes === undefined) {
          await replyPrivately(press, availabilityMessages.notSetUp);
          return;
        }
        if (button === undefined) {
          await replyPrivately(press, availabilityMessages.unknownPoll);
          return;
        }
        const found = pollOf(button, startMinutes);
        if (typeof found === "string") {
          await replyPrivately(press, found);
          return;
        }
        const link = deps.links.linkFor(press.user.id);
        if (link === undefined) {
          await replyPrivately(press, availabilityMessages.notLinked);
          return;
        }
        const roleName = allianceRoleName(button.tag);
        if (!press.memberRoles().some((role) => role.name === roleName)) {
          await replyPrivately(press, availabilityMessages.notInAlliance(button.tag));
          return;
        }
        await answer(press, button, found.raid, link.uid);
      } catch (error) {
        deps.logError(`The Availability Poll answer failed: ${errorMessage(error)}`);
        await server.log(`An Availability Poll answer failed: ${errorMessage(error)}`).catch(() => undefined);
      }
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
