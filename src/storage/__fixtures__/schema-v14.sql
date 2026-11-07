-- The schema of neil.db at version 14, frozen: migrations 1 to 14 as they shipped before slice 028.
-- A database written by the build before migration 15 is opened from this file in database.test.ts.
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-10-28T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (2, '2026-10-28T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (3, '2026-10-28T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (4, '2026-10-28T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (5, '2026-10-30T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (6, '2026-11-01T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (7, '2026-11-01T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (8, '2026-11-01T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (9, '2026-11-02T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (10, '2026-11-02T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (11, '2026-11-03T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (12, '2026-11-04T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (13, '2026-11-04T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (14, '2026-11-06T12:00:00.000Z');

CREATE TABLE start_record (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     first_started_at TEXT NOT NULL,
     start_count INTEGER NOT NULL CHECK (start_count >= 1)
   );

CREATE TABLE daily_quota (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     day TEXT NOT NULL,
     used INTEGER NOT NULL CHECK (used >= 0),
     quota_limit INTEGER NOT NULL CHECK (quota_limit >= 1),
     limit_reached INTEGER NOT NULL CHECK (limit_reached IN (0, 1)),
     confirmed_at TEXT
   );

CREATE TABLE onboarding_interview (
     id INTEGER PRIMARY KEY,
     member_id TEXT NOT NULL,
     thread_id TEXT NOT NULL,
     step TEXT NOT NULL,
     failed_attempts INTEGER NOT NULL CHECK (failed_attempts BETWEEN 0 AND 5),
     uid TEXT,
     player_json TEXT,
     started_at TEXT NOT NULL,
     last_asked_at TEXT,
     resumes_at TEXT,
     ended_at TEXT,
     end_reason TEXT,
     due_at TEXT
   , chosen_uid TEXT, chosen_player_json TEXT, matches_json TEXT);

CREATE INDEX onboarding_interview_due ON onboarding_interview (due_at);

CREATE TABLE link (
     member_id TEXT PRIMARY KEY,
     uid TEXT NOT NULL UNIQUE,
     linked_at TEXT NOT NULL,
     rank_source TEXT NOT NULL,
     alliance_rank TEXT,
     approved_by TEXT,
     approved_at TEXT
   , linked_by TEXT);

CREATE TABLE rank_approval (
     id INTEGER PRIMARY KEY,
     linked_member_id TEXT NOT NULL,
     thread_id TEXT NOT NULL,
     approver_kind TEXT NOT NULL,
     approver_member_id TEXT,
     state TEXT NOT NULL,
     rank TEXT,
     approved_by TEXT,
     asked_at TEXT NOT NULL,
     ended_at TEXT
   );

CREATE UNIQUE INDEX one_open_interview ON onboarding_interview (member_id)
     WHERE step IN ('recommending', 'awaiting-recommendation', 'awaiting-pick', 'awaiting-uid', 'checking',
       'awaiting-confirmation', 'paused-for-quota');

CREATE TABLE applied (
     member_id TEXT PRIMARY KEY REFERENCES link (member_id) ON DELETE CASCADE,
     nickname TEXT NOT NULL,
     roles_json TEXT NOT NULL,
     applied_at TEXT NOT NULL,
     complete INTEGER NOT NULL CHECK (complete IN (0, 1))
   , alliance_kingdom INTEGER, alliance_tag TEXT, alliance_recorded INTEGER NOT NULL DEFAULT 0 CHECK (alliance_recorded IN (0, 1)));

CREATE TABLE known_alliance (
     kingdom INTEGER NOT NULL,
     tag TEXT NOT NULL,
     name TEXT NOT NULL,
     last_seen TEXT NOT NULL,
     PRIMARY KEY (kingdom, tag)
   );

CREATE TABLE daily_sync (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     day TEXT NOT NULL,
     left_over_json TEXT NOT NULL
   );

CREATE TRIGGER link_linked_by_on_insert BEFORE INSERT ON link
     WHEN NEW.linked_by IS NOT NULL AND (NEW.linked_by = '' OR NEW.linked_by GLOB '*[^0-9]*')
     BEGIN SELECT RAISE(ABORT, 'link.linked_by must be a snowflake or NULL'); END;

CREATE TRIGGER link_linked_by_on_update BEFORE UPDATE OF linked_by ON link
     WHEN NEW.linked_by IS NOT NULL AND (NEW.linked_by = '' OR NEW.linked_by GLOB '*[^0-9]*')
     BEGIN SELECT RAISE(ABORT, 'link.linked_by must be a snowflake or NULL'); END;

CREATE TABLE reaper (
     uid TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     kingdom INTEGER NOT NULL,
     x REAL,
     y REAL,
     position_at TEXT,
     reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
     added_at TEXT NOT NULL,
     added_by TEXT NOT NULL,
     CHECK ((x IS NULL) = (y IS NULL) AND (x IS NULL) = (position_at IS NULL))
   );

CREATE INDEX reaper_kingdom ON reaper (kingdom);

CREATE TABLE preference (
     member_id TEXT NOT NULL CHECK (member_id <> '' AND member_id NOT GLOB '*[^0-9]*'),
     kind TEXT NOT NULL,
     value TEXT NOT NULL,
     PRIMARY KEY (member_id, kind, value)
   );

CREATE TABLE preference_prompt (
     member_id TEXT PRIMARY KEY CHECK (member_id <> '' AND member_id NOT GLOB '*[^0-9]*'),
     thread_id TEXT NOT NULL,
     posted_at TEXT NOT NULL
   );

CREATE TABLE member_usage (
     day TEXT NOT NULL,
     member_id TEXT NOT NULL CHECK (member_id <> '' AND member_id NOT GLOB '*[^0-9]*'),
     requests INTEGER NOT NULL CHECK (requests > 0),
     PRIMARY KEY (day, member_id)
   );

CREATE TABLE lookup_member_day (
     day TEXT PRIMARY KEY,
     lookup_members INTEGER NOT NULL CHECK (lookup_members >= 0)
   );

CREATE TABLE booty_alerts (
     member_id TEXT PRIMARY KEY,
     mode TEXT NOT NULL,
     window_start INTEGER NOT NULL,
     window_end INTEGER NOT NULL,
     time_zone TEXT NOT NULL
   );
