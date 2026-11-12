// コンビニ各社の新商品一覧ページから商品を取り出すアダプター
// どれも一覧ページ 1 回の取得で完結し、詳細ページは巡回しない（相手サーバーへの負荷を最小化）

export type RawItem = {
  externalId: string;      // 各社の商品コード等（再収集時の重複防止に使用）
  name: string;
  url: string;
  imageUrl: string | null;
  priceText: string | null; // 例: "258円（税込278.64円）"
  releaseText: string | null; // 例: "2026年11月10日（火）以降順次発売" / "2026.11.10" / "11/10"
  region: string | null;
  categoryText: string | null; // 各社サイト上のカテゴリ表記
  kcalText: string | null;
  description: string | null;
};

export type AdapterName = "seven" | "familymart" | "lawson" | "ministop" | "dailyyamazaki";

export type DetailInfo = { description: string | null; kcalText: string | null };

export type Adapter = {
  label: string;
  parse: (body: string, url: string) => RawItem[];
  /** 詳細ページから商品説明などを取り出す（一覧に説明があるサイトは不要） */
  detail?: (html: string) => DetailInfo;
};

export const ADAPTERS: Record<AdapterName, Adapter> = {
  seven: { label: "セブン-イレブン", parse: parseSeven, detail: detailSeven },
  familymart: { label: "ファミリーマート", parse: parseFamilyMart, detail: detailFamilyMart },
  lawson: { label: "ローソン", parse: parseLawson, detail: detailLawson },
  ministop: { label: "ミニストップ", parse: parseMinistop, detail: detailMinistop },
  dailyyamazaki: { label: "デイリーヤマザキ", parse: parseDailyYamazaki },
};

/** 説明文の整形：注記（※〜）を除き、長さを制限 */
export function cleanDescription(t: string | null) {
  if (!t) return null;
  const main = t.normalize("NFKC").split(/\s*※/)[0].replace(/\s+/g, " ").trim();
  return main.length >= 8 ? main.slice(0, 400) : null;
}

// ---------- 詳細ページ ----------
function detailSeven(html: string): DetailInfo {
  return {
    description: cleanDescription(text(first(html, /<div class="item_text">\s*<p>([\s\S]*?)<\/p>/))),
    kcalText: first(html, /熱量[:：]\s*([\d,.]+)\s*kcal/) ?? null,
  };
}
function detailFamilyMart(html: string): DetailInfo {
  return {
    description: cleanDescription(text(first(html, /<p class="ly-goods-lead">([\s\S]*?)<\/p>/))),
    kcalText: first(html, /熱量[^\d]{0,40}([\d,.]+)\s*kcal/) ?? null,
  };
}
function detailLawson(html: string): DetailInfo {
  const right = html.slice(html.indexOf('class="rightBlock"'));
  return {
    description: cleanDescription(text(first(right, /<p class="text">([\s\S]*?)<\/p>/))),
    kcalText: first(right, /([\d,.]+)\s*kcal/) ?? null,
  };
}
function detailMinistop(html: string): DetailInfo {
  return {
    description: cleanDescription(text(first(html, /<dt>商品特徴<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/))),
    kcalText: first(html, /([\d,.]+)\s*kcal/) ?? null,
  };
}

// ---------- helpers ----------

export function decodeEntities(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/** タグを除去してテキスト化 */
export function text(html: string | undefined | null) {
  if (!html) return null;
  const t = decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/[\s　]+/g, " ").trim();
  return t || null;
}

const abs = (href: string | undefined | null, base: string) => {
  if (!href) return null;
  try {
    return new URL(decodeEntities(href), base).href;
  } catch {
    return null;
  }
};

/** class 名を含む要素ブロックを、次の同種ブロックの手前まで切り出す */
function blocks(html: string, startPattern: RegExp) {
  const starts = [...html.matchAll(new RegExp(startPattern.source, "g"))].map((m) => m.index!);
  return starts.map((s, i) => html.slice(s, starts[i + 1] ?? s + 6000));
}

const first = (s: string, re: RegExp) => s.match(re)?.[1];

// ---------- セブン-イレブン ----------
// <div class="list_inner -item-code-041748"> … item_ttl / item_price / item_launch / item_region
function parseSeven(html: string, base: string): RawItem[] {
  const seen = new Map<string, RawItem>();
  for (const b of blocks(html, /<div class="list_inner -item-code-(\d+)/)) {
    const code = first(b, /-item-code-(\d+)/);
    const name = text(first(b, /class="item_ttl"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/));
    if (!code || !name) continue;
    const region = text(first(b, /class="item_region"[\s\S]*?<\/span>([\s\S]*?)<\/p>/));
    const existing = seen.get(code);
    if (existing) {
      // 同じ商品が地域ごとに掲載されているので販売地域をまとめる
      if (region && existing.region && !existing.region.includes(region)) existing.region += `、${region}`;
      continue;
    }
    const href = first(b, /class="item_ttl"[\s\S]*?href="([^"]+)"/);
    seen.set(code, {
      externalId: code,
      name,
      url: abs(href?.replace(/\/[a-z]+\/?$/, "/"), base) ?? base,
      imageUrl: abs(first(b, /data-original="([^"]+)"/) ?? first(b, /<img[^>]*src="([^"]+)"/), base),
      priceText: text(first(b, /class="item_price"[^>]*>([\s\S]*?)<\/div>/)),
      releaseText: text(first(b, /class="item_launch"[^>]*>([\s\S]*?)<\/div>/)),
      region,
      categoryText: null,
      kcalText: null,
      description: null,
    });
  }
  return [...seen.values()];
}

// ---------- ファミリーマート ----------
// 見出し「今週の新商品 (11/10～11/16)」+ <div class="ly-mod-infoset3"> …
function parseFamilyMart(html: string, base: string): RawItem[] {
  const week = text(first(html, /class="ly-mod-ttl-l ly-link-week"[^>]*>([\s\S]*?)<p/)); // "今週の新商品 (11/10～11/16)"
  const weekStart = week?.match(/(\d{1,2}\/\d{1,2})/)?.[1] ?? null;
  const out: RawItem[] = [];
  for (const b of blocks(html, /<div class="ly-mod-infoset3 /)) {
    const href = first(b, /<a href="([^"]+)" class="ly-mod-infoset3-link"/);
    const name = text(first(b, /class="ly-mod-infoset3-ttl"[^>]*>([\s\S]*?)<\/h3>/));
    if (!href || !name) continue;
    const id = href.match(/(\d{5,})\.html/)?.[1] ?? href;
    out.push({
      externalId: id,
      name,
      url: abs(href, base)!,
      imageUrl: abs(first(b, /<img src="([^"]+)"/), base),
      priceText: text(first(b, /class="ly-mod-infoset3-txt"[^>]*>([\s\S]*?)<\/p>/)),
      releaseText: weekStart,
      region: text(first(b, /発売地域：([\s\S]*?)<\/p>/)),
      categoryText: text(first(b, /class="ly-mod-infoset3-cate"[^>]*>([\s\S]*?)<\/p>/)),
      kcalText: null,
      description: null,
    });
  }
  return dedupe(out);
}

// ---------- ローソン ----------
// <li><a href="/recommend/original/detail/…"> p.ttl / 1個当たり291kcal / p.price / p.date
function parseLawson(html: string, base: string): RawItem[] {
  const out: RawItem[] = [];
  for (const m of html.matchAll(/<li>\s*<a href="([^"]*\/detail\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/g)) {
    const [, href, b] = m;
    const name = text(first(b, /<p class="ttl">([\s\S]*?)<\/p>/));
    if (!name) continue;
    out.push({
      externalId: href.match(/detail\/([^/.]+)\.html/)?.[1] ?? href,
      name,
      url: abs(href, base)!,
      imageUrl: abs(first(b, /<img src="([^"]+)"/), base),
      priceText: text(first(b, /<p class="price">([\s\S]*?)<\/p>/)),
      releaseText: text(first(b, /<p class="date">([\s\S]*?)<\/p>/)),
      region: text(first(b, /<li>(※[\s\S]*?)<\/li>/)),
      categoryText: null,
      kcalText: first(b, /([\d,.]+)\s*kcal/) ?? null,
      description: null,
    });
  }
  return dedupe(out);
}

// ---------- ミニストップ ----------
// /syohin/js/recommend.json（サイト自身が一覧描画に使っている JSON）
function parseMinistop(body: string, base: string): RawItem[] {
  let data: { title?: string; price?: string; image?: string; link?: string; region?: string; release?: string }[];
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  return dedupe(
    data
      .filter((d) => d.title)
      .map((d) => ({
        externalId: d.link?.match(/detail(\d+)/)?.[1] ?? d.title!,
        name: text(d.title)!,
        url: abs(d.link, base) ?? "https://www.ministop.co.jp/syohin/",
        imageUrl: abs(d.image, base),
        priceText: text(d.price),
        releaseText: d.release ?? null,
        region: d.region ?? null,
        categoryText: null,
        kcalText: null,
        description: null,
      })),
  );
}

// ---------- デイリーヤマザキ ----------
// <section class="c-products-list-sec"><a href="#product134750"> … 詳細はモーダル <div id="product134750">
function parseDailyYamazaki(html: string, base: string): RawItem[] {
  const out: RawItem[] = [];
  for (const b of blocks(html, /<section class="c-products-list-sec">/)) {
    const id = first(b, /href="#product(\d+)"/);
    const name = text(first(b, /<h3 class="ttl"[^>]*>([\s\S]*?)<\/h3>/));
    if (!id || !name) continue;
    const modal = html.slice(html.indexOf(`id="product${id}"`), html.indexOf(`id="product${id}"`) + 5000);
    out.push({
      externalId: id,
      name,
      url: `${base.split("#")[0]}#product${id}`,
      imageUrl: abs(first(b, /<figure class="pic"[^>]*><img src="([^"]+)"/), base),
      priceText: text(first(b, /<p class="price">([\s\S]*?)<\/p>/)),
      releaseText: null,
      region: null,
      categoryText: text(first(b, /<ul class="cate[^"]*">[\s\S]*?alt="([^"]+)"/)),
      kcalText: null,
      description: cleanDescription(text(first(modal, /<p class="txt01">([\s\S]*?)<\/p>/))),
    });
  }
  return dedupe(out);
}

function dedupe(items: RawItem[]) {
  const m = new Map<string, RawItem>();
  for (const it of items) if (!m.has(it.externalId)) m.set(it.externalId, it);
  return [...m.values()];
}
