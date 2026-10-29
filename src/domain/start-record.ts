/** How many times Neil has started with this data folder; always an integer ≥ 1. */
export type StartCount = number & { readonly __brand: "StartCount" };

export function startCount(value: number): StartCount {
  if (!Number.isInteger(value) || value < 1) throw new RangeError("start count must be an integer ≥ 1");
  return value as StartCount;
}

/** Evidence that the data folder persisted: when it was first used and how often since. */
export interface StartRecord {
  readonly firstStartedAt: Date;
  readonly startCount: StartCount;
}

export function recordStart(previous: StartRecord | undefined, now: Date): StartRecord {
  if (previous === undefined) return { firstStartedAt: now, startCount: startCount(1) };
  return { firstStartedAt: previous.firstStartedAt, startCount: startCount(previous.startCount + 1) };
}
