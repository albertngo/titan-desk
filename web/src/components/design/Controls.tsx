"use client";

/** Small, thumb-sized inputs for the Help me choose page. */

export function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-zinc-600">{label}</p>
      {children}
    </div>
  );
}

const pill = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm ${on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-800 active:bg-zinc-100"}`;

/** One of several (tap the chosen one again to clear it). */
export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T | null; options: { value: T; label: string }[]; onChange: (v: T | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={pill(value === o.value)} aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? null : o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Any number of several. */
export function Multi<T extends string>({ value, options, onChange }: { value: T[]; options: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" className={pill(on)} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={pill(value)} aria-pressed={value} onClick={() => onChange(!value)}>
      {value ? "✓ " : ""}{label}
    </button>
  );
}

export function NumberInput({ value, onChange, placeholder, prefix, suffix }: {
  value: number | null; onChange: (v: number | null) => void; placeholder?: string; prefix?: string; suffix?: string;
}) {
  return (
    <label className="flex w-40 items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm">
      {prefix && <span className="text-zinc-500">{prefix}</span>}
      <input
        inputMode="decimal"
        className="w-full bg-transparent outline-none"
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => {
          const n = Number.parseFloat(e.target.value);
          onChange(e.target.value.trim() === "" || !Number.isFinite(n) ? null : n);
        }}
      />
      {suffix && <span className="text-zinc-500">{suffix}</span>}
    </label>
  );
}
