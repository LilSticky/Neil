import { MessageFlags } from "discord.js";
import { sameTag } from "../domain/city-rotation.js";
import { isNapCouncilMember, isNapMember, linkedR5AllianceOf, mayApprove, mayAskToJoin, mayLeave, napMembers, } from "../domain/nap.js";
import { isOfficer } from "../domain/officer.js";
import { allianceLabel } from "./city-rotation-texts.js";
import { allowedMentions } from "./lookup.js";
import { napApproveOf, napApproveRow, napHistoryEmbed, napMessages as messages, napShowEmbed } from "./nap-texts.js";
/**
 * The NaP register: which Alliances are in the NaP, the open join requests, and the history of joins and leaves with
 * who asked, who approved or left, and when. No Game API requests. Every request, approval and leave writes one
 * #neil-log line, and no message of Neil's about the NaP mentions anybody.
 */
/** How long a saved join request may wait for its post before /nap join treats it as lost. */
const UNPOSTED_REQUEST_MS = 60_000;
export function createNap(deps) {
    const { store, server } = deps;
    function labeller() {
        const known = deps.knownAlliances.all(deps.now()).filter((alliance) => alliance.kingdom === deps.homeKingdom);
        const byTag = new Map(known.map((alliance) => [alliance.tag.toLowerCase(), alliance.name]));
        return (tag) => allianceLabel(tag, byTag.get(tag.toLowerCase()));
    }
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
            deps.logError(`Logging a NaP line failed: ${reasonOf(error)}`);
        }
    }
    async function replyPrivately(to, content) {
        await to.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions });
    }
    async function show(command) {
        const embed = napShowEmbed(napMembers(store.history()), store.openRequests(), labeller());
        await command.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions });
    }
    async function join(command) {
        const asker = command.user.id;
        const tag = r5AllianceOf(asker);
        if (tag === undefined) {
            await replyPrivately(command, messages.refusedNotR5);
            return;
        }
        const label = labeller()(tag);
        // The checks and the stored request run without an await in between, so two requests never both pass.
        const history = store.history();
        if (isNapMember(history, tag)) {
            await replyPrivately(command, messages.alreadyMember(label));
            return;
        }
        // A request never posted (Neil stopped between saving and posting it) has no button; after a minute it is asked again.
        const stuck = store.request(tag);
        if (stuck !== undefined &&
            stuck.messageId === undefined &&
            deps.now().getTime() - stuck.requestedAt.getTime() > UNPOSTED_REQUEST_MS) {
            store.removeRequest(tag);
        }
        if (!mayAskToJoin(tag, history, store.openRequests().map((request) => request.tag))) {
            await replyPrivately(command, messages.requestOpen(label));
            return;
        }
        const requestedAt = deps.now();
        store.addRequest({ tag, requestedBy: asker, requestedAt });
        const channelId = server.leadersChannelId();
        if (channelId === undefined) {
            store.removeRequest(tag);
            await replyPrivately(command, messages.noLeaders);
            await log(messages.logNoLeaders(tag));
            return;
        }
        try {
            const messageId = await server.post(channelId, {
                content: messages.joinRequest(label, asker, napMembers(history).length === 0),
                components: [napApproveRow(tag, requestedAt)],
                allowedMentions,
            });
            store.setRequestMessage(tag, requestedAt, channelId, messageId);
        }
        catch (error) {
            store.removeRequest(tag);
            await replyPrivately(command, messages.postFailed);
            await log(messages.logRequestPostFailed(tag, reasonOf(error)));
            return;
        }
        await replyPrivately(command, messages.asked(label));
        await log(messages.logRequested(asker, tag));
    }
    async function approve(button) {
        const pressed = napApproveOf(button.customId);
        const request = pressed === undefined ? undefined : store.request(pressed.tag);
        if (pressed === undefined || request === undefined || request.requestedAt.getTime() !== pressed.requestedAt) {
            await replyPrivately(button, messages.notOpen);
            return;
        }
        const approver = button.user.id;
        // The check and the write below run without an await in between, so two presses approve once.
        const history = store.history();
        const as = mayApprove({ allianceTag: r5AllianceOf(approver), officer: isOfficer(button.memberRoleIds(), deps.officerRoleIds) }, history);
        if (as === undefined) {
            await replyPrivately(button, messages.refusedApprove);
            return;
        }
        store.removeRequest(request.tag);
        store.append({
            kind: "joined",
            tag: request.tag,
            requestedBy: request.requestedBy,
            requestedAt: request.requestedAt,
            approvedBy: approver,
            approvedAs: as,
            at: deps.now(),
        });
        const label = labeller()(request.tag);
        await button.update({
            content: messages.approved(label, request.requestedBy, approver, as),
            components: [],
            allowedMentions,
        });
        await log(messages.logApproved(approver, as, request.tag, request.requestedBy));
    }
    async function leave(command) {
        const member = command.user.id;
        const tag = r5AllianceOf(member);
        const history = store.history();
        const inNap = tag === undefined ? undefined : napMembers(history).find((entry) => sameTag(entry.tag, tag));
        if (inNap === undefined || !mayLeave(tag, history)) {
            await replyPrivately(command, messages.refusedLeave);
            return;
        }
        store.append({ kind: "left", tag: inNap.tag, leftBy: member, at: deps.now() });
        const label = labeller()(inNap.tag);
        await replyPrivately(command, messages.leftReply(label));
        await log(messages.logLeft(member, inNap.tag));
        const channelId = server.leadersChannelId();
        if (channelId === undefined) {
            await log(messages.logLeaveNoLeaders(inNap.tag));
            return;
        }
        try {
            await server.post(channelId, { content: messages.leftNotice(label, member), allowedMentions });
        }
        catch (error) {
            await log(messages.logLeavePostFailed(inNap.tag, reasonOf(error)));
        }
    }
    async function history(command) {
        const events = store.history();
        const council = isNapCouncilMember(r5AllianceOf(command.user.id), events);
        if (!council && !isOfficer(command.memberRoleIds(), deps.officerRoleIds)) {
            await replyPrivately(command, messages.refusedHistory);
            return;
        }
        await command.reply({ embeds: [napHistoryEmbed(events)], flags: MessageFlags.Ephemeral, allowedMentions });
    }
    return { show, join, leave, history, approve };
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=nap.js.map