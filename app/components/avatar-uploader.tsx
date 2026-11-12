import { useRef, useState } from "react";
import { AVATAR_INPUT_MAX_BYTES, AVATAR_PX, AVATAR_STORE_MAX_BYTES, AVATAR_TARGET_BYTES, AVATAR_TYPES } from "~/lib/profile";

/**
 * プロフィール画像の選択。ブラウザ側で 512px の正方形にトリミング・縮小（WebP）してから送信するので、
 * 大きなスマホ写真でも軽くなる。サーバー側でも 5MB 上限と形式をチェックする。
 */
export function AvatarUploader({ current, nickname }: { current: string | null; nickname: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      setError("JPEG・PNG・WebP・GIF の画像を選んでください");
      e.target.value = "";
      return;
    }
    if (file.size > AVATAR_INPUT_MAX_BYTES) {
      setError("画像は 20MB 以下にしてください");
      e.target.value = "";
      return;
    }
    try {
      const resized = await compressAvatar(file);
      if (resized.size > AVATAR_STORE_MAX_BYTES) throw new Error("too large");
      const dt = new DataTransfer();
      dt.items.add(resized);
      e.target.files = dt.files;
      setPreview(URL.createObjectURL(resized));
    } catch {
      setError("この画像は読み込めませんでした。別の画像を選んでください");
      e.target.value = "";
    }
  }

  const shown = preview ?? current;
  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => input.current?.click()} className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full ring-2 ring-stone-200 dark:ring-white/10" aria-label="画像を選ぶ">
        {shown ? (
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-100 to-rose-100 text-2xl font-bold text-brand-600">{nickname.slice(0, 1)}</span>
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/40 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">変更</span>
      </button>
      <div className="min-w-0 text-sm">
        <input ref={input} type="file" name="avatar" accept={AVATAR_TYPES.join(",")} onChange={onChange} className="sr-only" />
        <button type="button" onClick={() => input.current?.click()} className="font-semibold text-brand-600 hover:underline">画像を選ぶ</button>
        <p className="mt-0.5 text-xs text-stone-400">JPEG・PNG・WebP・GIF（自動で小さくして保存します）</p>
        {preview && <p className="mt-0.5 text-xs text-emerald-600">「保存」で反映されます</p>}
        {error && <p className="mt-0.5 text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}

/**
 * プロフィール画像を正方形に切り抜いて 240px に縮小し、容量が目標以下になるまで画質を下げて圧縮する。
 * WebP を書き出せないブラウザ（古い Safari など）は JPEG にする。位置情報などのメタデータは残らない。
 */
async function compressAvatar(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(AVATAR_PX, side);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // 透過 PNG を JPEG にしたとき黒くならないように
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bmp.close();

  const encode = (type: string, q: number) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, q));
  const probe = await encode("image/webp", 0.8);
  const type = probe?.type === "image/webp" ? "image/webp" : "image/jpeg";
  let best: Blob | null = type === "image/webp" ? probe : null;
  for (const q of [0.8, 0.7, 0.6, 0.5]) {
    const b = q === 0.8 && best ? best : await encode(type, q);
    if (!b) continue;
    if (!best || b.size < best.size) best = b;
    if (b.size <= AVATAR_TARGET_BYTES) break;
  }
  if (!best) throw new Error("encode failed");
  return new File([best], type === "image/webp" ? "avatar.webp" : "avatar.jpg", { type });
}
