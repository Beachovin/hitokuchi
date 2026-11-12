import type { ProductRow } from "./db.server";
import { recommendFor } from "./recommend.server";
import { addDays, mondayOf, shortWeekLabel, todayJst } from "./weeks";

// 週1回の新商品ダイジェスト（メール）

export type Digest = { subject: string; weekLabel: string; releasing: ProductRow[]; recommended: ProductRow[]; weekCount: number; weekUrl: string };

export async function buildDigest(db: D1Database, userId: string, origin: string): Promise<Digest> {
  const week = mondayOf(todayJst());
  const sunday = addDays(week, 6);
  const [releasing, rec, count] = await Promise.all([
    db
      .prepare(
        `SELECT p.id, p.name, m.name AS maker, p.price, p.image_url, p.released_on, p.region, p.rating_avg, p.review_count
         FROM bookmarks b JOIN products p ON p.id = b.product_id LEFT JOIN makers m ON m.id = p.maker_id
         WHERE b.user_id = ? AND p.status = 'published' AND p.released_on BETWEEN ? AND ? ORDER BY p.released_on`,
      )
      .bind(userId, week, sunday)
      .all<ProductRow>(),
    recommendFor(db, userId, 6),
    db.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'published' AND released_on BETWEEN ? AND ?").bind(week, sunday).first<{ n: number }>(),
  ]);
  const label = shortWeekLabel(week, sunday);
  return {
    subject: `【ひとくち】${label}のコンビニ新商品${count?.n ?? 0}品`,
    weekLabel: label,
    releasing: releasing.results,
    recommended: rec.items,
    weekCount: count?.n ?? 0,
    weekUrl: `${origin}/weekly/${week}`,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** メール用 HTML（インライン CSS のみ） */
export function renderDigestHtml(d: Digest, origin: string, nickname: string) {
  const card = (p: ProductRow) => `
    <td style="width:50%;padding:6px;vertical-align:top">
      <a href="${origin}/products/${p.id}" style="display:block;text-decoration:none;color:#1c1917;background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:10px">
        ${p.image_url ? `<img src="${esc(p.image_url)}" alt="" width="100%" style="display:block;width:100%;height:140px;object-fit:contain;border-radius:8px">` : ""}
        <div style="font-size:11px;color:#78716c;margin-top:6px">${esc(p.maker ?? "")}</div>
        <div style="font-size:14px;font-weight:700;line-height:1.35">${esc(p.name)}</div>
        ${p.price ? `<div style="font-size:12px;color:#57534e;margin-top:4px">¥${p.price.toLocaleString("ja-JP")}${p.released_on ? ` ・ ${Number(p.released_on.slice(5, 7))}/${Number(p.released_on.slice(8))}発売` : ""}</div>` : ""}
      </a>
    </td>`;
  const grid = (items: ProductRow[]) => {
    const rows: string[] = [];
    for (let i = 0; i < items.length; i += 2) rows.push(`<tr>${card(items[i])}${items[i + 1] ? card(items[i + 1]) : "<td></td>"}</tr>`);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
  };
  const section = (title: string, items: ProductRow[]) =>
    items.length ? `<h2 style="font-size:17px;margin:28px 0 8px">${title}</h2>${grid(items)}` : "";
  return `<!doctype html><html lang="ja"><body style="margin:0;background:#fafaf9;font-family:-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <div style="font-size:20px;font-weight:900">💬 ひとくち</div>
    <div style="margin-top:16px;background:#1c1917;color:#fff;border-radius:20px;padding:24px">
      <div style="font-size:12px;letter-spacing:.2em;color:#fb923c;font-weight:700">WEEKLY DIGEST</div>
      <div style="font-size:22px;font-weight:900;margin-top:4px">${esc(d.weekLabel)}のコンビニ新商品</div>
      <div style="font-size:13px;color:#a8a29e;margin-top:6px">${esc(nickname)}さん、今週は ${d.weekCount} 品の新商品が登場します。</div>
      <a href="${d.weekUrl}" style="display:inline-block;margin-top:16px;background:#fff;color:#1c1917;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:999px">今週のまとめを見る →</a>
    </div>
    ${section("❤️ 「気になる」商品が今週発売", d.releasing)}
    ${section("✨ あなたへのおすすめ", d.recommended)}
    <p style="margin-top:28px;font-size:13px;color:#57534e">食べたら、星をタップするだけの「ひとこと口コミ」もどうぞ。発売3日以内の最初の口コミはファーストレビュー +5pt！</p>
    <p style="margin-top:24px;font-size:11px;color:#a8a29e">このメールは「ひとくち」でダイジェストの受け取りを設定した方にお送りしています。<br>
      配信の停止は <a href="${origin}/mypage#digest" style="color:#a8a29e">マイページ</a> から変更できます。</p>
  </div></body></html>`;
}

/** Resend API で送信（RESEND_API_KEY と DIGEST_FROM が設定されている場合のみ） */
export async function sendEmail(env: Env, to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY || !env.DIGEST_FROM) return { skipped: true as const };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.DIGEST_FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { skipped: false as const };
}

/** 月曜の cron から呼ぶ：受け取り設定済みのユーザーへ送信（同じ週に二重送信しない） */
export async function sendWeeklyDigests(env: Env, origin: string) {
  const week = mondayOf(todayJst());
  const { results } = await env.DB.prepare(
    "SELECT id, email, nickname FROM users WHERE digest_opt_in = 1 AND is_demo = 0 AND nickname IS NOT NULL AND (digest_last_sent IS NULL OR digest_last_sent < ?) LIMIT 500",
  )
    .bind(week)
    .all<{ id: string; email: string; nickname: string }>();
  let sent = 0;
  for (const u of results) {
    const d = await buildDigest(env.DB, u.id, origin);
    const r = await sendEmail(env, u.email, d.subject, renderDigestHtml(d, origin, u.nickname));
    if (r.skipped) return { sent, skipped: true };
    await env.DB.prepare("UPDATE users SET digest_last_sent = ? WHERE id = ?").bind(week, u.id).run();
    sent++;
  }
  return { sent, skipped: false };
}
