import { MessageFlags } from "discord.js";
import { z } from "zod";
import { checkApply, kingMoveSteps, planKingMove, } from "../domain/king-move.js";
import { parseAllianceKey } from "../domain/lookup-input.js";
import { isOfficer } from "../domain/officer.js";
import { appliedCard, applyOf, applyRow, kingMoveMessages as messages, preparedCard, supersededCard, } from "./king-move-texts.js";
/** Discord's code for a missing permission: here, the King role above Neil's own. */
const MISSING_PERMISSIONS = 50013;
const discordError = z.object({ code: z.number() });
/** No Member is pinged by a King Move card, line or answer: mentions only name them. */
const noPings = { parse: [] };
/**
 * The King Move (ADR 21): after each Handover Neil prepares the move of the King role to the receiving Alliance's R5, and
 * moves it only when an Officer presses Apply. Every step writes one #neil-log line.
 */
export function createKingMoves(deps) {
    const { store, server } = deps;
    /** The moves an Apply is running for, by the moment they were prepared, so two presses do not run at once. */
    const applying = new Set();
    async function log(line) {
        try {
            await server.log(line);
        }
        catch (error) {
            deps.logError(`Logging a King Move line failed: ${reasonOf(error)}`);
        }
    }
    async function editCard(move, content) {
        if (move.messageId === undefined)
            return;
        try {
            await server.editCard(move.messageId, { content, components: [], allowedMentions: noPings });
        }
        catch (error) {
            deps.logError(`Editing a King Move card failed: ${reasonOf(error)}`);
        }
    }
    /** The R5 of the Alliance, read live once, and their Member here. */
    async function expectedKingOf(holdingTag) {
        const key = parseAllianceKey(holdingTag);
        if (!key.ok)
            return { kind: "game-api-failed", detail: "not an Alliance tag" };
        const result = await deps.gameApi.getAlliance(deps.homeKingdom, key.value, "sync", "live");
        if (result.kind !== "found")
            return { kind: "game-api-failed", detail: result.kind };
        const alliance = result.value;
        const leaderUid = alliance.leaderUid;
        if (leaderUid === undefined)
            return { kind: "no-r5" };
        const leaderName = alliance.roster.find((entry) => entry.uid === leaderUid)?.name ?? alliance.leaderName;
        const memberId = deps.links.memberForUid(leaderUid);
        if (memberId === undefined)
            return { kind: "unlinked", leaderUid, leaderName };
        if (!(await server.isOnServer(memberId)))
            return { kind: "left-server", leaderUid, leaderName, memberId };
        return { kind: "member", leaderUid, leaderName, memberId };
    }
    /** Marks a still prepared King Move superseded, edits its card and logs it. */
    async function supersedeEarlier() {
        const earlier = store.load();
        if (earlier?.state.kind !== "prepared")
            return;
        store.save({ ...earlier, state: { kind: "superseded" } });
        await editCard(earlier, supersededCard(earlier));
        await log(messages.logSuperseded(earlier));
    }
    async function prepare(holdingTag) {
        await supersedeEarlier();
        const expected = await expectedKingOf(holdingTag);
        const holders = expected.kind === "member" ? await server.kingHolders() : [];
        const plan = planKingMove(holdingTag, expected, holders, deps.now());
        if (plan.kind === "not-prepared") {
            const { reason } = plan;
            await log(reason.kind === "already-king"
                ? messages.logNothingToMove(holdingTag, reason.memberId)
                : messages.logNotPrepared(holdingTag, reason));
            return;
        }
        const { move } = plan;
        store.save(move);
        let messageId;
        try {
            messageId = await server.postCard({ content: preparedCard(move), components: [applyRow(move)], allowedMentions: noPings });
        }
        catch (error) {
            await log(messages.logCardFailed(holdingTag, reasonOf(error)));
            return;
        }
        store.update((current) => current.preparedAt.getTime() === move.preparedAt.getTime() ? { ...current, messageId } : undefined);
        await log(messages.logPrepared(move));
    }
    async function replyPrivately(button, content) {
        await button.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: noPings });
    }
    async function apply(button) {
        const pressed = applyOf(button.customId);
        const officer = isOfficer(button.memberRoleIds(), deps.officerRoleIds);
        const move = store.load();
        const check = checkApply(move, pressed ?? -1, officer);
        if (check.kind === "not-officer") {
            await replyPrivately(button, messages.notOfficer);
            return;
        }
        if (check.kind === "not-open" || move === undefined) {
            await replyPrivately(button, messages.notOpen);
            return;
        }
        const key = move.preparedAt.getTime();
        if (applying.has(key)) {
            await replyPrivately(button, messages.busy);
            return;
        }
        applying.add(key);
        try {
            await runApply(button, move);
        }
        finally {
            applying.delete(key);
        }
    }
    async function runApply(button, move) {
        const steps = kingMoveSteps(move, await server.kingHolders());
        const done = [];
        const failed = [];
        // The new King gets King first, so the server is never left without one when a later step is refused.
        if (steps.giveToNewKing) {
            await step({ memberId: move.newKing, step: "give" }, () => server.giveKing(move.newKing), done, failed);
        }
        for (const memberId of steps.takeFrom) {
            await step({ memberId, step: "take" }, () => server.takeKing(memberId), done, failed);
        }
        if (failed.length > 0) {
            await replyPrivately(button, messages.refused(done, failed));
            await log(messages.logRefused(move, button.user.id, failed));
            return;
        }
        const appliedAt = deps.now();
        const appliedBy = button.user.id;
        store.update((current) => current.preparedAt.getTime() === move.preparedAt.getTime()
            ? { ...current, state: { kind: "applied", appliedBy, appliedAt } }
            : undefined);
        await replyPrivately(button, messages.applied(move, steps.takeFrom, steps.giveToNewKing));
        await editCard(move, appliedCard(move, appliedBy, appliedAt));
        await log(messages.logApplied(move, appliedBy, steps.takeFrom, steps.giveToNewKing));
    }
    async function step(what, run, done, failed) {
        try {
            await run();
            done.push(what);
        }
        catch (error) {
            const parsed = discordError.safeParse(error);
            failed.push({ ...what, missingPermissions: parsed.success && parsed.data.code === MISSING_PERMISSIONS });
            deps.logError(`King Move: Discord refused to ${what.step} King (${what.memberId}): ${reasonOf(error)}`);
        }
    }
    return {
        async afterHandover(holdingTag) {
            try {
                await prepare(holdingTag);
            }
            catch (error) {
                deps.logError(`Preparing the King Move failed: ${reasonOf(error)}`);
                await log(messages.logFailed(holdingTag, reasonOf(error)));
            }
        },
        apply,
    };
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=king-move.js.map