-- The schema of neil.db at version 10, frozen: migrations 1 to 10 as they shipped before slice 016.
-- A database written by the build before migration 11 is opened from this file in database.test.ts.
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
);
CREATE INDEX onboarding_interview_due ON onboarding_interview (due_at);
CREATE UNIQUE INDEX one_open_interview ON onboarding_interview (member_id)
  WHERE step IN ('awaiting-uid', 'checking', 'awaiting-confirmation', 'paused-for-quota');

CREATE TABLE link (
  member_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL,
  rank_source TEXT NOT NULL,
  alliance_rank TEXT,
  approved_by TEXT,
  approved_at TEXT
);

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

ALTER TABLE onboarding_interview ADD COLUMN chosen_uid TEXT;
ALTER TABLE onboarding_interview ADD COLUMN chosen_player_json TEXT;
ALTER TABLE onboarding_interview ADD COLUMN matches_json TEXT;
DROP INDEX one_open_interview;
CREATE UNIQUE INDEX one_open_interview ON onboarding_interview (member_id)
  WHERE step IN ('recommending', 'awaiting-recommendation', 'awaiting-pick', 'awaiting-uid', 'checking',
    'awaiting-confirmation', 'paused-for-quota');

CREATE TABLE applied (
  member_id TEXT PRIMARY KEY REFERENCES link (member_id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  roles_json TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  complete INTEGER NOT NULL CHECK (complete IN (0, 1))
);

CREATE TABLE known_alliance (
  kingdom INTEGER NOT NULL,
  tag TEXT NOT NULL,
  name TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (kingdom, tag)
);

ALTER TABLE applied ADD COLUMN alliance_kingdom INTEGER;
ALTER TABLE applied ADD COLUMN alliance_tag TEXT;
CREATE TABLE daily_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  day TEXT NOT NULL,
  left_over_json TEXT NOT NULL
);

ALTER TABLE applied ADD COLUMN alliance_recorded INTEGER NOT NULL DEFAULT 0 CHECK (alliance_recorded IN (0, 1));
UPDATE applied SET alliance_recorded = 1 WHERE alliance_kingdom IS NOT NULL;

ALTER TABLE link ADD COLUMN linked_by TEXT;

CREATE TRIGGER link_linked_by_on_insert BEFORE INSERT ON link
  WHEN NEW.linked_by IS NOT NULL AND (NEW.linked_by = '' OR NEW.linked_by GLOB '*[^0-9]*')
  BEGIN SELECT RAISE(ABORT, 'link.linked_by must be a snowflake or NULL'); END;
CREATE TRIGGER link_linked_by_on_update BEFORE UPDATE OF linked_by ON link
  WHEN NEW.linked_by IS NOT NULL AND (NEW.linked_by = '' OR NEW.linked_by GLOB '*[^0-9]*')
  BEGIN SELECT RAISE(ABORT, 'link.linked_by must be a snowflake or NULL'); END;
