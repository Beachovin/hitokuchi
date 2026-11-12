import { useEffect, useState } from "react";

/**
 * 確認付きの送信ボタン。window.confirm はアプリ内ブラウザや WebView で
 * 表示されない（常に「キャンセル」扱いになる）ことがあるため、画面内で確認する。
 * 1 回目のクリックで確認メッセージを表示し、「実行」で初めてフォームを送信する。
 */
export function ConfirmButton({
  children,
  message,
  confirmText = "実行する",
  name,
  value,
  className = "",
  disabled,
}: {
  children: React.ReactNode;
  message: string;
  confirmText?: string;
  name?: string;
  value?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) {
    return (
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {children}
      </button>
    );
  }
  return (
    <span role="alertdialog" aria-label="確認" className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30">
      <span className="font-semibold">{message}</span>
      <button type="submit" name={name} value={value} disabled={disabled} autoFocus className="rounded-lg bg-rose-600 px-3 py-1.5 font-bold text-white hover:bg-rose-500 disabled:opacity-50">
        {confirmText}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 font-semibold ring-1 ring-rose-200 hover:bg-white dark:ring-rose-500/30 dark:hover:bg-white/10">
        やめる
      </button>
    </span>
  );
}
