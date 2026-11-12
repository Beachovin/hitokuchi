#!/bin/sh
# 表示確認用のデモユーザーをローカル DB に追加する
set -e
cd "$(dirname "$0")/../.."
TMP=$(mktemp)
npx wrangler d1 execute hitokuchi-db --local --json --command "SELECT p.id, c.slug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status = 'published'" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s)[0].results)))' > "$TMP"
python3 db/demo/generate.py "$TMP"
rm -f "$TMP"
npx wrangler d1 execute hitokuchi-db --local --file=db/demo/remove.sql > /dev/null
npx wrangler d1 execute hitokuchi-db --local --file=db/demo/demo.sql > /dev/null
for f in db/demo/avatars/*.png; do
  npx wrangler r2 object put "hitokuchi-images/avatars/$(basename "$f")" --file "$f" --content-type image/png --local > /dev/null
done
echo "デモユーザーを追加しました（削除: npm run demo:remove:local）"
