export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-black tracking-tight">{title}</h1>
      <div className="ml-auto flex gap-2">{children}</div>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-white/10 ${className}`}>{children}</div>;
}

export function Badge({ tone = "stone", children }: { tone?: "stone" | "green" | "amber" | "red" | "blue"; children: React.ReactNode }) {
  const tones = {
    stone: "bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-stone-300",
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    red: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    blue: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export const btn = {
  primary: "rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:opacity-50 dark:bg-white dark:text-stone-900",
  ghost: "rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:opacity-50 dark:ring-white/10 dark:hover:bg-white/5",
  danger: "rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50 disabled:opacity-50 dark:ring-rose-500/30 dark:hover:bg-rose-500/10",
  success: "rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50",
};

export const input =
  "w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-brand-400 dark:bg-stone-950 dark:ring-white/10";
