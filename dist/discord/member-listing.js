import { z } from "zod";
/** How long an answered listing is reused. Discord allows about one Request Guild Members per 30 seconds for a guild. */
const KEEP_LISTING_MS = 35_000;
/** Added to Discord's wait, so the second attempt does not land on the edge of its window. */
const RETRY_MARGIN_MS = 1_000;
const rateLimitError = z.object({ data: z.object({ retry_after: z.number().nonnegative() }) });
/** How long Discord asks to wait, in milliseconds, when the error is its gateway rate limit. */
function retryAfterMs(error) {
    const parsed = rateLimitError.safeParse(error);
    return parsed.success ? parsed.data.data.retry_after * 1_000 : undefined;
}
/**
 * One listing of the Members for everyone who asks within the window, because Discord refuses a second one that soon. A
 * rate limited listing, which a restart can cause too, waits as long as Discord says and asks once more. A failure is
 * not kept. A reused listing can be up to the window old, so a caller must check what it acts on.
 */
export function sharedMemberListing(options) {
    let kept;
    const ask = async () => {
        try {
            return await options.list();
        }
        catch (error) {
            const wait = retryAfterMs(error);
            if (wait === undefined)
                throw error;
            await options.sleep(wait + RETRY_MARGIN_MS);
            return options.list();
        }
    };
    return () => {
        if (kept !== undefined) {
            const { answeredAt } = kept;
            if (answeredAt === undefined || options.now().getTime() - answeredAt < KEEP_LISTING_MS)
                return kept.listing;
        }
        const current = { listing: ask() };
        kept = current;
        current.listing.then(() => {
            current.answeredAt = options.now().getTime();
        }, () => {
            if (kept === current)
                kept = undefined;
        });
        return current.listing;
    };
}
//# sourceMappingURL=member-listing.js.map