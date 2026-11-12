import { ConfirmButton } from "~/components/confirm-button";
import { useEffect, useRef, useState } from "react";
import { Form, Link, data, redirect, useFetcher } from "react-router";
import type { Route } from "./+types/feature-edit";
import { audit, requireAdmin } from "~/lib/admin.server";
import { getCustomFeature } from "~/lib/custom-features.server";
import { FEATURE_EMOJIS, THEMES, themeGradient } from "~/lib/features";
import { PageTitle, btn, input } from "~/components/admin-ui";

type Item = { id: number; name: string; maker: string | null; image_url: string | null; released_on: string | null; category_emoji: string | null };

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const r = await getCustomFeature(env.DB, { id: Number(params.id) });
  if (!r) throw data(null, { status: 404 });
  return {
    feature: r.feature,
    items: r.items.map((p): Item => ({ id: p.id, name: p.name, maker: p.maker, image_url: p.image_url, released_on: p.released_on, category_emoji: p.category_emoji })),
  };
}

const RESERVED = new Set(["region"]);

export async function action({ params, request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const id = Number(params.id);
  const form = await request.formData();
  if (form.get("intent") === "delete") {
    await env.DB.prepare("DELETE FROM features WHERE id = ?").bind(id).run();
    await audit(env, request, admin, "feature.delete", `feature:${id}`);
    throw redirect("/admin/features");
  }
  let payload: { title: string; lead: string; slug: string; emoji: string; theme: string; status: string; items: number[] };
  try {
    payload = JSON.parse(String(form.get("payload")));
  } catch {
    return data({ ok: false as const, error: "保存データが不正です" }, { status: 400 });
  }
  const title = payload.title.trim().slice(0, 40);
  const slug = payload.slug.trim().toLowerCase();
  if (!title) return data({ ok: false as const, error: "タイトルを入力してください" }, { status: 400 });
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug) || RESERVED.has(slug)) return data({ ok: false as const, error: "URL は半角英小文字・数字・ハイフン（2〜41文字）で、既存の特集と重ならないものにしてください" }, { status: 400 });
  const dup = await env.DB.prepare("SELECT 1 FROM features WHERE slug = ? AND id != ?").bind(slug, id).first();
  if (dup) return data({ ok: false as const, error: "この URL は他の特集で使われています" }, { status: 409 });
  const items = [...new Set(payload.items.map(Number).filter(Number.isInteger))].slice(0, 100);
  const status = payload.status === "published" ? "published" : "draft";
  if (status === "published" && items.length === 0) return data({ ok: false as const, error: "公開するには商品を1つ以上追加してください" }, { status: 400 });
  await env.DB.batch([
    env.DB.prepare("UPDATE features SET title = ?, lead = ?, slug = ?, emoji = ?, theme = ?, status = ?, updated_at = datetime('now') WHERE id = ?").bind(
      title,
      payload.lead.trim().slice(0, 120),
      slug,
      [...payload.emoji].slice(0, 2).join("") || "🍙",
      THEMES.some((t) => t.id === payload.theme) ? payload.theme : "sunset",
      status,
      id,
    ),
    env.DB.prepare("DELETE FROM feature_items WHERE feature_id = ?").bind(id),
    ...items.map((pid, i) => env.DB.prepare("INSERT INTO feature_items(feature_id, product_id, position) SELECT ?, id, ? FROM products WHERE id = ?").bind(id, i, pid)),
  ]);
  await audit(env, request, admin, "feature.update", `feature:${id}`, { title, status, items: items.length });
  return { ok: true as const, savedAt: Date.now() };
}

export default function FeatureEditor({ loaderData }: Route.ComponentProps) {
  const { feature } = loaderData;
  const save = useFetcher<typeof action>();
  const [title, setTitle] = useState(feature.title);
  const [lead, setLead] = useState(feature.lead);
  const [slug, setSlug] = useState(feature.slug);
  const [emoji, setEmoji] = useState(feature.emoji);
  const [theme, setTheme] = useState(feature.theme);
  const [status, setStatus] = useState(feature.status);
  const [items, setItems] = useState<Item[]>(loaderData.items);
  const [dirty, setDirty] = useState(false);
  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setDirty(true);
  };

  const doSave = () => {
    save.submit(
      { payload: JSON.stringify({ title, lead, slug, emoji, theme, status, items: items.map((i) => i.id) }) },
      { method: "post" },
    );
  };
  useEffect(() => {
    if (save.data?.ok) setDirty(false);
  }, [save.data]);
  // Ctrl/⌘ + S で保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        doSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // 未保存のまま離れようとしたら確認
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);

  const addItem = (p: Item) => {
    if (items.some((i) => i.id === p.id)) return;
    setItems((xs) => [...xs, p]);
    setDirty(true);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    setItems((xs) => {
      const next = [...xs];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
    setDirty(true);
  };
  const remove = (idx: number) => {
    setItems((xs) => xs.filter((_, i) => i !== idx));
    setDirty(true);
  };

  return (
    <div>
      <PageTitle title="特集を編集">
        <Link to="/admin/features" className={btn.ghost}>← 一覧</Link>
        <a href={`/features/${feature.slug}?preview=1`} target="_blank" rel="noreferrer" className={btn.ghost}>↗ プレビュー</a>
        <button onClick={doSave} className={btn.primary} disabled={save.state !== "idle"}>
          {save.state !== "idle" ? "保存中…" : dirty ? "保存 ●" : "保存済み"}
        </button>
      </PageTitle>
      {save.data && !save.data.ok && "error" in save.data && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{save.data.error}</p>}
      {save.data?.ok && !dirty && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">保存しました{status === "published" ? "（公開中）" : "（下書き）"}</p>}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        {/* 設定 */}
        <div className="space-y-5">
          <div className={`overflow-hidden rounded-3xl bg-gradient-to-br ${themeGradient(theme)} p-6 text-white shadow-lg`} aria-label="プレビュー">
            <p className="text-4xl">{emoji || "🍙"}</p>
            <p className="mt-3 font-display text-2xl font-black leading-tight">{title || "タイトル"}</p>
            <p className="mt-1 text-sm opacity-90">{lead || "リード文"}</p>
            <div className="mt-4 flex -space-x-3">
              {items.slice(0, 5).map((p) => p.image_url && <img key={p.id} src={p.image_url} alt="" referrerPolicy="no-referrer" className="h-11 w-11 rounded-xl bg-white object-contain p-0.5 ring-2 ring-white/60" />)}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold">タイトル</span>
            <input value={title} onChange={(e) => touch(setTitle)(e.target.value)} maxLength={40} className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">リード文</span>
            <textarea value={lead} onChange={(e) => touch(setLead)(e.target.value)} maxLength={120} rows={2} className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">URL</span>
            <span className="flex items-center gap-1 text-sm text-stone-500">
              /features/
              <input value={slug} onChange={(e) => touch(setSlug)(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} className={input} />
            </span>
          </label>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">絵文字</legend>
            <div className="flex flex-wrap gap-1.5" role="radiogroup">
              {FEATURE_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={emoji === e}
                  onClick={() => touch(setEmoji)(e)}
                  className={`grid h-9 w-9 place-items-center rounded-lg text-xl transition ${emoji === e ? "bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-500/20" : "bg-stone-100 hover:bg-stone-200 dark:bg-white/5"}`}
                >
                  {e}
                </button>
              ))}
              <input value={emoji} onChange={(e) => touch(setEmoji)(e.target.value)} aria-label="絵文字を直接入力" className="h-9 w-14 rounded-lg bg-white text-center ring-1 ring-stone-200 dark:bg-stone-950 dark:ring-white/10" />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">テーマ色</legend>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => (
                <label key={t.id} className="cursor-pointer">
                  <input type="radio" name="theme" value={t.id} checked={theme === t.id} onChange={() => touch(setTheme)(t.id)} className="peer sr-only" />
                  <span className={`block h-9 w-14 rounded-lg bg-gradient-to-br ${t.gradient} ring-offset-2 transition peer-checked:ring-2 peer-checked:ring-stone-900 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 dark:peer-checked:ring-white`} title={t.label} />
                  <span className="mt-0.5 block text-center text-[10px] text-stone-500">{t.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex gap-2">
            <legend className="mb-1.5 text-sm font-semibold">公開状態</legend>
            {(
              [
                ["draft", "下書き"],
                ["published", "公開する"],
              ] as const
            ).map(([k, v]) => (
              <label key={k} className="cursor-pointer">
                <input type="radio" name="status" value={k} checked={status === k} onChange={() => touch(setStatus)(k)} className="peer sr-only" />
                <span className="block rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-stone-300 peer-checked:bg-stone-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 dark:ring-white/15 dark:peer-checked:bg-white dark:peer-checked:text-stone-900">
                  {v}
                </span>
              </label>
            ))}
          </fieldset>

          <Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <ConfirmButton className={btn.danger} message="この特集を削除します（元に戻せません）" confirmText="削除する">
              特集を削除
            </ConfirmButton>
          </Form>
        </div>

        {/* 商品 */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ProductSearch onAdd={addItem} selected={new Set(items.map((i) => i.id))} />
          <SelectedList items={items} move={move} remove={remove} />
        </div>
      </div>

      <details className="mt-6 rounded-xl bg-stone-50 p-4 text-sm text-stone-600 dark:bg-white/5 dark:text-stone-300">
        <summary className="cursor-pointer font-semibold">⌨️ キーボード操作</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          <li><kbd>/</kbd> 検索欄に移動</li>
          <li><kbd>↑</kbd><kbd>↓</kbd> 検索結果を選ぶ ／ <kbd>Enter</kbd> 追加</li>
          <li>選んだ商品で <kbd>Alt</kbd>+<kbd>↑</kbd><kbd>↓</kbd> 並べ替え</li>
          <li>選んだ商品で <kbd>Delete</kbd> 削除</li>
          <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>S</kbd> 保存</li>
          <li>マウスではドラッグで並べ替え</li>
        </ul>
      </details>
    </div>
  );
}

function ProductSearch({ onAdd, selected }: { onAdd: (p: Item) => void; selected: Set<number> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/admin/api/products?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          setResults(await res.json());
          setActive(0);
        }
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  // 「/」で検索欄へ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-white/10">
      <h2 className="mb-2 font-bold">商品をさがす</h2>
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (results[active]) onAdd(results[active]);
          } else if (e.key === "Escape") setQ("");
        }}
        placeholder="商品名・メーカーで検索（/ で移動）"
        aria-label="商品を検索"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="feature-search-results"
        aria-activedescendant={results[active] ? `res-${results[active].id}` : undefined}
        className={input}
      />
      <ul id="feature-search-results" role="listbox" className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto">
        {loading && results.length === 0 && <li className="p-3 text-sm text-stone-400">検索中…</li>}
        {results.map((p, i) => {
          const added = selected.has(p.id);
          return (
            <li
              key={p.id}
              id={`res-${p.id}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center gap-3 rounded-xl p-2 ${i === active ? "bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-400/30" : ""}`}
            >
              <Thumb p={p} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-[11px] text-stone-500">{p.maker} {p.released_on && `・${p.released_on}`}</p>
              </div>
              <button type="button" onClick={() => onAdd(p)} disabled={added} className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${added ? "text-stone-400" : "bg-stone-900 text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900"}`}>
                {added ? "追加済み" : "＋ 追加"}
              </button>
            </li>
          );
        })}
        {!loading && results.length === 0 && <li className="p-3 text-sm text-stone-400">該当する商品がありません</li>}
      </ul>
    </section>
  );
}

function SelectedList({ items, move, remove }: { items: Item[]; move: (from: number, to: number) => void; remove: (i: number) => void }) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const dragRef = useRef<number | null>(null);
  const focusAt = (i: number) => requestAnimationFrame(() => refs.current[i]?.focus());

  // ポインター操作でのドラッグ並べ替え（マウス・タッチ両対応）
  const onPointerDown = (i: number) => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = i;
    setDragIdx(i);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const from = dragRef.current;
    if (from == null) return;
    // ポインター位置に一番近い行の位置へ移動
    let to = from;
    refs.current.forEach((el, idx) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (e.clientY > r.top && e.clientY < r.bottom) to = idx;
    });
    if (to !== from) {
      move(from, to);
      dragRef.current = to;
      setDragIdx(to);
    }
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragIdx(null);
  };

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-white/10">
      <h2 className="mb-2 font-bold">特集に入れる商品（{items.length}）</h2>
      {items.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-stone-200 p-8 text-center text-sm text-stone-400 dark:border-white/10">左の検索から「＋ 追加」してください</p>
      ) : (
        <ol className="space-y-1.5" aria-label="特集の商品（Alt+↑↓で並べ替え、Deleteで削除）">
          {items.map((p, i) => (
            <li
              key={p.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              tabIndex={0}
              onPointerDown={onPointerDown(i)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(e) => {
                if (e.altKey && e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, i - 1);
                  focusAt(Math.max(0, i - 1));
                } else if (e.altKey && e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, i + 1);
                  focusAt(Math.min(items.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  focusAt(Math.max(0, i - 1));
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  focusAt(Math.min(items.length - 1, i + 1));
                } else if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  remove(i);
                  focusAt(Math.min(i, items.length - 2));
                }
              }}
              className={`flex touch-none cursor-grab select-none items-center gap-2 rounded-xl bg-stone-50 p-2 outline-none ring-brand-400 transition-shadow focus-visible:ring-2 dark:bg-white/5 ${
                dragIdx === i ? "z-10 cursor-grabbing bg-white shadow-lg ring-2 ring-brand-300 dark:bg-stone-800" : ""
              }`}
            >
              <span className="px-1 text-stone-400" aria-hidden>⋮⋮</span>
              <span className="w-5 text-center text-xs font-bold tabular-nums text-stone-400">{i + 1}</span>
              <Thumb p={p} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</p>
              <div className="flex shrink-0 gap-0.5">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="grid h-7 w-7 place-items-center rounded-lg text-stone-500 hover:bg-white disabled:opacity-30 dark:hover:bg-white/10" aria-label="上へ">↑</button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} className="grid h-7 w-7 place-items-center rounded-lg text-stone-500 hover:bg-white disabled:opacity-30 dark:hover:bg-white/10" aria-label="下へ">↓</button>
                <button type="button" onClick={() => remove(i)} className="grid h-7 w-7 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" aria-label="削除">×</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Thumb({ p }: { p: Item }) {
  return p.image_url ? (
    <img src={p.image_url} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain ring-1 ring-stone-200 dark:ring-white/10" />
  ) : (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-stone-100 text-lg dark:bg-white/10">{p.category_emoji ?? "🍙"}</span>
  );
}
