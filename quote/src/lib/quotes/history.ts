import { VERSION } from "@/lib/airtable/fields";
import type { SavePlan } from "./savePlan";

/**
 * Who worked on a version, and when (Albert, 2026-10-22: "editing and saving should also have a
 * history of the person working on the file at that time"). Pure; tested in tests/history.test.ts.
 *
 * Quote Versions carries Created By (app), Last Edited By, Last Edited At and an append-only
 * Edit Log, one line per save or send:
 *
 *   2026-10-22 14:05 · albert@titanfloors.ca · saved: 2 lines changed, 1 line added
 *
 * Airtable's own "last modified by" would name the app's token for every write, so the app
 * records the signed-in person itself, in the same update as the save.
 */

/** The signed-in person: the Microsoft account's email, and its display name when the sign-in carried one. */
export type Person = { email: string; name: string | null };

const LOG_LINES_KEPT = 300;

/** "2026-10-22 14:05", Toronto. */
export function stamp(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")} ${p("hour") === "24" ? "00" : p("hour")}:${p("minute")}`;
}

export function logLine(now: Date, who: string, what: string): string {
  return `${stamp(now)} · ${who} · ${what.replace(/\s+/g, " ").trim()}`;
}

/** The log with a line added at the end; the oldest lines go once it is very long, never the newest. */
export function appendLog(existing: string | null | undefined, line: string): string {
  const lines = (existing ?? "").split("\n").map((l) => l.trimEnd()).filter(Boolean);
  lines.push(line);
  return lines.slice(-LOG_LINES_KEPT).join("\n");
}

/** Newest first, for the page. */
export function logEntries(log: string | null | undefined): { when: string; who: string; what: string }[] {
  return (log ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [when, who, ...rest] = l.split(" · ");
      return rest.length ? { when, who, what: rest.join(" · ") } : { when: "", who: "", what: l };
    })
    .reverse();
}

/** "2 lines changed, 1 line added, 1 option removed": what a save plan does, for its log line. */
export function describePlan(plan: SavePlan): string {
  const n = (count: number, noun: string, verb: string) => (count ? [`${count} ${noun}${count === 1 ? "" : "s"} ${verb}`] : []);
  const parts = [
    ...n(plan.updateLines.length, "line", "changed"),
    ...n(plan.createLines.length, "line", "added"),
    ...n(plan.detachLines.length, "line", "removed"),
    ...n(plan.updateOptions.length, "option", "changed"),
    ...n(plan.createOptions.length, "option", "added"),
    ...n(plan.detachOptions.length, "option", "removed"),
  ];
  const terms = Object.keys(plan.version).length;
  if (terms) parts.push("terms changed");
  return parts.join(", ") || "nothing changed";
}

/** The fields every save or send writes beside its own: who, when, and the log with this line on the end. */
export function authorFields(person: Person, now: Date, what: string, existingLog: string | null | undefined, created = false): Record<string, unknown> {
  return {
    ...(created ? { [VERSION.createdBy]: person.email } : {}),
    [VERSION.lastEditedBy]: person.email,
    [VERSION.lastEditedAt]: now.toISOString(),
    [VERSION.editLog]: appendLog(existingLog, logLine(now, person.email, what)),
  };
}

/** "Albert", from the sign-in's display name, else from the address ("albert@…" → "Albert"); null for a shared box like info@. */
export function firstNameOf(person: Person): string | null {
  const fromName = (person.name ?? "").trim().split(/\s+/)[0];
  if (fromName && /^[\p{L}][\p{L}'’-]*$/u.test(fromName)) return fromName;
  const local = person.email.split("@")[0]?.split(/[._-]/)[0] ?? "";
  if (!/^[a-z]{2,}$/i.test(local) || /^(info|sales|office|hello|admin|quotes?|front ?desk|support|team)$/i.test(local)) return null;
  return local[0].toUpperCase() + local.slice(1).toLowerCase();
}
