"use client";

import { useEveAgent } from "eve/react";
import { useEffect, useRef, useState } from "react";
import { AnswerText } from "@/components/askbert/AnswerText";
import { AskBertCard } from "@/components/askbert/AskBertCard";
import { hitSessionLimit, messageText, referencedProducts, type MessageLike } from "@/lib/askbert-cards";
import { supabaseBrowser } from "@/lib/supabase/client";

const EXAMPLES = [
  "Waterproof LVP under $5/sf for a basement with pets",
  "Is Vidar Macaroon radiant-heat compatible?",
  "What's on promo in laminate right now?",
];

/**
 * The askBert assistant: a floating button on every page and a panel (bottom sheet on phones,
 * right-hand drawer on wider screens). Mounted once in the app layout, so a conversation
 * survives opening a product and coming back. The search box never depends on it.
 */
export function AskBert() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [online, setOnline] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, agent.status]);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || busy || !online || limited || agent.status === "resuming") return;
    setDraft("");
    void agent.send(q);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="askBert"
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[25] flex h-14 w-14 items-center justify-center rounded-full bg-askbert text-white shadow-lg active:bg-askbert-dark"
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[35] flex items-end md:items-stretch md:justify-end" role="dialog" aria-label="askBert">
          <button type="button" aria-label="Close askBert" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <section className="relative flex h-[90dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl md:h-full md:w-[420px] md:rounded-none">
            <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
              <h2 className="text-base font-semibold text-askbert">askBert</h2>
              <button
                type="button"
                onClick={() => { agent.reset(); setDraft(""); }}
                disabled={busy || messages.length === 0}
                className="ml-auto rounded-full border border-zinc-300 px-3 py-1 text-xs disabled:opacity-40"
              >
                New question
              </button>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-full px-2 py-1 text-lg leading-none text-zinc-500">
                ×
              </button>
            </header>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
              {messages.length === 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-sm text-zinc-600">Ask about any product, price, spec or which floor suits a room. Answers come from the catalogue.</p>
                  {EXAMPLES.map((e) => (
                    <button key={e} type="button" onClick={() => ask(e)}
                      className="block w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm active:bg-zinc-50">
                      {e}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((m, i) => {
                if (m.role === "user") {
                  return (
                    <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-askbert px-3 py-2 text-sm text-white">
                      {messageText(m)}
                    </div>
                  );
                }
                const text = messageText(m);
                const cards = referencedProducts(m);
                return (
                  <div key={i} className="space-y-2">
                    {text && <AnswerText text={text} />}
                    {cards.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {cards.map((p) => (
                          <AskBertCard key={p.sku} p={p} onOpen={() => { if (window.innerWidth < 768) setOpen(false); }} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {agent.status === "submitted" && <p className="text-sm text-zinc-500">Searching the catalogue…</p>}
              {limited && (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  This conversation reached its limit. Tap <strong>New question</strong> to start again.
                </p>
              )}
              {expired && (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  Your sign-in expired. <button type="button" className="underline" onClick={() => window.location.reload()}>Reload</button> and ask again.
                </p>
              )}
              {agent.error && !expired && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  askBert couldn&apos;t answer that. Try again, or use the search box.
                </p>
              )}
            </div>

            <form
              className="flex items-end gap-2 border-t border-zinc-200 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
              onSubmit={(e) => { e.preventDefault(); ask(draft); }}
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(draft); } }}
                rows={1}
                enterKeyHint="send"
                placeholder={online ? "Ask askBert…" : "askBert needs a connection"}
                disabled={!online || limited}
                className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-askbert"
              />
              {busy ? (
                <button type="button" onClick={() => void agent.cancel()} className="h-10 rounded-lg border border-zinc-300 px-3 text-sm font-medium">
                  Stop
                </button>
              ) : (
                <button type="submit" disabled={!draft.trim() || !online || limited}
                  className="h-10 rounded-lg bg-askbert px-4 text-sm font-semibold text-white disabled:opacity-40">
                  Send
                </button>
              )}
            </form>
          </section>
        </div>
      )}
    </>
  );
}
