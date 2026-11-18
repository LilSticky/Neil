import { MessageFlags, } from "discord.js";
import { cityRotationOf, lastRoyalCitySiege, leaveRotation, mayChangeCityRotation, mayEditCityRotation, moveAlliance, nextRoyalCitySiege, sameTag, skipTurn, upcomingAlliance, } from "../domain/city-rotation.js";
import { parseAllianceKey } from "../domain/lookup-input.js";
import { isOfficer } from "../domain/officer.js";
import { allianceLabel, cityRotationCard, cityRotationMessages as messages, confirmHandoverOf, confirmHandoverRow, orderText, } from "./city-rotation-texts.js";
import { allowedMentions } from "./lookup.js";
/** The longest order text /rotation set takes. */
export const MAX_ORDER_LENGTH = 200;
/** Discord shows at most 25 autocomplete choices, each at most 100 characters long. */
const MAX_CHOICES = 25;
const MAX_CHOICE_LENGTH = 100;
/**
 * The City Rotation: the card (pinned in #nap-announcements, and shown by /rotation show), the order kept by the R5s of
 * the Alliances in it, the Holding Alliance named by an Officer, and the Handover after each Royal City siege, confirmed
 * by the receiving Alliance's R5 or an Officer. Every change writes one #neil-log line.
 */
export function createCityRotation(deps) {
    const { store, server } = deps;
    /** The Known Alliances of the Home Kingdom, by tag in lower case. */
    function knownByTag() {
        const known = deps.knownAlliances.all(deps.now()).filter((alliance) => alliance.kingdom === deps.homeKingdom);
        return new Map(known.map((alliance) => [alliance.tag.toLowerCase(), alliance]));
    }
    function labeller() {
        const known = knownByTag();
        return (tag) => allianceLabel(tag, known.get(tag.toLowerCase())?.name);
    }
    /** The tag whose Turn is next (expected in an open Turn, or recorded after a skip or a leave); undefined in Contested or without an order. */
    function nextOf(state) {
        if (deps.mode !== "rotation" || state.order === undefined)
            return undefined;
        return upcomingAlliance(turnsOf(state));
    }
    function cardOf(state) {
        const now = deps.now();
        const embed = cityRotationCard({
            mode: deps.mode,
            state,
            label: labeller(),
            next: nextOf(state),
            nextSiege: nextRoyalCitySiege(now),
        });
        return { embeds: [embed], allowedMentions };
    }
    /** One #neil-log line; a refused log is written to the error log instead. */
    async function log(line) {
        try {
            await server.log(line);
        }
        catch (error) {
            deps.logError(`Logging a City Rotation line failed: ${reasonOf(error)}`);
        }
    }
    async function refreshCard() {
        try {
            const channelId = server.announcementsChannelId();
            if (channelId === undefined) {
                await log(messages.logNoAnnouncements);
                return;
            }
            const state = store.load();
            const card = cardOf(state);
            if (state.cardMessageId !== undefined && (await server.edit(channelId, state.cardMessageId, card)))
                return;
            const messageId = await server.post(channelId, card);
            store.update((current) => ({ ...current, cardMessageId: messageId }));
            try {
                await server.pin(channelId, messageId);
            }
            catch (error) {
                await log(messages.logPinFailed(reasonOf(error)));
            }
        }
        catch (error) {
            await log(messages.logCardFailed(reasonOf(error)));
        }
    }
    async function replyPrivately(command, content) {
        await command.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions });
    }
    async function show(command) {
        await command.reply({ ...cardOf(store.load()), flags: MessageFlags.Ephemeral });
    }
    async function set(command) {
        if (deps.mode === "contested") {
            await replyPrivately(command, messages.contested);
            return;
        }
        const typed = (command.options.getString("order", true) ?? "").slice(0, MAX_ORDER_LENGTH);
        const tags = typed.split(/[\s,]+/).filter((tag) => tag !== "");
        if (tags.length === 0) {
            await replyPrivately(command, messages.noOrderTags);
            return;
        }
        const known = knownByTag();
        const unknown = tags.filter((tag) => !known.has(tag.toLowerCase()));
        if (unknown.length > 0) {
            await replyPrivately(command, messages.unknownTags(unknown));
            return;
        }
        const order = tags.map((tag) => known.get(tag.toLowerCase())?.tag ?? tag);
        const holdingTyped = command.options.getString("holding")?.trim();
        const rotation = cityRotationOf(order, holdingTyped === undefined || holdingTyped === "" ? undefined : holdingTyped);
        if (!rotation.ok) {
            await replyPrivately(command, messages.problem(rotation.problem));
            return;
        }
        const before = store.load();
        const editor = deps.editorOf(command.user.id);
        if (editor === undefined || !mayEditCityRotation(editor, deps.homeKingdom, before.order, rotation.rotation.order)) {
            await replyPrivately(command, messages.refusedSet);
            return;
        }
        store.update((current) => ({
            ...current,
            order: rotation.rotation.order,
            holding: rotation.rotation.holding,
            handover: undefined,
            next: undefined,
        }));
        const label = labeller();
        await replyPrivately(command, messages.set(label(rotation.rotation.holding)));
        await log(messages.logSet(command.user.id, orderText(before.order), before.holding === undefined ? "none" : `[${before.holding}]`, orderText(rotation.rotation.order), `[${rotation.rotation.holding}]`));
        await refreshCard();
    }
    async function holder(command) {
        if (!isOfficer(command.memberRoleIds(), deps.officerRoleIds)) {
            await replyPrivately(command, messages.refusedHolder);
            return;
        }
        const typed = (command.options.getString("tag", true) ?? "").trim();
        const known = knownByTag().get(typed.toLowerCase());
        if (known === undefined) {
            await replyPrivately(command, messages.unknownHolder(typed));
            return;
        }
        const state = store.load();
        let tag = known.tag;
        if (deps.mode === "rotation") {
            if (state.order === undefined) {
                await replyPrivately(command, messages.noRotationForHolder);
                return;
            }
            const inOrder = state.order.find((candidate) => sameTag(candidate, known.tag));
            if (inOrder === undefined) {
                await replyPrivately(command, messages.holderNotInOrder(known.tag));
                return;
            }
            tag = inOrder;
        }
        store.update((current) => ({ ...current, holding: tag, handover: undefined, next: undefined }));
        const label = labeller()(tag);
        await replyPrivately(command, messages.holderNamed(label));
        await log(messages.logHolder(command.user.id, `[${tag}]`));
        await refreshCard();
        if (deps.mode === "contested")
            await deps.onHandover?.(tag);
    }
    async function confirm(button) {
        const pressed = confirmHandoverOf(button.customId);
        const waiting = store.load().handover;
        if (waiting === undefined ||
            pressed === undefined ||
            waiting.siegeAt.getTime() !== pressed.siegeAt ||
            !sameTag(waiting.expected, pressed.tag)) {
            await replyPrivately(button, messages.notOpen);
            return;
        }
        const officer = isOfficer(button.memberRoleIds(), deps.officerRoleIds);
        const leaderMember = waiting.leaderUid === undefined ? undefined : deps.links.memberForUid(waiting.leaderUid);
        const isLeader = leaderMember !== undefined && leaderMember === button.user.id;
        if (!isLeader && !officer) {
            await replyPrivately(button, messages.confirmRefused);
            return;
        }
        // The check above and this change run without an await in between, so two presses confirm once.
        store.update((state) => ({ ...state, holding: waiting.expected, handover: undefined, next: undefined }));
        const label = labeller()(waiting.expected);
        await button.update({ content: messages.confirmed(label, button.user.id), components: [], allowedMentions });
        await log(messages.logConfirmed(button.user.id, isLeader ? "R5" : "Officer", `[${waiting.expected}]`));
        await refreshCard();
        await deps.onHandover?.(waiting.expected);
    }
    /** Reads the expected Alliance live; its R5 and the R5's Player Name, or why there is none. */
    async function expectedLeaderOf(tag) {
        const key = parseAllianceKey(tag);
        if (!key.ok)
            return { leaderUid: undefined, leader: { kind: "unknown" }, readFailed: true };
        const result = await deps.gameApi.getAlliance(deps.homeKingdom, key.value, "sync", "live");
        if (result.kind !== "found")
            return { leaderUid: undefined, leader: { kind: "unknown" }, readFailed: true };
        const alliance = result.value;
        const leaderUid = alliance.leaderUid;
        if (leaderUid === undefined)
            return { leaderUid, leader: { kind: "unknown" }, readFailed: false };
        const playerName = leaderNameOf(alliance, leaderUid);
        const memberId = deps.links.memberForUid(leaderUid);
        return {
            leaderUid,
            leader: memberId === undefined ? { kind: "unlinked", playerName } : { kind: "linked", playerName, memberId },
            readFailed: false,
        };
    }
    /** The after-siege step of Rotation mode: name the next Alliance, read its R5 and ask for confirmation. */
    async function askForHandover(siegeAt, state) {
        const { order } = state;
        if (order === undefined)
            return;
        const label = labeller();
        if (state.handover !== undefined) {
            await log(messages.logStillWaiting(label(state.handover.expected)));
            return;
        }
        const expected = upcomingAlliance({ ...turnsOf(state), order, expected: undefined });
        if (expected === undefined)
            return;
        const { leaderUid, leader, readFailed } = await expectedLeaderOf(expected);
        store.update((current) => ({
            ...current,
            next: undefined,
            handover: { expected, leaderUid, siegeAt, messageId: undefined },
        }));
        await log(messages.logExpected(label(expected), leaderUid));
        await postConfirmRequest(siegeAt, expected, messages.confirmRequest(label(expected), leader, readFailed), leader);
    }
    /** Whether the open Turn is still the one after this siege, waiting for this Alliance. */
    function isOpenTurn(state, siegeAt, expected) {
        return (state.handover !== undefined &&
            state.handover.siegeAt.getTime() === siegeAt.getTime() &&
            sameTag(state.handover.expected, expected));
    }
    /** Posts the confirmation request of the open Turn in nap-leaders and records where it is. */
    async function postConfirmRequest(siegeAt, expected, content, leader) {
        const channelId = server.leadersChannelId();
        if (channelId === undefined) {
            await log(messages.logNoLeaders);
            return;
        }
        try {
            const messageId = await server.post(channelId, {
                content,
                components: [confirmHandoverRow(siegeAt, expected)],
                allowedMentions: leader.kind === "linked" ? { parse: [], users: [leader.memberId] } : allowedMentions,
            });
            store.update((current) => current.handover !== undefined && isOpenTurn(current, siegeAt, expected)
                ? { ...current, handover: { ...current.handover, messageId } }
                : current);
        }
        catch (error) {
            await log(messages.logSiegePostFailed(reasonOf(error)));
        }
    }
    /**
     * After a skip or a leave moved the open Turn on to `expected`: the old request in nap-leaders loses its button, and
     * Neil reads the new Alliance's R5 fresh and asks them to confirm. Gives the R5's uid for the log, or "unknown".
     */
    async function moveOpenTurnOn(old, expected) {
        const label = labeller();
        const channelId = server.leadersChannelId();
        if (old.messageId !== undefined && channelId !== undefined) {
            try {
                await server.edit(channelId, old.messageId, {
                    content: messages.turnMovedOn(label(expected)),
                    components: [],
                    allowedMentions,
                });
            }
            catch (error) {
                await log(messages.logSiegePostFailed(reasonOf(error)));
            }
        }
        const { leaderUid, leader, readFailed } = await expectedLeaderOf(expected);
        store.update((current) => current.handover !== undefined && isOpenTurn(current, old.siegeAt, expected)
            ? { ...current, handover: { ...current.handover, leaderUid } }
            : current);
        const content = `${messages.turnMovedOnHead}\n${messages.confirmRequest(label(expected), leader, readFailed)}`;
        await postConfirmRequest(old.siegeAt, expected, content, leader);
        return leaderUid === undefined ? "unknown" : `uid ${leaderUid}`;
    }
    /** Why a change by this caller is refused, or the state with its order when it may go ahead. No await inside. */
    function checkChange(command) {
        if (deps.mode === "contested")
            return { ok: false, reason: messages.contested };
        const state = store.load();
        if (state.order === undefined)
            return { ok: false, reason: messages.noRotationToChange };
        const editor = deps.editorOf(command.user.id);
        if (editor === undefined || !mayChangeCityRotation(editor, deps.homeKingdom, state.order)) {
            return { ok: false, reason: messages.refusedChange };
        }
        return { ok: true, state, order: state.order };
    }
    /** The state with a changed order and next; an open Turn handed to another Alliance waits for that Alliance's R5. */
    function withTurns(current, turns) {
        const { handover } = current;
        const expected = turns.expected;
        if (handover === undefined || expected === undefined || sameTag(handover.expected, expected)) {
            return { ...current, order: turns.order, next: turns.next };
        }
        return {
            ...current,
            order: turns.order,
            next: turns.next,
            handover: { ...handover, expected, leaderUid: undefined, messageId: undefined },
        };
    }
    /** The news of a change in home-kingdom-announcements, mentioning nobody; a failure is logged once. */
    async function announce(content) {
        const channelId = server.kingdomAnnouncementsChannelId();
        if (channelId === undefined) {
            await log(messages.logNoKingdomAnnouncements);
            return;
        }
        try {
            await server.post(channelId, { content, allowedMentions });
        }
        catch (error) {
            await log(messages.logKingdomAnnouncementFailed(reasonOf(error)));
        }
    }
    /** The tag as the order spells it, from what was typed or picked. */
    function typedAlliance(command) {
        return (command.options.getString("alliance", true) ?? "").trim();
    }
    function tagText(tag) {
        return tag === undefined ? "none" : `[${tag}]`;
    }
    async function move(command) {
        const checked = checkChange(command);
        if (!checked.ok) {
            await replyPrivately(command, checked.reason);
            return;
        }
        const { state } = checked;
        const position = command.options.getInteger("position", true) ?? 0;
        const result = moveAlliance(turnsOf(state), typedAlliance(command), position);
        if (!result.ok) {
            await replyPrivately(command, messages.changeProblem(result.problem));
            return;
        }
        const after = store.update((current) => withTurns(current, result.turns));
        const tag = after.order?.find((candidate) => sameTag(candidate, typedAlliance(command))) ?? typedAlliance(command);
        const next = nextOf(after);
        const label = labeller();
        const nextLabel = next === undefined ? undefined : label(next);
        await replyPrivately(command, messages.moved(label(tag), position, nextLabel));
        await log(messages.logMoved(command.user.id, `[${tag}]`, position, orderText(state.order), orderText(after.order), tagText(next)));
        await announce(messages.announceMoved(label(tag), position, orderText(after.order), nextLabel));
        await refreshCard();
    }
    async function skip(command) {
        const checked = checkChange(command);
        if (!checked.ok) {
            await replyPrivately(command, checked.reason);
            return;
        }
        const { state } = checked;
        const result = skipTurn(turnsOf(state));
        if (!result.ok) {
            await replyPrivately(command, messages.changeProblem(result.problem));
            return;
        }
        store.update((current) => withTurns(current, result.turns));
        const label = labeller();
        await replyPrivately(command, messages.skipped(label(result.skipped), label(result.upcoming)));
        const asked = state.handover === undefined ? undefined : await moveOpenTurnOn(state.handover, result.upcoming);
        await log(messages.logSkipped(command.user.id, `[${result.skipped}]`, orderText(state.order), `[${result.upcoming}]`, asked));
        await announce(messages.announceSkipped(label(result.skipped), label(result.upcoming)));
        await refreshCard();
    }
    async function leave(command) {
        const checked = checkChange(command);
        if (!checked.ok) {
            await replyPrivately(command, checked.reason);
            return;
        }
        const { state } = checked;
        const result = leaveRotation(turnsOf(state), typedAlliance(command));
        if (!result.ok) {
            await replyPrivately(command, messages.changeProblem(result.problem));
            return;
        }
        const after = store.update((current) => withTurns(current, result.turns));
        const next = nextOf(after);
        const label = labeller();
        const nextLabel = next === undefined ? undefined : label(next);
        const holding = state.holding !== undefined && sameTag(state.holding, result.left);
        await replyPrivately(command, messages.left(label(result.left), nextLabel));
        const { handover } = state;
        const asked = handover !== undefined && result.turns.expected !== undefined && !sameTag(handover.expected, result.turns.expected)
            ? await moveOpenTurnOn(handover, result.turns.expected)
            : undefined;
        await log(messages.logLeft(command.user.id, `[${result.left}]`, orderText(state.order), orderText(after.order), tagText(next), asked));
        await announce(messages.announceLeft(label(result.left), holding, orderText(after.order), nextLabel));
        await refreshCard();
    }
    async function setPaused(command, paused) {
        const checked = checkChange(command);
        if (!checked.ok) {
            await replyPrivately(command, checked.reason);
            return;
        }
        const { state, order } = checked;
        if (state.paused === paused) {
            await replyPrivately(command, paused ? messages.alreadyPaused : messages.notPaused);
            return;
        }
        const after = store.update((current) => ({ ...current, paused }));
        const next = nextOf(after);
        const nextLabel = next === undefined ? undefined : labeller()(next);
        if (paused) {
            await replyPrivately(command, messages.pausedReply);
            await log(messages.logPaused(command.user.id, orderText(order)));
            await announce(messages.announcePaused);
        }
        else {
            await replyPrivately(command, messages.resumedReply(nextLabel));
            await log(messages.logResumed(command.user.id, orderText(order), tagText(next)));
            await announce(messages.announceResumed(nextLabel));
        }
        await refreshCard();
    }
    function allianceChoices(typed) {
        const state = store.load();
        if (deps.mode !== "rotation" || state.order === undefined)
            return [];
        const label = labeller();
        const wanted = typed.trim().toLowerCase();
        return state.order
            .map((tag) => ({ name: label(tag).slice(0, MAX_CHOICE_LENGTH), value: tag }))
            .filter((choice) => choice.name.toLowerCase().includes(wanted))
            .slice(0, MAX_CHOICES);
    }
    /** The after-siege step of Contested mode: one line for the Officers, no Game API request. */
    async function askOfficers() {
        const channelId = server.leadersChannelId();
        if (channelId === undefined) {
            await log(messages.logNoLeaders);
            return;
        }
        try {
            await server.post(channelId, { content: messages.contestedSiegeOver, allowedMentions });
        }
        catch (error) {
            await log(messages.logSiegePostFailed(reasonOf(error)));
        }
    }
    /**
     * Once per Royal City siege: the siege is recorded first, so a restart or an overlapping tick never acts twice, and
     * sieges missed while Neil was off make one step. The very first tick only records the last siege: Neil acts on the
     * sieges after it starts keeping the City Rotation.
     */
    async function afterSiege() {
        const last = lastRoyalCitySiege(deps.now());
        // The check and the record run without an await in between.
        const handled = store.load();
        const before = handled.lastHandledSiege;
        if (before !== undefined && before.getTime() >= last.getTime())
            return;
        store.update((current) => ({ ...current, lastHandledSiege: last }));
        if (before === undefined)
            return;
        if (deps.mode === "rotation" && handled.paused) {
            await log(messages.logPausedSiege);
            return;
        }
        if (deps.mode === "rotation")
            await askForHandover(last, handled);
        else
            await askOfficers();
        await refreshCard();
    }
    return {
        show,
        set,
        holder,
        move,
        skip,
        leave,
        pause: (command) => setPaused(command, true),
        resume: (command) => setPaused(command, false),
        allianceChoices,
        confirm,
        refreshCard,
        async tick() {
            try {
                await afterSiege();
            }
            catch (error) {
                deps.logError(`The City Rotation's after-siege step failed: ${reasonOf(error)}`);
            }
        },
    };
}
/** Where the stored City Rotation stands, as the domain sees it. */
function turnsOf(state) {
    return { order: state.order ?? [], holding: state.holding, next: state.next, expected: state.handover?.expected };
}
/** The R5's Player Name from the roster, or the Alliance's leader name; undefined when neither is known. */
function leaderNameOf(alliance, leaderUid) {
    return alliance.roster.find((entry) => entry.uid === leaderUid)?.name ?? alliance.leaderName;
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=city-rotation.js.map