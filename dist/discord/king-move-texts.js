import { ButtonStyle, ComponentType } from "discord.js";
import { timestamp } from "./timestamps.js";
/** The custom id prefix of the Apply button of a King Move. */
export const KING_MOVE_PREFIX = "king:";
/** The hint when Discord refuses to move King: Neil's role must sit above King. */
export const ROLE_ORDER_HINT = "Drag Neil's role above King (and below Moderator) in Server Settings → Roles, then press Apply again.";
/** A Member as a mention; the messages carrying it never ping. */
function mention(memberId) {
    return `<@${memberId}>`;
}
function mentions(memberIds) {
    return memberIds.length === 0 ? "nobody" : memberIds.map(mention).join(", ");
}
/** The R5 as the card names them: their Player Name and uid. */
function leaderOf(move) {
    return move.leaderName === undefined ? `uid ${move.leaderUid}` : `${move.leaderName} (uid ${move.leaderUid})`;
}
/** The lines every King Move card starts with. */
function cardLines(move) {
    const losing = move.previousKings.filter((memberId) => memberId !== move.newKing);
    return [
        `**King Move** for the Handover to [${move.holdingTag}], prepared ${timestamp(move.preparedAt, "f")}`,
        `New King: ${mention(move.newKing)}, R5 ${leaderOf(move)}`,
        `Holding King now: ${mentions(move.previousKings)}`,
        `Loses King: ${mentions(losing)}`,
    ];
}
/** The card of a prepared King Move, waiting for an Officer's Apply. */
export function preparedCard(move) {
    return [...cardLines(move), "An Officer presses Apply to move King. Neil moves nothing on its own."].join("\n");
}
/** The card once an Officer applied the move. */
export function appliedCard(move, appliedBy, appliedAt) {
    return [...cardLines(move), `Applied by ${mention(appliedBy)} ${timestamp(appliedAt, "f")}.`].join("\n");
}
/** The card once a newer Handover replaced the move. */
export function supersededCard(move) {
    return [...cardLines(move), "Replaced by a newer King Move; this one can no longer be applied."].join("\n");
}
/** The Apply button of a King Move; it names the move by the moment it was prepared. */
export function applyRow(move) {
    return {
        type: ComponentType.ActionRow,
        components: [
            {
                type: ComponentType.Button,
                style: ButtonStyle.Primary,
                label: "Apply",
                custom_id: `${KING_MOVE_PREFIX}${move.preparedAt.getTime().toString()}`,
            },
        ],
    };
}
/** The moment of preparation an Apply button names; undefined for a custom id Neil did not make. */
export function applyOf(customId) {
    if (!customId.startsWith(KING_MOVE_PREFIX))
        return undefined;
    const preparedAt = Number(customId.slice(KING_MOVE_PREFIX.length));
    return Number.isSafeInteger(preparedAt) && preparedAt > 0 ? preparedAt : undefined;
}
/** A role step as a reader sees it. */
function stepText(step) {
    return step.step === "give" ? `give King to ${mention(step.memberId)}` : `take King from ${mention(step.memberId)}`;
}
function failedText(failed) {
    return failed.map((step) => `${stepText(step)}${step.missingPermissions ? " (missing permissions)" : ""}`).join(", ");
}
/** Why Neil prepared no King Move, as the log line names it. */
function notPreparedReason(reason) {
    switch (reason.kind) {
        case "game-api-failed":
            return `the Game API gave no answer (${reason.detail})`;
        case "no-r5":
            return "the Game API names no R5 for the Alliance";
        case "unlinked":
            return `the R5 (uid ${reason.leaderUid}) has no Linked Member`;
        case "left-server":
            return `the R5's Member ${mention(reason.memberId)} (uid ${reason.leaderUid}) is not on the server`;
    }
}
export const kingMoveMessages = {
    notOfficer: "Only Officers can apply a King Move.",
    notOpen: "This King Move was already applied or replaced by a newer one; nothing changed.",
    busy: "This King Move is being applied right now; nothing else changed.",
    applied: (move, takenFrom, given) => `King Move applied: ${given ? `${mention(move.newKing)} got King` : `${mention(move.newKing)} already held King`}; ` +
        `taken from ${mentions(takenFrom)}.`,
    refused: (done, failed) => [
        `Discord refused part of the King Move: ${failedText(failed)}.`,
        `Done: ${done.length === 0 ? "nothing" : done.map(stepText).join(", ")}.`,
        failed.some((step) => step.missingPermissions) ? ROLE_ORDER_HINT : "Press Apply again to finish it.",
    ].join("\n"),
    logPrepared: (move) => `King Move prepared for [${move.holdingTag}]: ${mention(move.newKing)} (R5 uid ${move.leaderUid}) gets King; ` +
        `${mentions(move.previousKings.filter((memberId) => memberId !== move.newKing))} lose it. Waiting for an Officer's Apply.`,
    logApplied: (move, by, takenFrom, given) => `King Move for [${move.holdingTag}] applied by ${mention(by)}: ` +
        `${given ? `${mention(move.newKing)} got King` : `${mention(move.newKing)} already held King`}; taken from ${mentions(takenFrom)}.`,
    logRefused: (move, by, failed) => `King Move for [${move.holdingTag}] pressed by ${mention(by)}, refused by Discord: ${failedText(failed)}. ` +
        (failed.some((step) => step.missingPermissions) ? ROLE_ORDER_HINT : "The move stays applicable."),
    logSuperseded: (move) => `King Move for [${move.holdingTag}] (${mention(move.newKing)}) replaced by a newer Handover; it can no longer be applied.`,
    logNothingToMove: (holdingTag, memberId) => `King Move for [${holdingTag}]: nothing to move, ${mention(memberId)} already is the only King.`,
    logNotPrepared: (holdingTag, reason) => `No King Move for [${holdingTag}]: ${notPreparedReason(reason)}. An Officer moves King by hand.`,
    logCardFailed: (holdingTag, reason) => `King Move for [${holdingTag}] prepared, but its card could not be posted (${reason}). An Officer moves King by hand.`,
    logFailed: (holdingTag, reason) => `No King Move for [${holdingTag}]: preparing it failed (${reason}). An Officer moves King by hand.`,
};
//# sourceMappingURL=king-move-texts.js.map