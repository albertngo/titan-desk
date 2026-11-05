import { describe, expect, it } from "vitest";
import { lastSentOf, ONLY_THEMSELVES, resolveSender, sendAsChoices } from "../src/lib/send/sendAs";

/* Send as someone else (2026-11-04; opened to everyone 2026-11-05). Invented addresses except Albert's. */

const ALBERT = ONLY_THEMSELVES[0];
const allow = ["pat@titanfloors.ca", ALBERT, "INFO@titanfloors.ca", "outside@example.com"];
const users = [{ email: "pat@titanfloors.ca", name: "Pat Example" }];

describe("send as (2026-11-05)", () => {
  it("lets everyone pick from the allowed sign-ins on the company domain, themselves first", () => {
    const choices = sendAsChoices("pat@titanfloors.ca", allow, "hello@titanfloors.ca", users);
    expect(choices.map((c) => c.email)).toEqual(["pat@titanfloors.ca", "info@titanfloors.ca"]);
    expect(choices[0].name).toBe("Pat Example");
  });

  it("puts Albert on the list only when Albert is signed in", () => {
    expect(sendAsChoices("info@titanfloors.ca", allow, "hello@titanfloors.ca", users).map((c) => c.email)).not.toContain(ALBERT);
    expect(sendAsChoices(ALBERT.toUpperCase(), allow, "hello@titanfloors.ca", users).map((c) => c.email)).toEqual([ALBERT, "info@titanfloors.ca", "pat@titanfloors.ca"]);
  });

  it("sends as the person picked only when they are on the list; anyone else is refused, never sent as them", () => {
    const pat = { email: "pat@titanfloors.ca", name: "Pat" };
    const choices = sendAsChoices(pat.email, allow, "hello@titanfloors.ca", users);
    expect(resolveSender(pat, "info@titanfloors.ca", choices)).toEqual({ ok: true, sender: { email: "info@titanfloors.ca", name: null }, as: true });
    expect(resolveSender(pat, "outside@example.com", choices).ok).toBe(false);
    expect(resolveSender(pat, ALBERT, choices)).toEqual({ ok: false, message: "Only Albert can send a quote as Albert." });
    // No pick, or picking yourself, is just sending as yourself: the default.
    expect(resolveSender(pat, null, choices)).toEqual({ ok: true, sender: pat, as: false });
    expect(resolveSender(pat, "PAT@titanfloors.ca", [])).toEqual({ ok: true, sender: pat, as: false });
    const albert = { email: ALBERT, name: "Albert" };
    expect(resolveSender(albert, "pat@titanfloors.ca", sendAsChoices(ALBERT, allow, "hello@titanfloors.ca", users)).ok).toBe(true);
  });

  it("says who sent the quote last: the newest version that went out, drafts never", () => {
    expect(lastSentOf([])).toBeNull();
    expect(
      lastSentOf([
        { version: 1, sentBy: "info@titanfloors.ca", sentAt: "2026-11-01", status: "Superseded" },
        { version: 2, sentBy: "Pat@titanfloors.ca", sentAt: "2026-11-03", status: "Sent" },
        { version: 3, sentBy: null, sentAt: null, status: "Draft" },
      ]),
    ).toEqual({ email: "pat@titanfloors.ca", version: 2, on: "2026-11-03" });
    // Same day: the higher version.
    expect(lastSentOf([{ version: 1, sentBy: "a@titanfloors.ca", sentAt: "2026-11-03", status: "Superseded" }, { version: 2, sentBy: "b@titanfloors.ca", sentAt: "2026-11-03", status: "Accepted" }])?.email).toBe("b@titanfloors.ca");
  });
});
