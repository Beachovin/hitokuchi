// 楽天アフィリエイトの画像広告（バナー・モーションウィジェット）のコードの検査と表示用の整形。
// 管理者が楽天の管理画面からコピーしたコードを、サイト本体から切り離した iframe の中で動かす。

/** 楽天の広告コードの長さの上限 */
export const RAKUTEN_AD_MAX_LENGTH = 6000;

/** 広告コードの中で読み込みを許すドメイン（楽天と、その画像配信） */
const ALLOWED_HOSTS = [/(^|\.)rakuten\.co\.jp$/, /(^|\.)rakuten\.com$/, /(^|\.)r10s\.jp$/, /(^|\.)rakuten-static\.com$/];

/** 楽天以外のものが紛れていないかを確認する。問題があれば理由を返す */
export function validateRakutenAdCode(raw: string): { code: string } | { error: string } {
  const code = raw.trim();
  if (!code) return { code: "" };
  if (code.length > RAKUTEN_AD_MAX_LENGTH) return { error: `コードが長すぎます（${RAKUTEN_AD_MAX_LENGTH.toLocaleString()} 文字まで）` };
  if (!/rakuten/i.test(code)) return { error: "楽天アフィリエイトの広告コードを貼り付けてください" };
  if (/<\s*(iframe|object|embed|form|meta|base|link)\b/i.test(code)) return { error: "このコードには使えない要素が含まれています（iframe / form など）" };
  if (/javascript:|data:text|on\w+\s*=/i.test(code)) return { error: "このコードには使えない記述が含まれています" };
  const urls = [...code.matchAll(/(?:https?:)?\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  if (!urls.length) return { error: "広告のリンク先が見つかりません。楽天の画面からコードをそのままコピーしてください" };
  const bad = urls.find((h) => !ALLOWED_HOSTS.some((re) => re.test(h)));
  if (bad) return { error: `楽天以外のサイト（${bad}）を読み込むコードは使えません` };
  return { code };
}

/** 広告の大きさ。モーションウィジェットの rakuten_size="300x250" や、画像の width / height から読み取る */
export function rakutenAdSize(code: string): { width: number; height: number } {
  const widget = code.match(/rakuten_size\s*=\s*["'](\d{2,4})x(\d{2,4})["']/i);
  if (widget) return { width: Number(widget[1]), height: Number(widget[2]) };
  const w = code.match(/\bwidth\s*=\s*["']?(\d{2,4})/i);
  const h = code.match(/\bheight\s*=\s*["']?(\d{2,4})/i);
  if (w && h) return { width: Number(w[1]), height: Number(h[1]) };
  return { width: 300, height: 250 };
}

/** iframe に入れる HTML。リンクは新しいタブで開く */
export function rakutenAdDocument(code: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}img{max-width:100%;height:auto}</style></head><body>${code}</body></html>`;
}
