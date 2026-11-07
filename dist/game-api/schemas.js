import { z } from "zod";
import { PICTURE_PATH_PATTERN } from "../domain/picture-path.js";
/** A Game API id: a JSON number in the recordings, or a string of digits. Always read back as a string. */
const idSchema = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform((id) => String(id));
/** A whole number that cannot be negative; any other value reads as undefined (the body is still valid). */
const wholeCountSchema = z.number().int().nonnegative().optional().catch(undefined);
/**
 * A language tag such as `ja`, `en`, `zh-Hans` or `pt-BR`: two or three letters, then up to three subtags of letters
 * and digits. Any other text, or one too long to be a tag, reads as undefined.
 */
const languageSchema = z
    .string()
    .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,3}$/)
    .optional()
    .catch(undefined);
/** The shield reading: any number (0 means no shield); any other value reads as undefined (unknown). */
const shieldingSchema = z.number().optional().catch(undefined);
/** The latest Unix time in seconds a Date holds (8.64e15 milliseconds). */
const MAX_DATE_SECONDS = 8_640_000_000_000;
/** A Unix time in seconds a Date holds, above the Unix epoch; 0 and any other value reads as undefined (unknown). */
const unixSecondsSchema = z.number().int().positive().max(MAX_DATE_SECONDS).optional().catch(undefined);
/**
 * A picture path under /static/, of a picture extension (see PICTURE_PATH_PATTERN); any other value reads as undefined.
 */
const picturePathSchema = z.string().regex(PICTURE_PATH_PATTERN).optional().catch(undefined);
/**
 * One row of the Alliance roster in a Player's answer. The rank label reads as null when missing or not text (the rank is
 * then unknown). `online` and `last_online_at` read as absent when unreadable, as in an Alliance's roster; the row is still
 * accepted.
 */
const rosterRowSchema = z.object({
    uid: idSchema,
    rank_label: z.string().nullable().catch(null),
    online: z.boolean().nullish().catch(undefined),
    last_online_at: z.number().int().positive().max(MAX_DATE_SECONDS).nullish().catch(undefined),
});
/**
 * The body of GET /players/{uid}. Unknown fields are ignored, so the Game can add fields without breaking us.
 * The Player details (`kills` to `shielding`) each read as undefined when unreadable; the body is still accepted.
 */
export const playerBodySchema = z.object({
    uid: idSchema,
    nick: z.string().min(1),
    kid: z.number().int(),
    power: z.number().int().nonnegative(),
    lv: z.number().int().positive(),
    aid: z.number().int().nonnegative().nullable(),
    alliance_abbr: z.string().nullish(),
    alliance_name: z.string().nullish(),
    alliance_members: z.array(rosterRowSchema).nullish(),
    /** Only `leader_id` is read. An unreadable `alliance` or `leader_id` leaves the Leader unknown; the body is still accepted. */
    alliance: z
        .object({ leader_id: idSchema.optional().catch(undefined) })
        .nullish()
        .catch(undefined),
    kills: wholeCountSchema,
    vip: wholeCountSchema,
    likes: wholeCountSchema,
    last_online_at: unixSecondsSchema,
    language: languageSchema,
    x: wholeCountSchema,
    y: wholeCountSchema,
    avatar_url: picturePathSchema,
    server_badge_url: picturePathSchema,
    shielding: shieldingSchema,
});
/**
 * One row of an Alliance's `members`; the name and the rank label may be null. The Kingdom (`kid`) and sanctuary level
 * (`lv`) read as absent when they are not whole numbers. The activity figures (`active`, `daily_honor`, `daily_tech`)
 * are null when the Game has no data, and read as absent when they are not whole numbers.
 * `last_online_at` is a Unix time in seconds, read as absent when it is 0 or beyond the range a Date holds. `power` reads as absent
 * when it is not a whole number that cannot be negative.
 */
const rosterMemberSchema = z.object({
    uid: idSchema,
    nick_name: z.string().nullish(),
    rank_label: z.string().nullish(),
    power: wholeCountSchema,
    kid: z.number().int().nullish().catch(undefined),
    lv: z.number().int().nullish().catch(undefined),
    active: z.number().int().nullish().catch(undefined),
    daily_honor: z.number().int().nullish().catch(undefined),
    daily_tech: z.number().int().nullish().catch(undefined),
    online: z.boolean().nullish().catch(undefined),
    last_online_at: z.number().int().positive().max(MAX_DATE_SECONDS).nullish().catch(undefined),
});
/**
 * The body of GET /alliances/{kingdom}/{key}. `sid` is the Kingdom the Alliance is in. A member row without a
 * readable uid is left out; a missing `members` gives an empty roster.
 */
export const allianceBodySchema = z.object({
    abbr: z.string(),
    name: z.string(),
    sid: z.number().int(),
    power: z.number().int().nonnegative(),
    member_count: z.number().int().nonnegative(),
    capacity: z.number().int().nonnegative(),
    /** An empty leader_name means no Leader is known, the same as a missing one. */
    leader_name: z
        .string()
        .nullish()
        .transform((name) => (name === "" ? undefined : name)),
    members: z
        .array(z.unknown())
        .nullish()
        .transform((rows) => (rows ?? []).flatMap((row) => {
        const member = rosterMemberSchema.safeParse(row);
        return member.success ? [member.data] : [];
    })),
    /** The Alliance details (`level` to `server_badge_url`) each read as undefined when unreadable; the body is still accepted. */
    level: wholeCountSchema,
    exp: wholeCountSchema,
    gift_level: wholeCountSchema,
    language: languageSchema,
    /** Only `rank.rank` is read, a whole number of at least 1; the score is not read. */
    rank: z
        .object({ rank: z.number().int().min(1) })
        .optional()
        .catch(undefined),
    /** The Join Requirements: `auto` is whether the Alliance is open; `power` and `castle_level` are the minimums. */
    join: z
        .object({
        auto: z.boolean(),
        power: z.number().int().nonnegative(),
        castle_level: z.number().int().nonnegative(),
    })
        .optional()
        .catch(undefined),
    badge_url: picturePathSchema,
    server_badge_url: picturePathSchema,
});
const matchSchema = z.object({
    tag: z.string().optional(),
    name: z.string().optional(),
    server: z.number().int().optional(),
    uid: idSchema.optional(),
});
/**
 * The 409 body when more than one Player or Alliance matches, read back as `{ matches }`. The alliance 409 is
 * hand-written (research R9), so every field of a match is optional and the schema stays lenient.
 */
export const ambiguousBodySchema = z.union([
    z.object({ matches: z.array(matchSchema) }),
    // The recorded 409 of /players/name/{name} (2026-10-31) nests the list: {"detail":{"error":"ambiguous","matches":[…]}}.
    z.object({ detail: z.object({ matches: z.array(matchSchema) }) }).transform((body) => ({ matches: body.detail.matches })),
]);
/** The `quota` object of a lookup body (GAME-API.md): whole numbers, a limit of at least 1. */
const bodyQuotaSchema = z.object({
    limit: z.number().int().min(1),
    used: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
});
/** A rate-limit header value: a string of digits, read as a whole number of at least `min`. */
function headerNumberSchema(min) {
    return z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min));
}
const limitHeaderSchema = headerNumberSchema(1);
const remainingHeaderSchema = headerNumberSchema(0);
/**
 * The Daily Quota figures of one Game API response. The body `quota` is preferred; without it the
 * `x-ratelimit-limit` and `x-ratelimit-remaining` headers are read and `used` is their difference.
 * Returns `undefined` when the response carries no figures and `"malformed"` when they cannot be read.
 */
export function quotaFiguresFrom(body, headers) {
    if (typeof body === "object" && body !== null && "quota" in body) {
        const quota = bodyQuotaSchema.safeParse(body.quota);
        return quota.success ? { used: quota.data.used, limit: quota.data.limit } : "malformed";
    }
    const limitHeader = headers.get("x-ratelimit-limit");
    const remainingHeader = headers.get("x-ratelimit-remaining");
    if (limitHeader === null && remainingHeader === null) {
        return undefined;
    }
    if (limitHeader === null || remainingHeader === null) {
        return "malformed";
    }
    const limit = limitHeaderSchema.safeParse(limitHeader);
    const remaining = remainingHeaderSchema.safeParse(remainingHeader);
    if (!limit.success || !remaining.success) {
        return "malformed";
    }
    return { used: Math.max(0, limit.data - remaining.data), limit: limit.data };
}
//# sourceMappingURL=schemas.js.map