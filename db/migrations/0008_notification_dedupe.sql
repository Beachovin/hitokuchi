-- 実績など product_id が NULL の通知も重複しないようにする（SQLite の UNIQUE は NULL を別値として扱うため）
DELETE FROM notifications WHERE id NOT IN (
  SELECT MIN(id) FROM notifications GROUP BY user_id, kind, COALESCE(product_id, 0), ref
);
CREATE UNIQUE INDEX idx_notifications_dedupe ON notifications(user_id, kind, COALESCE(product_id, 0), ref);
