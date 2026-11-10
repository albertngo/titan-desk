"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSettingAction } from "@/app/settings/actions";

type Item = { key: string; group: string; label: string; help: string; kind: "switch" | "number" | "emails" | "phone"; unit?: string; min?: number; max?: number; value: string; by: string | null; when: string | null };

/** The Settings page's form (2026-11-10): one row per setting, grouped; each saves on its own. */
export function SettingsForm({ items }: { items: Item[] }) {
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <section className="card st">
      {groups.map((g) => (
        <div key={g} className="st-sec">
          <h2 className="st-h">{g}</h2>
          {items.filter((i) => i.group === g).map((i) => (
            <SettingRow key={i.key} item={i} />
          ))}
        </div>
      ))}
    </section>
  );
}

function SettingRow({ item }: { item: Item }) {
  const router = useRouter();
  const [value, setValue] = useState(item.value);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = (v: string) =>
    start(async () => {
      setMsg(null);
      const r = await saveSettingAction(item.key, v);
      setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.message });
      if (r.ok) router.refresh();
    });
  const changed = value !== item.value;
  return (
    <div className="st-row">
      <div className="st-what">
        <label className="st-label" htmlFor={`st-${item.key}`}>
          {item.label}
        </label>
        <span className="st-help">{item.help}</span>
        {item.by && <span className="st-meta">Last changed by {item.by}{item.when ? `, ${new Date(item.when).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" })}` : ""}</span>}
      </div>
      <div className="st-input">
        {item.kind === "switch" ? (
          <label className="st-switch">
            <input id={`st-${item.key}`} type="checkbox" checked={value === "on"} disabled={busy} onChange={(e) => { const v = e.target.checked ? "on" : "off"; setValue(v); save(v); }} />
            {value === "on" ? "On" : "Off"}
          </label>
        ) : (
          <>
            <input
              id={`st-${item.key}`}
              className="in"
              inputMode={item.kind === "number" ? "numeric" : undefined}
              type={item.kind === "phone" ? "tel" : "text"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={item.kind === "phone" ? "+14165550100" : item.kind === "emails" ? "you@titanflooring.ca" : undefined}
            />
            {item.unit && <span className="st-unit">{item.unit}</span>}
            <button type="button" className="btn small primary" disabled={busy || !changed} onClick={() => save(value)}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        )}
        {msg && <span className={`st-msg${msg.ok ? "" : " bad"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
