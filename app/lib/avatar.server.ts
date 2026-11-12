import { AVATAR_STORE_MAX_BYTES, AVATAR_TYPES } from "./profile";

// アップロードされた画像の先頭バイトで形式を確認（拡張子や Content-Type の偽装対策）
function sniff(b: Uint8Array) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** プロフィール画像を R2 に保存し、古い画像を削除する。キーはユーザー ID を含まないランダム値 */
export async function saveAvatar(env: Env, userId: string, oldKey: string | null, file: File) {
  if (file.size === 0) return { error: "画像を選んでください" };
  if (file.size > AVATAR_STORE_MAX_BYTES) return { error: "画像を縮小できませんでした。別の画像を選ぶか、ブラウザを更新してもう一度お試しください" };
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type || !AVATAR_TYPES.includes(type)) return { error: "JPEG・PNG・WebP・GIF の画像を選んでください" };
  const key = `avatars/${crypto.randomUUID()}.${type.split("/")[1]}`;
  await env.IMAGES.put(key, buf, { httpMetadata: { contentType: type } });
  await env.DB.prepare("UPDATE users SET avatar_key = ? WHERE id = ?").bind(key, userId).run();
  if (oldKey) await env.IMAGES.delete(oldKey);
  return { key };
}

export async function removeAvatar(env: Env, userId: string, oldKey: string | null) {
  await env.DB.prepare("UPDATE users SET avatar_key = NULL WHERE id = ?").bind(userId).run();
  if (oldKey) await env.IMAGES.delete(oldKey);
}
