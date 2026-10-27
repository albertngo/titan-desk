import { sortThread, type Channel, type Message } from "@/lib/conversation/thread";

/**
 * Address arrived (named 2026-10-15, built 2026-10-27, Albert: "filled auto"): reading a site
 * address out of what the customer wrote, so a quote booked before anyone had the address fills
 * itself and staff only confirm it. Pure, no I/O: src/lib/quotes/address.ts reads GHL and writes.
 * Tested in tests/addressReply.test.ts with invented addresses only (this repo is public).
 *
 * Rules (Albert, 2026-10-27):
 * - The address can come as a reply to the booking workflow's ask (ADDRESS_ASK), to an ask a
 *   person typed in their own words, or texted with no ask from us at all.
 * - A text or a chat counts at any time in the window. An email counts only after we asked: an
 *   email signature carries addresses that are not the site.
 * - An address we sent them before they wrote it is ours (the showroom, a letterhead), never the site.
 * - One address or nothing. Replies to our latest ask come first; otherwise two different
 *   addresses are for a person to read, and nothing is filled.
 * - Nothing is guessed: a unit, city or postal code is kept only when they typed one.
 */

/** The booking workflow's own words (Albert, 2026-10-27). */
export const ADDRESS_ASK = "Just to make sure we have the right address, could you send it to me here if you haven't already?";

export type FoundAddress = {
  /** "55 Elm Cres W": number, street name, street type, direction. */
  street: string;
  unit: string | null;
  city: string | null;
  postalCode: string | null;
  /** The same street however it was typed ("55 elm crescent" = "55 Elm Cres"), unit left out. */
  key: string;
};

export type AddressFinding =
  | { kind: "found"; address: FoundAddress; messageId: string; at: string; channel: Channel; afterAsk: boolean }
  | { kind: "several"; addresses: FoundAddress[] }
  | { kind: "none" };

/** What goes on the GHL contact's street line, the way staff type it there: "55 Elm Cres #4". */
export function addressLine(a: Pick<FoundAddress, "street" | "unit">): string {
  return a.unit ? `${a.street} #${a.unit}` : a.street;
}

// ---------- asking ----------

const squash = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9?]+/g, " ").trim();

/** A person's ask is short; a whole quote email that happens to say "address" is not one. */
const ASK_MAX_CHARS = 300;

/** Our message asks for their address: the workflow's words, or a person's ("what's the address?"). An email address is not the address. */
export function isAddressAsk(body: string | null): boolean {
  if (!body) return false;
  const b = squash(body);
  if (b.includes(squash(ADDRESS_ASK))) return true;
  if (body.length > ASK_MAX_CHARS) return false;
  const asked = b.replace(/\be ?mail address(es)?\b/g, " ");
  if (!/\baddress(es)?\b/.test(asked)) return false;
  return b.includes("?") || /\b(send|share|text|confirm|provide|whats|what is|need|let us know|let me know)\b/.test(b);
}

// ---------- reading an address ----------

/** Street types, as typed, to one spelling each for comparing. Words that are often not streets (Park, Hill, View, Square…) are left out on purpose. */
const TYPES: Record<string, string> = {
  street: "st", st: "st", str: "st",
  avenue: "ave", ave: "ave", av: "ave",
  road: "rd", rd: "rd",
  drive: "dr", dr: "dr",
  crescent: "cres", cres: "cres", cresc: "cres", cr: "cres",
  crest: "crest",
  court: "crt", crt: "crt", ct: "crt",
  boulevard: "blvd", blvd: "blvd", blv: "blvd",
  way: "way",
  lane: "lane", ln: "lane",
  place: "pl", pl: "pl",
  trail: "trail", trl: "trail",
  circle: "cir", cir: "cir", circ: "cir",
  circuit: "circt", circt: "circt",
  gate: "gate", gt: "gate",
  terrace: "terr", terr: "terr", ter: "terr",
  parkway: "pkwy", pkwy: "pkwy",
  heights: "hts", hts: "hts",
  grove: "grove", grv: "grove",
  line: "line",
  sideroad: "sdrd", sdrd: "sdrd",
  path: "path",
  mews: "mews",
  gardens: "gdns", gdns: "gdns",
  glen: "glen",
  ridge: "ridge",
  hollow: "hollow",
  landing: "landng",
  crossing: "cross",
  promenade: "prom",
  highway: "hwy", hwy: "hwy",
};

const DIRS: Record<string, string> = { n: "n", s: "s", e: "e", w: "w", ne: "ne", nw: "nw", se: "se", sw: "sw", north: "n", south: "s", east: "e", west: "w" };

const UNIT_WORDS = new Set(["unit", "apt", "apartment", "suite", "ste"]);

/** Words that are never part of a street name, so "300 sq ft", "2 more line" and "3 bedroom way" are not addresses. */
const STOP = new Set(
  (
    "a an the and or of in on at to for by with from my our your his her their its it it's is was are be " +
    "i we you they me us them this that these those there here also just only all both each every few many much some any no not " +
    "more less other same total about around approx approximately roughly over under " +
    "one two three four five six seven eight nine ten " +
    "sq sqft ft feet foot square metres meters m inch inches " +
    "step steps stair stairs room rooms floor floors bedroom bedrooms bed beds bath baths bathroom bathrooms kitchen basement level levels storey story " +
    "min mins minutes hour hours day days week weeks month months year years pm am " +
    "box boxes piece pieces plank planks colour colours color colors sample samples quote quotes option options coat coats door doors window windows kids people times x " +
    "hi hello hey thanks thank thx ty please pls yes yeah ok okay sure great"
  ).split(" "),
);

/** Cities and towns Titan works in, written the way the contact should get them. A city typed that is not here is kept only when a province or postal code follows it. */
const CITIES = [
  "Toronto", "North York", "East York", "York", "Etobicoke", "Scarborough",
  "Mississauga", "Port Credit", "Streetsville", "Meadowvale", "Brampton", "Bolton", "Caledon",
  "Oakville", "Milton", "Burlington", "Halton Hills", "Georgetown", "Acton",
  "Hamilton", "Stoney Creek", "Ancaster", "Dundas", "Waterdown", "Flamborough", "Binbrook", "Grimsby",
  "Vaughan", "Woodbridge", "Maple", "Concord", "Kleinburg", "Thornhill", "Markham", "Unionville",
  "Richmond Hill", "King City", "Nobleton", "Aurora", "Newmarket", "Stouffville", "Whitchurch-Stouffville",
  "East Gwillimbury", "Keswick", "Bradford", "Innisfil", "Barrie",
  "Pickering", "Ajax", "Whitby", "Oshawa", "Courtice", "Bowmanville", "Clarington", "Uxbridge",
  "Guelph", "Cambridge", "Kitchener", "Waterloo", "Brantford", "Orangeville", "Erin", "Shelburne", "Alliston",
  "St. Catharines", "Niagara Falls", "Welland",
];
const cityKey = (s: string) => s.toLowerCase().replace(/\./g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
const CITY_BY_KEY = new Map(CITIES.map((c) => [cityKey(c), c]));
const CITY_MAX_WORDS = 3;
/** "ON" only in capitals: a lowercase "on" is the word ("thanks on Tuesday"). */
const isProvince = (t: Tok) => t.word === "ON" || t.low === "ont" || t.low === "ontario";

const POSTAL = /\b([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])[ -]?(\d[ABCEGHJ-NPRSTV-Z]\d)\b/i;

type Tok = { raw: string; word: string; low: string; brk: boolean };

/** Words with their trailing punctuation noted: a comma, a new line or "!" / "?" ends a street. */
function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  for (const raw of text.replace(/\r?\n+/g, " , ").split(/\s+/).filter(Boolean)) {
    const word = raw.replace(/^[("'“‘]+/, "").replace(/[),;:!?"'”’.]+$/, "");
    const brk = /[,;:!?]["')”’]*$/.test(raw);
    if (!word) {
      if (out.length && /[,;:!?]/.test(raw)) out[out.length - 1].brk = true;
      continue;
    }
    out.push({ raw, word, low: word.toLowerCase(), brk });
  }
  return out;
}

const NUMBER = /^([1-9]\d{0,5}[a-z]?)$/i;
const UNIT_DASH = /^([a-z]?\d{1,5}[a-z]?)-([1-9]\d{0,5}[a-z]?)$/i;
const UNIT_VALUE = /^#?([a-z]?\d{1,5}[a-z]?)$/i;
const UNIT_GLUED = /^(?:unit|apt|suite|ste)#?([a-z]?\d{1,5}[a-z]?)$/i;
const NAME_WORD = /^(?:[a-z][a-z'’.-]*|\d+(?:st|nd|rd|th))$/i;

const nameOk = (t: Tok | undefined) => Boolean(t && !t.brk && NAME_WORD.test(t.word) && t.word.length <= 20 && !STOP.has(t.low));
const typeOf = (t: Tok | undefined) => (t ? TYPES[t.low.replace(/\.$/, "")] : undefined);

/** "elm" → "Elm", "ST." → "St", "o'connor" → "O'Connor", "2ND" → "2nd"; mixed case is kept as typed. */
function title(word: string): string {
  const w = word.replace(/\.$/, "");
  if (/^\d/.test(w)) return w.toLowerCase();
  if (w !== w.toLowerCase() && w !== w.toUpperCase()) return w;
  return w
    .toLowerCase()
    .replace(/(^|[-\s])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/^([a-z])['’]([a-z])/i, (_, a: string, b: string) => `${a.toUpperCase()}'${b.toUpperCase()}`);
}

function unitBefore(t: Tok[], i: number): string | null {
  const one = t[i - 1];
  const two = t[i - 2];
  if (one && two && UNIT_WORDS.has(two.low) && UNIT_VALUE.test(one.word)) return one.word.replace(/^#/, "").toUpperCase();
  if (one && /^#/.test(one.raw) && UNIT_VALUE.test(one.word)) return one.word.replace(/^#/, "").toUpperCase();
  const glued = one?.word.match(UNIT_GLUED);
  return glued ? glued[1].toUpperCase() : null;
}

/** A unit right after the street: "unit 4", "apt 4", "#4", "unit4". Returns the unit and how many words it took. */
function unitAfter(t: Tok[], j: number): [string, number] | null {
  const a = t[j];
  const b = t[j + 1];
  if (a && b && UNIT_WORDS.has(a.low) && UNIT_VALUE.test(b.word)) return [b.word.replace(/^#/, "").toUpperCase(), 2];
  if (a && /^#/.test(a.raw) && UNIT_VALUE.test(a.word)) return [a.word.replace(/^#/, "").toUpperCase(), 1];
  const glued = a?.word.match(UNIT_GLUED);
  return glued ? [glued[1].toUpperCase(), 1] : null;
}

/** The city right after the street: a known one (after an optional "in"), or any one or two words followed by the province or a postal code. */
function cityAfter(t: Tok[], j: number): string | null {
  let k = j;
  if (t[k]?.low === "in") k++;
  for (let n = CITY_MAX_WORDS; n >= 1; n--) {
    const words = t.slice(k, k + n);
    if (words.length < n || words.slice(0, -1).some((w) => w.brk)) continue;
    const known = CITY_BY_KEY.get(cityKey(words.map((w) => w.word).join(" ")));
    if (known) return known;
  }
  for (let n = 2; n >= 1; n--) {
    const words = t.slice(k, k + n);
    const next = t[k + n];
    if (words.length < n || !next || words.slice(0, -1).some((w) => w.brk)) continue;
    if (!words.every((w) => /^[a-z][a-z'’.-]*$/i.test(w.word) && !STOP.has(w.low))) continue;
    if (isProvince(next) || POSTAL.test(t.slice(k + n, k + n + 2).map((w) => w.word).join(" "))) return words.map((w) => title(w.word)).join(" ");
  }
  return null;
}

/** Every street address in one message, in the order written. */
export function parseAddresses(text: string | null): FoundAddress[] {
  if (!text) return [];
  const t = tokenize(text);
  const found: FoundAddress[] = [];
  for (let i = 0; i < t.length; i++) {
    const tok = t[i];
    if (tok.brk) continue;
    const dash = tok.word.match(UNIT_DASH);
    const plain = dash ? null : tok.word.match(NUMBER);
    if (!dash && !plain) continue;
    const number = (dash ? dash[2] : plain![1]).toUpperCase();
    let unit = dash ? dash[1].toUpperCase() : unitBefore(t, i);

    let street: string | null = null;
    let key = "";
    let j = i + 1;
    // "1234 Highway 7": the type comes before its number.
    if (typeOf(t[j]) === "hwy" && !t[j].brk && /^\d{1,3}$/.test(t[j + 1]?.word ?? "")) {
      street = `${number} Highway ${t[j + 1].word}`;
      key = `${number.toLowerCase()}|hwy ${t[j + 1].word}`;
      j += 2;
    } else {
      // The shortest name that reaches a street type: "55 Elm St, St. Catharines" is Elm St, and
      // "100 St Clair Ave W" still reads St Clair because "St" alone is followed by no type.
      for (let n = 1; n <= 3 && !street; n++) {
        const name = t.slice(i + 1, i + 1 + n);
        if (name.length < n || !name.every((w) => nameOk(w))) continue;
        const type = typeOf(t[i + 1 + n]);
        if (!type) continue;
        j = i + 2 + n;
        let dir = "";
        let dirKey = "";
        const typeTok = t[i + 1 + n];
        const d = t[j];
        if (!typeTok.brk && d && DIRS[d.low]) {
          dir = d.word.length <= 2 ? ` ${d.word.toUpperCase()}` : ` ${title(d.word)}`;
          dirKey = DIRS[d.low];
          j++;
        }
        street = `${number} ${name.map((w) => title(w.word)).join(" ")} ${title(typeTok.word)}${dir}`;
        key = `${number.toLowerCase()}|${name.map((w) => w.low.replace(/[.'’]/g, "")).join(" ")}|${type}|${dirKey}`;
      }
    }
    if (!street) continue;

    const u = unitAfter(t, j);
    if (u) {
      unit = unit ?? u[0];
      j += u[1];
    }
    const city = cityAfter(t, j);
    const rest = t.slice(j, j + 8).map((w) => w.word).join(" ");
    const postal = rest.match(POSTAL);
    found.push({ street, unit, city, postalCode: postal ? `${postal[1]} ${postal[2]}`.toUpperCase() : null, key });
    i = j - 1;
  }
  return found;
}

// ---------- finding the one address in a thread ----------

/** Where a reply's own words end: the quoted message, a separator line, a signature tag or a newsletter footer. */
const QUOTE_START = /^\s*(On .{3,200} wrote:|-{2,}\s*Original Message|From:\s|Sent from my |_{5,}\s*$|-{5,}\s*$|Copyright\b)/i;
/**
 * The customer's answer is at the top of an email. Further down is what it quotes or forwards, and
 * one reply carried our own newsletter footer, old showroom address and all, with no "wrote:" line
 * above it (2026-10-27).
 */
const EMAIL_TOP_LINES = 20;

/** An email reply without what it quotes: its own top lines only, where our letterhead never is. */
export function withoutQuote(body: string): string {
  const lines = body.split(/\r?\n/);
  const cut = lines.findIndex((l) => QUOTE_START.test(l));
  return (cut >= 0 ? lines.slice(0, cut) : lines)
    .slice(0, EMAIL_TOP_LINES)
    .filter((l) => !/^\s*>/.test(l))
    .join("\n");
}

const CUSTOMER_CHANNELS: readonly Channel[] = ["sms", "chat", "email"];

type Mention = { address: FoundAddress; m: Message & { at: string } };

function settle(mentions: Mention[], asks: string[]): AddressFinding {
  const byKey = new Map<string, Mention[]>();
  for (const x of mentions) byKey.set(x.address.key, [...(byKey.get(x.address.key) ?? []), x]);
  if (byKey.size === 0) return { kind: "none" };
  const groups = [...byKey.values()];
  const firsts = groups.map((g) => g[g.length - 1].address);
  if (groups.length > 1) return { kind: "several", addresses: firsts };
  const g = groups[0];
  const units = new Set(g.map((x) => x.address.unit).filter((u): u is string => u !== null));
  if (units.size > 1) return { kind: "several", addresses: g.map((x) => x.address) };
  const latest = g[g.length - 1];
  const lastOf = (k: "city" | "postalCode") => [...g].reverse().find((x) => x.address[k])?.address[k] ?? null;
  return {
    kind: "found",
    address: { ...latest.address, unit: [...units][0] ?? null, city: lastOf("city"), postalCode: lastOf("postalCode") },
    messageId: latest.m.id,
    at: latest.m.at,
    channel: latest.m.channel,
    afterAsk: asks.some((a) => a < latest.m.at),
  };
}

/**
 * The site address the customer gave in their messages, if exactly one can be read. `since` starts
 * the window (an older thread is an earlier job); `ours` are addresses that are always ours, such
 * as the letterhead.
 */
export function findAddress(messages: Message[], opts: { since: string | null; ours?: (string | null)[] }): AddressFinding {
  const thread = sortThread(messages).filter((m): m is Message & { at: string } => m.at !== null && CUSTOMER_CHANNELS.includes(m.channel));
  const inWindow = (m: { at: string }) => !opts.since || m.at >= opts.since;

  // An address we wrote first is ours: the earliest time we sent each one.
  const ours = new Map<string, string>();
  for (const a of (opts.ours ?? []).flatMap((s) => parseAddresses(s))) ours.set(a.key, "");
  for (const m of thread.filter((x) => x.direction === "out")) {
    for (const a of parseAddresses(m.body)) if (!ours.has(a.key)) ours.set(a.key, m.at);
  }

  const asks = thread.filter((m) => m.direction === "out" && inWindow(m) && isAddressAsk(m.body)).map((m) => m.at);
  const mentions: Mention[] = [];
  for (const m of thread) {
    if (m.direction !== "in" || !inWindow(m)) continue;
    if (m.channel === "email" && !asks.some((a) => a < m.at)) continue;
    const text = m.channel === "email" ? withoutQuote(m.body ?? "") : m.body;
    for (const address of parseAddresses(text)) {
      const sentAt = ours.get(address.key);
      if (sentAt !== undefined && sentAt < m.at) continue;
      mentions.push({ address, m });
    }
  }

  const lastAsk = asks[asks.length - 1];
  if (lastAsk) {
    const replies = mentions.filter((x) => x.m.at > lastAsk);
    if (replies.length > 0) return settle(replies, asks);
  }
  return settle(mentions, asks);
}
