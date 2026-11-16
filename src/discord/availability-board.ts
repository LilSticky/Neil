import { availabilityTotals, countsOf, type AvailabilityTotals } from "../domain/availability.js";
import type { Raid } from "../domain/raid.js";
import type { AvailabilityStore, StoredPoll } from "../storage/availability-store.js";
import type { PostedCard } from "../storage/raid-store.js";
import { pollCard, pollRows, summaryCard, type PollCardState } from "./availability-texts.js";
import type { CardEdit, RaidServer } from "./raid-server.js";

export interface AvailabilityBoardDeps {
  readonly availability: Pick<AvailabilityStore, "answers">;
  readonly server: Pick<RaidServer, "edit" | "log">;
}

/** The posted cards of a poll, brought up to date with its answers. */
export interface AvailabilityBoard {
  /** The totals of the poll: the Alliances that got a card, and any answered for. */
  totals(poll: StoredPoll): AvailabilityTotals;
  /** Edits the poll cards of the tags given, and the summary, to the current counts. */
  refresh(raid: Raid, poll: StoredPoll, tags: readonly string[]): Promise<void>;
  /** Edits every poll card and the summary to the state given: open, or closed with the final numbers and no buttons. */
  showAll(raid: Raid, poll: StoredPoll, state: PollCardState): Promise<void>;
}

/**
 * The poll cards and the Availability Summary as Neil keeps them: edited after every answer and at the close. A card
 * that is gone is logged once and not posted again; a failed edit is logged and the next card is still edited.
 */
export function createAvailabilityBoard(deps: AvailabilityBoardDeps): AvailabilityBoard {
  const { server } = deps;
  const goneLogged = new Set<string>();

  function totals(poll: StoredPoll): AvailabilityTotals {
    return availabilityTotals(deps.availability.answers(poll.raidId), [...poll.cards.keys()]);
  }

  async function edit(card: PostedCard, change: CardEdit, what: string): Promise<void> {
    try {
      if (await server.edit(card, change)) return;
      if (goneLogged.has(card.messageId)) return;
      goneLogged.add(card.messageId);
      await server.log(`The ${what} is gone; Neil does not post it again.`);
    } catch (error) {
      await server.log(`The ${what} could not be edited: ${errorMessage(error)}`).catch(() => undefined);
    }
  }

  async function show(raid: Raid, poll: StoredPoll, tags: readonly string[], state: PollCardState): Promise<void> {
    const current = totals(poll);
    for (const tag of tags) {
      const card = poll.cards.get(tag);
      if (card === undefined) continue;
      await edit(
        card,
        { embeds: [pollCard(raid, tag, countsOf(current, tag), state)], components: pollRows(raid.id, tag, state) },
        `Availability Poll card of [${tag}] for the Raid of ${raid.id}`,
      );
    }
    if (poll.summaryCard !== undefined) {
      await edit(
        poll.summaryCard,
        { embeds: [summaryCard(raid, current, state)], components: [] },
        `Availability Summary for the Raid of ${raid.id}`,
      );
    }
  }

  return {
    totals,
    refresh: (raid, poll, tags) => show(raid, poll, tags, "open"),
    showAll: (raid, poll, state) => show(raid, poll, [...poll.cards.keys()], state),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
