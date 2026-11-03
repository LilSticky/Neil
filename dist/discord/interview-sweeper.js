import { quotaReset, recoverAfterRestart, timeOut, } from "../domain/onboarding-interview.js";
import { abandonedLogLine, askUidMessage, foundCardMessage, quotaResetMessage, timedOutMessage, } from "./interview-texts.js";
const SWEEP_EVERY_MS = 60_000;
const ENDED_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export function createSweeper(deps) {
    return {
        async recover() {
            const now = deps.now();
            let inFlight;
            try {
                inFlight = deps.interviews.inFlight();
            }
            catch (error) {
                deps.logError(`Recovering Onboarding Interviews failed: ${errorText(error)}`);
                return;
            }
            reportCorrupt(deps, inFlight.corrupt, "recovering");
            for (const interview of inFlight.interviews) {
                await guarded(deps, `Recovering Onboarding Interview ${interview.id.toString()}`, async () => {
                    if (interview.step === "awaiting-confirmation")
                        return recoverChosen(deps, interview);
                    const transition = recoverAfterRestart(interview, now);
                    // The Member may have left meanwhile: the Interview is then no longer in flight, and is left alone.
                    if (!deps.interviews.saveIfStep(transition.interview, interview.step))
                        return;
                    if (transition.event.kind === "asked") {
                        await deps.channels.post(interview.threadId, askUidMessage(interview.id, interview.memberId));
                    }
                });
            }
        },
        async sweep() {
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
            }
            catch (error) {
                deps.logError(`Sweeping Onboarding Interviews failed: ${errorText(error)}`);
                return;
            }
            reportCorrupt(deps, due.corrupt, "sweeping");
            for (const interview of due.interviews) {
                await guarded(deps, `Sweeping Onboarding Interview ${interview.id.toString()}`, () => interview.step === "paused-for-quota" ? resume(deps, interview, now) : abandonSilent(deps, interview, now));
            }
        },
    };
}
/** Starts the sweeper: recover, then sweep at once, then sweep every 60 seconds. Runs are queued so they never overlap. */
export function startSweeper(sweeper, schedule) {
    let queue = Promise.resolve();
    const enqueue = (task) => {
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
async function recoverChosen(deps, interview) {
    const outcome = deps.linkChosen === undefined ? "refused" : await deps.linkChosen(interview);
    if (outcome === "refused")
        await deps.channels.post(interview.threadId, foundCardMessage(interview.id, interview.player));
}
/** The Daily Quota has reset: the paused Interview asks for the uid again, and its timeout starts now. */
async function resume(deps, interview, now) {
    const transition = quotaReset(interview, now);
    if (transition.event.kind !== "resumed")
        return;
    if (!deps.interviews.saveIfStep(transition.interview, interview.step))
        return;
    await deps.channels.post(interview.threadId, quotaResetMessage(interview.id, interview.memberId));
}
/** No answer within the timeout: the Interview is abandoned, its thread locked and the log told. */
async function abandonSilent(deps, interview, now) {
    const transition = timeOut(interview, now);
    if (transition.event.kind !== "abandoned")
        return;
    if (!deps.interviews.saveIfStep(transition.interview, interview.step))
        return;
    // The log comes first: a thread that is gone must not cost the line.
    await deps.channels.log(abandonedLogLine(interview.memberId, "timed-out"));
    await deps.channels.post(interview.threadId, timedOutMessage(deps.timeoutMs));
    await deps.channels.lockAndArchive(interview.threadId);
}
async function guarded(deps, label, work) {
    try {
        await work();
    }
    catch (error) {
        deps.logError(`${label} failed: ${errorText(error)}`);
    }
}
function reportCorrupt(deps, corrupt, doing) {
    if (corrupt === 0)
        return;
    deps.logError(`Skipped ${corrupt.toString()} unreadable Onboarding Interview row(s) in neil.db while ${doing}; fix or remove them by hand.`);
}
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=interview-sweeper.js.map