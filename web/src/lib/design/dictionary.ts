import type { AttrSet, DictionaryRow, Preference } from "./types";

/** Lower-case, letters/digits/apostrophes only, single spaces: "Warm & COZY!" -> "warm cozy". */
export function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9']+/g, " ").trim()} `;
}

export type PhraseMatch = { row: DictionaryRow; matched: string };

/**
 * Dictionary rows whose `matches` appear in `text` as whole words. Longest triggers win: once
 * "too grey" matched, its words cannot also trigger a shorter phrase, so "too grey" never also
 * reads as a liking for grey. `forKind` limits the search to one kind (the "what do you not
 * want" box only looks at Avoid rows plus any Preference the words clearly state).
 */
export function matchPhrases(text: string, dictionary: DictionaryRow[], forKind?: DictionaryRow["kind"]): PhraseMatch[] {
  let hay = normalise(text);
  if (!hay.trim()) return [];
  const triggers: { row: DictionaryRow; trigger: string }[] = [];
  for (const row of dictionary) {
    if (forKind && row.kind !== forKind) continue;
    for (const m of row.matches) {
      const t = normalise(m).trim();
      if (t) triggers.push({ row, trigger: t });
    }
  }
  triggers.sort((a, b) => b.trigger.length - a.trigger.length);
  const out: PhraseMatch[] = [];
  const seen = new Set<string>();
  for (const { row, trigger } of triggers) {
    const needle = ` ${trigger} `;
    const at = hay.indexOf(needle);
    if (at < 0) continue;
    hay = hay.slice(0, at) + " ".repeat(needle.length - 1) + hay.slice(at + needle.length - 1); // consume
    if (!seen.has(row.id)) {
      seen.add(row.id);
      out.push({ row, matched: trigger });
    }
  }
  return out;
}

export function attrsOf(row: DictionaryRow): AttrSet {
  const a: AttrSet = {};
  if (row.undertone.length) a.undertone = row.undertone;
  if (row.tone_depth_min !== null || row.tone_depth_max !== null) a.tone = [row.tone_depth_min ?? 1, row.tone_depth_max ?? 5];
  if (row.busyness.length) a.busyness = row.busyness;
  if (row.texture.length) a.texture = row.texture;
  if (row.style.length) a.style = row.style;
  if (row.width_min_in !== null || row.width_max_in !== null) a.width = [row.width_min_in, row.width_max_in];
  return a;
}

export function preferenceFromRow(row: DictionaryRow, source: Preference["source"] = "said"): Preference {
  return {
    id: `dict:${row.id}`,
    label: row.phrase,
    kind: row.kind === "Avoid" ? "avoid" : "prefer",
    source,
    weight: row.weight,
    attrs: attrsOf(row),
    say: row.say_to_client,
    also: [row.also_look_for && `Look for: ${row.also_look_for}`, row.also_avoid && `Avoid: ${row.also_avoid}`].filter(Boolean).join(" · ") || null,
  };
}

/**
 * Preferences from the two free-text answers. Words in "what you'd like" can trigger any row;
 * words in "what you don't want" trigger Avoid rows, and a Preference phrase there ("not too
 * modern") is turned into an avoid of the same attributes, because the client said it as a dislike.
 */
export function preferencesFromWords(like: string, dislike: string, dictionary: DictionaryRow[]): Preference[] {
  const prefs: Preference[] = [];
  const ids = new Set<string>();
  for (const { row } of matchPhrases(like, dictionary)) {
    prefs.push(preferenceFromRow(row));
    ids.add(row.id);
  }
  for (const { row } of matchPhrases(dislike, dictionary)) {
    if (ids.has(row.id)) continue;
    const p = preferenceFromRow(row);
    prefs.push(row.kind === "Avoid" ? p : { ...p, id: `not:${row.id}`, label: `Not ${row.phrase.toLowerCase()}`, kind: "avoid", say: null });
  }
  return prefs;
}
