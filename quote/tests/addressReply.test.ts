import { describe, expect, it } from "vitest";
import type { Message } from "../src/lib/conversation/thread";
import { ADDRESS_ASK, addressLine, findAddress, isAddressAsk, parseAddresses, withoutQuote } from "../src/lib/link/addressReply";

// INVENTED addresses only: this repo is public.

/** What a person reads off an address; `key` is only for comparing. */
const one = (text: string) => parseAddresses(text).map((a) => ({ street: a.street, unit: a.unit, city: a.city, postalCode: a.postalCode }));

describe("reading a street address out of a message", () => {
  it("reads the plain forms customers text", () => {
    expect(one("55 elm cres")).toEqual([{ street: "55 Elm Cres", unit: null, city: null, postalCode: null }]);
    expect(one("Hi! It's 1200 Maplewood Drive")).toEqual([{ street: "1200 Maplewood Drive", unit: null, city: null, postalCode: null }]);
    expect(one("12 Queen St West")).toEqual([{ street: "12 Queen St West", unit: null, city: null, postalCode: null }]);
    expect(one("88 dundas st e")).toEqual([{ street: "88 Dundas St E", unit: null, city: null, postalCode: null }]);
    expect(one("100 St Clair Ave W")).toEqual([{ street: "100 St Clair Ave W", unit: null, city: null, postalCode: null }]);
    expect(one("45 Mount Pleasant Rd")).toEqual([{ street: "45 Mount Pleasant Rd", unit: null, city: null, postalCode: null }]);
    expect(one("2050 5th Line")).toEqual([{ street: "2050 5th Line", unit: null, city: null, postalCode: null }]);
    expect(one("7 o'connor ct")).toEqual([{ street: "7 O'Connor Ct", unit: null, city: null, postalCode: null }]);
    expect(one("24 Birch Crest")).toEqual([{ street: "24 Birch Crest", unit: null, city: null, postalCode: null }]);
    expect(one("1400 Birchwood Drive #210")).toEqual([{ street: "1400 Birchwood Drive", unit: "210", city: null, postalCode: null }]);
    expect(one("9876 Highway 7")).toEqual([{ street: "9876 Highway 7", unit: null, city: null, postalCode: null }]);
  });

  it("keeps a unit however it is written", () => {
    for (const text of ["Unit 4, 55 Elm Cres", "unit 4 55 elm cres", "#4 55 Elm Cres", "4-55 Elm Cres", "55 Elm Cres unit 4", "55 Elm Cres, Unit 4", "55 Elm Cres #4", "55 Elm Cres apt 4"]) {
      expect(one(text), text).toEqual([{ street: "55 Elm Cres", unit: "4", city: null, postalCode: null }]);
    }
    expect(addressLine({ street: "55 Elm Cres", unit: "4" })).toBe("55 Elm Cres #4");
    expect(addressLine({ street: "55 Elm Cres", unit: null })).toBe("55 Elm Cres");
  });

  it("takes the city and postal code only when they were typed", () => {
    expect(one("55 Elm Cres, Brampton, ON L6X 0A1")).toEqual([{ street: "55 Elm Cres", unit: null, city: "Brampton", postalCode: "L6X 0A1" }]);
    expect(one("55 elm cres brampton l6x0a1")).toEqual([{ street: "55 Elm Cres", unit: null, city: "Brampton", postalCode: "L6X 0A1" }]);
    expect(one("55 Elm Cres in richmond hill")).toEqual([{ street: "55 Elm Cres", unit: null, city: "Richmond Hill", postalCode: null }]);
    expect(one("55 Elm St, St. Catharines")).toEqual([{ street: "55 Elm St", unit: null, city: "St. Catharines", postalCode: null }]);
    expect(one("55 Elm Cres, Unit 4, North York")).toEqual([{ street: "55 Elm Cres", unit: "4", city: "North York", postalCode: null }]);
    // A town not on the list counts when the province follows it; nothing else is guessed.
    expect(one("55 Elm Cres, Smalltown ON")).toEqual([{ street: "55 Elm Cres", unit: null, city: "Smalltown", postalCode: null }]);
    expect(one("55 Elm Cres thanks on Tuesday")).toEqual([{ street: "55 Elm Cres", unit: null, city: null, postalCode: null }]);
    expect(one("55 Elm Cres. My friend in Milton recommended you")).toEqual([{ street: "55 Elm Cres", unit: null, city: null, postalCode: null }]);
  });

  it("does not read numbers that are not addresses", () => {
    for (const text of [
      "about 450 sq ft in the basement",
      "we have 3 rooms and 2 stairs",
      "call me at 416 555 0199",
      "416-555-0199",
      "I can do 2:30 or 5pm",
      "the quote was $4500",
      "2 more line items please",
      "13 steps on the main staircase",
      "Thursday works, see you then",
      "300 total square feet",
    ]) {
      expect(parseAddresses(text), text).toEqual([]);
    }
  });

  it("finds two addresses in one message as two", () => {
    expect(parseAddresses("It's 55 Elm Cres, not 60 Elm Cres").map((a) => a.street)).toEqual(["55 Elm Cres", "60 Elm Cres"]);
  });

  it("reads the same street the same way however it was typed", () => {
    const [a] = parseAddresses("55 elm crescent");
    const [b] = parseAddresses("55 Elm Cres.");
    expect(a.key).toBe(b.key);
  });
});

describe("our address ask", () => {
  it("knows the workflow's words, and a person's own", () => {
    expect(isAddressAsk(ADDRESS_ASK)).toBe(true);
    expect(isAddressAsk(`Hi Jane! ${ADDRESS_ASK.toUpperCase()} Thanks`)).toBe(true);
    expect(isAddressAsk("What's the address for the visit?")).toBe(true);
    expect(isAddressAsk("Can you send me your address")).toBe(true);
  });

  it("does not take an email address, or a long message that mentions one, for an ask", () => {
    expect(isAddressAsk("What's your email address?")).toBe(false);
    expect(isAddressAsk("See you Thursday!")).toBe(false);
    expect(isAddressAsk(`Your quote is ready. ${"Details of the work. ".repeat(20)} Reply to confirm your address?`)).toBe(false);
    expect(isAddressAsk(null)).toBe(false);
  });
});

describe("an email reply without what it quotes", () => {
  it("drops the quoted message and its letterhead", () => {
    expect(withoutQuote("55 Elm Cres\n\nOn Mon, Oct 26, 2026 at 9:00 AM Titan wrote:\n> 77 Showroom Rd")).toBe("55 Elm Cres\n");
    expect(withoutQuote("It's 55 Elm Cres\n-----Original Message-----\n77 Showroom Rd")).toBe("It's 55 Elm Cres");
    expect(withoutQuote("It's 55 Elm Cres\n________________________________\nFrom: Titan\n77 Showroom Rd")).toBe("It's 55 Elm Cres");
  });

  it("reads only the top of an email: a footer far below, with no quote line above it, is not theirs", () => {
    const footer = ["Sounds good, thanks", ...Array.from({ length: 40 }, () => ""), "Copyright © 2026 Titan, All rights reserved.", "77 Showroom Rd #1"].join("\n");
    expect(parseAddresses(withoutQuote(footer))).toEqual([]);
    const noCopyright = ["Sounds good, thanks", ...Array.from({ length: 40 }, () => "more of the newsletter"), "77 Showroom Rd #1"].join("\n");
    expect(parseAddresses(withoutQuote(noCopyright))).toEqual([]);
  });
});

// ---------- the thread ----------

let n = 0;
const msg = (direction: "in" | "out", body: string, at: string, o: Partial<Message> = {}): Message => ({
  id: `m${++n}`,
  channel: "sms",
  label: "Text",
  direction,
  body,
  subject: null,
  attachments: [],
  at,
  status: null,
  automated: false,
  callSeconds: null,
  emailId: null,
  ...o,
});
const since = "2026-10-01T00:00:00.000Z";
const ask = (at: string) => msg("out", ADDRESS_ASK, at, { automated: true });
const street = (f: ReturnType<typeof findAddress>) => (f.kind === "found" ? addressLine(f.address) : f.kind);

describe("finding the one site address in a thread", () => {
  it("reads the reply to the workflow's ask", () => {
    const thread = [ask("2026-10-20T14:00:00.000Z"), msg("in", "55 elm cres unit 4 brampton", "2026-10-20T14:05:00.000Z")];
    const f = findAddress(thread, { since });
    expect(f).toMatchObject({ kind: "found", channel: "sms", afterAsk: true, at: "2026-10-20T14:05:00.000Z" });
    expect(f.kind === "found" && f.address).toMatchObject({ street: "55 Elm Cres", unit: "4", city: "Brampton" });
  });

  it("reads an address texted with no ask from us", () => {
    const f = findAddress([msg("in", "Hi, looking for a quote on 1200 Maplewood Dr", "2026-10-20T14:05:00.000Z")], { since });
    expect(f).toMatchObject({ kind: "found", afterAsk: false });
    expect(street(f)).toBe("1200 Maplewood Dr");
  });

  it("reads an address sent before the ask (\"if you haven't already\")", () => {
    const thread = [msg("in", "it's 55 Elm Cres", "2026-10-19T10:00:00.000Z"), ask("2026-10-20T14:00:00.000Z"), msg("in", "I sent it yesterday!", "2026-10-20T14:05:00.000Z")];
    expect(street(findAddress(thread, { since }))).toBe("55 Elm Cres");
  });

  it("joins what came in pieces: the street once, the city later", () => {
    const thread = [ask("2026-10-20T14:00:00.000Z"), msg("in", "55 Elm Cres", "2026-10-20T14:05:00.000Z"), msg("in", "sorry, 55 Elm Cres in Oakville", "2026-10-20T14:06:00.000Z")];
    const f = findAddress(thread, { since });
    expect(f.kind === "found" && f.address).toMatchObject({ street: "55 Elm Cres", city: "Oakville" });
  });

  it("the reply to our latest ask wins over an address mentioned earlier", () => {
    const thread = [
      msg("in", "my neighbour at 60 Elm Cres had you do theirs", "2026-10-18T10:00:00.000Z"),
      ask("2026-10-20T14:00:00.000Z"),
      msg("in", "55 Elm Cres", "2026-10-20T14:05:00.000Z"),
    ];
    expect(street(findAddress(thread, { since }))).toBe("55 Elm Cres");
  });

  it("two different addresses with no reply to settle it is for a person", () => {
    const thread = [msg("in", "the job is at 60 Elm Cres", "2026-10-18T10:00:00.000Z"), msg("in", "actually 55 Elm Cres", "2026-10-19T10:00:00.000Z")];
    const f = findAddress(thread, { since });
    expect(f.kind).toBe("several");
    expect(f.kind === "several" && f.addresses.map((a) => a.street)).toEqual(["60 Elm Cres", "55 Elm Cres"]);
    // A correction inside the reply to the ask is held too.
    expect(findAddress([ask("2026-10-20T14:00:00.000Z"), msg("in", "It's 55 Elm Cres, not 60 Elm Cres", "2026-10-20T14:05:00.000Z")], { since }).kind).toBe("several");
  });

  it("two units on one street is two addresses", () => {
    const thread = [msg("in", "55 Elm Cres unit 4", "2026-10-18T10:00:00.000Z"), msg("in", "55 Elm Cres unit 6", "2026-10-19T10:00:00.000Z")];
    expect(findAddress(thread, { since }).kind).toBe("several");
    // The same street with and without its unit is one address, with the unit.
    expect(street(findAddress([msg("in", "55 Elm Cres", "2026-10-18T10:00:00.000Z"), msg("in", "55 Elm Cres unit 4", "2026-10-19T10:00:00.000Z")], { since }))).toBe("55 Elm Cres #4");
  });

  it("an address we sent first is ours, never the site; one we only echoed back is still theirs", () => {
    const showroom = msg("out", "Our showroom is at 77 Showroom Rd, see you Saturday", "2026-10-15T10:00:00.000Z");
    expect(findAddress([showroom, msg("in", "great, see you at 77 Showroom Rd", "2026-10-16T10:00:00.000Z")], { since }).kind).toBe("none");
    const echoed = [msg("in", "55 Elm Cres", "2026-10-16T10:00:00.000Z"), msg("out", "Got it, 55 Elm Cres on Thursday!", "2026-10-16T10:05:00.000Z")];
    expect(street(findAddress(echoed, { since }))).toBe("55 Elm Cres");
    // The letterhead is always ours.
    expect(findAddress([msg("in", "is the store at 77 Showroom Rd?", "2026-10-16T10:00:00.000Z")], { since, ours: ["77 Showroom Rd, Mississauga ON"] }).kind).toBe("none");
  });

  it("an email counts only after we asked, and never what it quotes", () => {
    const signature = msg("in", "Thanks!\nJane Doe\nAcme Ltd, 500 Office Blvd", "2026-10-16T10:00:00.000Z", { channel: "email", label: "Email" });
    expect(findAddress([signature], { since }).kind).toBe("none");
    const reply = msg("in", "It's 55 Elm Cres\n\nOn Tue, Oct 20, 2026 Titan wrote:\n> 77 Showroom Rd", "2026-10-20T15:00:00.000Z", { channel: "email", label: "Email" });
    expect(street(findAddress([ask("2026-10-20T14:00:00.000Z"), reply], { since }))).toBe("55 Elm Cres");
  });

  it("reads only this job's window, and only what the customer wrote", () => {
    expect(findAddress([msg("in", "55 Elm Cres", "2025-06-01T10:00:00.000Z")], { since }).kind).toBe("none");
    expect(findAddress([msg("out", "Is it 55 Elm Cres?", "2026-10-16T10:00:00.000Z")], { since }).kind).toBe("none");
    expect(findAddress([msg("in", "55 Elm Cres", "2026-10-16T10:00:00.000Z", { channel: "note", label: "Internal note" })], { since }).kind).toBe("none");
    expect(findAddress([msg("in", "55 Elm Cres", "2026-10-16T10:00:00.000Z", { at: null })], { since }).kind).toBe("none");
    expect(findAddress([], { since }).kind).toBe("none");
  });

  it("reads a chat the same as a text", () => {
    const f = findAddress([msg("in", "55 Elm Cres", "2026-10-16T10:00:00.000Z", { channel: "chat", label: "Chat" })], { since });
    expect(f).toMatchObject({ kind: "found", channel: "chat" });
  });
});
