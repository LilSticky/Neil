import { z } from "zod";

/** A Game API id: a JSON number in the recordings, or a string of digits. Always read back as a string. */
const idSchema = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform((id) => String(id));

const rosterRowSchema = z.object({
  uid: idSchema,
  rank_label: z.string().nullable(),
});

/** The body of GET /players/{uid}. Unknown fields are ignored, so the Game can add fields without breaking us. */
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
});

export type PlayerBody = z.infer<typeof playerBodySchema>;

/** One row of an Alliance's `members`; the name and the rank label may be null. */
const rosterMemberSchema = z.object({
  uid: idSchema,
  nick_name: z.string().nullish(),
  rank_label: z.string().nullish(),
});

export type RosterMemberBody = z.infer<typeof rosterMemberSchema>;

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
    .transform((rows): RosterMemberBody[] =>
      (rows ?? []).flatMap((row) => {
        const member = rosterMemberSchema.safeParse(row);
        return member.success ? [member.data] : [];
      }),
    ),
});

export type AllianceBody = z.infer<typeof allianceBodySchema>;

const matchSchema = z.object({
  tag: z.string().optional(),
  name: z.string().optional(),
  server: z.number().int().optional(),
  uid: idSchema.optional(),
});

/**
 * The 409 body of GET /alliances/{kingdom}/{key} when more than one alliance matches. Hand-written (research R9),
 * so every field of a match is optional and the schema stays lenient.
 */
export const ambiguousBodySchema = z.object({
  matches: z.array(matchSchema),
});

export type AmbiguousBody = z.infer<typeof ambiguousBodySchema>;

/** The `quota` object of a lookup body (GAME-API.md): whole numbers, a limit of at least 1. */
const bodyQuotaSchema = z.object({
  limit: z.number().int().min(1),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});

/** A rate-limit header value: a string of digits, read as a whole number of at least `min`. */
function headerNumberSchema(min: number) {
  return z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min));
}

const limitHeaderSchema = headerNumberSchema(1);
const remainingHeaderSchema = headerNumberSchema(0);

export type QuotaFigures = { used: number; limit: number };

/**
 * The Daily Quota figures of one Game API response. The body `quota` is preferred; without it the
 * `x-ratelimit-limit` and `x-ratelimit-remaining` headers are read and `used` is their difference.
 * Returns `undefined` when the response carries no figures and `"malformed"` when they cannot be read.
 */
export function quotaFiguresFrom(body: unknown, headers: Headers): QuotaFigures | undefined | "malformed" {
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
