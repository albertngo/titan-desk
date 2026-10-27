/**
 * Lets any page hand a question to askBert ("Ask Bert about this" on a tile, or a search with no
 * results). AskBert listens, opens and asks. A browser event, so pages need no shared state.
 */
export const ASKBERT_EVENT = "askbert:ask";

export function askBert(prompt: string): void {
  window.dispatchEvent(new CustomEvent<string>(ASKBERT_EVENT, { detail: prompt }));
}
