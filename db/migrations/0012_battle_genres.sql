-- 新商品バトルをジャンル（カテゴリ）ごとに
ALTER TABLE battles ADD COLUMN category_id INTEGER REFERENCES categories(id);
UPDATE battles SET category_id = (SELECT category_id FROM products WHERE id = battles.product_a) WHERE category_id IS NULL;
CREATE UNIQUE INDEX idx_battles_week_genre ON battles(week, category_id);
