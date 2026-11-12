-- 口コミ・再訪を促す機能

-- 食べた記録
CREATE TABLE eaten (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);

-- サイト内通知（気になる商品の発売日・口コミの催促など）
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                  -- release_today / ask_review / first_review_bonus / achievement
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  ref TEXT NOT NULL DEFAULT '',        -- 重複防止用の補助キー（実績 ID など）
  body TEXT NOT NULL,
  link TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, kind, product_id, ref)
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

-- ファーストレビュー・ひとこと口コミ
ALTER TABLE reviews ADD COLUMN is_first INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN is_quick INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviewers ADD COLUMN first_count INTEGER NOT NULL DEFAULT 0;

-- 新商品バトル
CREATE TABLE battles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week TEXT NOT NULL,                  -- 週の月曜日
  product_a INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_b INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (week, product_a, product_b)
);
CREATE TABLE battle_votes (
  battle_id INTEGER NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  voter_key TEXT NOT NULL,             -- ログイン中はユーザー ID、未ログインは匿名 Cookie
  choice TEXT NOT NULL CHECK (choice IN ('a', 'b')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (battle_id, voter_key)
);

-- 週1回のダイジェスト
ALTER TABLE users ADD COLUMN digest_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN digest_last_sent TEXT;

-- 口コミの AI 要約
ALTER TABLE products ADD COLUMN ai_summary TEXT;
ALTER TABLE products ADD COLUMN ai_summary_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN ai_summary_at TEXT;
INSERT OR IGNORE INTO settings(key, value) VALUES ('ai_summary_enabled', '1'), ('digest_enabled', '0');
