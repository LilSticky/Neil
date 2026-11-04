import {
  quotaReset,
  recoverAfterRestart,
  timeOut,
  type AwaitingConfirmation,
  type OpenInterview,
} from "../domain/onboarding-interview.js";
import type { InterviewStore } from "../storage/interview-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { PostedPreferencePrompt, PreferenceStore } from "../storage/preference-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import {
  abandonedLogLine,
  askUidMessage,
  foundCardMessage,
  quotaResetMessage,
} from "./interview-texts.js";

const SWEEP_EVERY_MS = 60_000;
const ENDED_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Makes the Link of an Interview whose Member chose the Player shown, as the Member's own confirmation would: "done" when
 * the Link is made, "ended" when the Interview moved on meanwhile, "refused" when the uid is Linked to someone else.
 */
export type LinkChosen = (interview: AwaitingConfirmation) => Promise<"done" | "ended" | "refused">;

/**
 * What the sweeper needs: the stores, the Discord channels, the timeout, the clock and the error log. linkChosen recovers
 * the Links of chosen Players; without it the card of such a Player is shown again, for the Member to confirm.
 */
export interface SweeperDeps {
  readonly interviews: InterviewStore;
  readonly links: LinkStore;
  readonly preferences: PreferenceStore;
  readonly channels: OnboardingChannels;
  readonly timeoutMs: number;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
  readonly linkChosen?: LinkChosen;
}

/** The two jobs of the sweeper. Neither rejects: a failing Interview is logged and the rest still run. */
export interface Sweeper {
  /** After a restart: asks each Interview whose Game API lookup or check was in flight for its uid again. */
  recover(): Promise<void>;
  /** Abandons the Interviews past their deadline and deletes the rows ended long ago. */
  sweep(): Promise<void>;
}

/** Runs `run` every `everyMs` milliseconds and returns the function that stops it. */
export type Schedule = (run: () => void, everyMs: number) => () => void;

export function createSweeper(deps: SweeperDeps): Sweeper {
  return {
    async recover(): Promise<void> {
      const now = deps.now();
      let inFlight;
      try {
        inFlight = deps.interviews.inFlight();
      } catch (error) {
        deps.logError(`Recovering Onboarding Interviews failed: ${errorText(error)}`);
        return;
      }
      reportCorrupt(deps, inFlight.corrupt, "recovering");
      for (const interview of inFlight.interviews) {
        await guarded(deps, `Recovering Onboarding Interview ${interview.id.toString()}`, async () => {
          if (interview.step === "awaiting-confirmation") return recoverChosen(deps, interview);
          const transition = recoverAfterRestart(interview, now);
          // The Member may have left meanwhile: the Interview is then no longer in flight, and is left alone.
          if (!deps.interviews.saveIfStep(transition.interview, interview.step)) return;
          if (transition.event.kind === "asked") {
            await deps.channels.post(interview.threadId, askUidMessage(interview.id, interview.memberId));
          }
        });
      }
    },

    async sweep(): Promise<void> {
      const now = deps.now();
      const cutoff = new Date(now.getTime() - ENDED_RETENTION_MS);
      await guarded(deps, "Deleting ended rows", () => {
        deps.interviews.deleteEndedBefore(cutoff);
        deps.links.deleteEndedBefore(cutoff);
        return Promise.resolve();
      });
      await closeExpiredPreferences(deps, now);
      let due;
      try {
        due = deps.interviews.due(now);
      } catch (error) {
        deps.logError(`Sweeping Onboarding Interviews failed: ${errorText(error)}`);
        return;
      }
      reportCorrupt(deps, due.corrupt, "sweeping");
      for (const interview of due.interviews) {
        await guarded(deps, `Sweeping Onboarding Interview ${interview.id.toString()}`, () =>
          interview.step === "paused-for-quota" ? resume(deps, interview, now) : abandonSilent(deps, interview, now),
        );
      }
    },
  };
}

/** Starts the sweeper: recover, then sweep at once, then sweep every 60 seconds. Runs are queued so they never overlap. */
export function startSweeper(sweeper: Sweeper, schedule: Schedule): () => void {
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>): void => {
    queue = queue.then(task);
  };
  enqueue(() => sweeper.recover());
  enqueue(() => sweeper.sweep());
  return schedule(() => {
    enqueue(() => sweeper.sweep());
  }, SWEEP_EVERY_MS);
}

/**
 * The Member chose the Player shown and the Link was not made before the restart: it is made now. When the Link is
 * refused, the card is shown again, so that the Member can answer it.
 */
async function recoverChosen(deps: SweeperDeps, interview: AwaitingConfirmation): Promise<void> {
  const outcome = deps.linkChosen === undefined ? "refused" : await deps.linkChosen(interview);
  if (outcome === "refused") await deps.channels.post(interview.threadId, foundCardMessage(interview.id, interview.player));
}

/** The Daily Quota has reset: the paused Interview asks for the uid again, and its timeout starts now. */
async function resume(deps: SweeperDeps, interview: OpenInterview, now: Date): Promise<void> {
  const transition = quotaReset(interview, now);
  if (transition.event.kind !== "resumed") return;
  if (!deps.interviews.saveIfStep(transition.interview, interview.step)) return;
  await deps.channels.post(interview.threadId, quotaResetMessage(interview.id, interview.memberId));
}

/** No answer within the timeout: the Interview is abandoned, its thread deleted and the log told. */
async function abandonSilent(deps: SweeperDeps, interview: OpenInterview, now: Date): Promise<void> {
  const transition = timeOut(interview, now);
  if (transition.event.kind !== "abandoned") return;
  if (!deps.interviews.saveIfStep(transition.interview, interview.step)) return;
  // The log comes first: a thread that is gone must not cost the line.
  await deps.channels.log(abandonedLogLine(interview.memberId, "timed-out"));
  await deps.channels.deleteThread(interview.threadId);
}

/**
 * A Preferences message past the Interview timeout is closed and its thread deleted, unless the Member has a pending Rank
 * Approval, whose thread stays. Never throws: a failing message is logged and the others are still closed.
 */
async function closeExpiredPreferences(deps: SweeperDeps, now: Date): Promise<void> {
  let expired: PostedPreferencePrompt[];
  try {
    expired = deps.preferences.promptsPostedBefore(new Date(now.getTime() - deps.timeoutMs));
  } catch (error) {
    deps.logError(`Sweeping Preferences messages failed: ${errorText(error)}`);
    return;
  }
  for (const prompt of expired) {
    await guarded(deps, `Closing the Preferences message of Member ${prompt.memberId}`, () =>
      closeExpiredPreference(deps, prompt),
    );
  }
}

/** The thread goes first: when its deletion fails the prompt stays open, and the next sweep retries it. */
async function closeExpiredPreference(deps: SweeperDeps, prompt: PostedPreferencePrompt): Promise<void> {
  if (deps.links.pendingFor(prompt.memberId) === undefined) await deps.channels.deleteThread(prompt.threadId);
  deps.preferences.closePrompt(prompt.memberId);
}

async function guarded(deps: SweeperDeps, label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    deps.logError(`${label} failed: ${errorText(error)}`);
  }
}

function reportCorrupt(deps: SweeperDeps, corrupt: number, doing: "recovering" | "sweeping"): void {
  if (corrupt === 0) return;
  deps.logError(
    `Skipped ${corrupt.toString()} unreadable Onboarding Interview row(s) in neil.db while ${doing}; fix or remove them by hand.`,
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
