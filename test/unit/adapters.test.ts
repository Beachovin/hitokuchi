import { describe, expect, it } from "vitest";
import { ADAPTERS, cleanDescription, decodeEntities, text } from "../../workers/scrape/adapters";

// 各社の一覧ページの構造を最小限に再現した HTML。ページ構造が変わったときに気づけるよう、
// 実物から「アダプターが頼っている class 名・並び」だけを抜き出している。

describe("セブン-イレブン", () => {
  const html = `
    <div class="list_inner -item-code-041748"><div class="item_ttl"><p><a href="/products/a/item/041748/kanto/">もちもち&amp;どら焼き</a></p></div>
      <figure><img data-original="//img.7api-01.dp1.sej.co.jp/item-image/041748/A.jpg"></figure>
      <div class="item_price"><p>258円（税込278.64円）</p></div><div class="item_launch"><p>2026年11月10日（火）以降順次発売</p></div>
      <div class="item_region"><p><span>販売地域：</span>関東</p></div></div>
    <div class="list_inner -item-code-041748"><div class="item_ttl"><p><a href="/products/a/item/041748/tokai/">もちもち&amp;どら焼き</a></p></div>
      <div class="item_region"><p><span>販売地域：</span>東海</p></div></div>
    <div class="list_inner -item-code-041800"><div class="item_ttl"><p><a href="/products/a/item/041800/">辛ねぎ味噌ラーメン</a></p></div>
      <div class="item_price"><p>550円（税込594円）</p></div></div>`;
  const items = ADAPTERS.seven.parse(html, "https://www.sej.co.jp/products/a/thisweek/");

  it("商品を取り出し、地域違いの同じ商品は 1 件にまとめる", () => {
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ externalId: "041748", name: "もちもち&どら焼き", priceText: "258円（税込278.64円）", region: "関東、東海" });
  });
  it("画像・リンクは絶対 URL にする", () => {
    expect(items[0].imageUrl).toBe("https://img.7api-01.dp1.sej.co.jp/item-image/041748/A.jpg");
    expect(items[0].url).toBe("https://www.sej.co.jp/products/a/item/041748/");
  });
  it("詳細ページから説明とカロリーを取り出す", () => {
    const d = ADAPTERS.seven.detail!(`<div class="item_text"><p>北海道産小豆を使ったどら焼きです。※地域により内容が異なります。</p></div><td>熱量：291kcal</td>`);
    expect(d).toEqual({ description: "北海道産小豆を使ったどら焼きです。", kcalText: "291" });
  });
});

describe("ファミリーマート", () => {
  const html = `<h2 class="ly-mod-ttl-l ly-link-week">今週の新商品 (11/10～11/16)<p>x</p></h2>
    <div class="ly-mod-infoset3 js-x"><a href="/goods/dessert/0123456.html" class="ly-mod-infoset3-link">
      <p class="ly-mod-infoset3-img"><img src="/content/dam/goods/0123456.jpg"></p>
      <p class="ly-mod-infoset3-cate">デザート</p><h3 class="ly-mod-infoset3-ttl">コグマシュークリーム</h3>
      <p class="ly-mod-infoset3-txt">230円（税込248円）</p><p>発売地域：全国</p></a></div>`;
  const items = ADAPTERS.familymart.parse(html, "https://www.family.co.jp/goods/newgoods.html");
  it("週の開始日を発売日として使う", () => {
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ externalId: "0123456", name: "コグマシュークリーム", releaseText: "11/10", categoryText: "デザート", region: "全国" });
    expect(items[0].url).toBe("https://www.family.co.jp/goods/dessert/0123456.html");
  });
});

describe("ローソン", () => {
  const html = `<ul><li><a href="/recommend/original/detail/1512345_1996.html"><p class="img"><img src="/recommend/original/detail/img/l812345.jpg"></p>
    <p class="ttl">どらもっち あんこ&amp;ホイップ</p><p>1個当たり291kcal</p><p class="price"><span>235</span>円(税込)</p><p class="date">2026.11.10</p></a></li></ul>`;
  const items = ADAPTERS.lawson.parse(html, "https://www.lawson.co.jp/recommend/new/");
  it("商品名・価格・発売日・カロリーを取り出す", () => {
    expect(items[0]).toMatchObject({ externalId: "1512345_1996", name: "どらもっち あんこ&ホイップ", releaseText: "2026.11.10", kcalText: "291" });
    expect(items[0].priceText).toContain("235");
  });
});

describe("ミニストップ（公開 JSON）", () => {
  it("JSON から取り出す", () => {
    const items = ADAPTERS.ministop.parse(JSON.stringify([{ title: "キャラメルパフェ", price: "398円(税込429.84円)", image: "/syohin/img/a.jpg", link: "/syohin/sweets/detail123.html", region: "全国", release: "2026/11/07" }, { price: "タイトルなし" }]), "https://www.ministop.co.jp/syohin/js/recommend.json");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ externalId: "123", name: "キャラメルパフェ", releaseText: "2026/11/07" });
  });
  it("JSON が壊れていても落ちず 0 件を返す", () => expect(ADAPTERS.ministop.parse("<html>メンテナンス中</html>", "https://www.ministop.co.jp/")).toEqual([]));
});

describe("デイリーヤマザキ", () => {
  const html = `<section class="c-products-list-sec"><a href="#product134750"><figure class="pic"><img src="/upload/134750.jpg"></figure>
    <ul class="cate"><li><img alt="パン"></li></ul><h3 class="ttl">ダブルチョコロールパン</h3><p class="price">税込 180円</p></a></section>
    <div id="product134750"><p class="txt01">チョコクリームをたっぷり包んだロールパンです。</p></div>`;
  const items = ADAPTERS.dailyyamazaki.parse(html, "https://www.daily-yamazaki.jp/new/");
  it("一覧とモーダルの説明を組み合わせる", () => {
    expect(items[0]).toMatchObject({ externalId: "134750", name: "ダブルチョコロールパン", categoryText: "パン", description: "チョコクリームをたっぷり包んだロールパンです。" });
    expect(items[0].url).toBe("https://www.daily-yamazaki.jp/new/#product134750");
  });
});

describe("共通処理", () => {
  it("ページ構造が変わって何も取れないときは 0 件（＝収集エラーとして検知される）", () => {
    for (const a of Object.values(ADAPTERS)) expect(a.parse("<html><body>リニューアルしました</body></html>", "https://example.test/")).toEqual([]);
  });
  it("HTML の実体参照を戻し、タグを取り除く", () => {
    expect(decodeEntities("A&amp;B &lt;C&gt; &#12354;")).toBe("A&B <C> あ");
    expect(text("<p>こんにちは<br>世界</p>")).toBe("こんにちは 世界");
    expect(text("  ")).toBeNull();
  });
  it("説明文は注記（※）を除き、短すぎるものは捨てる", () => {
    expect(cleanDescription("ふんわり食感のケーキです。※画像はイメージです。")).toBe("ふんわり食感のケーキです。");
    expect(cleanDescription("新商品")).toBeNull();
    expect(cleanDescription("あ".repeat(500))).toHaveLength(400);
  });
});
