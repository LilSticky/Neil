import { MessageFlags } from "discord.js";
import { currentNapRules, mayProposeNapRules, napRulesTextProblem, openNapRulesProposal, } from "../domain/nap-rules.js";
import { allowedMentions } from "./lookup.js";
import { splitBetweenLines } from "./nap-motion-texts.js";
import { NAP_RULES_CHANGE_FIELD, NAP_RULES_TEXT_FIELD, napRulesAnnouncementLines, napRulesEmbed, napRulesHistoryEmbed, napRulesMessages as messages, napRulesModal, napRulesMotionText, napRulesVersionEmbed, } from "./nap-rules-texts.js";
/**
 * The NaP Rules (ADR 26): numbered versions of the rules the NaP Council agreed on. A member of the NaP Council proposes
 * a version, which is put to a NaP Motion; approved, it takes effect and is announced in #nap-announcements with what
 * changed and its full text. Public views and the announcement name no Member; only #neil-log names the proposer.
 */
export function createNapRules(deps) {
    const { store, server } = deps;
    /** One #neil-log line; a refused log is written to the error log instead. */
    async function log(line) {
        try {
            await server.log(line);
        }
        catch (error) {
            deps.logError(`Logging a NaP Rules line failed: ${reasonOf(error)}`);
        }
    }
    async function replyPrivately(to, content) {
        await to.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions });
    }
    async function show(command) {
        const versions = store.versions();
        const current = currentNapRules(versions);
        const open = openNapRulesProposal(versions);
        if (current === undefined) {
            await replyPrivately(command, open === undefined ? messages.noRules : messages.noRulesButProposal(open.number));
            return;
        }
        await command.reply({ embeds: [napRulesEmbed(current, open)], flags: MessageFlags.Ephemeral, allowedMentions });
    }
    async function history(command) {
        const versions = store.versions();
        const number = command.options.getInteger("version");
        if (number === null) {
            await command.reply({ embeds: [napRulesHistoryEmbed(versions)], flags: MessageFlags.Ephemeral, allowedMentions });
            return;
        }
        const version = versions.find((candidate) => candidate.number === number);
        if (version === undefined) {
            await replyPrivately(command, messages.noSuchVersion(number));
            return;
        }
        await command.reply({ embeds: [napRulesVersionEmbed(version, versions)], flags: MessageFlags.Ephemeral, allowedMentions });
    }
    /** The private refusal of a proposal, or undefined when the Member may propose now. */
    function refusalOf(memberId) {
        if (!deps.motions.mayOpen(memberId))
            return messages.refusedPropose;
        const versions = store.versions();
        if (mayProposeNapRules(versions))
            return undefined;
        const open = openNapRulesProposal(versions);
        return open === undefined ? undefined : messages.proposalOpen(open.number);
    }
    async function propose(command) {
        const refusal = refusalOf(command.user.id);
        if (refusal !== undefined) {
            await replyPrivately(command, refusal);
            return;
        }
        await command.showModal(napRulesModal(currentNapRules(store.versions())?.text));
    }
    async function submit(modal) {
        const proposer = modal.user.id;
        // Checked again: two members could submit at once. The checks and the write run with no await in between.
        const refusal = refusalOf(proposer);
        if (refusal !== undefined) {
            await replyPrivately(modal, refusal);
            return;
        }
        const text = modal.fields.getTextInputValue(NAP_RULES_TEXT_FIELD).trim();
        const change = modal.fields.getTextInputValue(NAP_RULES_CHANGE_FIELD).trim();
        const versions = store.versions();
        const problem = napRulesTextProblem(text, change, currentNapRules(versions));
        if (problem !== undefined) {
            await replyPrivately(modal, messages.textProblem(problem));
            return;
        }
        const number = store.propose({ text, change, proposedBy: proposer, proposedAt: deps.now() });
        const opening = await deps.motions.openFor(proposer, napRulesMotionText(number, change));
        if (opening.kind !== "opened") {
            store.remove(number);
            const reason = opening.kind === "refused"
                ? "the proposer is not on the NaP Council"
                : opening.kind === "no-leaders"
                    ? "the server has no #nap-leaders"
                    : opening.reason;
            await replyPrivately(modal, opening.kind === "refused"
                ? messages.refusedPropose
                : opening.kind === "no-leaders"
                    ? messages.noLeaders
                    : messages.postFailed);
            await log(messages.logNotProposed(proposer, reason));
            return;
        }
        store.setMotion(number, opening.id);
        await replyPrivately(modal, messages.proposed(number, opening.id, opening.endsAt));
        await log(messages.logProposed(proposer, number, opening.id));
    }
    async function settle(motionId, outcome) {
        const version = store.versions().find((candidate) => candidate.motion === motionId);
        if (version === undefined)
            return;
        const at = deps.now();
        if (!store.decide(version.number, outcome, at))
            return;
        if (outcome === "rejected") {
            await log(messages.logRejected(version.number, motionId));
            return;
        }
        await log(messages.logApproved(version.number, motionId));
        await announce(version.number, napRulesAnnouncementLines(version, at));
    }
    /**
     * Posts the announcement in the original #nap-announcements, which the Interaction Bot translates, as plain content
     * split between lines, with mentions off; a missing channel or a failed post only logs a line and the version stays
     * in effect.
     */
    async function announce(number, lines) {
        const channelId = server.announcementsChannelId();
        if (channelId === undefined) {
            await log(messages.logNoAnnouncements(number));
            return;
        }
        try {
            for (const content of splitBetweenLines(lines))
                await server.post(channelId, { content, allowedMentions });
        }
        catch (error) {
            await log(messages.logAnnouncementFailed(number, reasonOf(error)));
        }
    }
    async function tick() {
        try {
            for (const version of store.versions()) {
                if (version.status.kind !== "proposed" || version.motion === undefined)
                    continue;
                const closed = deps.motionOf(version.motion)?.closed;
                if (closed !== undefined)
                    await settle(version.motion, closed.outcome);
            }
        }
        catch (error) {
            deps.logError(`The NaP Rules tick failed: ${reasonOf(error)}`);
        }
    }
    return { show, history, propose, submit, settle, tick };
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=nap-rules.js.map