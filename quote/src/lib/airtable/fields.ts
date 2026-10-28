/**
 * Airtable IDs for the quoting tables in the Bert base. IDs, not secrets.
 * Records are read with returnFieldsByFieldId=true, so renaming a field in Airtable never
 * breaks the app; deleting one does (the page shows the gap rather than guessing).
 */
export const BASE_ID = "appWHOVZ0QCS0xQ3M";

/**
 * The four quote tables. Renamed in Airtable on 2026-10-14 (Albert): what was "Quote Families"
 * is now Quotes (one per opportunity, Q-1234) and what was "Quotes" is now Quote Versions
 * (v1 preliminary, v2 measured, …). IDs did not change.
 */
export const T = {
  quotes: "tbl3UuhjUPzbwRPiN",
  versions: "tblyOBAe7Y2W4Tv2q",
  options: "tbldbVTeelE9fU54o",
  lines: "tblGkT8y8JycWkX5b",
} as const;

/** The four tables this app may ever write to (milestone 3). Nothing else, ever. */
export const WRITABLE_TABLES: readonly string[] = [T.quotes, T.versions, T.options, T.lines];

/** Quotes table: one row per quote. Customer fields are display copies; GHL owns them. */
export const QUOTE = {
  legacyId: "fldzAQG3cQOleJ52Y",
  seq: "fldSkqqvTbmpA9oTI",
  quoteNumber: "fld2auo5sktzZwEnc",
  displayName: "fldkmRhIuwTFW4IWz",
  customerName: "fldOShjcS3OIcfuRF",
  firstName: "fldf449CmKjCVgMZM",
  lastName: "fldON7GXfCQwgUZrW",
  phone: "fldWFjH5f48TxQ8c9",
  email: "fldobrsMHsKqAO9xa",
  siteAddress: "fldML5ejPLilqKWIH",
  siteCity: "fldqXqA7N7ufioIQR",
  addressStatus: "fld7OiVXGKP85WSQ2",
  linkStatus: "fldQOCEJX7XJYvw3t",
  projectTiming: "fldTjBuJ9KezNmNOb",
  ghlContactId: "fldeMn6beJXCZLZza",
  ghlOpportunityId: "fld3nW15aOW71NFwi",
  companyCamUrl: "fldbVLfEofje1VUu5",
  folderUrl: "fldjMRYkmz70JbuJq",
  projectNumber: "fld3RVbHUDHJR7SBp",
  notionProjectUrl: "fldKIMbQCupiXuLvA",
  /**
   * The version that is the contract now (2026-10-27): the accepted version, then the newest change
   * sent after it. Its total is what GHL's value and Notion's Value Approx carry. Written by the app.
   */
  contractVersion: "fldQC0eOTE7sZu6OK",
  pipeline: "fldeupuDWQZ0dbXEg",
  notes: "fldnVyjuta6kQjOOf",
  versions: "fldasgos7nsSuqkJh",
  /** 2026-10-27: the Rooms tab's log, JSON written by the app only (src/lib/rooms/log.ts). Nothing prices or checks from it. */
  rooms: "fldSzknHoePiGjWoU",
  /** 2026-10-28: photos of the stair site sheet, uploaded from the Site sheet tab. Attachments, app-written only. */
  siteSheetPhotos: "fldVyJRpAY5Mr8Obn",
  /** 2026-10-28: what was read from the site sheet and what staff checked, JSON (src/lib/sitesheet/sheet.ts). */
  siteSheet: "fldDmKVwRWRZ6tsEc",
} as const;

/** Quote Versions table: one row per version of a quote. */
export const VERSION = {
  label: "fld0Ahq1ydIdBTyHb",
  version: "fldvZo1lss1aYrzxu",
  status: "fldkPrMJXkkJyKPIE",
  basis: "fldRpkmNhPmwKXK1y",
  showHst: "fldGVuwi6PUAKNz78",
  validUntil: "fldHv3BsyS5XfOjqT",
  sentAt: "fldVMuWtrCG1RSeS5",
  notes: "fldgjbZ6qzH4SiQ1E",
  quote: "fldvNuCszkwy0gB8o",
  lines: "fldCmBh6M92eJoVTW",
  options: "fldGHuPGdZ1zbUmeF",
  discountRate: "fldiQXF2LNtK5Auix",
  /** 2026-10-22: why the discount was given, in the customer's words; prints beside the Discount row. */
  discountReason: "fldD60VsOq8Ob2atE",
  /** 2026-10-22: Itemised Pricing. Unticked (the default) = lump sum, one price for the project; ticked = unit prices and line amounts. */
  itemised: "fldCOPt8yqlgd8sJf",
  /** The version this one replaced (Save as new version). */
  supersedes: "fldPJSJz7AWEBdyRD",
  /** Airtable's own guard (formula): text when a preliminary must not be sent because a measured version exists. */
  sendBlock: "fld0Rr4cYWdLIPhgI",
  /** Sending (2026-10-15): the customer link's secret, the frozen customer copy, and who sent it how. */
  customerToken: "fld1fHEStYhiWXIp8",
  customerCopy: "fldolHclfZEvpNfVD",
  sentBy: "fld9H5ufunLFG5Tak",
  sentTo: "fldC6n0ROmUBqL7pw",
  /**
   * Who worked on the version (2026-10-22, Albert: "editing and saving should have a history of the
   * person working on the file"): the signed-in person who created it, who last saved it and when,
   * and an append-only log, one line per save or send. Written by the app only.
   */
  createdBy: "fldyHhdyjLMds9x0H",
  lastEditedBy: "fldhfKZGSX2R9AiiM",
  lastEditedAt: "fldRCdXB6ehz1Nkqk",
  editLog: "fldvoKc0aiv9xktcg",
  /** 2026-10-27: the payment schedule as JSON (src/lib/pricing/schedule.ts); blank = 35 / 35 / balance. */
  paymentSchedule: "fldz0pG0gxLgzIs7p",
  /**
   * Acceptance (2026-10-27): the record of the customer's yes, as JSON (src/lib/accept/plan.ts), the
   * option it was for, and the day. Written once, by the app, when the version becomes Accepted.
   */
  acceptance: "fldsqfGVC27KQd4lW",
  acceptedOption: "fldglEl68TZ2XJdWp",
  acceptedAt: "fldPf4Ks6UHCdaPTA",
  /** 2026-10-27: 1, 2, … on a version made with Make a change after acceptance; blank on an ordinary version. */
  changeNo: "fldZNj3La4y8dJY3Z",
  /**
   * Open tracking (Albert, 2026-10-27): the customer's link reports each open and each PDF download
   * from its page, through the staff app's /api/activity (src/lib/quotes/activity.ts). Counts, first
   * and last open, and an append-only Activity Log ("2026-10-27 14:03 · opened · iPhone"). First Open
   * Noted At and Summary Noted At stamp the two GHL comments so each goes once; Track Activity is set
   * on send, so versions sent before tracking never get a summary.
   */
  openedCount: "fldDukIf4PJI1jdSu",
  firstOpenedAt: "fld7KIM7LSXLP8zQA",
  lastOpenedAt: "fldQrz6iQ0xlkh2rt",
  pdfDownloads: "fldXZ5JYXO0H90Kn6",
  activityLog: "fldoCliOvKWW3FlQL",
  firstOpenNotedAt: "fldnYRsV8IQiqaJMJ",
  summaryNotedAt: "fldsrd6yHGpXCYHlf",
  trackActivity: "fldOXliSwNNIRRALZ",
} as const;

export const OPTION = {
  name: "fldCHIOvfWzmfS4vL",
  description: "fldlFCZXTxESWL8KB",
  sortOrder: "fldqiHTiJqZhNpGlk",
  recommended: "fldslboCP3IZCEhJj",
  /** Standard / Premium (2026-10-16): Premium prices the option's labour at the card rate +15%. */
  serviceLevel: "fld7emrZTif7sChk8",
  /** The contractor picked for the whole option (2026-10-16), a Rate Card Contractor name. Sets cost only. */
  crew: "fldAclqYwusXAlizF",
  /** 2026-10-22: what the customer sees in place of the option's Private section (one rolled-up row); blank = "Additional work". */
  privateLabel: "fldBYBPfe6bcSdsQD",
  /** Flooring / Stairs (2026-10-28): a customer accepts at most one option of each. Blank = from the lines. */
  scope: "fldSJma4kK5YZn8P0",
  lines: "fldYmOczi2hNUldJU",
  /** The version this option belongs to; emptied, never deleted, when the option is removed. */
  version: "flduprOIp2Z5Z6JcG",
  // Airtable's own rollups/formulas — read only to show the parity check.
  preDiscount: "fldBTYJKRLPbCkuWw",
  cost: "fldOfXmrlI9Kkh5RF",
  discount: "flditLXPBk6OZHKmN",
  subtotal: "fldIW8a0q6C9wTR2P",
  profit: "fldzpJCHZRAsYoaft",
  marginPct: "fldK84tuL3C0lpVIU",
  hst: "fld8g2GA01hi61gMA",
  total: "fldWOoereqWe2BDBh",
  payment1: "fldsTtqVb0GO4Dx0D",
  payment2: "fldtbc3V5w2jKbWoo",
  paymentFinal: "fld97vzuzezJqcLjm",
} as const;

export const LINE = {
  /** Primary field: a short name for the row in Airtable's own grid. */
  label: "fld5HNeCqalHUg5RD",
  lineType: "fldO97Rvu3klZxv6z",
  section: "fldwnlPh9z5Tt3w79",
  sortOrder: "flds1Vp3RhbjWhU7R",
  area: "fldhrdklHPWAnuDtn",
  qty: "fldleEE3dx1biWQdZ",
  uom: "fldscUQhu6TFM78DK",
  waste: "fldKoT5NHBtDtDcyz",
  unitPrice: "fldxtw912i4r310LB",
  unitPriceSnap: "fldAlvYWmm81UGJlx",
  unitCostSnap: "fldAihbNToePyOSWF",
  minChargeSnap: "fld1DbqT1YgygkSZb",
  manualCost: "fldV76miZBNkp308Z",
  costOverride: "fldCbFSZOcHtBRXbg",
  clientNote: "flduFJN9sMhFgvim7",
  include: "fldODrvxNHlLz5UoQ",
  rateItem: "fldpl8V8mmqZI4PfG",
  rateLaborType: "fldi7WLWqNYcqWZuN",
  rateSpec: "fld23EpiOraWWexlL",
  stairItem: "fldHLNdWOwGBCyl0b",
  product: "fld3mukkZxpqaMXcN",
  description: "fldQXq4uPhVV1oO1O",
  contractor: "fldN5I9ZqWDH1IYGj",
  option: "fldfvQS0ZV3Xls8DN",
  /** The version this line belongs to (Quote Versions.Lines reads it). */
  version: "fldToFEW9FfhPXrfg",
  /** Typed wording; when blank, `description` (a formula) falls back to the Rate Card / Stair Item name. */
  descriptionOverride: "fldAdkBeY59oOSPNh",
  /** Materials lines only (2026-10-16): ticked = no HST on this material. Other sections follow Show HST. */
  noHst: "fldq8sPfy3iaBFJu5",
  /** 2026-10-16: the Install Material picked for a Rate Card line; its price and cost are in the snaps. */
  installMaterial: "fldLHVDiQWa3lOIcq",
  /** 2026-10-20: the Stair Profiles row a preliminary's staircase line was priced from. */
  stairProfile: "fldx3bE8kRnoGRRwu",
  /** 2026-10-28: lookup of the Stair Item's Category, for grouping the Stairs section. Read only. */
  stairCategory: "fldSFOxH6jcSqDxLL",
  // Airtable's own per-line results — read only for the parity check.
  lineTotal: "fldtr6qmdjmWc1YFM",
  lineCost: "fld64HUgwqcRso3Br",
} as const;

export const airtableRecordUrl = (table: string, record: string) =>
  `https://airtable.com/${BASE_ID}/${table}/${record}`;

/**
 * Quote Settings: one row, read only. Online Acceptance is the switch for accepting quotes (Albert,
 * 2026-10-27): ticked = on, unticked = off everywhere at once, with no redeploy.
 */
export const SETTINGS_TABLE = "tbl87nxBec8uKta8V";
export const SETTINGS = {
  onlineAcceptance: "fldTFU2lpwpqrWTrv",
} as const;

/**
 * Terms Versions, read only: one row per saved version of the Project Expectations Word doc, made by
 * Make ("Project Expectations → PDF", 2026-10-27) and never edited, so what a customer agreed to
 * never changes underneath them. The newest by Modified At is the one a customer agrees to today.
 */
export const TERMS_TABLE = "tblYN4djj4SmQWvkJ";
export const TERMS = {
  name: "fldGtf9hRLteG4H4i",
  modifiedAt: "fldLwcbjCbaPEvJqC",
  pdf: "fldLT70qt6VSG54Iq",
  sourceFileId: "fld0DByOwla08481v",
} as const;

export const RATE_TABLE = "tblGBGezZfBWhEgmu";
export const RATE = {
  laborType: "fldawNJcW3bbKnCp8",
  spec: "fldVYJ1psh6cfrNhG",
  contractor: "fldm8lMxWDE4rF44O",
  uom: "fldJvK2PyDAdTkIn9",
  rate: "fldVKBNdPycTVFUgH",
  totalCost: "fldD18VKUPrcLtRTP",
  minCharge: "fldheQ38Y9S1myfWo",
  defaultWaste: "fldO2w5Frt7Q2QeTj",
  active: "fld2ZHDbhu8PYIJFe",
  /** 2026-10-16: the Install Materials group this job's material swaps within; blank = no swap. */
  materialGroup: "fldskxNatiyqheLSd",
  /** 2026-10-16: the Install Material a line starts with, added on top of the Titan Rate and Total Cost (labour only, 2026-10-28). */
  defaultMaterial: "fldKoeawws0YkMo78",
} as const;

/** Install Materials (2026-10-16), read-only: what a Rate Card job's material can be swapped for. */
export const MATERIAL_TABLE = "tblyljyGUu6lexd2g";
export const MATERIAL = {
  name: "fldCDrRgRpJYeqY63",
  group: "fldJOxaEfw9HI9KC0",
  cost: "fldcSDm7iSlX6u9ZA",
  price: "fldlWjoshIgciIxIy",
  active: "fldK9CMq2NQfVi2L9",
} as const;

/**
 * Stair Profiles (created 2026-10-20): one row per staircase on the preliminary's dropdown, with
 * the preset price and cost (the old GHL mobile-quote options), the stair type and method the
 * customer description is written from, and six links to Stair Items the editor's builder
 * multiplies. Read-only here; the preset is a stored price by design (Albert, 2026-10-20).
 */
export const PROFILE_TABLE = "tblyRK2dJf4in5NW0";
export const PROFILE = {
  name: "fld7ADLJHKax2reWx",
  stairType: "fldf2CphffH6hIGSQ",
  method: "fld9kfFNAmCycehXK",
  steps: "fld5kQiQQLYUrBg0h",
  price: "fldT9aUZtWm33j0Dx",
  cost: "fldeb3xEPKzkKcjUi",
  active: "fldUHwprPSCOCY9RK",
  sort: "fldTYCChkMwsqolSH",
  perStep: "flds7wtg7wPOrdsU7",
  perStaircase: "fldlQUdGb6ZJ6MTMR",
  perOpenSide: "fld2akp8oQoqfSWKY",
  perHandrailFt: "fld4SlG2nrbJvfYcr",
  perSpindle: "fldUjDQvUIjYB6VHr",
  perPost: "fld56yJLtiGsBdlU4",
} as const;

export const STAIR_TABLE = "tbltRm9tL6r5brZn2";
export const STAIR = {
  name: "fld8SLwwaodFia9PL",
  category: "fldOxeVyLo8XHV9zV",
  size: "fldrU1r8MKJzzLL1P",
  rate: "fldPFjFyKzHu0nxYx",
  cost: "fldX96S7DulWrGjUC",
  active: "fldZwEDirc4fNjRIm",
} as const;

/**
 * Quick Quote Choices (created 2026-10-15): one row per choice on the quick, preliminary form.
 * Read-only here. Each choice points at Rate Card rows, Stair Items or a catalogue SKU; prices
 * are always read from those, never stored on the choice.
 */
export const QUICK_TABLE = "tbld59a6L9SitP0wa";
export const QUICK = {
  choice: "fldFyolLOohvDtYJv",
  group: "fldvhNhq35uLpfevx",
  rateCard: "fldBgMA3pI8xyqujw",
  stairItems: "fldjheShInlh7A8OE",
  standardSku: "fld1gO7oLmBsxOpc2",
  times: "fldcjNeNpoUhgzdoX",
  sort: "fld7L4cwcyMS8pZHG",
  active: "fldlu05SAWQ2wj7qm",
  needs: "fldTEn9j8KzrJDeQX",
} as const;

/** The Master Flooring Catalogue, read-only: material prices for the quick form. Ids from platform-settings/airtable.json. */
export const CATALOGUE_TABLE = "tblfLXD3zkSdNQGbS";
export const CAT = {
  sku: "fldx3byCOht5HbKmH",
  name: "fldPSbURaP3wp0Tce",
  brand: "fldUnNZptVhSQYp4h",
  collection: "fldL8miCdB55TWmfJ",
  cost: "flduJqOhE4YuX3Bmq",
  retail: "fldpH6d7GlytLLh7Q",
  active: "fldPsKISM495IjaWU",
} as const;
