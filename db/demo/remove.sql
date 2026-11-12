-- デモデータの削除（is_demo = 1 のユーザーと、その口コミ・投票・ブックマーク）
DELETE FROM review_votes WHERE voter_id IN (SELECT id FROM users WHERE is_demo = 1)
  OR review_id IN (SELECT id FROM reviews WHERE reviewer_id IN (SELECT id FROM users WHERE is_demo = 1));
DELETE FROM reports WHERE review_id IN (SELECT id FROM reviews WHERE reviewer_id IN (SELECT id FROM users WHERE is_demo = 1));
DELETE FROM reviews WHERE reviewer_id IN (SELECT id FROM users WHERE is_demo = 1);
DELETE FROM reviewers WHERE id IN (SELECT id FROM users WHERE is_demo = 1);
DELETE FROM users WHERE is_demo = 1;
-- 実ユーザーの口コミの Good / Bad と集計を再計算
UPDATE reviews SET good_count = (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = reviews.id AND v.value = 1),
  bad_count = (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = reviews.id AND v.value = -1);
UPDATE reviewers SET review_count = (SELECT COUNT(*) FROM reviews r WHERE r.reviewer_id = reviewers.id AND r.status = 'published'),
  good_received = COALESCE((SELECT SUM(good_count) FROM reviews r WHERE r.reviewer_id = reviewers.id AND r.status = 'published'), 0),
  bad_received = COALESCE((SELECT SUM(bad_count) FROM reviews r WHERE r.reviewer_id = reviewers.id AND r.status = 'published'), 0);
UPDATE products SET review_count = (SELECT COUNT(*) FROM reviews r WHERE r.product_id = products.id AND r.status = 'published'),
  rating_avg = COALESCE((SELECT ROUND(AVG(rating), 2) FROM reviews r WHERE r.product_id = products.id AND r.status = 'published'), 0);
