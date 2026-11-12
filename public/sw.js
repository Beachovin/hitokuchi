/*
 * ひとくち Service Worker
 *
 * 方針（普段のサイトに影響を出さないための安全設計）
 *  - ページ（HTML）とデータ（.data / API）はキャッシュしない。常にネットワークから最新を取得し、
 *    オフラインのときだけ /offline.html を表示する。
 *  - キャッシュするのは、ファイル名にハッシュが付いた静的ファイル（/assets/*）とアイコン類のみ。
 *  - 管理画面・ログイン・API・POST などは一切触らない（ブラウザにそのまま任せる）。
 *  - 外部サイト（商品画像の配信元・フォント）は触らない。
 *
 * 緊急停止：KILL_SWITCH を true にしてデプロイすると、全ユーザーの SW が自分自身を解除する。
 */
const KILL_SWITCH = false;
const VERSION = "v1";
const STATIC_CACHE = `hitokuchi-static-${VERSION}`;
const IMG_CACHE = `hitokuchi-img-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/favicon.svg", "/icons/icon-192.png", "/manifest.webmanifest"];
const BYPASS = [/^\/admin/, /^\/auth\//, /^\/api\//, /^\/login/, /^\/sitemap\.xml/, /^\/robots\.txt/, /^\/ads\.txt/, /^\/sw\.js/];
const IMG_LIMIT = 200;

self.addEventListener("install", (event) => {
  if (KILL_SWITCH) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = KILL_SWITCH ? [] : [STATIC_CACHE, IMG_CACHE];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      if (KILL_SWITCH) {
        await self.registration.unregister();
        for (const client of await self.clients.matchAll()) client.navigate(client.url);
        return;
      }
      await self.clients.claim();
    })(),
  );
});

// ページ側の「更新する」ボタンから新しい版をすぐ有効にする
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (KILL_SWITCH) return;
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.some((re) => re.test(url.pathname))) return;

  // ページ遷移：ネットワーク優先・キャッシュしない・オフライン時だけ案内ページ
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // ハッシュ付きの静的ファイル：キャッシュ優先（内容が変わればファイル名も変わる）
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname === "/favicon.svg") {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // アップロード画像（プロフィール画像・口コミ写真）：キャッシュ優先、件数上限あり
  if (url.pathname.startsWith("/img/")) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
          const keys = await cache.keys();
          for (const k of keys.slice(0, Math.max(0, keys.length - IMG_LIMIT))) await cache.delete(k);
        }
        return res;
      }),
    );
  }
  // それ以外（.data・manifest 等）はブラウザに任せる
});
