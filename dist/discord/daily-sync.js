import { canSendFor, utcDayOf } from "../domain/daily-quota.js";
import { isDue, planSync, playerFromRoster, rankAfterSync, } from "../domain/daily-sync.js";
import { parseAllianceKey } from "../domain/lookup-input.js";
import { nameAndRolesNotAppliedLogLine } from "./name-and-roles-texts.js";
/** How often the Daily Sync checks whether it is due: a run missed at its hour starts at the next check. */
const CHECK_EVERY_MS = 10 * 60_000;
/**
 * Runs the Daily Sync once: each Linked Member on the server is checked against the Game API, by one roster request per
 * Alliance or by a uid lookup, within the Sync Share and above the Quota Reserve. The day is recorded before the first
 * request, and the Members not reached are left over for the next day. Stops at an outage (unavailable, try-again or
 * not prepared) or an abort, and logs its summary. Rejects only when Discord cannot be reached.
 */
export async function runDailySync(deps) {
    const now = deps.now();
    const day = utcDayOf(now);
    const syncLinks = deps.links.all().map((link) => ({
        memberId: link.memberId,
        uid: link.uid,
        lastAlliance: lastAllianceOf(deps.applied.get(link.memberId)),
    }));
    const steps = planSync(syncLinks, deps.runs.load()?.leftOver ?? []);
    // Every planned Member is left over until reached, so a run cut short is not repeated today and its Members come first.
    const pending = new Set(steps.flatMap(linksOf).map((link) => link.memberId));
    deps.runs.save({ day, leftOver: [...pending] });
    const counts = { changed: 0, skipped: 0 };
    // Requests are counted by the Daily Quota's used figure, so a retry inside a call counts as the request it is.
    const usedAtStart = deps.gameApi.quotaToday().used;
    const requestsSent = () => Math.max(0, deps.gameApi.quotaToday().used - usedAtStart);
    const mayRequest = () => requestsSent() < deps.share &&
        deps.signal?.aborted !== true &&
        canSendFor(deps.gameApi.quotaToday(), "sync", deps.quotaReserve);
    /** Applies the Player to a reached Member: the rank is worked out from the Link as it is now and the Alliance last applied. */
    const apply = async (present, player) => {
        const { link, server } = present;
        const current = deps.links.linkFor(link.memberId);
        if (current !== undefined) {
            const rank = rankAfterSync(current.allianceRank, link.lastAlliance, player);
            if (await deps.nameAndRoles.syncMember(link.memberId, player, rank, server))
                counts.changed += 1;
        }
        pending.delete(link.memberId);
    };
    /** Fetches the Member; one who is not on the server is Unlinked as missing and leaves the run. */
    const present = async (link) => {
        const server = await deps.members.memberOf(link.memberId);
        if (server !== undefined)
            return { link, server };
        await deps.unlink.unlink({ id: link.memberId }, "missing");
        counts.skipped += 1;
        pending.delete(link.memberId);
        return undefined;
    };
    /** Looks one Member up by uid. Returns false when the run must stop. */
    const lookUp = async (member) => {
        if (!mayRequest())
            return false;
        const result = await deps.gameApi.getPlayer(member.link.uid, "sync");
        if (result.kind === "found") {
            await apply(member, result.value);
            return true;
        }
        if (result.kind === "not-found") {
            counts.skipped += 1;
            pending.delete(member.link.memberId);
            await deps.preferenceRoles.apply(member.link.memberId);
            await deps.log(nameAndRolesNotAppliedLogLine(member.link.memberId));
            return true;
        }
        return false;
    };
    /** One roster request for the Alliance, applied to the Members on the server it lists. Returns false when the run must stop. */
    const readRoster = async (alliance, links, fallbacks) => {
        const members = [];
        for (const link of links) {
            const member = await present(link);
            if (member !== undefined)
                members.push(member);
        }
        if (members.length === 0)
            return true;
        const key = parseAllianceKey(alliance.tag);
        if (!key.ok) {
            fallbacks.push(...members);
            return true;
        }
        if (!mayRequest())
            return false;
        const result = await deps.gameApi.getAlliance(alliance.kingdom, key.value, "sync");
        if (result.kind === "not-found") {
            fallbacks.push(...members);
            return true;
        }
        if (result.kind !== "found")
            return false;
        for (const member of members) {
            const entry = result.value.roster.find((row) => row.uid === member.link.uid);
            const player = entry === undefined ? undefined : playerFromRoster(result.value, entry);
            if (player === undefined)
                fallbacks.push(member);
            else
                await apply(member, player);
        }
        return true;
    };
    /** A uid step: the Member is fetched, then looked up when present. Returns false when the run must stop. */
    const uidStep = async (link) => {
        const member = await present(link);
        return member === undefined ? true : lookUp(member);
    };
    // The steps in their planned order; the Members a roster does not give are looked up by uid after them.
    const fallbacks = [];
    let stopped = false;
    for (const step of steps) {
        const going = step.kind === "roster" ? await readRoster(step.alliance, step.links, fallbacks) : await uidStep(step.link);
        if (!going) {
            stopped = true;
            break;
        }
    }
    for (const member of stopped ? [] : fallbacks) {
        if (!(await lookUp(member)))
            break;
    }
    const leftOver = [...pending];
    deps.runs.save({ day, leftOver });
    const summary = { changed: counts.changed, skipped: counts.skipped, requests: requestsSent() };
    await deps.log(summaryLine(day, summary, leftOver.length));
}
/** The Alliance a Member was last applied in: none when there is no Applied State, which is unrecorded. */
function lastAllianceOf(state) {
    return state === undefined ? "unrecorded" : state.alliance;
}
function linksOf(step) {
    return step.kind === "roster" ? step.links : [step.link];
}
function summaryLine(day, counts, left) {
    const requests = `${counts.requests.toString()} ${counts.requests === 1 ? "request" : "requests"}`;
    return {
        content: `📅 Daily Sync for ${day} (UTC): ${counts.changed.toString()} changed, ${counts.skipped.toString()} skipped, ${requests}, ${left.toString()} left.`,
        allowedMentions: { parse: [] },
    };
}
/**
 * Starts the Daily Sync: a check now and every 10 minutes after, each running the Daily Sync when it is due (the Sync hour
 * has come and today's run is not recorded). Runs never overlap. Returns the function that stops the checks: it ends a run
 * in progress before its next request, and resolves once that run has ended.
 */
export function startDailySync(deps, syncHourUtc, schedule) {
    const stopping = new AbortController();
    let running = undefined;
    const check = () => {
        if (running !== undefined || stopping.signal.aborted)
            return;
        try {
            if (!isDue(deps.runs.load()?.day, deps.now(), syncHourUtc))
                return;
        }
        catch (error) {
            deps.logError(`Checking the Daily Sync failed: ${reasonOf(error)}`);
            return;
        }
        running = runDailySync({ ...deps, signal: stopping.signal })
            .catch((error) => {
            deps.logError(`The Daily Sync failed: ${reasonOf(error)}`);
        })
            .finally(() => {
            running = undefined;
        });
    };
    check();
    const stopTimer = schedule(check, CHECK_EVERY_MS);
    return async () => {
        stopTimer();
        stopping.abort();
        await running;
    };
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=daily-sync.js.map