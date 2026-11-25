import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { galleryLink, galleryProjectId, galleryToken } from "../src/lib/gallery/token";

// INVENTED ids only: this repo is public.
const CAM = "https://app.companycam.com/projects/123456";

describe("job photo gallery links (2026-11-25)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("makes no link without the key or the customer address", () => {
    expect(galleryToken("123456")).toBeNull();
    expect(galleryLink(CAM)).toBeNull();
    vi.stubEnv("QUOTE_GALLERY_KEY", "test-key-not-real");
    expect(galleryLink(CAM)).toBeNull();
  });

  it("signs a project id and reads it back, and refuses anything else", () => {
    vi.stubEnv("QUOTE_GALLERY_KEY", "test-key-not-real");
    vi.stubEnv("QUOTE_CUSTOMER_URL", "https://quote.example/");
    const t = galleryToken("123456")!;
    expect(t).toMatch(/^123456-[0-9a-f]{32}$/);
    expect(galleryProjectId(t)).toBe("123456");
    expect(galleryLink(CAM)).toBe(`https://quote.example/g/${t}`);
    // Another project with this signature, a made-up signature, or junk: nothing.
    expect(galleryProjectId(t.replace("123456", "123457"))).toBeNull();
    expect(galleryProjectId(`123456-${"a".repeat(32)}`)).toBeNull();
    expect(galleryProjectId("../etc")).toBeNull();
    expect(galleryLink("https://example.com/projects/123456")).toBeNull();
    // A new key turns every old link off.
    vi.stubEnv("QUOTE_GALLERY_KEY", "another-key");
    expect(galleryProjectId(t)).toBeNull();
  });
});
