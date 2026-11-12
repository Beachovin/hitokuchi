-- 管理者ログイン：ロールと操作ログ
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

CREATE TABLE admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,                 -- 退会後も誰の操作か分かるように保存
  action TEXT NOT NULL,                -- 例: candidate.approve / review.hide / settings.update
  target TEXT,                         -- 例: candidate:12 / review:80
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON admin_audit_logs(created_at DESC);
