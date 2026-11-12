import { describe, expect, it } from "vitest";
import { rakutenAdDocument, rakutenAdSize, validateRakutenAdCode } from "~/lib/rakuten-ad";

// 楽天アフィリエイトの画面で作られるコードの形（ID はダミー）
const WIDGET = `<!-- Rakuten Widget FROM HERE --><script type="text/javascript">rakuten_design="slide";rakuten_affiliateId="0000000a.00000000.0000000b.00000000";rakuten_items="ctsmatch";rakuten_genreId="0";rakuten_size="300x250";rakuten_target="_blank";rakuten_theme="gray";rakuten_border="off";rakuten_auto_mode="on";rakuten_genre_title="off";rakuten_recommend="on";rakuten_ts="1731400000000";</script><script type="text/javascript" src="https://xml.affiliate.rakuten.co.jp/widget/js/rakuten_widget.js?20230106"></script><!-- Rakuten Widget TO HERE -->`;
const BANNER = `<a href="https://hb.afl.rakuten.co.jp/hsc/0000000c.00000000.0000000a.00000000/?link_type=pict&ut=xxx" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;"><img src="https://hbb.afl.rakuten.co.jp/hsb/0000000c.00000000.0000000a.00000000/?me_id=1&me_adv_id=1&t=pict" border="0" style="margin:2px" alt="" title=""></a>`;
const BANNER_SIZED = `<a href="https://hb.afl.rakuten.co.jp/hsc/x/" target="_blank"><img src="https://thumbnail.image.rakuten.co.jp/a.jpg" width="728" height="90"></a>`;

describe("楽天の広告コードの検査", () => {
  it("モーションウィジェットとバナーのコードは受け付ける", () => {
    expect(validateRakutenAdCode(WIDGET)).toEqual({ code: WIDGET });
    expect(validateRakutenAdCode(`  ${BANNER}\n`)).toEqual({ code: BANNER });
    expect(validateRakutenAdCode(BANNER_SIZED)).toHaveProperty("code");
  });
  it("空欄は「広告なし」として受け付ける", () => expect(validateRakutenAdCode("   ")).toEqual({ code: "" }));
  it("楽天以外のサイトを読み込むコードは拒否する", () => {
    expect(validateRakutenAdCode(`${WIDGET}<script src="https://evil.example/x.js"></script>`)).toHaveProperty("error");
    expect(validateRakutenAdCode(`<a href="https://hb.afl.rakuten.co.jp.evil.example/"><img src="https://rakuten.co.jp/a.png"></a>`)).toHaveProperty("error");
  });
  it("楽天のコードでないもの・危険な記述は拒否する", () => {
    expect(validateRakutenAdCode("<p>こんにちは</p>")).toHaveProperty("error");
    expect(validateRakutenAdCode(`<img src="https://thumbnail.image.rakuten.co.jp/a.jpg" onerror="alert(1)">`)).toHaveProperty("error");
    expect(validateRakutenAdCode(`<a href="javascript:alert(1)">rakuten</a>`)).toHaveProperty("error");
    expect(validateRakutenAdCode(`<iframe src="https://rakuten.co.jp/"></iframe>`)).toHaveProperty("error");
    expect(validateRakutenAdCode(`<form action="https://rakuten.co.jp/"></form>`)).toHaveProperty("error");
  });
  it("長すぎるコードは拒否する", () => expect(validateRakutenAdCode(WIDGET + " ".repeat(10) + "a".repeat(6000))).toHaveProperty("error"));
});

describe("広告の大きさ", () => {
  it("ウィジェットは rakuten_size から読む", () => expect(rakutenAdSize(WIDGET)).toEqual({ width: 300, height: 250 }));
  it("バナーは画像の width / height から読む", () => expect(rakutenAdSize(BANNER_SIZED)).toEqual({ width: 728, height: 90 }));
  it("分からなければ 300×250", () => expect(rakutenAdSize(BANNER)).toEqual({ width: 300, height: 250 }));
});

describe("iframe の中身", () => {
  it("リンクは新しいタブで開き、コードをそのまま入れる", () => {
    const doc = rakutenAdDocument(BANNER);
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain(BANNER);
  });
});
