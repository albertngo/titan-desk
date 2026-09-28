/** askBert catalogue constants, kept free of dependencies so every layer can import them. */

/** Category values used in the catalogue (see mirror.category_synonyms in migration 001). */
export const CATEGORIES = [
  "LVP", "LVT", "Laminate", "Engineered hardwood", "Solid hardwood",
  "Tile / Stone", "STONE", "Carpet", "Accessory",
] as const;

export const REQUIREMENTS = ["waterproof", "radiant_heat", "pet_friendly", "underpad_attached"] as const;
export const AVAILABILITY = ["any", "current_only", "hide_unavailable", "confirmed_in_stock"] as const;
export const INSTALL = ["Click", "T&G", "Glue down", "Loose lay"] as const;

/** Hard cap on products per tool call. */
export const MAX_LIMIT = 10;
