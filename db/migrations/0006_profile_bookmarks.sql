-- プロフィール（画像・年代・性別と公開設定）とブックマーク
ALTER TABLE users ADD COLUMN avatar_key TEXT;                   -- R2 のキー（自分でアップロードした画像）
ALTER TABLE users ADD COLUMN age_group TEXT;                    -- '10s' '20s' … '60s'
ALTER TABLE users ADD COLUMN gender TEXT;                       -- 'female' 'male' 'other'
ALTER TABLE users ADD COLUMN show_age INTEGER NOT NULL DEFAULT 0;     -- 1 で口コミに表示
ALTER TABLE users ADD COLUMN show_gender INTEGER NOT NULL DEFAULT 0;  -- 1 で口コミに表示
ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;      -- 表示確認用のデモユーザー（公開前に削除）

CREATE TABLE bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX idx_bookmarks_product ON bookmarks(product_id);
