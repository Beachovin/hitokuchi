import { useState } from "react";
import { compressImage, IMAGE_TYPES, REVIEW_IMAGE_INPUT_MAX_BYTES, REVIEW_IMAGE_PX, REVIEW_IMAGE_STORE_MAX_BYTES, REVIEW_IMAGE_TARGET_BYTES } from "~/lib/image";

/**
 * 口コミ写真の入力。選んだ画像を端末側で縮小・圧縮してから送る
 * （スマホ写真 3〜8MB → 長辺 1280px・約 200KB 以下。位置情報なども落ちる）。
 */
export function PhotoInput({ error }: { error?: string }) {
  const [local, setLocal] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLocal(null);
    setNote(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reject = (msg: string) => {
      setLocal(msg);
      e.target.value = "";
    };
    if (!IMAGE_TYPES.includes(file.type)) return reject("JPEG・PNG・WebP・GIF の画像を選んでください");
    if (file.size > REVIEW_IMAGE_INPUT_MAX_BYTES) return reject("画像は 20MB 以下にしてください");
    try {
      const out = await compressImage(file, { maxPx: REVIEW_IMAGE_PX, targetBytes: REVIEW_IMAGE_TARGET_BYTES });
      if (out.size > REVIEW_IMAGE_STORE_MAX_BYTES) throw new Error("too large");
      const dt = new DataTransfer();
      dt.items.add(out);
      e.target.files = dt.files;
      setNote(`${Math.max(1, Math.round(out.size / 1024))}KB に圧縮しました`);
    } catch {
      reject("この画像は読み込めませんでした。別の画像を選んでください");
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold" htmlFor="image">写真（任意・自動で小さくして保存します）</label>
      <input
        id="image"
        name="image"
        type="file"
        accept={IMAGE_TYPES.join(",")}
        onChange={onChange}
        className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-stone-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white dark:file:bg-white dark:file:text-stone-900"
      />
      {note && <p className="mt-1 text-xs text-emerald-600">{note}</p>}
      {(local ?? error) && <p className="mt-1 text-xs text-rose-600">{local ?? error}</p>}
    </div>
  );
}
