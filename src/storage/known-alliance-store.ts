import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { knownSince, type KnownAlliance } from "../domain/alliance-match.js";
import { parseKingdom } from "../domain/lookup-input.js";
import type { Alliance } from "../domain/player.js";

/** The part of an Alliance the Known Alliances keep: its Kingdom, tag and name. */
export type AllianceSighting = Pick<Alliance, "kingdom" | "tag" | "name">;

const row = z.object({
  kingdom: z.number().int(),
  tag: z.string(),
  name: z.string(),
  last_seen: z.iso.datetime(),
});

/** Keeps the Known Alliances in neil.db; a corrupt row is an error, never a silent skip. */
export class KnownAllianceStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Remembers an Alliance seen at `at`: a new name for a known tag replaces the old one. */
  seen(alliance: AllianceSighting, at: Date): void {
    this.db
      .prepare(
        `INSERT INTO known_alliance (kingdom, tag, name, last_seen) VALUES (?, ?, ?, ?)
         ON CONFLICT (kingdom, tag) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`,
      )
      .run(alliance.kingdom, alliance.tag, alliance.name, at.toISOString());
  }

  /** The Known Alliances last seen within 30 days of `now`. */
  all(now: Date): KnownAlliance[] {
    return this.db
      .prepare("SELECT kingdom, tag, name, last_seen FROM known_alliance WHERE last_seen >= ? ORDER BY kingdom, tag")
      .all(knownSince(now).toISOString())
      .map(knownAllianceOf);
  }

  /** Deletes the Known Alliances not seen within 30 days of `now`. */
  forget(now: Date): void {
    this.db.prepare("DELETE FROM known_alliance WHERE last_seen < ?").run(knownSince(now).toISOString());
  }
}

function knownAllianceOf(raw: Record<string, unknown>): KnownAlliance {
  const parsed = row.safeParse(raw);
  if (!parsed.success) throw new Error("a Known Alliance in neil.db is corrupt; fix or remove it by hand");
  const kingdom = parseKingdom(parsed.data.kingdom);
  if (!kingdom.ok) throw new Error("a Known Alliance in neil.db is corrupt; fix or remove it by hand");
  return {
    kingdom: kingdom.value,
    tag: parsed.data.tag,
    name: parsed.data.name,
    lastSeen: new Date(parsed.data.last_seen),
  };
}
