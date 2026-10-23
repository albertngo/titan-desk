"use client";

import { useEveAgent } from "eve/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnswerText } from "@/components/askbert/AnswerText";
import { ShopCard, ShopCardSkeleton } from "@/components/ShopCard";
import { ShortcutIcon } from "@/components/askbert/ShortcutIcon";
import { hitSessionLimit, messageText, referencedProducts, type MessageLike } from "@/lib/askbert-cards";
import { fromGroup, fromProduct, SHORTCUTS, TYPE_CHIPS, type ShopItem, type Shortcut } from "@/lib/askbert-shop";
import { EMPTY_FILTERS, filtersToArgs } from "@/lib/db/filters";
import { searchStaffGrouped } from "@/lib/db/queries";
import { ASKBERT_EVENT } from "@/lib/askbert-bridge";
import { supabaseBrowser } from "@/lib/supabase/client";

/** How many collections the "On promo now" shelf shows. */
const PROMO_SHELF = 12;
/** The one elevation tier askBert uses (denim-tinted, light from above). */
const LIFT = "shadow-[0_0_0_1px_rgba(41,56,149,0.06),0_2px_6px_rgba(41,56,149,0.06),0_6px_14px_rgba(41,56,149,0.08)]";

/**
 * askBert: a button on every page that opens a full-screen Titan shop. Quick questions and an
 * "On promo now" shelf to start; answers on the left, the products Bert names as a photo grid on
 * the right (inline on phones). Mounted once in the app layout, so a conversation survives
 * opening a product and coming back. The search box never depends on it.
 */
export function AskBert() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [online, setOnline] = useState(true);
  // undefined: not loaded yet · null: could not load · []: nothing on promo
  const [promos, setPromos] = useState<ShopItem[] | null | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const agent = useEveAgent({
    agent: "askbert",
    prewarm: open,
    // Send the current Supabase access token; getSession() refreshes it when it is about to expire.
    headers: async (): Promise<Record<string, string>> => {
      const { data } = await supabaseBrowser().auth.getSession();
      return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
    },
  });

  const messages = agent.data.messages as unknown as readonly MessageLike[];
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const expired = (agent.error as { status?: number } | undefined)?.status === 401;
  const limited = hitSessionLimit(messages);
  const canAsk = !busy && online && !limited && agent.status !== "resuming";

  let lastAnswer = -1;
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") { lastAnswer = i; break; }
  const picks = lastAnswer >= 0 ? referencedProducts(messages[lastAnswer]).map(fromProduct) : [];

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Full screen: lock the page behind, close on Escape.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The promo shelf loads once, the first time the shop opens.
  useEffect(() => {
    if (!open || promos !== undefined) return;
    searchStaffGrouped(supabaseBrowser(), filtersToArgs({ ...EMPTY_FILTERS, q: "on promo" }, 0, PROMO_SHELF))
      .then((groups) => setPromos(groups.filter((g) => g.any_promo).map(fromGroup)))
      .catch(() => setPromos(null));
  }, [open, promos]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, agent.status]);

  const ask = (text: string): boolean => {
    const q = text.trim();
    if (!q || !canAsk) return false;
    setDraft("");
    void agent.send(q);
    return true;
  };

  // "Ask Bert about this" from any page: open the shop and ask (or leave it in the box if Bert is busy).
  const askRef = useRef(ask);
  useEffect(() => { askRef.current = ask; });
  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q !== "string") return;
      setOpen(true);
      if (!askRef.current(q)) setDraft(q);
    };
    window.addEventListener(ASKBERT_EVENT, onAsk);
    return () => window.removeEventListener(ASKBERT_EVENT, onAsk);
  }, []);

  const fill = (text: string) => {
    setDraft(text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  };

  const run = (s: Shortcut) => (s.mode === "send" ? ask(s.prompt) : fill(s.prompt));
  const close = () => setOpen(false);

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="askBert"
          onClick={() => setOpen(true)}
          className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[25] flex h-14 items-center gap-2 rounded-full bg-denim pl-1.5 pr-5 text-cream ${LIFT} transition duration-200 hover:bg-denim-dark active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cream/10">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src="/brand/titan-mascot-cream.png" alt="" className="h-9 w-9 object-contain" />
          </span>
          <span className="font-display text-[17px] font-bold">Ask Bert</span>
        </button>
      )}

      {open && (
        <div role="dialog" aria-modal="true" aria-label="askBert" className="fixed inset-0 z-[35] flex flex-col bg-cream font-brand text-ink">
          <header className="pt-safe bg-denim text-cream">
            <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-2 sm:px-6">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
              <img src="/brand/titan-mascot-cream.png" alt="Titan Flooring" className="h-11 w-11 object-contain" />
              <div className="min-w-0 leading-tight">
                <p className="font-display text-xl font-bold">askBert</p>
                <p className="truncate text-[12px] text-sky">Titan Flooring&apos;s catalogue, in plain words</p>
              </div>
              <button
                type="button"
                onClick={() => { agent.reset(); setDraft(""); }}
                disabled={busy || messages.length === 0}
                className="ml-auto flex h-10 items-center gap-1.5 rounded-full border border-cream/30 px-3.5 text-sm font-medium transition-colors hover:bg-cream/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
              >
                <ShortcutIcon name="plus" className="h-4 w-4" />
                <span className="hidden sm:inline">New question</span>
                <span className="sm:hidden">New</span>
              </button>
              <button type="button" aria-label="Close askBert" onClick={close}
                className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream">
                <ShortcutIcon name="close" className="h-6 w-6" />
              </button>
            </div>
          </header>

          <div className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-1 lg:grid-cols-[minmax(400px,5fr)_7fr]">
            <section aria-label="Conversation" className="flex min-h-0 min-w-0 flex-col lg:border-r lg:border-cream-deep">
              <div ref={listRef} className="flex-1 overflow-y-auto px-4 pb-6 pt-6 sm:px-6" aria-live="polite">
                {messages.length === 0 ? (
                  <Welcome run={run} ask={ask} canAsk={canAsk} promos={promos} onOpen={close} />
                ) : (
                  <div className="mx-auto max-w-2xl space-y-5">
                    {messages.map((m, i) => {
                      if (m.role === "user") {
                        return (
                          <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-denim px-4 py-2.5 text-[15px] leading-relaxed text-cream">
                            {messageText(m)}
                          </div>
                        );
                      }
                      const text = messageText(m);
                      const items = referencedProducts(m).map(fromProduct);
                      return (
                        <div key={i} className="space-y-3">
                          {text && (
                            <div className="flex gap-3">
                              <BertAvatar />
                              <div className={`min-w-0 flex-1 rounded-2xl rounded-tl-md bg-white px-4 py-3 text-[15px] ${LIFT}`}>
                                <AnswerText text={text} />
                              </div>
                            </div>
                          )}
                          {items.length > 0 && (
                            // The latest answer's products fill the right-hand grid on wide screens.
                            <div className={i === lastAnswer ? "lg:hidden" : ""}>
                              <Rail items={items} onOpen={close} onAsk={canAsk ? ask : undefined} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {agent.status === "submitted" && (
                      <div className="flex items-center gap-3">
                        <BertAvatar />
                        <p className="flex items-center gap-2 text-sm text-ink/70">
                          <span className="flex gap-1" aria-hidden>
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-denim [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-denim [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-denim" />
                          </span>
                          Bert is checking the catalogue
                        </p>
                      </div>
                    )}
                    {limited && (
                      <Notice>This conversation reached its limit. Tap <strong>New question</strong> to start again.</Notice>
                    )}
                    {expired && (
                      <Notice>
                        Your sign-in expired. <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Reload</button> and ask again.
                      </Notice>
                    )}
                    {agent.error && !expired && (
                      <Notice tone="error">Bert couldn&apos;t answer that. Try again, or use the search box.</Notice>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-cream-deep bg-cream px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6">
                <div className="mx-auto max-w-2xl">
                  {/* Quick-question chips once a conversation is going (the welcome screen has the tiles). */}
                  {messages.length > 0 && (
                  <div className="-mx-1 mb-2.5 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                    {SHORTCUTS.map((s) => (
                      <button key={s.id} type="button" onClick={() => run(s)} disabled={!canAsk}
                        className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition duration-200 active:scale-[0.97] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${
                          s.id === "promo" ? "bg-peach text-campfire-dark hover:bg-[#efd3c7]" : "bg-white text-denim ring-1 ring-denim/15 hover:ring-denim/40"}`}>
                        <ShortcutIcon name={s.icon} className="h-4 w-4" />
                        {s.label}
                      </button>
                    ))}
                  </div>
                  )}
                  <form
                    className={`flex items-end gap-2 rounded-[28px] bg-white py-1.5 pl-5 pr-1.5 ring-1 ring-denim/15 transition focus-within:ring-2 focus-within:ring-denim ${LIFT}`}
                    onSubmit={(e) => { e.preventDefault(); ask(draft); }}
                  >
                    <textarea
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(draft); } }}
                      rows={1}
                      enterKeyHint="send"
                      aria-label="Ask Bert"
                      placeholder={online ? "Ask about a floor, price or promo" : "askBert needs a connection"}
                      disabled={!online || limited}
                      className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base text-ink outline-none placeholder:text-ink/45"
                    />
                    {busy ? (
                      <button type="button" onClick={() => void agent.cancel()}
                        className="h-11 shrink-0 rounded-full border border-denim/25 px-4 text-sm font-semibold text-denim transition-colors hover:bg-cream">
                        Stop
                      </button>
                    ) : (
                      <button type="submit" aria-label="Send" disabled={!draft.trim() || !canAsk}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-denim text-cream transition duration-200 hover:bg-denim-dark active:scale-95 disabled:bg-denim/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim">
                        <ShortcutIcon name="send" className="h-5 w-5" />
                      </button>
                    )}
                  </form>
                </div>
              </div>
            </section>

            <aside aria-label="Products" className="hidden min-h-0 overflow-y-auto px-6 py-6 lg:block xl:px-8">
              {picks.length > 0 && (
                <Shelf title="Bert's picks" note="From the catalogue, in the order Bert named them" count={picks.length}>
                  <Grid items={picks} onOpen={close} onAsk={canAsk ? ask : undefined} />
                </Shelf>
              )}
              <Shelf title="On promo now" note="Collections with a live promo, from the catalogue" count={promos?.length ?? null}>
                <PromoGrid promos={promos} onOpen={close} onAsk={canAsk ? ask : undefined} />
              </Shelf>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}

/** The empty conversation: a greeting, the quick questions, shop-by-type, and (phones) promos. */
function Welcome({ run, ask, canAsk, promos, onOpen }: {
  run: (s: Shortcut) => void;
  ask: (q: string) => void;
  canAsk: boolean;
  promos: ShopItem[] | null | undefined;
  onOpen: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-end gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/titan-mascot-blue.png" alt="" className="h-20 w-20 shrink-0 object-contain sm:h-24 sm:w-24" />
        <div className="pb-1">
          <h2 className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.01em] text-denim [text-wrap:balance] sm:text-[34px]">
            What are we looking for today?
          </h2>
        </div>
      </div>
      <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink/75">
        Ask about any floor, price, promo or room. Bert answers from Titan&apos;s live catalogue, cost included.
      </p>

      <h3 className="mt-7 text-[13px] font-semibold text-ink/60">Quick questions</h3>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {SHORTCUTS.map((s) => {
          const hot = s.id === "promo";
          return (
            <button key={s.id} type="button" onClick={() => run(s)} disabled={!canAsk}
              className={`group flex flex-col items-start gap-2.5 rounded-2xl p-3.5 text-left transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${
                hot ? "bg-peach" : `bg-white ${LIFT}`}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${hot ? "bg-campfire text-cream" : "bg-sky text-denim"}`}>
                <ShortcutIcon name={s.icon} />
              </span>
              <span>
                <span className={`block text-[15px] font-semibold ${hot ? "text-campfire-dark" : "text-ink"}`}>{s.label}</span>
                <span className="block text-[12px] text-ink/60">{s.mode === "fill" ? `${s.hint}…` : s.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <h3 className="mt-7 text-[13px] font-semibold text-ink/60">Shop by type</h3>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {TYPE_CHIPS.map((t) => (
          <button key={t.label} type="button" onClick={() => ask(t.prompt)} disabled={!canAsk}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-denim ring-1 ring-denim/15 transition duration-200 hover:ring-denim/40 active:scale-[0.97] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim">
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-8 lg:hidden">
        <Shelf title="On promo now" note="Collections with a live promo" count={promos?.length ?? null}>
          {promos === undefined ? (
            <div className="grid grid-cols-2 gap-4"><ShopCardSkeleton /><ShopCardSkeleton /></div>
          ) : promos && promos.length > 0 ? (
            <Rail items={promos} onOpen={onOpen} onAsk={canAsk ? ask : undefined} />
          ) : (
            <p className="text-sm text-ink/60">{promos === null ? "Promos couldn't load. Ask Bert instead." : "Nothing is on promo right now."}</p>
          )}
        </Shelf>
      </div>
    </div>
  );
}

function Shelf({ title, note, count, children }: { title: string; note: string; count: number | null; children: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="font-display text-[22px] font-bold tracking-[-0.01em] text-denim">{title}</h2>
        {count !== null && <span className="text-sm tabular-nums text-ink/50">{count}</span>}
      </div>
      <p className="-mt-3 mb-4 text-[13px] text-ink/55">{note}</p>
      {children}
    </section>
  );
}

function Grid({ items, onOpen, onAsk }: { items: ShopItem[]; onOpen: () => void; onAsk?: (q: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((it) => <ShopCard key={it.key} item={it} onOpen={onOpen} onAsk={onAsk} />)}
    </div>
  );
}

function PromoGrid({ promos, onOpen, onAsk }: { promos: ShopItem[] | null | undefined; onOpen: () => void; onAsk?: (q: string) => void }) {
  if (promos === undefined) {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-7 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => <ShopCardSkeleton key={i} />)}
      </div>
    );
  }
  if (promos === null) return <p className="text-sm text-ink/60">Promos couldn&apos;t load. Ask Bert &ldquo;What&apos;s on promo?&rdquo; instead.</p>;
  if (promos.length === 0) return <p className="text-sm text-ink/60">Nothing is on promo right now.</p>;
  return <Grid items={promos} onOpen={onOpen} onAsk={onAsk} />;
}

/** A horizontal, snap-scrolling row of tiles (phones, and earlier answers). */
function Rail({ items, onOpen, onAsk }: { items: ShopItem[]; onOpen: () => void; onAsk?: (q: string) => void }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:px-6">
      {items.map((it) => (
        <div key={it.key} className="w-[44%] shrink-0 snap-start sm:w-[30%] lg:w-[38%] xl:w-[30%]">
          <ShopCard item={it} onOpen={onOpen} onAsk={onAsk} size="sm" />
        </div>
      ))}
    </div>
  );
}

function BertAvatar() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img src="/brand/titan-mascot-blue.png" alt="" className="h-7 w-7 object-contain" />
    </span>
  );
}

function Notice({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "error" }) {
  return (
    <p className={`rounded-xl px-4 py-3 text-sm ${tone === "error" ? "bg-[#fbe4dc] text-campfire-dark" : "bg-peach text-ink"}`}>
      {children}
    </p>
  );
}
