export function startCount(value) {
    if (!Number.isInteger(value) || value < 1)
        throw new RangeError("start count must be an integer ≥ 1");
    return value;
}
export function recordStart(previous, now) {
    if (previous === undefined)
        return { firstStartedAt: now, startCount: startCount(1) };
    return { firstStartedAt: previous.firstStartedAt, startCount: startCount(previous.startCount + 1) };
}
//# sourceMappingURL=start-record.js.map