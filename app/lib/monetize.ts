import { useRouteLoaderData } from "react-router";
import type { PublicSettings } from "./settings.server";

/** root の loader が返す広告・アフィリエイト設定を取得 */
export function usePublicSettings(): PublicSettings | undefined {
  return useRouteLoaderData<{ publicSettings: PublicSettings }>("root")?.publicSettings;
}

// ネット通販で買える可能性が高いカテゴリだけアフィリエイトを出す
// （チルドスイーツ・弁当・パンなどコンビニ限定品が中心のカテゴリは対象外）
const AFFILIATE_CATEGORIES = new Set(["snack", "chocolate", "drink", "noodle"]);

export function affiliateLinks(s: PublicSettings | undefined, query: string, categorySlug: string | null) {
  if (!s || !categorySlug || !AFFILIATE_CATEGORIES.has(categorySlug)) return [];
  const q = encodeURIComponent(query);
  const links: { label: string; href: string; className: string }[] = [];
  if (s.amazon_tag) {
    links.push({
      label: "Amazonで探す",
      href: `https://www.amazon.co.jp/s?k=${q}&tag=${encodeURIComponent(s.amazon_tag)}`,
      className: "bg-[#ff9900] text-stone-900 hover:brightness-105",
    });
  }
  if (s.rakuten_affiliate_id) {
    const target = `https://search.rakuten.co.jp/search/mall/${q}/`;
    links.push({
      label: "楽天市場で探す",
      href: `https://hb.afl.rakuten.co.jp/hgc/${encodeURIComponent(s.rakuten_affiliate_id)}/?pc=${encodeURIComponent(target)}&m=${encodeURIComponent(target)}`,
      className: "bg-[#bf0000] text-white hover:brightness-110",
    });
  }
  return links;
}
