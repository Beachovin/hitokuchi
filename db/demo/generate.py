"""
表示確認用のデモユーザー・口コミ・Good を生成する（ローカル専用）。
  python3 db/demo/generate.py <商品一覧JSON> → db/demo/demo.sql と db/demo/avatars/*.png を出力
公開前に必ず `npm run demo:remove:local`（本番なら --remote）で削除すること。
"""
import json, random, sys, struct, zlib, os

random.seed(42)
products = json.load(open(sys.argv[1]))  # [{id, slug}]
OUT = os.path.dirname(__file__)

# ---------- アバター画像（抽象的なグラデーション。実在の人物写真ではない） ----------
def png(path, c1, c2, c3):
    W = H = 256
    rows = []
    for y in range(H):
        row = bytearray([0])
        for x in range(W):
            t = (x + y) / (W + H)
            r, g, b = [int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)]
            dx, dy = x - 170, y - 80
            d = (dx * dx + dy * dy) ** 0.5
            if d < 70:  # 柔らかい円
                k = (1 - d / 70) * 0.55
                r, g, b = [int(v * (1 - k) + c3[i] * k) for i, v in enumerate((r, g, b))]
            row += bytes((r, g, b))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")
    open(path, "wb").write(data)

os.makedirs(f"{OUT}/avatars", exist_ok=True)

# ---------- デモユーザー ----------
# ポイント = 口コミ数×3 + Good×2 − Bad
USERS = [
    # nickname, 口コミ数, もらうGood, 年代, 性別, 年代表示, 性別表示, アバター色
    ("コンビニ探検家ミナ", 40, 46, "30s", "female", 1, 1, ((167, 139, 250), (103, 232, 249), (253, 230, 138))),  # 120+92=212 プラチナ
    ("夜食マイスター", 18, 16, "40s", "male", 1, 0, ((251, 191, 36), (234, 88, 12), (255, 255, 255))),        # 54+32=86 ゴールド
    ("パン好きOL", 8, 5, "20s", "female", 1, 1, ((203, 213, 225), (100, 116, 139), (255, 255, 255))),          # 24+10=34 シルバー
    ("甘党エンジニア", 3, 1, "20s", "male", 0, 0, None),                                                         # 9+2=11 ブロンズ
    ("はじめてのひとくち", 1, 0, None, None, 0, 0, None),                                                         # 3 レギュラー
]
VOTERS = [f"デモ投票者{i}" for i in range(1, 13)]

TEMPLATES = {
    "onigiri": [("具がたっぷり", "ごはんの量に対して具がしっかり入っていて満足感がありました。味付けもちょうどいいです。"),
                ("朝ごはんに最適", "海苔の香りがよく、朝の忙しい時間にぴったり。リピートしたいです。"),
                ("ちょっと塩気強め", "味は好きですが、少し塩気が強く感じました。お茶と一緒に食べるのがおすすめ。")],
    "bread": [("ふんわり食感", "生地がふんわりしていて、中のクリームとのバランスが絶妙でした。"),
              ("ボリューム満点", "見た目以上にずっしりしていて、これ一つでお腹いっぱいになります。"),
              ("温めると美味しい", "トースターで少し温めると香りが立ってさらに美味しくなりました。")],
    "sweets": [("ご褒美にぴったり", "甘さが上品で、仕事終わりのご褒美にちょうどいいサイズ感でした。"),
               ("期待以上", "コンビニスイーツとは思えないクオリティ。見つけたらまた買います。"),
               ("甘さ控えめ", "甘すぎないので最後まで飽きずに食べられました。コーヒーと合います。")],
    "noodle": [("スープが濃厚", "スープに深みがあって麺によく絡みます。寒い日にまた食べたい。"),
               ("麺がもちもち", "麺の食感がよく、レンジ調理でもお店っぽい仕上がりでした。")],
    "deli": [("おつまみに最高", "味がしっかりしていて、晩酌のお供にぴったりでした。"),
             ("手軽に一品", "あと一品ほしいときに便利。量もちょうどいいです。")],
    "default": [("また買いたい", "全体的にバランスがよく、満足度の高い商品でした。"),
                ("普通においしい", "特別な驚きはないけど安定しておいしい。価格相応だと思います。")],
}

q = lambda s: "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"
sql = ["-- 表示確認用デモデータ（db/demo/generate.py で生成）。公開前に必ず削除すること"]
pool = products[:]

user_ids = []
for i, (nick, n_reviews, n_good, age, gender, sa, sg, colors) in enumerate(USERS, 1):
    uid = f"00000000-0000-4000-8000-{i:012d}"
    avatar_key = None
    if colors:
        avatar_key = f"avatars/demo-{i}.png"
        png(f"{OUT}/avatars/demo-{i}.png", *colors)
    sql.append(
        f"INSERT INTO users(id, google_sub, email, nickname, avatar_key, age_group, gender, show_age, show_gender, is_demo) VALUES "
        f"({q(uid)}, {q(f'demo-{i}')}, {q(f'demo-{i}@example.invalid')}, {q(nick)}, {q(avatar_key)}, {q(age)}, {q(gender)}, {sa}, {sg}, 1);"
    )
    user_ids.append((uid, nick, n_reviews, n_good))

voter_ids = []
for j, nick in enumerate(VOTERS, 1):
    vid = f"00000000-0000-4000-9000-{j:012d}"
    sql.append(f"INSERT INTO users(id, google_sub, email, nickname, is_demo) VALUES ({q(vid)}, {q(f'demo-voter-{j}')}, {q(f'demo-voter-{j}@example.invalid')}, {q(nick)}, 1);")
    voter_ids.append(vid)

review_no = 0
for uid, nick, n_reviews, n_good in user_ids:
    # 全デモユーザーが 1 つの「見本用商品」に口コミを書き、ランクの見た目を並べて比べられるようにする
    showcase = pool[0]
    chosen = [showcase] + random.sample(pool[1:], n_reviews - 1)
    my_reviews = []
    for p in chosen:
        review_no += 1
        rid = 900000 + review_no
        title, body = random.choice(TEMPLATES.get(p["slug"] or "", TEMPLATES["default"]))
        rating = random.choices([5, 4, 3, 2], [40, 40, 15, 5])[0]
        days = random.randint(0, 20)
        sql.append(
            f"INSERT INTO reviews(id, product_id, nickname, rating, taste, volume, value, title, body, status, reviewer_id, created_at) VALUES "
            f"({rid}, {p['id']}, {q(nick)}, {rating}, {max(1, min(5, rating + random.randint(-1, 1)))}, {random.randint(2, 5)}, {max(1, min(5, rating + random.randint(-1, 1)))}, "
            f"{q(title)}, {q(body)}, 'published', {q(uid)}, datetime('now', '-{days} days', '-{random.randint(0, 23)} hours'));"
        )
        my_reviews.append(rid)
    # Good を口コミに分散（同じ投票者は同じ口コミに 1 回まで）
    slots = [(r, v) for r in my_reviews for v in voter_ids]
    for r, v in random.sample(slots, min(n_good, len(slots))):
        sql.append(f"INSERT INTO review_votes(review_id, voter_id, value) VALUES ({r}, {q(v)}, 1);")

# 集計を実データから再計算
sql.append("UPDATE reviews SET good_count = (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = reviews.id AND v.value = 1), "
           "bad_count = (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = reviews.id AND v.value = -1) WHERE id > 900000;")
sql.append("INSERT INTO reviewers(id, nickname, review_count, good_received, bad_received) "
           "SELECT u.id, u.nickname, COUNT(r.id), COALESCE(SUM(r.good_count), 0), COALESCE(SUM(r.bad_count), 0) "
           "FROM users u JOIN reviews r ON r.reviewer_id = u.id AND r.status = 'published' WHERE u.is_demo = 1 GROUP BY u.id "
           "ON CONFLICT(id) DO UPDATE SET review_count = excluded.review_count, good_received = excluded.good_received, bad_received = excluded.bad_received;")
sql.append("UPDATE products SET review_count = (SELECT COUNT(*) FROM reviews r WHERE r.product_id = products.id AND r.status = 'published'), "
           "rating_avg = COALESCE((SELECT ROUND(AVG(rating), 2) FROM reviews r WHERE r.product_id = products.id AND r.status = 'published'), 0) "
           "WHERE id IN (SELECT DISTINCT product_id FROM reviews WHERE id > 900000);")
open(f"{OUT}/demo.sql", "w").write("\n".join(sql) + "\n")
print(f"users={len(USERS)} voters={len(VOTERS)} reviews={review_no}")
