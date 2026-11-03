import { z } from "zod";
import { knownSince } from "../domain/alliance-match.js";
import { parseKingdom } from "../domain/lookup-input.js";
const row = z.object({
    kingdom: z.number().int(),
    tag: z.string(),
    name: z.string(),
    last_seen: z.iso.datetime(),
});
/** Keeps the Known Alliances in neil.db; a corrupt row is an error, never a silent skip. */
export class KnownAllianceStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Remembers an Alliance seen at `at`: a new name for a known tag replaces the old one. */
    seen(alliance, at) {
        this.db
            .prepare(`INSERT INTO known_alliance (kingdom, tag, name, last_seen) VALUES (?, ?, ?, ?)
         ON CONFLICT (kingdom, tag) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`)
            .run(alliance.kingdom, alliance.tag, alliance.name, at.toISOString());
    }
    /** The Known Alliances last seen within 30 days of `now`. */
    all(now) {
        return this.db
            .prepare("SELECT kingdom, tag, name, last_seen FROM known_alliance WHERE last_seen >= ? ORDER BY kingdom, tag")
            .all(knownSince(now).toISOString())
            .map(knownAllianceOf);
    }
    /** Deletes the Known Alliances not seen within 30 days of `now`. */
    forget(now) {
        this.db.prepare("DELETE FROM known_alliance WHERE last_seen < ?").run(knownSince(now).toISOString());
    }
}
function knownAllianceOf(raw) {
    const parsed = row.safeParse(raw);
    if (!parsed.success)
        throw new Error("a Known Alliance in neil.db is corrupt; fix or remove it by hand");
    const kingdom = parseKingdom(parsed.data.kingdom);
    if (!kingdom.ok)
        throw new Error("a Known Alliance in neil.db is corrupt; fix or remove it by hand");
    return {
        kingdom: kingdom.value,
        tag: parsed.data.tag,
        name: parsed.data.name,
        lastSeen: new Date(parsed.data.last_seen),
    };
}
//# sourceMappingURL=known-alliance-store.js.map