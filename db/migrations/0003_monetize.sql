-- フェーズ1 マネタイズ：画像 URL 埋め込み・広告・アフィリエイト

-- 商品画像は保存せず、収集元の画像 URL をそのまま埋め込む
ALTER TABLE products ADD COLUMN image_url TEXT;

INSERT OR IGNORE INTO settings(key, value) VALUES
  ('ads_enabled', '0'),            -- 1 で広告枠を表示
  ('adsense_client', ''),          -- 例: ca-pub-1234567890123456
  ('adsense_slot', ''),            -- 広告ユニット ID（空なら自動広告のみ）
  ('amazon_tag', ''),              -- Amazon アソシエイトのトラッキング ID（例: xxxx-22）
  ('rakuten_affiliate_id', '');    -- 楽天アフィリエイト ID
