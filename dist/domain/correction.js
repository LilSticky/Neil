/**
 * Whether a Member may make a correction on the Member targetId. Unlinking yourself is open to every Member; any other
 * correction, and unlinking someone else, needs an Officer. An Officer may not correct their own Link with a Rank
 * Approval or an Officer Link.
 */
export function mayCorrect(correction, corrector, targetId) {
    const isSelf = corrector.memberId === targetId;
    if (correction === "unlink") {
        if (isSelf || corrector.isOfficer)
            return { ok: true };
        return { ok: false, reason: "not-officer" };
    }
    if (!corrector.isOfficer)
        return { ok: false, reason: "not-officer" };
    if (isSelf)
        return { ok: false, reason: "own-link" };
    return { ok: true };
}
//# sourceMappingURL=correction.js.map