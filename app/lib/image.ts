// 画像まわりの共通処理（サーバー・ブラウザ両方で使える純粋な関数と、ブラウザ用の圧縮）

/** 受け付ける画像形式。SVG はスクリプトを含められるため受け付けない */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** 先頭バイトから画像形式を判定する（拡張子や Content-Type の偽装対策）。画像でなければ null */
export function sniffImage(b: Uint8Array): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** 口コミ写真：選べる元画像の上限／保存する上限／長辺の大きさ／圧縮の目標 */
export const REVIEW_IMAGE_INPUT_MAX_BYTES = 20 * 1024 * 1024;
export const REVIEW_IMAGE_STORE_MAX_BYTES = 600 * 1024;
export const REVIEW_IMAGE_PX = 1280;
export const REVIEW_IMAGE_TARGET_BYTES = 200 * 1024;

export type CompressOptions = {
  /** 出力の最大辺（px） */
  maxPx: number;
  /** true なら中央を正方形に切り抜く（プロフィール画像用） */
  square?: boolean;
  /** この容量を下回るまで画質を段階的に下げる */
  targetBytes: number;
};

/**
 * ブラウザで画像を縮小・再圧縮する（WebP。書き出せないブラウザは JPEG）。
 * 再エンコードするので位置情報などのメタデータは残らない。
 */
export async function compressImage(file: File, o: CompressOptions): Promise<File> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const sw = o.square ? side : bmp.width;
  const sh = o.square ? side : bmp.height;
  const scale = Math.min(1, o.maxPx / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // 透過 PNG を JPEG にしたとき黒くならないように
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  bmp.close();

  const encode = (type: string, q: number) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, q));
  const probe = await encode("image/webp", 0.8);
  const type = probe?.type === "image/webp" ? "image/webp" : "image/jpeg";
  let best: Blob | null = type === "image/webp" ? probe : null;
  for (const q of [0.8, 0.7, 0.6, 0.5]) {
    const b = q === 0.8 && best ? best : await encode(type, q);
    if (!b) continue;
    if (!best || b.size < best.size) best = b;
    if (b.size <= o.targetBytes) break;
  }
  if (!best) throw new Error("encode failed");
  return new File([best], type === "image/webp" ? "image.webp" : "image.jpg", { type });
}
