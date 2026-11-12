import type { Route } from "./+types/sitemap";
import { listWeeks } from "~/lib/db.server";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;
  const origin = new URL(request.url).origin;
  const [{ results: products }, weeks] = await Promise.all([
    db.prepare("SELECT id, updated_at FROM products WHERE status = 'published' ORDER BY id DESC LIMIT 45000").all<{ id: number; updated_at: string }>(),
    listWeeks(db, 200),
  ]);
  const urls = [
    { loc: `${origin}/`, changefreq: "daily", priority: "1.0" },
    { loc: `${origin}/products`, changefreq: "daily", priority: "0.8" },
    { loc: `${origin}/weekly`, changefreq: "weekly", priority: "0.8" },
    ...weeks.map((w) => ({ loc: `${origin}/weekly/${w.week}`, changefreq: "weekly", priority: "0.7" })),
    ...products.map((p) => ({ loc: `${origin}/products/${p.id}`, lastmod: p.updated_at.slice(0, 10), changefreq: "weekly", priority: "0.6" })),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => `  <url><loc>${esc(u.loc)}</loc>${"lastmod" in u && u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`)
      .join("\n") +
    `\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
