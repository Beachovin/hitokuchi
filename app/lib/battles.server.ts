// 毎週の「新商品バトル」：同じカテゴリの新商品 2 つから「どっちが気になる？」を投票

/**
 * 週ごとの新商品バトルをジャンル（カテゴリ）ごとに作る。
 * その週に発売された画像付きの商品が 2 つ以上あるジャンルすべてが対象。
 * 既にバトルがあるジャンルはそのまま（何度呼んでも重複しない）なので、毎朝の cron で呼ぶと
 * 週の途中で新商品が増えたジャンルのバトルも追加される。
 * 対戦カードは「気になる・口コミ・食べた」の多い注目商品同士で、できるだけ別チェーンの組み合わせ。
 */
export async function generateWeeklyBattles(db: D1Database, week: string, sunday: string) {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.category_id, c.name AS category, m.name AS maker,
              (SELECT COUNT(*) FROM bookmarks b WHERE b.product_id = p.id) * 2
              + p.review_count * 3
              + (SELECT COUNT(*) FROM eaten e WHERE e.product_id = p.id) AS score
       FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN makers m ON m.id = p.maker_id
       WHERE p.status = 'published' AND p.image_url IS NOT NULL AND p.released_on BETWEEN ? AND ?
         AND NOT EXISTS (SELECT 1 FROM battles bt WHERE bt.week = ? AND bt.category_id = p.category_id)
       ORDER BY c.sort, score DESC, p.released_on ASC, p.id`,
    )
    .bind(week, sunday, week)
    .all<{ id: number; category_id: number; category: string; maker: string | null; score: number }>();
  const byCat = new Map<number, typeof results>();
  for (const r of results) byCat.set(r.category_id, [...(byCat.get(r.category_id) ?? []), r]);
  const stmts: D1PreparedStatement[] = [];
  for (const [categoryId, items] of byCat) {
    if (items.length < 2) continue;
    const a = items[0];
    const b = items.find((x) => x.id !== a.id && x.maker !== a.maker) ?? items[1];
    stmts.push(
      db.prepare("INSERT OR IGNORE INTO battles(week, product_a, product_b, theme, category_id) VALUES (?, ?, ?, ?, ?)").bind(week, a.id, b.id, `${a.category}対決`, categoryId),
    );
  }
  if (stmts.length) await db.batch(stmts);
  return { created: stmts.length };
}

/** ページ表示時の保険：その週のバトルが 1 つも無いときだけ作る（通常は cron が作成） */
export async function ensureBattles(db: D1Database, week: string, sunday: string) {
  const exists = await db.prepare("SELECT 1 FROM battles WHERE week = ? LIMIT 1").bind(week).first();
  if (!exists) await generateWeeklyBattles(db, week, sunday);
}

export type BattleSide = { id: number; name: string; image_url: string | null; maker: string | null; votes: number };
export type Battle = { id: number; theme: string; genre: { slug: string; name: string; emoji: string } | null; a: BattleSide; b: BattleSide; total: number; mine: "a" | "b" | null };

export async function getBattles(db: D1Database, week: string, voterKey: string | null): Promise<Battle[]> {
  const { results } = await db
    .prepare(
      `SELECT bt.id, bt.theme, c.slug AS g_slug, c.name AS g_name, c.emoji AS g_emoji,
         pa.id AS a_id, pa.name AS a_name, pa.image_url AS a_img, ma.name AS a_maker,
         pb.id AS b_id, pb.name AS b_name, pb.image_url AS b_img, mb.name AS b_maker,
         (SELECT COUNT(*) FROM battle_votes v WHERE v.battle_id = bt.id AND v.choice = 'a') AS a_votes,
         (SELECT COUNT(*) FROM battle_votes v WHERE v.battle_id = bt.id AND v.choice = 'b') AS b_votes,
         (SELECT choice FROM battle_votes v WHERE v.battle_id = bt.id AND v.voter_key = ?) AS mine
       FROM battles bt
       JOIN products pa ON pa.id = bt.product_a LEFT JOIN makers ma ON ma.id = pa.maker_id
       JOIN products pb ON pb.id = bt.product_b LEFT JOIN makers mb ON mb.id = pb.maker_id
       LEFT JOIN categories c ON c.id = bt.category_id
       WHERE bt.week = ? ORDER BY c.sort, bt.id`,
    )
    .bind(voterKey ?? "", week)
    .all<Record<string, string | number | null>>();
  return results.map((r) => ({
    id: Number(r.id),
    theme: String(r.theme),
    genre: r.g_slug ? { slug: String(r.g_slug), name: String(r.g_name), emoji: String(r.g_emoji) } : null,
    a: { id: Number(r.a_id), name: String(r.a_name), image_url: r.a_img as string | null, maker: r.a_maker as string | null, votes: Number(r.a_votes) },
    b: { id: Number(r.b_id), name: String(r.b_name), image_url: r.b_img as string | null, maker: r.b_maker as string | null, votes: Number(r.b_votes) },
    total: Number(r.a_votes) + Number(r.b_votes),
    mine: (r.mine as "a" | "b" | null) ?? null,
  }));
}

/** 投票は 1 人 1 回・変更不可（既に投票済みなら false） */
export async function voteBattle(db: D1Database, battleId: number, voterKey: string, choice: "a" | "b") {
  const r = await db.prepare("INSERT OR IGNORE INTO battle_votes(battle_id, voter_key, choice) VALUES (?, ?, ?)").bind(battleId, voterKey, choice).run();
  return (r.meta.changes ?? 0) > 0;
}

// 未ログインの投票者を識別する匿名 Cookie（投票の重複防止のみに使用）
const COOKIE = "hk_bv";
export function battleVoterKey(request: Request, userId: string | null) {
  if (userId) return { key: `u:${userId}`, setCookie: null as string | null };
  const m = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f-]{36})`));
  if (m) return { key: `a:${m[1]}`, setCookie: null };
  const id = crypto.randomUUID();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return { key: `a:${id}`, setCookie: `${COOKIE}=${id}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; SameSite=Lax${secure}` };
}
