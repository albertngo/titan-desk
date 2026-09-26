import { expect, test } from "@playwright/test";

// Smoke against a local stack. Sign-in is exercised manually (Entra), so these run with
// E2E_SESSION_COOKIE set to a signed-in session's cookie header, or they check the public surface only.
test("manifest is served without cookies", async ({ request }) => {
  const r = await request.get("/manifest.webmanifest");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("application/manifest+json");
  const m = await r.json();
  expect(m.display).toBe("standalone");
});

test("anonymous visitors are sent to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /Microsoft 365/ })).toBeVisible();
});

test.describe("signed in", () => {
  test.skip(!process.env.E2E_SESSION_COOKIE, "needs E2E_SESSION_COOKIE");
  test.use({ extraHTTPHeaders: { cookie: process.env.E2E_SESSION_COOKIE ?? "" } });

  test("search, card, detail, report link", async ({ page }) => {
    await page.goto("/?q=macaroon");
    const card = page.getByRole("link", { name: /Macaroon/ }).first();
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Macaroon/);
    await expect(page.getByRole("link", { name: /Report an issue/ })).toHaveAttribute("href", /airtable\.com/);
  });
});
