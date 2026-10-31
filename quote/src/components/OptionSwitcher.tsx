"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

/**
 * The options on a customer's quote, side by side (Albert, 2026-10-31: "it should stay in the same
 * section and just show the different details instead of scrolling down"). A row of compact option
 * buttons, and right under it the chosen option's full details; picking another swaps the details in
 * place, so nobody jumps down the page and back. It starts on the recommended option, else the first.
 *
 * The panels are drawn on the server (CustomerQuote) and only shown or hidden here, so this file holds
 * no figure of its own. Every panel stays in the page: printing shows them all, one after another.
 */

export type SwitchTab = {
  /** 1-based option number, as everywhere else the customer sees it. */
  no: number;
  name: string;
  price: string;
  tag: string;
  recommended: boolean;
};

export function OptionSwitcher({ label, heading, tabs, panels }: { label: string; heading: string; tabs: SwitchTab[]; panels: React.ReactNode[] }) {
  const first = Math.max(0, tabs.findIndex((t) => t.recommended));
  const [on, setOn] = useState(first);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const [from, setFrom] = useState<"left" | "right" | null>(null);
  const row = useRef<HTMLDivElement>(null);
  /** Where the option buttons sat on screen when one was pressed, so the page can be put back exactly there. */
  const held = useRef<number | null>(null);

  const pick = (k: number, focus = false) => {
    if (k === on) return;
    held.current = row.current?.getBoundingClientRect().top ?? null;
    setFrom(k > on ? "right" : "left");
    setOn(k);
    if (focus) buttons.current[k]?.focus({ preventScroll: true });
  };

  // Switching never moves the page (Albert, 2026-10-31: "it doesn't scroll down into an odd place"): options of
  // different lengths would otherwise shift what is on screen, so the buttons are kept where the finger left them.
  useLayoutEffect(() => {
    if (held.current === null || !row.current) return;
    const drift = row.current.getBoundingClientRect().top - held.current;
    held.current = null;
    if (Math.abs(drift) > 1) window.scrollBy({ top: drift, behavior: "instant" as ScrollBehavior });
  }, [on]);
  // Arrow keys move between options, as on any tab row.
  const onKey = (e: React.KeyboardEvent, k: number) => {
    const n = tabs.length;
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? (k + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (k - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to === null) return;
    e.preventDefault();
    pick(to, true);
  };

  return (
    // One framed section per group (Albert, 2026-10-31: "more like a header and more obvious… more of a border, so
    // that you can visually see what the options are"): a header band, the option buttons, and the details, all
    // inside the same border, so it is plain which options and which details belong together.
    <section className="cq-switch" aria-labelledby={`${id}-h`}>
      <header className="cq-switch-h">
        <h2 id={`${id}-h`}>{heading}</h2>
        <p className="cq-switch-hint">{tabs.length > 1 ? `${tabs.length} to choose from. Tap one to see what it includes.` : "What it includes is below."}</p>
      </header>
      <div ref={row} className="cq-tabs" role="tablist" aria-label={label} style={{ "--n": Math.min(tabs.length, 3) } as React.CSSProperties}>
        {tabs.map((t, k) => (
          <button
            key={t.no}
            ref={(el) => {
              buttons.current[k] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-t${k}`}
            aria-selected={k === on}
            aria-controls={`${id}-p${k}`}
            tabIndex={k === on ? 0 : -1}
            className={`cq-tab${k === on ? " on" : ""}`}
            onClick={() => pick(k)}
            onKeyDown={(e) => onKey(e, k)}
          >
            <span className="top">
              <span className="no">Option {t.no}</span>
              {t.recommended && <span className="rec">Recommended</span>}
            </span>
            <span className="nm">{t.name}</span>
            <span className="pr">{t.price}</span>
            <span className="tg">{t.tag}</span>
          </button>
        ))}
      </div>
      {panels.map((p, k) => (
        <div key={k} role="tabpanel" id={`${id}-p${k}`} aria-labelledby={`${id}-t${k}`} className={`cq-panel${k === on ? " on" : ""}`} data-from={k === on && from ? from : undefined}>
          {p}
        </div>
      ))}
    </section>
  );
}
