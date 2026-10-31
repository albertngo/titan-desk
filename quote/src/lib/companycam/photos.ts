/**
 * Reading CompanyCam's answers into what the Photos tab shows (Albert, 2026-10-30: "display all
 * those photos with their proper timestamps and descriptions, mirroring company cam itself").
 * Pure, no I/O: src/lib/companycam/client.ts fetches, this reads. Tested in tests/companycam.test.ts.
 *
 * Each photo keeps three sizes (thumbnail for the grid, web for the viewer, original to open) and
 * prefers CompanyCam's annotated copy when there is one, since a PM's markup on a stair or a laser
 * reading is often the point of the photo. The web size is also the one a later Claude reader would
 * be given (measurement photos, stairs), so it is kept for every photo.
 */

export type CamPhoto = {
  id: string;
  /** When it was taken (ISO), else when it was uploaded; null when CompanyCam gave neither. */
  at: string | null;
  by: string | null;
  description: string | null;
  tags: string[];
  thumb: string;
  web: string;
  full: string;
  /** The shown copy carries the PM's markup. */
  annotated: boolean;
  /** The photo's own page in CompanyCam. */
  pageUrl: string | null;
};

export type CamProject = { id: string; name: string | null; address: string | null; url: string };

export type CamDay = { day: string; label: string; photos: CamPhoto[] };

const PROJECT_URL = /^https:\/\/app\.companycam\.com\/projects\/(\d{1,15})(?:[/?#]|$)/;

/** The project id in a CompanyCam link as Make writes it (`project_url`, https://app.companycam.com/projects/123); anything else is null. */
export function projectIdOf(url: string | null | undefined): string | null {
  return url ? (PROJECT_URL.exec(url.trim())?.[1] ?? null) : null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const https = (v: unknown) => {
  const s = str(v);
  return s && /^https:\/\//.test(s) ? s : null;
};

/** A unix time in seconds (CompanyCam's own) or an ISO string, as ISO. */
function isoOf(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return new Date(v * 1000).toISOString();
  const s = str(v);
  if (!s) return null;
  const d = new Date(/^\d+$/.test(s) ? Number(s) * 1000 : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** One photo from GET /projects/{id}/photos; one with no usable picture is left out. */
export function toPhoto(raw: unknown): CamPhoto | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = p.id === undefined || p.id === null ? null : String(p.id);
  if (!id) return null;
  if (p.processing_status === "processing_error" || p.processing_status === "duplicate") return null;
  const uris = new Map<string, string>();
  for (const u of Array.isArray(p.uris) ? p.uris : []) {
    if (!u || typeof u !== "object") continue;
    const type = str((u as Record<string, unknown>).type);
    const url = https((u as Record<string, unknown>).uri) ?? https((u as Record<string, unknown>).url);
    if (type && url) uris.set(type, url);
  }
  const annotated = uris.has("web_annotation") || uris.has("original_annotation");
  const pick = (...types: string[]) => types.map((t) => uris.get(t)).find(Boolean) ?? null;
  const web = annotated ? pick("web_annotation", "original_annotation", "web", "original") : pick("web", "original", "thumbnail");
  if (!web) return null;
  const thumb = (annotated ? pick("thumbnail_annotation", "web_annotation") : null) ?? pick("thumbnail") ?? web;
  const full = (annotated ? pick("original_annotation") : null) ?? pick("original") ?? web;
  const tags = (Array.isArray(p.tags) ? p.tags : [])
    .map((t) => (typeof t === "string" ? str(t) : t && typeof t === "object" ? str((t as Record<string, unknown>).display_value) ?? str((t as Record<string, unknown>).value) : null))
    .filter((t): t is string => Boolean(t));
  return {
    id,
    at: isoOf(p.captured_at) ?? isoOf(p.created_at),
    by: str(p.creator_name),
    description: str(p.description),
    tags,
    thumb,
    web,
    full,
    annotated,
    pageUrl: https(p.photo_url),
  };
}

export function toPhotos(list: unknown): CamPhoto[] {
  return (Array.isArray(list) ? list : []).map(toPhoto).filter((p): p is CamPhoto => p !== null);
}

/** GET /projects/{id}, as the tab's header. */
export function toProject(raw: unknown, url: string): CamProject | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.id === undefined || p.id === null) return null;
  const a = (p.address && typeof p.address === "object" ? p.address : {}) as Record<string, unknown>;
  const address = [str(a.street_address_1), str(a.street_address_2), str(a.city), str(a.state), str(a.postal_code)].filter(Boolean).join(", ") || null;
  return { id: String(p.id), name: str(p.name), address, url: https(p.project_url) ?? url };
}

const TZ = "America/Toronto";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

/**
 * The project's photos the way CompanyCam's timeline shows them: by day, newest day first, newest
 * photo first within a day; photos with no time come last under "Date unknown". Duplicates by id
 * (a photo seen on two pages) are kept once.
 */
export function byDay(photos: CamPhoto[], now = new Date()): CamDay[] {
  const seen = new Set<string>();
  const unique = photos.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  const sorted = [...unique].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const days = new Map<string, CamPhoto[]>();
  for (const p of sorted) {
    const k = p.at ? dayKey(p.at) : "";
    days.set(k, [...(days.get(k) ?? []), p]);
  }
  const thisYear = dayKey(now.toISOString()).slice(0, 4);
  return [...days.entries()].map(([day, list]) => ({ day, label: day ? dayLabel(day, thisYear) : "Date unknown", photos: list }));
}

/** "Thursday, October 30", with the year once it is another year. */
function dayLabel(day: string, thisYear: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: day.startsWith(thisYear) ? undefined : "numeric" });
}

/** "2:05 p.m." in Toronto time. */
export function timeOf(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}

/** "Oct 30, 2026, 2:05 p.m." in Toronto time, for the viewer. */
export function whenOf(iso: string | null): string {
  if (!iso) return "Date unknown";
  return new Date(iso).toLocaleString("en-CA", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
