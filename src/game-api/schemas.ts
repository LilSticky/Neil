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

/** The body of GET /alliances/{kingdom}/{key}. `sid` is the Kingdom the Alliance is in. */
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
