/** Remembers which Handover Reminders and next-holder announcements were handled, per Royal City siege, in neil.db. */
export class HandoverStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Whether the post of this kind for the Royal City siege was handled (posted, failed or dropped). */
    handoverPosted(siegeAt, kind) {
        return (this.db.prepare("SELECT 1 AS found FROM handover_posts WHERE siege_at = ? AND kind = ?").get(siegeAt.toISOString(), kind) !==
            undefined);
    }
    /** Records the post of this kind for the Royal City siege as handled; recording it again keeps the first time. */
    recordHandoverPosted(siegeAt, kind, at) {
        this.db
            .prepare("INSERT INTO handover_posts (siege_at, kind, posted_at) VALUES (?, ?, ?) ON CONFLICT (siege_at, kind) DO NOTHING")
            .run(siegeAt.toISOString(), kind, at.toISOString());
    }
}
//# sourceMappingURL=handover-store.js.map