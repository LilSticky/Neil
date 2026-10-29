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
  nick: z.string(),
  kid: z.number().int(),
  power: z.number().int().nonnegative(),
  lv: z.number().int().positive(),
  aid: z.number().int().nonnegative().nullable(),
  alliance_abbr: z.string().nullish(),
  alliance_name: z.string().nullish(),
  alliance_members: z.array(rosterRowSchema).nullish(),
});

export type PlayerBody = z.infer<typeof playerBodySchema>;
