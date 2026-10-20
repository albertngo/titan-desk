import { describe, expect, it } from "vitest";
import {
  attachmentOf,
  callLength,
  emailPeek,
  channelOf,
  hasMore,
  htmlToText,
  isAutomated,
  parseMessages,
  photos,
  sortThread,
  summarize,
  type Message,
} from "../src/lib/conversation/thread";

// INVENTED messages only: this repo is public.
const raw = (o: Record<string, unknown> = {}) => ({
  id: "m1",
  type: 2,
  messageType: "TYPE_SMS",
  direction: "inbound",
  body: "Hi, here are the photos of the basement",
  dateAdded: "2026-10-18T14:02:00.000Z",
  status: "delivered",
  attachments: ["https://files.example.com/a/IMG_0001.jpg"],
  ...o,
});

describe("reading GHL's message list", () => {
  it("reads the three shapes GHL has used for the list", () => {
    const one = [raw()];
    expect(parseMessages({ messages: { messages: one, nextPage: false } })).toHaveLength(1);
    expect(parseMessages({ messages: one })).toHaveLength(1);
    expect(parseMessages(one)).toHaveLength(1);
    expect(parseMessages(null)).toEqual([]);
    expect(parseMessages({ messages: "nope" })).toEqual([]);
  });

  it("keeps what the screen needs and nothing it cannot use", () => {
    const [m] = parseMessages([raw()]);
    expect(m).toEqual<Message>({
      id: "m1",
      channel: "sms",
      label: "Text",
      direction: "in",
      body: "Hi, here are the photos of the basement",
      subject: null,
      attachments: [{ url: "https://files.example.com/a/IMG_0001.jpg", kind: "image", name: "IMG_0001.jpg" }],
      at: "2026-10-18T14:02:00.000Z",
      status: "delivered",
      automated: false,
      callSeconds: null,
      emailId: null,
    });
  });

  it("drops entries without an id and attachments that are not https", () => {
    expect(parseMessages([{ body: "no id" }, raw({ attachments: ["http://plain.example.com/x.jpg", "javascript:alert(1)", 42] })])).toEqual([
      expect.objectContaining({ id: "m1", attachments: [] }),
    ]);
  });

  it("falls back to the type number when the name is missing", () => {
    expect(parseMessages([raw({ messageType: undefined, type: 3 })])[0].channel).toBe("email");
    expect(parseMessages([raw({ messageType: undefined, type: 1 })])[0].channel).toBe("call");
    expect(parseMessages([raw({ messageType: undefined, type: 999 })])[0].channel).toBe("other");
  });

  it("orders oldest first, undated last, one per id", () => {
    const list = parseMessages([
      raw({ id: "c", dateAdded: "2026-10-18T16:00:00.000Z" }),
      raw({ id: "a", dateAdded: "2026-10-18T10:00:00.000Z" }),
      raw({ id: "a", dateAdded: "2026-10-18T10:00:00.000Z" }),
      raw({ id: "n", dateAdded: undefined }),
      raw({ id: "b", dateAdded: "2026-10-18T12:00:00.000Z" }),
    ]);
    expect(list.map((m) => m.id)).toEqual(["a", "b", "c", "n"]);
  });

  it("turns an HTML email body into text and remembers the id to fetch the full email with", () => {
    const [m] = parseMessages([
      raw({
        id: "e1",
        type: 3,
        messageType: "TYPE_EMAIL",
        direction: "outbound",
        body: "<div><p>Hi Jane,</p><p>Your quote is attached.&nbsp;Thanks &amp; regards</p><style>p{}</style></div>",
        meta: { email: { messageIds: ["em-77"], subject: "Your flooring quote" } },
      }),
    ]);
    expect(m.body).toBe("Hi Jane,\nYour quote is attached. Thanks & regards");
    expect(m.subject).toBe("Your flooring quote");
    expect(m.emailId).toBe("em-77");
    expect(m.direction).toBe("out");
  });

  it("reads a call's length", () => {
    const [m] = parseMessages([raw({ type: 1, messageType: "TYPE_CALL", body: undefined, meta: { call: { duration: 184, status: "completed" } } })]);
    expect(m.channel).toBe("call");
    expect(m.body).toBeNull();
    expect(callLength(m.callSeconds)).toBe("3 min");
    expect(callLength(45)).toBe("45 s");
    expect(callLength(null)).toBeNull();
  });

  it("says whether older messages exist", () => {
    expect(hasMore({ messages: { messages: [], nextPage: true } })).toBe(true);
    expect(hasMore({ messages: { messages: [], nextPage: false } })).toBe(false);
    expect(hasMore({ messages: [] })).toBe(false);
    expect(hasMore(null)).toBe(false);
  });
});

describe("channels and automation", () => {
  it("names the channel from GHL's type name", () => {
    expect(channelOf("TYPE_SMS")).toBe("sms");
    expect(channelOf("TYPE_CUSTOM_PROVIDER_EMAIL")).toBe("email");
    expect(channelOf("TYPE_CAMPAIGN_VOICEMAIL")).toBe("call");
    expect(channelOf("TYPE_WHATSAPP")).toBe("chat");
    expect(channelOf("TYPE_LIVE_CHAT")).toBe("chat");
    expect(channelOf("TYPE_INTERNAL_COMMENT")).toBe("note");
    expect(channelOf("TYPE_ACTIVITY_APPOINTMENT")).toBe("activity");
    expect(channelOf("TYPE_LIVE_CHAT_INFO_MESSAGE")).toBe("activity");
    expect(channelOf(null)).toBe("other");
  });

  it("marks workflow, campaign and activity messages as automated, and a person's or the API's as not", () => {
    expect(isAutomated("TYPE_SMS", "workflow")).toBe(true);
    expect(isAutomated("TYPE_CAMPAIGN_SMS", null)).toBe(true);
    expect(isAutomated("TYPE_SMS_REVIEW_REQUEST", "app")).toBe(true);
    expect(isAutomated("TYPE_ACTIVITY_OPPORTUNITY", null)).toBe(true);
    expect(isAutomated("TYPE_SMS", "app")).toBe(false);
    // The quote app's own sends arrive through the API: those are worth seeing.
    expect(isAutomated("TYPE_EMAIL", "api")).toBe(false);
    expect(isAutomated("TYPE_SMS", null)).toBe(false);
  });

  it("keeps automated messages in the thread, marked", () => {
    const list = parseMessages([raw({ id: "p" }), raw({ id: "w", source: "workflow" })]);
    expect(list.map((m) => [m.id, m.automated])).toEqual([["p", false], ["w", true]]);
  });
});

describe("attachments", () => {
  it("treats known picture extensions, and no extension at all, as pictures; other files as links", () => {
    expect(attachmentOf("https://files.example.com/x/photo.HEIC")?.kind).toBe("image");
    expect(attachmentOf("https://files.example.com/x/abc123")?.kind).toBe("image");
    expect(attachmentOf("https://files.example.com/x/plan.pdf")).toEqual({ url: "https://files.example.com/x/plan.pdf", kind: "file", name: "plan.pdf" });
    expect(attachmentOf("https://files.example.com/x/Floor%20plan.pdf")?.name).toBe("Floor plan.pdf");
    expect(attachmentOf({ url: "https://files.example.com/y.png" })?.name).toBe("y.png");
    expect(attachmentOf("ftp://files.example.com/y.png")).toBeNull();
    expect(attachmentOf("")).toBeNull();
  });

  it("lists the thread's pictures newest first", () => {
    const list = parseMessages([
      raw({ id: "a", dateAdded: "2026-10-18T10:00:00.000Z", attachments: ["https://f.example.com/1.jpg", "https://f.example.com/notes.pdf"] }),
      raw({ id: "b", dateAdded: "2026-10-18T12:00:00.000Z", attachments: ["https://f.example.com/2.jpg"] }),
    ]);
    expect(photos(list).map((p) => p.name)).toEqual(["2.jpg", "1.jpg"]);
  });
});

describe("the summary line", () => {
  it("counts every message and picture, and finds the last message each way", () => {
    const list = parseMessages([
      raw({ id: "a", direction: "inbound", dateAdded: "2026-10-17T10:00:00.000Z" }),
      raw({ id: "b", direction: "outbound", dateAdded: "2026-10-18T10:00:00.000Z", attachments: [] }),
      raw({ id: "w", direction: "outbound", source: "workflow", dateAdded: "2026-10-19T10:00:00.000Z", attachments: [] }),
    ]);
    expect(summarize(list)).toEqual({ total: 3, photos: 1, automated: 1, lastIn: "2026-10-17T10:00:00.000Z", lastOut: "2026-10-19T10:00:00.000Z" });
    expect(summarize([])).toEqual({ total: 0, photos: 0, automated: 0, lastIn: null, lastOut: null });
  });
});

describe("an email's peek", () => {
  it("shows a short email whole, with nothing to expand", () => {
    expect(emailPeek("Thanks, see you Tuesday.")).toEqual({ peek: "Thanks, see you Tuesday.", more: false });
  });

  it("cuts a long first paragraph at a word and says there is more", () => {
    const body = "Hi Jane, thanks for sending the measurements over. I have put together two options for the basement, one in vinyl plank and one in engineered oak, and attached the quote.";
    const r = emailPeek(body, 80);
    expect(r.more).toBe(true);
    expect(r.peek.length).toBeLessThanOrEqual(81);
    expect(r.peek).toMatch(/…$/);
    expect(r.peek).toBe("Hi Jane, thanks for sending the measurements over. I have put together two…");
  });

  it("stops at the first blank line even when that paragraph is short", () => {
    expect(emailPeek("Hi Jane,\n\nYour quote is attached.\n\nThanks")).toEqual({ peek: "Hi Jane,", more: true });
  });
});

describe("html to text", () => {
  it("keeps paragraph breaks and decodes entities", () => {
    expect(htmlToText("<p>One</p><p>Two<br>Three</p>")).toBe("One\nTwo\nThree");
    expect(htmlToText("a &lt;b&gt; &quot;c&quot; &#39;d&#39; &#8212; e")).toBe("a <b> \"c\" 'd' — e");
    expect(htmlToText("<head><title>x</title></head><body>  hi   there </body>")).toBe("hi there");
  });

  it("sortThread leaves a sorted list alone", () => {
    const list = parseMessages([raw({ id: "a" }), raw({ id: "b", dateAdded: "2026-10-19T00:00:00.000Z" })]);
    expect(sortThread(list)).toEqual(list);
  });
});
