import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { uploadAttachment } from "../src/lib/airtable/client";
import { QUOTE, T } from "../src/lib/airtable/fields";

// INVENTED ids and bytes only: this repo is public.
describe("attachment upload (2026-11-05)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the file as Airtable's upload endpoint names it: contentType, file (base64), filename", async () => {
    vi.stubEnv("QUOTE_AIRTABLE_TOKEN", "test-token");
    vi.stubEnv("QUOTE_MODE", "");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await uploadAttachment(T.quotes, "recAAAAAAAAAAAAAA", QUOTE.payoutCards, { contentType: "image/jpeg", filename: "card.jpg", base64: "/9j/AAAA" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(new RegExp(`^https://content\\.airtable\\.com/v0/app[A-Za-z0-9]{14}/recAAAAAAAAAAAAAA/${QUOTE.payoutCards}/uploadAttachment$`));
    expect(JSON.parse(String(init.body))).toEqual({ contentType: "image/jpeg", file: "/9j/AAAA", filename: "card.jpg" });
  });
});
