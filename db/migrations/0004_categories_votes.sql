-- カテゴリをマイグレーションで管理（デモ用 seed は廃止）
INSERT OR IGNORE INTO categories(slug, name, emoji, sort) VALUES
  ('sweets', 'スイーツ', '🍰', 0),
  ('snack', 'スナック', '🥨', 1),
  ('chocolate', 'チョコレート', '🍫', 2),
  ('bread', 'パン', '🥐', 3),
  ('onigiri', 'おにぎり・弁当', '🍙', 4),
  ('drink', 'ドリンク', '🧋', 5),
  ('ice', 'アイス', '🍨', 6),
  ('noodle', 'カップ麺・麺類', '🍜', 7),
  ('deli', 'お惣菜', '🍗', 8);

-- 商品の販売地域（一覧で表示）
ALTER TABLE products ADD COLUMN region TEXT;
UPDATE products SET region = (
  SELECT c.region FROM product_candidates c WHERE c.duplicate_of = products.id AND c.region IS NOT NULL ORDER BY c.id LIMIT 1
);

-- 商品説明の取得状況（詳細ページを取得済みか）
ALTER TABLE products ADD COLUMN detail_fetched_at TEXT;

-- ===== 口コミの Good / Bad とレビュアー =====
-- ログイン機能が入るまでは、ブラウザごとの匿名 ID（Cookie）でレビュアーを識別する
ALTER TABLE reviews ADD COLUMN reviewer_id TEXT;
ALTER TABLE reviews ADD COLUMN good_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN bad_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);

CREATE TABLE review_votes (
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (1, -1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (review_id, voter_id)
);

-- レビュアーごとの集計（口コミ投稿・投票のたびに更新）
CREATE TABLE reviewers (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0,
  good_received INTEGER NOT NULL DEFAULT 0,
  bad_received INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
