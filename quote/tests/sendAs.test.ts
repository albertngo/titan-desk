import { describe, expect, it } from "vitest";
import { canPickSender, resolveSender, SEND_AS_PICKERS, sendAsChoices } from "../src/lib/send/sendAs";

/* Send as someone else (Albert, 2026-11-04: "Only Albert has the option to"). Invented addresses except the picker's. */

const ALBERT = SEND_AS_PICKERS[0];
const allow = ["pat@titanfloors.ca", ALBERT, "INFO@titanfloors.ca", "outside@example.com"];
const users = [{ email: "pat@titanfloors.ca", name: "Pat Example" }];

describe("send as (2026-11-04)", () => {
  it("lets only Albert pick, from the allowed sign-ins on the company domain, himself first", () => {
    expect(canPickSender(ALBERT.toUpperCase())).toBe(true);
    expect(canPickSender("pat@titanfloors.ca")).toBe(false);
    const choices = sendAsChoices(ALBERT, allow, "hello@titanfloors.ca", users);
    expect(choices.map((c) => c.email)).toEqual([ALBERT, "info@titanfloors.ca", "pat@titanfloors.ca"]);
    expect(choices.find((c) => c.email === "pat@titanfloors.ca")?.name).toBe("Pat Example");
  });

  it("sends as the person picked only when Albert picks someone on the list; anyone else is refused, never sent as them", () => {
    const choices = sendAsChoices(ALBERT, allow, "hello@titanfloors.ca", users);
    const albert = { email: ALBERT, name: "Albert" };
    expect(resolveSender(albert, "pat@titanfloors.ca", choices)).toEqual({ ok: true, sender: { email: "pat@titanfloors.ca", name: "Pat Example" }, as: true });
    expect(resolveSender(albert, "outside@example.com", choices).ok).toBe(false);
    expect(resolveSender(albert, null, choices)).toEqual({ ok: true, sender: albert, as: false });
    const pat = { email: "pat@titanfloors.ca", name: "Pat" };
    expect(resolveSender(pat, ALBERT, choices)).toEqual({ ok: false, message: "Only Albert can send a quote as someone else." });
    // Picking yourself is just sending.
    expect(resolveSender(pat, "PAT@titanfloors.ca", [])).toEqual({ ok: true, sender: pat, as: false });
  });
});
