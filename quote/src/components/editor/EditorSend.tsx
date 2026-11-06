"use client";

import { createContext } from "react";

/**
 * The Send card inside the editor (Albert, 2026-11-06: "Send option card WITHIN the 'edit' screen is also
 * available"). The editor knows its own unsaved changes, which a same-tab storage read cannot see, so it tells
 * the card here; null outside the editor, where the card reads this device's storage as before.
 */
export const EditorSend = createContext<{ unsavedAt: string | null } | null>(null);
