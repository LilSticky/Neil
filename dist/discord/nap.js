import { MessageFlags } from "discord.js";
import { sameTag } from "../domain/city-rotation.js";
import { isNapCouncilMember, isNapMember, linkedR5AllianceOf, mayAskToJoin, mayDecide, mayLeave, NAP_COOLDOWN_MS, NAP_VOTE_MS, napFormerMembers, napMembers, runningCooldownOf, voteResult, } from "../domain/nap.js";
import { isOfficer } from "../domain/officer.js";
import { allianceLabel } from "./city-rotation-texts.js";
import { allowedMentions } from "./lookup.js";
import { napHistoryEmbed, napListEmbed, napMessages as messages, napShowEmbed, napVoteOf, napVoteRow, } from "./nap-texts.js";
/** How long a saved join request may wait for its post before /nap join treats it as lost. */
const UNPOSTED_REQUEST_MS = 60_000;
/**
 * The NaP register: which Alliances are in the NaP, the open join requests and their NaP Votes, and the history of
 * joins, declines and leaves with who asked, how it was decided, and when. No Game API requests. Every request, vote,
 * result and leave writes one #neil-log line, and no message of Neil's about the NaP mentions anybody.
 */
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
        const cooldown = runningCooldownOf(history, tag, deps.now());
        if (cooldown !== undefined) {
            await replyPrivately(command, messages.cooldown(label, cooldown.declinedAt, cooldown.endsAt));
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
            const vote = napMembers(history).length === 0 ? undefined : openVote(stuck);
            await checkRequestMessage(command, stuck, stuck.messageId, label, vote?.endsAt);
            if (vote?.opened === true)
                await log(messages.logVoteOpened(stuck.tag, vote.endsAt));
            return;
        }
        if (!mayAskToJoin(tag, history, store.openRequests().map((request) => request.tag), deps.now())) {
            await replyPrivately(command, messages.requestOpen(label));
            return;
        }
        const requestedAt = deps.now();
        const voteEndsAt = napMembers(history).length === 0 ? undefined : new Date(requestedAt.getTime() + NAP_VOTE_MS);
        store.addRequest({ tag, requestedBy: asker, requestedAt, voteEndsAt });
        const channelId = server.leadersChannelId();
        if (channelId === undefined) {
            store.removeRequest(tag);
            await replyPrivately(command, messages.noLeaders);
            await log(messages.logNoLeaders(tag));
            return;
        }
        try {
            const messageId = await server.post(channelId, {
                content: messages.joinRequest(label, asker, voteEndsAt),
                components: [napVoteRow(tag, requestedAt)],
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
     * The end of the NaP Vote on an open request, opening the vote now when it is not open yet (the request was made while
     * the NaP had no members). Synchronous, so it runs in the same block as the caller's checks.
     */
    function openVote(request) {
        if (request.voteEndsAt !== undefined)
            return { endsAt: request.voteEndsAt, opened: false };
        const endsAt = new Date(deps.now().getTime() + NAP_VOTE_MS);
        store.setVoteEnd(request.tag, request.requestedAt, endsAt);
        return { endsAt, opened: true };
    }
    /**
     * Refreshes the message of an open join request, or posts the same request again (same asker, time and buttons) when
     * the message is gone or not in the current #nap-leaders. The request stays open whatever happens. Without a vote end,
     * the text says an Officer decides.
     */
    async function checkRequestMessage(command, request, messageId, label, voteEndsAt) {
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
                content: messages.joinRequest(label, request.requestedBy, voteEndsAt),
                components: [napVoteRow(request.tag, request.requestedAt)],
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
    async function vote(button) {
        const pressed = napVoteOf(button.customId);
        const request = pressed === undefined ? undefined : store.request(pressed.tag);
        if (pressed === undefined || request === undefined || request.requestedAt.getTime() !== pressed.requestedAt) {
            await replyPrivately(button, messages.notOpen);
            return;
        }
        const presser = button.user.id;
        const now = deps.now();
        // The checks and the writes below run without an await in between, so two presses, or a press and the tick, never
        // both decide.
        const history = store.history();
        const voterTag = r5AllianceOf(presser);
        const as = mayDecide({ allianceTag: voterTag, officer: isOfficer(button.memberRoleIds(), deps.officerRoleIds) }, history);
        if (as === "officer") {
            await decideAsOfficer(button, request, pressed.vote, presser, now);
            return;
        }
        const council = napMembers(history).find((member) => voterTag !== undefined && sameTag(member.tag, voterTag));
        if (as === undefined || council === undefined) {
            await replyPrivately(button, messages.refusedVote);
            return;
        }
        const endsAt = request.voteEndsAt ?? new Date(now.getTime() + NAP_VOTE_MS);
        if (now.getTime() >= endsAt.getTime()) {
            await replyPrivately(button, messages.voteEnded);
            return;
        }
        const opened = request.voteEndsAt === undefined;
        if (opened)
            store.setVoteEnd(request.tag, request.requestedAt, endsAt);
        const earlier = store
            .votes(request.tag, request.requestedAt)
            .find((cast) => sameTag(cast.allianceTag, council.tag))?.vote;
        store.castVote(request.tag, request.requestedAt, {
            allianceTag: council.tag,
            voterId: presser,
            vote: pressed.vote,
            at: now,
        });
        const changedFrom = earlier !== undefined && earlier !== pressed.vote ? earlier : undefined;
        const label = labeller();
        await replyPrivately(button, messages.voted(pressed.vote, label(council.tag), label(request.tag), endsAt, changedFrom));
        await log(messages.logVoted(presser, pressed.vote, council.tag, request.tag, changedFrom));
        if (opened)
            await announceVote(request, endsAt);
    }
    /** While the NaP has no members, an Officer approves or declines at once; a decline starts the NaP Cooldown. */
    async function decideAsOfficer(button, request, choice, officer, now) {
        store.removeRequest(request.tag);
        store.append({
            kind: choice === "approve" ? "joined" : "declined",
            tag: request.tag,
            requestedBy: request.requestedBy,
            requestedAt: request.requestedAt,
            decision: { as: "officer", by: officer },
            at: now,
        });
        const label = labeller()(request.tag);
        const askAgain = new Date(now.getTime() + NAP_COOLDOWN_MS);
        await button.update({
            content: choice === "approve"
                ? messages.approved(label, request.requestedBy, officer)
                : messages.declinedByOfficer(label, request.requestedBy, officer, askAgain),
            components: [],
            allowedMentions,
        });
        await log(choice === "approve"
            ? messages.logApproved(officer, request.tag, request.requestedBy)
            : messages.logDeclined(officer, request.tag, request.requestedBy, askAgain));
        if (choice === "approve")
            await announce(request.tag, messages.joinedAnnouncement(label, now));
    }
    /** Logs that the NaP Vote on a request opened later than the request, and edits its message to say until when. */
    async function announceVote(request, endsAt) {
        await log(messages.logVoteOpened(request.tag, endsAt));
        await editRequest(request, {
            content: messages.joinRequest(labeller()(request.tag), request.requestedBy, endsAt),
            components: [napVoteRow(request.tag, request.requestedAt)],
            allowedMentions,
        });
    }
    /** Edits the message of a request in #nap-leaders; a gone message or a failed edit only writes a #neil-log line. */
    async function editRequest(request, message) {
        if (request.channelId === undefined || request.messageId === undefined)
            return;
        try {
            if (!(await server.edit(request.channelId, request.messageId, message))) {
                await log(messages.logEditFailed(request.tag, "the message is gone"));
            }
        }
        catch (error) {
            await log(messages.logEditFailed(request.tag, reasonOf(error)));
        }
    }
    async function tick() {
        try {
            for (const { tag } of store.openRequests())
                await tickRequest(tag);
        }
        catch (error) {
            deps.logError(`The NaP tick failed: ${reasonOf(error)}`);
        }
    }
    /** Opens or counts the NaP Vote on one open, posted request, while the NaP has members. */
    async function tickRequest(tag) {
        // Read again after the awaits of the requests before: the checks and the writes run with no await in between.
        const request = store.request(tag);
        if (request?.messageId === undefined)
            return;
        const members = napMembers(store.history());
        if (members.length === 0)
            return;
        const now = deps.now();
        if (request.voteEndsAt === undefined) {
            const { endsAt } = openVote(request);
            await announceVote(request, endsAt);
            return;
        }
        if (request.voteEndsAt.getTime() > now.getTime())
            return;
        const result = voteResult(store.votes(request.tag, request.requestedAt), members);
        store.removeRequest(request.tag);
        store.append({
            kind: result.outcome === "approved" ? "joined" : "declined",
            tag: request.tag,
            requestedBy: request.requestedBy,
            requestedAt: request.requestedAt,
            decision: { as: "vote", approve: result.approve, decline: result.decline },
            at: now,
        });
        const label = labeller()(request.tag);
        const askAgain = new Date(now.getTime() + NAP_COOLDOWN_MS);
        await log(messages.logVoteResult(request.tag, request.requestedBy, result, askAgain));
        await editRequest(request, {
            content: result.outcome === "approved"
                ? messages.approvedByVote(label, request.requestedBy, result.approve, result.decline)
                : messages.declinedByVote(label, request.requestedBy, result.approve, result.decline, askAgain),
            components: [],
            allowedMentions,
        });
        if (result.outcome === "approved")
            await announce(request.tag, messages.joinedAnnouncement(label, now));
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
    return { show, join, leave, history, vote, tick, refreshList };
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=nap.js.map