-- 管理画面で作る特集
CREATE TABLE features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  lead TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '🍙',
  theme TEXT NOT NULL DEFAULT 'sunset',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE feature_items (
  feature_id INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (feature_id, product_id)
);
CREATE INDEX idx_feature_items_order ON feature_items(feature_id, position);
