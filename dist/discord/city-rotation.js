import { MessageFlags, } from "discord.js";
import { cityRotationOf, lastRoyalCitySiege, mayEditCityRotation, nextHoldingAlliance, nextRoyalCitySiege, sameTag, } from "../domain/city-rotation.js";
import { parseAllianceKey } from "../domain/lookup-input.js";
import { isOfficer } from "../domain/officer.js";
import { allianceLabel, cityRotationCard, cityRotationMessages as messages, confirmHandoverOf, confirmHandoverRow, orderText, } from "./city-rotation-texts.js";
import { allowedMentions } from "./lookup.js";
/** The longest order text /rotation set takes. */
export const MAX_ORDER_LENGTH = 200;
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
    /** The tag whose Turn follows the Holding Alliance's; undefined in Contested or without an order. */
    function nextOf(state) {
        if (deps.mode !== "rotation" || state.order === undefined)
            return undefined;
        return nextHoldingAlliance({ order: state.order, holding: state.holding ?? state.order[0] ?? "" });
    }
    function cardOf(state) {
        const now = deps.now();
        const embed = cityRotationCard({
            mode: deps.mode,
            state,
            label: labeller(),
            next: nextOf(state),
            nextSiege: deps.siegeTime === undefined ? undefined : nextRoyalCitySiege(now, deps.siegeTime),
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
        store.update((current) => ({ ...current, holding: tag, handover: undefined }));
        const label = labeller()(tag);
        await replyPrivately(command, messages.holderNamed(label));
        await log(messages.logHolder(command.user.id, `[${tag}]`));
        await refreshCard();
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
        store.update((state) => ({ ...state, holding: waiting.expected, handover: undefined }));
        const label = labeller()(waiting.expected);
        await button.update({ content: messages.confirmed(label, button.user.id), components: [], allowedMentions });
        await log(messages.logConfirmed(button.user.id, isLeader ? "R5" : "Officer", `[${waiting.expected}]`));
        await refreshCard();
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
        const expected = nextHoldingAlliance({ order, holding: state.holding ?? order[0] ?? "" });
        const { leaderUid, leader, readFailed } = await expectedLeaderOf(expected);
        store.update((current) => ({
            ...current,
            handover: { expected, leaderUid, siegeAt, messageId: undefined },
        }));
        await log(messages.logExpected(label(expected), leaderUid));
        const channelId = server.leadersChannelId();
        if (channelId === undefined) {
            await log(messages.logNoLeaders);
            return;
        }
        try {
            const messageId = await server.post(channelId, {
                content: messages.confirmRequest(label(expected), leader, readFailed),
                components: [confirmHandoverRow(siegeAt, expected)],
                allowedMentions: leader.kind === "linked" ? { parse: [], users: [leader.memberId] } : allowedMentions,
            });
            store.update((current) => current.handover !== undefined && current.handover.siegeAt.getTime() === siegeAt.getTime()
                ? { ...current, handover: { ...current.handover, messageId } }
                : current);
        }
        catch (error) {
            await log(messages.logSiegePostFailed(reasonOf(error)));
        }
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
        if (deps.siegeTime === undefined)
            return;
        const last = lastRoyalCitySiege(deps.now(), deps.siegeTime);
        // The check and the record run without an await in between.
        const handled = store.load();
        const before = handled.lastHandledSiege;
        if (before !== undefined && before.getTime() >= last.getTime())
            return;
        store.update((current) => ({ ...current, lastHandledSiege: last }));
        if (before === undefined)
            return;
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
/** The R5's Player Name from the roster, or the Alliance's leader name; undefined when neither is known. */
function leaderNameOf(alliance, leaderUid) {
    return alliance.roster.find((entry) => entry.uid === leaderUid)?.name ?? alliance.leaderName;
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=city-rotation.js.map