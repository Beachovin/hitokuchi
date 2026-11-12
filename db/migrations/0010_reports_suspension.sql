-- ユーザー通報とアカウント停止
ALTER TABLE users ADD COLUMN suspended_at TEXT;
ALTER TABLE users ADD COLUMN suspended_reason TEXT;
ALTER TABLE reviews ADD COLUMN hidden_by_suspension INTEGER NOT NULL DEFAULT 0;

CREATE TABLE user_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  review_id INTEGER REFERENCES reviews(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'impersonation', 'inappropriate', 'other')),
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_user_reports_status ON user_reports(status, created_at DESC);
CREATE INDEX idx_user_reports_target ON user_reports(target_user_id, status);
CREATE UNIQUE INDEX idx_user_reports_once ON user_reports(reporter_id, review_id) WHERE status = 'open';
