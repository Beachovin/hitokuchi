// ブラウザの保存領域（localStorage / sessionStorage）の安全な読み書き。
// プライベートブラウズや設定でブロックされていると例外になるので、失敗しても画面は動くようにする。

export function safeGet(store: Storage | undefined, key: string) {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSet(store: Storage | undefined, key: string, value: string) {
  try {
    store?.setItem(key, value);
  } catch {}
}
