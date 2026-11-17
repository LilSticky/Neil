import { MessageFlags } from "discord.js";
import { sameTag } from "../domain/city-rotation.js";
import { isNapCouncilMember, isNapMember, linkedR5AllianceOf, mayApprove, mayAskToJoin, mayLeave, napFormerMembers, napMembers, } from "../domain/nap.js";
import { isOfficer } from "../domain/officer.js";
import { allianceLabel } from "./city-rotation-texts.js";
import { allowedMentions } from "./lookup.js";
import { napApproveOf, napApproveRow, napHistoryEmbed, napListEmbed, napMessages as messages, napShowEmbed, } from "./nap-texts.js";
/**
 * The NaP register: which Alliances are in the NaP, the open join requests, and the history of joins and leaves with
 * who asked, who approved or left, and when. No Game API requests. Every request, approval and leave writes one
 * #neil-log line, and no message of Neil's about the NaP mentions anybody.
 */
/** How long a saved join request may wait for its post before /nap join treats it as lost. */
const UNPOSTED_REQUEST_MS = 60_000;
export function createNap(deps) {
    const { store, server } = deps;
    /** The tags (case-folded) of the open requests whose message /nap join is checking or posting again right now. */
    const checking = new Set();
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
        const events = store.history();
        const embed = napShowEmbed(napMembers(events), napFormerMembers(events), store.openRequests(), labeller());
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
        if (checking.has(tag.toLowerCase())) {
            await replyPrivately(command, messages.requestOpen(label));
            return;
        }
        // A request never posted (Neil stopped between saving and posting it) has no button; after a minute it is asked again.
        const stuck = store.request(tag);
        if (stuck !== undefined &&
            stuck.messageId === undefined &&
            deps.now().getTime() - stuck.requestedAt.getTime() > UNPOSTED_REQUEST_MS) {
            store.removeRequest(tag);
        }
        // A posted request whose message was deleted could never be approved (#148): check it, and post it again if gone.
        if (stuck !== undefined && stuck.messageId !== undefined) {
            await checkRequestMessage(command, stuck, stuck.messageId, label, napMembers(history).length === 0);
            return;
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
    /**
     * Refreshes the message of an open join request, or posts the same request again (same asker, time and button) when
     * the message is gone or not in the current #nap-leaders. The request stays open whatever happens.
     */
    async function checkRequestMessage(command, request, messageId, label, napEmpty) {
        const key = request.tag.toLowerCase();
        checking.add(key);
        try {
            const channelId = server.leadersChannelId();
            if (channelId === undefined) {
                await replyPrivately(command, messages.noLeaders);
                await log(messages.logRepostNoLeaders(request.tag));
                return;
            }
            const message = {
                content: messages.joinRequest(label, request.requestedBy, napEmpty),
                components: [napApproveRow(request.tag, request.requestedAt)],
                allowedMentions,
            };
            let stillThere;
            try {
                stillThere = request.channelId === channelId && (await server.edit(channelId, messageId, message));
                if (!stillThere) {
                    const newId = await server.post(channelId, message);
                    store.setRequestMessage(request.tag, request.requestedAt, channelId, newId);
                }
            }
            catch (error) {
                await replyPrivately(command, messages.postFailed);
                await log(messages.logRepostFailed(request.tag, reasonOf(error)));
                return;
            }
            if (stillThere) {
                await replyPrivately(command, messages.requestOpen(label));
                return;
            }
            await replyPrivately(command, messages.reposted(label));
            await log(messages.logReposted(command.user.id, request.tag));
        }
        finally {
            checking.delete(key);
        }
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
        const at = deps.now();
        store.append({
            kind: "joined",
            tag: request.tag,
            requestedBy: request.requestedBy,
            requestedAt: request.requestedAt,
            approvedBy: approver,
            approvedAs: as,
            at,
        });
        const label = labeller()(request.tag);
        await button.update({
            content: messages.approved(label, request.requestedBy, approver, as),
            components: [],
            allowedMentions,
        });
        await log(messages.logApproved(approver, as, request.tag, request.requestedBy));
        await announce(request.tag, messages.joinedAnnouncement(label, at));
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
        const at = deps.now();
        store.append({ kind: "left", tag: inNap.tag, leftBy: member, at });
        const label = labeller()(inNap.tag);
        await replyPrivately(command, messages.leftReply(label));
        await log(messages.logLeft(member, inNap.tag));
        await noticeLeaders(inNap.tag, messages.leftNotice(label, member));
        await announce(inNap.tag, messages.leftAnnouncement(label, at));
    }
    /** Tells the NaP Council in #nap-leaders that an Alliance left; a missing channel or failed post only logs a line. */
    async function noticeLeaders(tag, content) {
        const channelId = server.leadersChannelId();
        if (channelId === undefined) {
            await log(messages.logLeaveNoLeaders(tag));
            return;
        }
        try {
            await server.post(channelId, { content, allowedMentions });
        }
        catch (error) {
            await log(messages.logLeavePostFailed(tag, reasonOf(error)));
        }
    }
    /**
     * Announces a join or leave in #nap-announcements, then brings the NaP list there up to date. Runs after the change is
     * stored and answered: a missing channel or a failure only logs a line, and the list is left alone without a channel.
     */
    async function announce(tag, content) {
        const channelId = server.announcementsChannelId();
        if (channelId === undefined) {
            await log(messages.logNoAnnouncements(tag));
            return;
        }
        try {
            await server.post(channelId, { content, allowedMentions });
        }
        catch (error) {
            await log(messages.logAnnouncementFailed(tag, reasonOf(error)));
        }
        await refreshList();
    }
    /** The refreshes of the NaP list, chained so they run one at a time and two quick changes never post two lists. */
    let listRefreshes = Promise.resolve();
    function refreshList() {
        const next = listRefreshes.then(updateList);
        listRefreshes = next;
        return next;
    }
    async function updateList() {
        try {
            const channelId = server.announcementsChannelId();
            if (channelId === undefined) {
                await log(messages.logListNoAnnouncements);
                return;
            }
            const events = store.history();
            const list = {
                embeds: [napListEmbed(napMembers(events), napFormerMembers(events), labeller())],
                allowedMentions,
            };
            const messageId = store.listMessageId();
            if (messageId !== undefined && (await server.edit(channelId, messageId, list)))
                return;
            const newId = await server.post(channelId, list);
            store.setListMessageId(newId);
            try {
                await server.pin(channelId, newId);
            }
            catch (error) {
                await log(messages.logListPinFailed(reasonOf(error)));
            }
        }
        catch (error) {
            await log(messages.logListFailed(reasonOf(error)));
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
    return { show, join, leave, history, approve, refreshList };
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=nap.js.map