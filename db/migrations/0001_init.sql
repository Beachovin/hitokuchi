-- ひとくち 初期スキーマ（Cloudflare D1 / SQLite）

CREATE TABLE makers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🍽️',
  parent_id INTEGER REFERENCES categories(id),
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  maker_id INTEGER REFERENCES makers(id),
  category_id INTEGER REFERENCES categories(id),
  jan TEXT UNIQUE,
  price INTEGER,                 -- 円（税込）
  kcal INTEGER,
  description TEXT,
  image_key TEXT,                -- R2 のキー（無ければグラデーション表示）
  accent TEXT NOT NULL DEFAULT '#f97316', -- カード背景の色味
  released_on TEXT,              -- YYYY-MM-DD
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  rating_avg REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_products_released ON products(status, released_on DESC);
CREATE INDEX idx_products_rating ON products(status, rating_avg DESC, review_count DESC);
CREATE INDEX idx_products_category ON products(category_id);

CREATE TABLE product_channels (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, channel_id)
);

-- 全文検索（商品名・メーカー名）
CREATE VIRTUAL TABLE products_fts USING fts5(name, maker, tokenize='trigram');  -- rowid = products.id

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  taste INTEGER CHECK (taste BETWEEN 1 AND 5),
  volume INTEGER CHECK (volume BETWEEN 1 AND 5),
  value INTEGER CHECK (value BETWEEN 1 AND 5),
  title TEXT,
  body TEXT NOT NULL,
  image_key TEXT,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','flagged')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reviews_product ON reviews(product_id, status, created_at DESC);
CREATE INDEX idx_reviews_status ON reviews(status, created_at DESC);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== スクレイピング =====

CREATE TABLE scrape_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('rss','listing')),
  url TEXT NOT NULL,             -- RSS の URL、または新商品一覧ページの URL
  link_selector TEXT,            -- listing 用: 商品詳細リンクを含む URL のパターン（部分一致）
  channel_id INTEGER REFERENCES channels(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  max_items INTEGER NOT NULL DEFAULT 20,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE scrape_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER REFERENCES scrape_sources(id) ON DELETE SET NULL,
  instance_id TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  found INTEGER NOT NULL DEFAULT 0,
  extracted INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

-- 同じページを二度 LLM に通さないためのハッシュ
CREATE TABLE scraped_pages (
  url TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE product_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER REFERENCES scrape_sources(id) ON DELETE SET NULL,
  run_id INTEGER REFERENCES scrape_runs(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  name TEXT NOT NULL,
  maker TEXT,
  category_hint TEXT,
  jan TEXT,
  price INTEGER,
  kcal INTEGER,
  released_on TEXT,
  description TEXT,
  image_url TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  duplicate_of INTEGER REFERENCES products(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_candidates_status ON product_candidates(status, created_at DESC);
