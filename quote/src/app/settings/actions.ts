"use server";

import { saveSetting } from "@/lib/settings/settings";

/** One setting changed on the Settings page (2026-11-10). Admin only, checked inside. */
export async function saveSettingAction(key: string, value: string): Promise<{ ok: true } | { ok: false; message: string }> {
  return saveSetting(String(key ?? ""), String(value ?? ""));
}
