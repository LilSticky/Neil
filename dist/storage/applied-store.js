import { z } from "zod";
import { linkOf } from "./link-store.js";
const appliedRow = z.object({
    member_id: z.string().regex(/^\d+$/),
    nickname: z.string(),
    roles_json: z.string().transform((text, ctx) => {
        const parsed = z.array(z.string()).safeParse(JSON.parse(text));
        if (parsed.success)
            return parsed.data;
        ctx.addIssue({ code: "custom", message: "not a list of role names" });
        return z.NEVER;
    }),
    applied_at: z.iso.datetime().transform((value) => new Date(value)),
    complete: z.union([z.literal(0), z.literal(1)]),
});
/** Keeps the Applied State of each Link in neil.db; a corrupt row is an error, never a silent repair. */
export class AppliedStore {
    db;
    constructor(db) {
        this.db = db;
    }
    get(memberId) {
        const raw = this.db
            .prepare("SELECT member_id, nickname, roles_json, applied_at, complete FROM applied WHERE member_id = ?")
            .get(memberId);
        return raw === undefined ? undefined : appliedOf(raw);
    }
    /** Stores the Applied State, replacing the Member's previous one. */
    record(state) {
        this.db
            .prepare(`INSERT INTO applied (member_id, nickname, roles_json, applied_at, complete) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (member_id) DO UPDATE SET nickname = excluded.nickname, roles_json = excluded.roles_json,
           applied_at = excluded.applied_at, complete = excluded.complete`)
            .run(state.memberId, state.nickname, JSON.stringify(state.roles), state.appliedAt.toISOString(), state.complete ? 1 : 0);
    }
    /** The Links whose Member has no Applied State yet, or one that is not complete (the startup apply's work list). */
    linkedWithoutCompleteApply() {
        const rows = this.db
            .prepare(`SELECT l.member_id, l.uid, l.linked_at, l.rank_source, l.alliance_rank, l.approved_by, l.approved_at
         FROM link l LEFT JOIN applied a ON a.member_id = l.member_id
         WHERE a.member_id IS NULL OR a.complete = 0
         ORDER BY l.linked_at, l.member_id`)
            .all();
        return rows.map(linkOf);
    }
}
function appliedOf(raw) {
    const parsed = appliedRow.safeParse(raw);
    if (!parsed.success)
        throw new Error("an Applied State in neil.db is corrupt; fix or remove it by hand");
    return {
        memberId: parsed.data.member_id,
        nickname: parsed.data.nickname,
        roles: parsed.data.roles_json,
        appliedAt: parsed.data.applied_at,
        complete: parsed.data.complete === 1,
    };
}
//# sourceMappingURL=applied-store.js.map