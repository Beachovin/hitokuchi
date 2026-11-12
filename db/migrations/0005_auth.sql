-- Google ログイン
CREATE TABLE users (
  id TEXT PRIMARY KEY,                 -- 内部 ID（UUID）
  google_sub TEXT NOT NULL UNIQUE,     -- Google のユーザー識別子
  email TEXT NOT NULL,                 -- 公開しない
  google_name TEXT,                    -- 公開しない（本人の画面にのみ表示）
  avatar_url TEXT,                     -- 公開しない（本人のヘッダーにのみ表示）
  nickname TEXT,                       -- 公開する表示名。NULL の間は初回設定を促す
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);
CREATE UNIQUE INDEX idx_users_nickname ON users(nickname) WHERE nickname IS NOT NULL;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                 -- セッショントークンの SHA-256（トークン自体は保存しない）
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- 匿名 Cookie 時代の口コミ・投票は存在しない前提でリセット（reviewer_id / voter_id はユーザー ID を指す）
DELETE FROM review_votes;
DELETE FROM reviewers;
