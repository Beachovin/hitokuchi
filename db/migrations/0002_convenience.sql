-- コンビニ 5 社に限定した収集と、Claude 整形の ON/OFF 設定

-- 販売チャネル（コンビニ 5 社）
INSERT OR IGNORE INTO channels(slug, name) VALUES
  ('seven-eleven', 'セブン-イレブン'),
  ('familymart', 'ファミリーマート'),
  ('lawson', 'ローソン'),
  ('ministop', 'ミニストップ'),
  ('daily-yamazaki', 'デイリーヤマザキ');

-- 旧デモ用チャネルを付け替えて削除（新規 DB では何もしない）
UPDATE OR IGNORE product_channels SET channel_id = (SELECT id FROM channels WHERE slug = 'seven-eleven') WHERE channel_id = (SELECT id FROM channels WHERE slug = 'conveni-a');
UPDATE OR IGNORE product_channels SET channel_id = (SELECT id FROM channels WHERE slug = 'familymart') WHERE channel_id = (SELECT id FROM channels WHERE slug = 'conveni-b');
UPDATE OR IGNORE product_channels SET channel_id = (SELECT id FROM channels WHERE slug = 'lawson') WHERE channel_id = (SELECT id FROM channels WHERE slug = 'conveni-c');
UPDATE OR IGNORE product_channels SET channel_id = (SELECT id FROM channels WHERE slug = 'ministop') WHERE channel_id = (SELECT id FROM channels WHERE slug = 'super');
DELETE FROM product_channels WHERE channel_id IN (SELECT id FROM channels WHERE slug IN ('conveni-a','conveni-b','conveni-c','super'));
DELETE FROM channels WHERE slug IN ('conveni-a','conveni-b','conveni-c','super');

-- 設定（key-value）
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO settings(key, value) VALUES
  ('use_claude', '0'),                       -- 1 のとき Claude で整形
  ('claude_model', 'claude-haiku-5-5'),
  ('max_items_per_source', '80');

-- 収集元はコンビニ各社のアダプターに限定
ALTER TABLE scrape_sources ADD COLUMN adapter TEXT;
DELETE FROM scrape_sources WHERE adapter IS NULL;
INSERT INTO scrape_sources(name, kind, adapter, url, channel_id, max_items) VALUES
  ('セブン-イレブン 今週の新商品', 'listing', 'seven', 'https://www.sej.co.jp/products/a/thisweek/', (SELECT id FROM channels WHERE slug='seven-eleven'), 80),
  ('セブン-イレブン 来週の新商品', 'listing', 'seven', 'https://www.sej.co.jp/products/a/nextweek/', (SELECT id FROM channels WHERE slug='seven-eleven'), 80),
  ('ファミリーマート 今週の新商品', 'listing', 'familymart', 'https://www.family.co.jp/goods/newgoods.html', (SELECT id FROM channels WHERE slug='familymart'), 80),
  ('ファミリーマート 来週の新商品', 'listing', 'familymart', 'https://www.family.co.jp/goods/newgoods/nextweek.html', (SELECT id FROM channels WHERE slug='familymart'), 80),
  ('ローソン 新商品', 'listing', 'lawson', 'https://www.lawson.co.jp/recommend/new/', (SELECT id FROM channels WHERE slug='lawson'), 80),
  ('ミニストップ 今週のおすすめ', 'listing', 'ministop', 'https://www.ministop.co.jp/syohin/js/recommend.json', (SELECT id FROM channels WHERE slug='ministop'), 80),
  ('デイリーヤマザキ 新商品', 'listing', 'dailyyamazaki', 'https://www.daily-yamazaki.jp/new/', (SELECT id FROM channels WHERE slug='daily-yamazaki'), 80);

-- 候補に整形情報を追加
ALTER TABLE product_candidates ADD COLUMN external_key TEXT;      -- adapter:商品コード（再収集の重複防止）
ALTER TABLE product_candidates ADD COLUMN region TEXT;            -- 販売地域
ALTER TABLE product_candidates ADD COLUMN normalized_by TEXT NOT NULL DEFAULT 'rules'; -- rules | claude
CREATE INDEX idx_candidates_external ON product_candidates(external_key);

-- コンビニ向けにお惣菜カテゴリを追加
INSERT OR IGNORE INTO categories(slug, name, emoji, sort) VALUES ('deli', 'お惣菜', '🍗', 8);
