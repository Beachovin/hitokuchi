import { useState } from "react";

export function StarInput({ name, label, size = 32, required }: { name: string; label: string; size?: number; required?: boolean }) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const words = ["", "いまいち", "ふつう", "まあまあ", "おいしい", "最高！"];
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold">{label}</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
            <input type="radio" name={name} value={n} required={required} className="peer sr-only" onChange={() => setValue(n)} />
            <svg
              width={size}
              height={size}
              viewBox="0 0 24 24"
              className={`transition-all duration-150 peer-focus-visible:ring-2 rounded ${n <= shown ? "scale-110 text-amber-400" : "text-stone-300 dark:text-stone-700"}`}
              aria-hidden
            >
              <path fill="currentColor" d="M12 2.5l2.9 6.2 6.8.7-5.1 4.6 1.5 6.7L12 17.3 5.9 20.7l1.5-6.7L2.3 9.4l6.8-.7z" />
            </svg>
            <span className="sr-only">{n}点</span>
          </label>
        ))}
        {size >= 28 && <span className="ml-2 min-w-16 text-sm font-semibold text-amber-600">{words[shown]}</span>}
      </div>
    </fieldset>
  );
}
