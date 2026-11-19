import { MessageFlags, } from "discord.js";
import { sameTag } from "../domain/city-rotation.js";
import { exileReasonOf } from "../domain/exile.js";
import { parseUid } from "../domain/lookup-input.js";
import { isNapMember, linkedR5AllianceOf, napMembers } from "../domain/nap.js";
import { isNapReportOutcome, mayProposeOutcome, mayReport, NAP_REPORT_MAX_NOTE, napReportTextProblem, } from "../domain/nap-report.js";
import { allowedMentions } from "./lookup.js";
import { napReportAnnouncement, napReportMessages as messages, napReportMotionText, napReportThreadIntro, napReportThreadName, } from "./nap-report-texts.js";
import { recordFoundExile } from "./reaper.js";
/**
 * The NaP Reports (ADR 28): a suspected breach of the NaP, its evidence in a private thread under #nap-leaders that holds
 * the NaP Council and the reporter (the accused Alliance's R5 is on the council), and the outcome the NaP Council decides
 * by NaP Motion. Neil only records the decision and carries it out. The motion text and the announcement name only the
 * number, the accused Alliance and the outcome; only #neil-log and neil.db name the reporter and the proposer. Neil never
 * deletes, archives or locks a report's thread, and keeps every report.
 */
export function createNapReports(deps) {
    const { store, server } = deps;
    /** The tag of the Home Kingdom Alliance the Member is Linked R5 of; undefined when they are none. */
    function r5AllianceOf(memberId) {
        const editor = deps.editorOf(memberId);
        return editor === undefined ? undefined : linkedR5AllianceOf(editor, deps.homeKingdom);
    }
    /** One #neil-log line; a refused log is written to the error log instead. */
    async function log(line) {
        try {
            await server.log(line);
        }
        catch (error) {
            deps.logError(`Logging a NaP Report line failed: ${reasonOf(error)}`);
        }
    }
    async function replyPrivately(command, content) {
        await command.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions });
    }
    /** Posts in the report's thread with mentions off; a failed post only logs a line. */
    async function postInThread(report, content) {
        if (report.threadId === undefined)
            return;
        try {
            await server.post(report.threadId, { content, allowedMentions });
        }
        catch (error) {
            await log(messages.logThreadPostFailed(report.number, reasonOf(error)));
        }
    }
    /** The Linked Members on the NaP Council now, and the reporter, each once: who the report's thread holds. */
    function threadMembers(reporter) {
        const history = deps.napHistory();
        const council = deps.links
            .all()
            .map((link) => link.memberId)
            .filter((memberId) => {
            const tag = r5AllianceOf(memberId);
            return tag !== undefined && isNapMember(history, tag);
        });
        return [...new Set([reporter, ...council])];
    }
    /** The private refusal of a report, or the accused Alliance's tag as the NaP register keeps it. */
    function checkReport(reporter, accusedInput) {
        const reporterTag = r5AllianceOf(reporter);
        const history = deps.napHistory();
        if (reporterTag === undefined || !isNapMember(history, reporterTag))
            return { ok: false, refusal: messages.refusedReport };
        if (sameTag(reporterTag, accusedInput))
            return { ok: false, refusal: messages.ownAlliance };
        const accused = napMembers(history).find((member) => sameTag(member.tag, accusedInput));
        if (accused === undefined || !mayReport(reporterTag, accused.tag, history)) {
            return { ok: false, refusal: messages.notInNap(accusedInput) };
        }
        const council = napMembers(history).find((member) => sameTag(member.tag, reporterTag));
        return { ok: true, reporterTag: council?.tag ?? reporterTag, accusedTag: accused.tag };
    }
    async function report(command) {
        const reporter = command.user.id;
        const accusedInput = (command.options.getString("alliance", true) ?? "").trim();
        const checked = checkReport(reporter, accusedInput);
        if (!checked.ok) {
            await replyPrivately(command, checked.refusal);
            return;
        }
        const what = (command.options.getString("what", true) ?? "").trim();
        const problem = napReportTextProblem(what);
        if (problem !== undefined) {
            await replyPrivately(command, problem === "blank" ? messages.blankWhat : messages.whatTooLong);
            return;
        }
        const player = command.options.getInteger("player");
        const uid = player === null ? undefined : parseUid(player > 0 ? player.toString() : "");
        if (uid !== undefined && !uid.ok) {
            await replyPrivately(command, messages.badPlayer);
            return;
        }
        const reportedAt = deps.now();
        const filed = {
            accusedTag: checked.accusedTag,
            accusedUid: uid?.value,
            what,
            reportedBy: reporter,
            reporterTag: checked.reporterTag,
            reportedAt,
        };
        const number = store.file(filed);
        const leaders = server.leadersChannelId();
        if (leaders === undefined) {
            store.remove(number);
            await replyPrivately(command, messages.noLeaders);
            await log(messages.logNotFiled(reporter, checked.accusedTag, "the server has no #nap-leaders"));
            return;
        }
        // Opening the thread and adding its members can take longer than Discord waits for an answer.
        await command.deferReply({ flags: MessageFlags.Ephemeral });
        let opened;
        try {
            opened = await server.openPrivateThread(leaders, napReportThreadName(number, checked.accusedTag), threadMembers(reporter));
        }
        catch (error) {
            store.remove(number);
            await command.editReply({ content: messages.threadFailed, allowedMentions });
            await log(messages.logNotFiled(reporter, checked.accusedTag, `the thread could not be opened (${reasonOf(error)})`));
            return;
        }
        store.setThread(number, opened.threadId);
        const stored = { number, ...filed, threadId: opened.threadId };
        await postInThread(stored, napReportThreadIntro(stored));
        await command.editReply({ content: messages.filed(number, opened.threadId), allowedMentions });
        await log(messages.logFiled(reporter, number, checked.accusedTag, opened.notAdded));
    }
    async function proposeOutcome(command) {
        const proposer = command.user.id;
        if (!deps.motions.mayOpen(proposer)) {
            await replyPrivately(command, messages.refusedPropose);
            return;
        }
        const number = command.options.getInteger("report", true) ?? 0;
        const outcome = command.options.getString("outcome", true) ?? "";
        if (!isNapReportOutcome(outcome)) {
            await replyPrivately(command, messages.badOutcome);
            return;
        }
        const noteText = (command.options.getString("note") ?? "").trim();
        if (noteText.length > NAP_REPORT_MAX_NOTE) {
            await replyPrivately(command, messages.noteTooLong);
            return;
        }
        const note = noteText === "" ? undefined : noteText;
        // The checks and the stored proposal run with no await in between, so two proposals never both pass.
        const filed = store.reports().find((candidate) => candidate.number === number);
        const may = mayProposeOutcome(filed, store.proposals(), outcome);
        if (!may.ok || filed === undefined) {
            const refusal = may.ok ? "unknown-report" : may.refusal;
            await replyPrivately(command, refusal === "unknown-report"
                ? messages.unknownReport(number)
                : refusal === "decided"
                    ? messages.decided(number)
                    : refusal === "waiting"
                        ? messages.waiting(number)
                        : messages.noAccusedPlayer(number));
            return;
        }
        const id = store.propose({ report: number, outcome, note, proposedBy: proposer, proposedAt: deps.now() });
        const opening = await deps.motions.openFor(proposer, napReportMotionText(number, filed.accusedTag, outcome));
        if (opening.kind !== "opened") {
            store.removeProposal(id);
            const reason = opening.kind === "refused"
                ? "the proposer is not on the NaP Council"
                : opening.kind === "no-leaders"
                    ? "the server has no #nap-leaders"
                    : opening.reason;
            await replyPrivately(command, opening.kind === "refused"
                ? messages.refusedPropose
                : opening.kind === "no-leaders"
                    ? messages.motionNoLeaders
                    : messages.motionPostFailed);
            await log(messages.logNotProposed(proposer, number, reason));
            return;
        }
        store.setMotion(id, opening.id);
        await replyPrivately(command, messages.proposed(number, opening.id, opening.endsAt));
        await log(messages.logProposed(proposer, number, outcome, opening.id));
        await postInThread(filed, messages.threadProposed(outcome, opening.id, opening.endsAt, note));
    }
    async function settle(motionId, verdict) {
        const proposal = store.proposals().find((candidate) => candidate.motion === motionId);
        if (proposal === undefined)
            return;
        const filed = store.reports().find((candidate) => candidate.number === proposal.report);
        if (filed === undefined)
            return;
        const at = deps.now();
        if (!store.decide(proposal.id, verdict, at))
            return;
        if (verdict === "rejected") {
            await log(messages.logRejected(filed.number, proposal.outcome, motionId));
            await postInThread(filed, messages.threadRejected(proposal.outcome, motionId));
            return;
        }
        await log(messages.logApproved(filed.number, proposal.outcome, motionId));
        await postInThread(filed, messages.threadApproved(proposal.outcome, motionId));
        await carryOut(filed, proposal, motionId);
        await announce(filed, proposal, at);
    }
    /** Carries out an approved expulsion or Exile; the other outcomes are only recorded. */
    async function carryOut(filed, proposal, motionId) {
        if (proposal.outcome === "expelled") {
            await deps.expel(filed.accusedTag, proposal.proposedBy, motionId);
            return;
        }
        if (proposal.outcome === "exile" && filed.accusedUid !== undefined)
            await addExile(filed, filed.accusedUid, proposal.proposedBy);
    }
    /**
     * Adds the accused Player to REAPER as /reaper add does, with the report as the reason; an Exile already stored stays as
     * it was. A refused or failed read is told in the thread and the log, for the NaP Council to add the Exile by hand.
     */
    async function addExile(filed, uid, proposer) {
        let result;
        try {
            result = await deps.readPlayer(uid);
        }
        catch (error) {
            await exileNotAdded(filed, uid, reasonOf(error));
            return;
        }
        if (result.kind !== "found") {
            await exileNotAdded(filed, uid, `the Game API read ended with ${result.kind}`);
            return;
        }
        const reason = exileReasonOf(`NaP report ${filed.number.toString()}: Exile`);
        if (!reason.ok)
            return;
        const already = deps.exiles.reaper.find(result.value.uid) !== undefined;
        const confirmation = await recordFoundExile(result.value, result.asOf, reason.value, proposer, deps.exiles);
        await postInThread(filed, already ? messages.threadExileKept(confirmation) : messages.threadExileAdded(confirmation));
    }
    async function exileNotAdded(filed, uid, reason) {
        await log(messages.logExileNotAdded(filed.number, uid, reason));
        await postInThread(filed, messages.threadExileNotRead(uid));
    }
    /**
     * Posts the public log entry in the original #nap-announcements, mentions off; a missing channel or a failed post only
     * logs a line and the decision stands.
     */
    async function announce(filed, proposal, at) {
        const channelId = server.announcementsChannelId();
        if (channelId === undefined) {
            await log(messages.logNoAnnouncements(filed.number));
            return;
        }
        try {
            await server.post(channelId, {
                content: napReportAnnouncement(filed.number, filed.accusedTag, proposal.outcome, at),
                allowedMentions,
            });
        }
        catch (error) {
            await log(messages.logAnnouncementFailed(filed.number, reasonOf(error)));
        }
    }
    async function tick() {
        try {
            for (const proposal of store.proposals()) {
                if (proposal.status.kind !== "proposed" || proposal.motion === undefined)
                    continue;
                const closed = deps.motionOf(proposal.motion)?.closed;
                if (closed !== undefined)
                    await settle(proposal.motion, closed.outcome);
            }
        }
        catch (error) {
            deps.logError(`The NaP Report tick failed: ${reasonOf(error)}`);
        }
    }
    return { report, proposeOutcome, settle, tick };
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=nap-reports.js.map