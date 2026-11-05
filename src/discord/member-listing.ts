import { z } from "zod";

/** How long a listing is reused. Discord allows about one Request Guild Members per 30 seconds for a guild. */
const KEEP_LISTING_MS = 35_000;

/** Added to Discord's wait, so the second attempt does not land on the edge of its window. */
const RETRY_MARGIN_MS = 1_000;

export interface MemberListingOptions<T> {
  /** Asks Discord for every Member of the guild. */
  readonly list: () => Promise<T>;
  readonly now: () => Date;
  readonly sleep: (ms: number) => Promise<void>;
}

const rateLimitError = z.object({ data: z.object({ retry_after: z.number().nonnegative() }) });

/** How long Discord asks to wait, in milliseconds, when the error is its gateway rate limit. */
function retryAfterMs(error: unknown): number | undefined {
  const parsed = rateLimitError.safeParse(error);
  return parsed.success ? parsed.data.data.retry_after * 1_000 : undefined;
}

/**
 * One listing of the Members for everyone who asks within the window, because Discord refuses a second one that soon. A
 * rate limited listing, which a restart can cause too, waits as long as Discord says and asks once more. A failure is
 * not kept. A reused listing can be up to the window old, so a caller must check what it acts on.
 */
export function sharedMemberListing<T>(options: MemberListingOptions<T>): () => Promise<T> {
  let kept: { readonly listing: Promise<T>; readonly askedAt: number } | undefined;

  const ask = async (): Promise<T> => {
    try {
      return await options.list();
    } catch (error) {
      const wait = retryAfterMs(error);
      if (wait === undefined) throw error;
      await options.sleep(wait + RETRY_MARGIN_MS);
      return options.list();
    }
  };

  return () => {
    const now = options.now().getTime();
    if (kept !== undefined && now - kept.askedAt < KEEP_LISTING_MS) return kept.listing;
    const current = { listing: ask(), askedAt: now };
    kept = current;
    current.listing.catch(() => {
      if (kept === current) kept = undefined;
    });
    return current.listing;
  };
}
