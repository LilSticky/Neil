import { MessageFlags, } from "discord.js";
import { exileReasonOf, mayChangeReaper, rankExiles, } from "../domain/exile.js";
import { parsePlayerName } from "../domain/lookup-input.js";
import { listedPlayerMatches } from "../domain/player.js";
import { answer, allowedMentions, errorText, parseOptionalKingdom, replyPrivately, sharedPlayerFailureText, } from "./lookup.js";
import { escapeText, lookupMessages, renderPlayerPickList } from "./lookup-cards.js";
import { closestAnswer, CLOSEST_PAGE_SIZE, LIST_PAGE_SIZE, listAnswer } from "./reaper-cards.js";
import { isOwner, parseReaperCustomId, reaperPageCount, } from "./reaper-pages.js";
import { reaperMessages } from "./reaper-texts.js";
/** The position of a Player as the Game read it, or undefined when it gave none. */
function positionOf(player) {
    const location = player.details?.location;
    return location === undefined ? undefined : { x: location.x, y: location.y };
}
/** The Exile a found Player makes: its position when the Game read one, the reason and the adder. */
function exileOf(player, fetchedAt, reason, adderId, addedAt) {
    const position = positionOf(player);
    return {
        uid: player.uid,
        name: player.name,
        kingdom: player.kingdom,
        lastPosition: position === undefined ? undefined : { position, at: fetchedAt },
        reason,
        addedAt,
        addedBy: adderId,
    };
}
/** The Alliance as the confirmation shows it: "[TAG]", or "no alliance" for a Player with none. */
function allianceText(player) {
    return player.alliance === undefined ? "no alliance" : `[${escapeText(player.alliance.tag)}]`;
}
/**
 * Stores a found Player as an Exile and logs the addition. Returns the private answer: the confirmation, or the stored
 * reason when the Player already is an Exile, in which case nothing is changed or logged. The check and the store run
 * without an await between them, so no other write can come in between.
 */
export async function recordFoundExile(player, fetchedAt, reason, adderId, context) {
    const existing = context.reaper.find(player.uid);
    if (existing !== undefined)
        return reaperMessages.alreadyExile(existing.name, existing.reason);
    const exile = exileOf(player, fetchedAt, reason, adderId, context.now());
    context.reaper.add(exile);
    const logged = reaperMessages.addLog(player.name, player.uid, player.kingdom, adderId, reason);
    await answer("the log line of a REAPER change", context, () => context.channels.log({ content: logged, allowedMentions }));
    return reaperMessages.added(player.name, player.kingdom, allianceText(player));
}
/** The private pick list for an ambiguous name of /reaper add, which carries the reason to the pick. */
function exilePickList(result, name, adderId, reason, context) {
    const { listed } = listedPlayerMatches(result.matches);
    if (listed.length === 0)
        return { content: lookupMessages.unavailable };
    const sessionId = context.pickSessions.open(adderId, { kind: "exile", matches: result.matches, reason }, context.now());
    return renderPlayerPickList(name, result.matches, sessionId);
}
/** The private answer to a name of /reaper add that gave no Player: a pick list when ambiguous, else the reason. */
function nameFailureMessage(failure, name, kingdom, adderId, reason, context) {
    switch (failure.kind) {
        case "ambiguous":
            return exilePickList(failure, name, adderId, reason, context);
        case "not-found":
            return { content: lookupMessages.playerNameNotFound(name, kingdom) };
        case "not-prepared":
            return { content: lookupMessages.playerNameNotPrepared(name) };
        default:
            return { content: sharedPlayerFailureText(failure, context.now()) };
    }
}
/** Looks the name up for /reaper add; a refused or broken lookup is logged and told as unavailable. */
async function findNamed(name, kingdom, context) {
    try {
        return await context.gameApi.findPlayer(name, kingdom, "lookup");
    }
    catch (error) {
        context.logError(`Looking up the name for REAPER failed: ${errorText(error)}`);
        return undefined;
    }
}
/** Answers /reaper add: only Home Kingdom R5s, the reason and the name checked before any Game API request. */
export async function handleReaperAdd(interaction, context) {
    await answer("/reaper add", context, async () => {
        const editor = context.editorOf(interaction.user.id);
        if (editor === undefined || !mayChangeReaper(editor, context.homeKingdom)) {
            await replyPrivately(interaction, reaperMessages.refused);
            return;
        }
        const reason = exileReasonOf(interaction.options.getString("reason") ?? "");
        if (!reason.ok) {
            await replyPrivately(interaction, reaperMessages.invalidReason);
            return;
        }
        const name = parsePlayerName(interaction.options.getString("name") ?? "");
        if (!name.ok) {
            await replyPrivately(interaction, lookupMessages.invalidPlayerName);
            return;
        }
        const kingdom = parseOptionalKingdom(interaction.options.getInteger("kingdom"));
        if (!kingdom.ok) {
            await replyPrivately(interaction, lookupMessages.invalidKingdom);
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await findNamed(name.value, kingdom.value, context);
        if (result === undefined) {
            await interaction.editReply({ content: lookupMessages.unavailable, allowedMentions });
            return;
        }
        if (result.kind === "found") {
            const content = await recordFoundExile(result.value, result.fetchedAt, reason.value, interaction.user.id, context);
            await interaction.editReply({ content, allowedMentions });
            return;
        }
        const answerText = nameFailureMessage(result, name.value, kingdom.value, interaction.user.id, reason.value, context);
        await interaction.editReply({ ...answerText, allowedMentions });
    });
}
/** How many Exiles are read from the Game API at once. */
const READS_AT_ONCE = 4;
/** Reads REAPER for a /reaper answer; a read that throws is logged and gives undefined, which the answer tells as unavailable. */
function readOrLog(command, read, logError) {
    try {
        return read();
    }
    catch (error) {
        logError(`Reading REAPER for ${command} failed: ${errorText(error)}`);
        return undefined;
    }
}
/** Reads one Player with the lookup purpose; a read that throws is logged and told as unavailable. */
async function readPlayer(uid, context) {
    try {
        return await context.gameApi.getPlayer(uid, "lookup");
    }
    catch (error) {
        context.logError(`Reading an Exile for REAPER failed: ${errorText(error)}`);
        return { kind: "unavailable", reason: "unexpected" };
    }
}
/** The REAPER row a fresh read of a Player leaves behind. */
function refreshOf(player, fetchedAt) {
    return { name: player.name, kingdom: player.kingdom, position: positionOf(player), readAt: fetchedAt };
}
/**
 * Reads the Exiles at most READS_AT_ONCE at a time, from one shared queue. A found read refreshes its row; a quota
 * refusal stops the queue, so the Exiles not yet read keep their stored positions.
 */
async function readExiles(exiles, context) {
    const queue = exiles.values();
    const reads = new Map();
    const state = { refusal: undefined };
    const worker = async () => {
        while (state.refusal === undefined) {
            const next = queue.next();
            if (next.done === true)
                return;
            const { uid } = next.value;
            const result = await readPlayer(uid, context);
            if (result.kind === "found") {
                reads.set(uid, { player: result.value, fetchedAt: result.fetchedAt });
                context.reaper.refresh(uid, refreshOf(result.value, result.fetchedAt));
            }
            else if (result.kind === "quota-spent" || result.kind === "reserve-kept") {
                state.refusal = result;
            }
        }
    };
    await Promise.all(Array.from({ length: READS_AT_ONCE }, worker));
    return { reads, refusal: state.refusal };
}
/**
 * Builds the ranking for /reaper closest without rendering it: the Exiles of one Kingdom read through the Game API,
 * ranked by distance from the origin. The caller's own Exile (when the caller has a Link) is left out.
 */
export async function rankClosest(origin, kingdom, callerUid, context) {
    const exiles = context.reaper.inKingdom(kingdom);
    const { reads, refusal } = await readExiles(exiles, context);
    const candidates = exiles.map((exile) => ({ exile, player: reads.get(exile.uid)?.player }));
    const { ranking, leftOut } = rankExiles(origin, kingdom, callerUid, candidates);
    return { origin, kingdom, ranking, reads, leftOut, refusal };
}
/**
 * x and y win over the Linked Player's position. Without a Link the Kingdom is the Home Kingdom, and so it is when the
 * Linked Player cannot be read but x and y are given. A caller with no Link and no x and y, or whose Linked Player
 * cannot be read and who gives no x and y, has no origin; when the quota kept that read, the refusal is returned.
 */
async function closestOriginOf(given, memberId, context) {
    const link = context.links.linkFor(memberId);
    if (link === undefined) {
        if (given === undefined)
            return { kind: "unmeasurable" };
        return { kind: "measured", origin: given, kingdom: context.homeKingdom, callerUid: undefined };
    }
    const caller = await readPlayer(link.uid, context);
    if (caller.kind !== "found") {
        if (given !== undefined)
            return { kind: "measured", origin: given, kingdom: context.homeKingdom, callerUid: link.uid };
        if (caller.kind === "quota-spent" || caller.kind === "reserve-kept")
            return { kind: "refused", refusal: caller };
        return { kind: "unmeasurable" };
    }
    const origin = given ?? positionOf(caller.value);
    if (origin === undefined)
        return { kind: "unmeasurable" };
    return { kind: "measured", origin, kingdom: caller.value.kingdom, callerUid: link.uid };
}
/** Answers /reaper closest, privately. Mismatched coordinates are refused before any Game API request. With all, the answer is paged. */
export async function handleReaperClosest(interaction, context) {
    await answer("/reaper closest", context, async () => {
        const x = interaction.options.getInteger("x");
        const y = interaction.options.getInteger("y");
        if ((x === null) !== (y === null)) {
            await replyPrivately(interaction, reaperMessages.bothXAndY);
            return;
        }
        const given = x === null || y === null ? undefined : { x, y };
        const all = interaction.options.getBoolean("all") === true;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const start = await closestOriginOf(given, interaction.user.id, context);
        if (start.kind === "refused") {
            await interaction.editReply({ content: sharedPlayerFailureText(start.refusal, context.now()), allowedMentions });
            return;
        }
        if (start.kind === "unmeasurable") {
            await interaction.editReply({ content: reaperMessages.askXAndY, allowedMentions });
            return;
        }
        const ranking = await rankClosest(start.origin, start.kingdom, start.callerUid, context);
        const now = context.now();
        const paged = all && reaperPageCount(ranking.ranking.length, CLOSEST_PAGE_SIZE) > 1;
        const sessionId = paged ? context.pages.open(interaction.user.id, { kind: "closest", ranking }, now) : undefined;
        await interaction.editReply(closestAnswer(ranking, now, 0, sessionId));
    });
}
/** Answers /reaper list, privately: every Exile of REAPER, newest first, 8 per page. */
export async function handleReaperList(interaction, context) {
    await answer("/reaper list", context, async () => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const exiles = readOrLog("/reaper list", () => context.reaper.all(), context.logError);
        if (exiles === undefined) {
            await interaction.editReply({ content: lookupMessages.unavailable, allowedMentions });
            return;
        }
        if (exiles.length === 0) {
            await interaction.editReply({ content: reaperMessages.empty, allowedMentions });
            return;
        }
        const paged = reaperPageCount(exiles.length, LIST_PAGE_SIZE) > 1;
        const sessionId = paged ? context.pages.open(interaction.user.id, { kind: "list", exiles }, context.now()) : undefined;
        await interaction.editReply(listAnswer(exiles, 0, sessionId));
    });
}
/**
 * Answers a page button of /reaper: only the Member who ran the answer may turn it, while it is open, and the page is
 * redrawn from what was answered, with no Game API call.
 */
export async function handleReaperPage(interaction, context) {
    await answer("/reaper page", context, async () => {
        const parsed = parseReaperCustomId(interaction.customId);
        if (parsed === undefined) {
            await replyPrivately(interaction, reaperMessages.pageExpired);
            return;
        }
        const session = readOrLog("/reaper page", () => context.pages.get(parsed.sessionId, context.now()), context.logError);
        if (session === undefined) {
            await replyPrivately(interaction, lookupMessages.unavailable);
            return;
        }
        if (session === "expired") {
            await replyPrivately(interaction, reaperMessages.pageExpired);
            return;
        }
        if (!isOwner(session, interaction.user.id)) {
            await replyPrivately(interaction, reaperMessages.pageNotYours);
            return;
        }
        const { content } = session;
        const redraw = content.kind === "closest"
            ? closestAnswer(content.ranking, context.now(), parsed.page, parsed.sessionId)
            : listAnswer(content.exiles, parsed.page, parsed.sessionId);
        await interaction.update(redraw);
    });
}
//# sourceMappingURL=reaper.js.map