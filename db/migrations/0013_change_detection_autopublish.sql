-- 収集元の更新検知：一覧の中身（商品コードの集合）が変わったときだけ本処理を走らせる
ALTER TABLE scrape_sources ADD COLUMN list_hash TEXT;      -- 前回処理した一覧の商品コード集合のハッシュ
ALTER TABLE scrape_sources ADD COLUMN etag TEXT;           -- 条件付きリクエスト用
ALTER TABLE scrape_sources ADD COLUMN last_modified TEXT;
ALTER TABLE scrape_sources ADD COLUMN checked_at TEXT;     -- 最後に更新を確認した日時
ALTER TABLE scrape_sources ADD COLUMN changed_at TEXT;     -- 最後に更新を検知した日時

-- 自動排除などの理由
ALTER TABLE product_candidates ADD COLUMN note TEXT;

-- 一度取り込んだ商品コード（古い商品・候補を削除したあとも再収集しないための軽い記録）
CREATE TABLE scrape_seen (
  external_key TEXT PRIMARY KEY,
  seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- スクレイピング結果を承認待ちにせずそのまま公開する（既定はオフ）
INSERT OR IGNORE INTO settings(key, value) VALUES ('auto_publish', '0');
