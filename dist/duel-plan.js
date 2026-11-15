/**
 * The Duel Plan: for each Alliance Duel day, Monday to Saturday in Server Time, what scores today (`scores`) and what to
 * save for a later day (`save`). Neil posts it in #event-announcements at the daily reset, 00:00 Server Time.
 *
 * The owner or a leader fills and changes these texts through a pull request. A day whose `scores` text is empty gets no
 * card; Neil writes one line in #neil-log instead. Each text is at most 1024 characters, Discord's embed field limit.
 */
export const DUEL_PLAN = {
    monday: { scores: "", save: "" },
    tuesday: { scores: "", save: "" },
    wednesday: { scores: "", save: "" },
    thursday: { scores: "", save: "" },
    friday: { scores: "", save: "" },
    saturday: { scores: "", save: "" },
};
//# sourceMappingURL=duel-plan.js.map