// 簡易 NG ワード判定。引っかかったレビューは flagged にして管理画面で確認する
const NG_WORDS = ["死ね", "殺す", "http://", "https://", "LINE ID", "副業"];

export function needsReview(text: string) {
  return NG_WORDS.some((w) => text.includes(w));
}
