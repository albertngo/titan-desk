/** Coerce Airtable REST cell values. Absent, error ({error}) and NaN ({specialValue}) cells read as empty. */

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (Array.isArray(v)) {
    const joined = v.filter((x) => typeof x === "string" && x.trim() !== "").join(", ");
    return joined === "" ? null : joined;
  }
  return null;
}

export const bool = (v: unknown): boolean => v === true;

export function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.startsWith("rec")) : [];
}
