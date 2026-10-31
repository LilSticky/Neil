import { quotaReset, recoverAfterRestart, timeOut, type OpenInterview } from "../domain/onboarding-interview.js";
import type { InterviewStore } from "../storage/interview-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import { abandonedLogLine, askUidMessage, quotaResetMessage, timedOutMessage } from "./interview-texts.js";

const SWEEP_EVERY_MS = 60_000;
const ENDED_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** What the sweeper needs: the stores, the Discord channels, the timeout, the clock and the error log. */
export interface SweeperDeps {
  readonly interviews: InterviewStore;
  readonly links: LinkStore;
  readonly channels: OnboardingChannels;
  readonly timeoutMs: number;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

/** The two jobs of the sweeper. Neither rejects: a failing Interview is logged and the rest still run. */
export interface Sweeper {
  /** After a restart: asks each Interview that was waiting on a Game API check for its uid again. */
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
      let checking;
      try {
        checking = deps.interviews.checking();
      } catch (error) {
        deps.logError(`Recovering Onboarding Interviews failed: ${errorText(error)}`);
        return;
      }
      reportCorrupt(deps, checking.corrupt, "recovering");
      for (const interview of checking.interviews) {
        await guarded(deps, `Recovering Onboarding Interview ${interview.id.toString()}`, async () => {
          const transition = recoverAfterRestart(interview, now);
          deps.interviews.save(transition.interview);
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

/** The Daily Quota has reset: the paused Interview asks for the uid again, and its timeout starts now. */
async function resume(deps: SweeperDeps, interview: OpenInterview, now: Date): Promise<void> {
  const transition = quotaReset(interview, now);
  if (transition.event.kind !== "resumed") return;
  deps.interviews.save(transition.interview);
  await deps.channels.post(interview.threadId, quotaResetMessage(interview.id, interview.memberId));
}

/** No answer within the timeout: the Interview is abandoned, its thread locked and the log told. */
async function abandonSilent(deps: SweeperDeps, interview: OpenInterview, now: Date): Promise<void> {
  const transition = timeOut(interview, now);
  if (transition.event.kind !== "abandoned") return;
  deps.interviews.save(transition.interview);
  await deps.channels.post(interview.threadId, timedOutMessage(deps.timeoutMs));
  await deps.channels.lockAndArchive(interview.threadId);
  await deps.channels.log(abandonedLogLine(interview.memberId, "timed-out"));
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
