-- The schema of neil.db at version 5, frozen: migrations 1 to 5 as they shipped before slice 007.
-- A database written by the build before migration 6 is opened from this file in database.test.ts.
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-10-28T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (2, '2026-10-28T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (3, '2026-10-28T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (4, '2026-10-28T12:00:00.000Z');
INSERT INTO schema_migrations (version, applied_at) VALUES (5, '2026-10-30T12:00:00.000Z');

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
