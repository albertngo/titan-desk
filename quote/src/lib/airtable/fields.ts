/**
 * Airtable IDs for the quoting tables in the Bert base. IDs, not secrets.
 * Records are read with returnFieldsByFieldId=true, so renaming a field in Airtable never
 * breaks the app; deleting one does (the page shows the gap rather than guessing).
 */
export const BASE_ID = "appWHOVZ0QCS0xQ3M";

export const T = {
  families: "tbl3UuhjUPzbwRPiN",
  quotes: "tblyOBAe7Y2W4Tv2q",
  options: "tbldbVTeelE9fU54o",
  lines: "tblGkT8y8JycWkX5b",
} as const;

export const FAMILY = {
  familyId: "fldzAQG3cQOleJ52Y",
  customerName: "fldOShjcS3OIcfuRF",
  siteAddress: "fldML5ejPLilqKWIH",
  siteCity: "fldqXqA7N7ufioIQR",
} as const;

export const QUOTE = {
  quoteId: "fld0Ahq1ydIdBTyHb",
  version: "fldvZo1lss1aYrzxu",
  status: "fldkPrMJXkkJyKPIE",
  basis: "fldRpkmNhPmwKXK1y",
  showHst: "fldGVuwi6PUAKNz78",
  validUntil: "fldHv3BsyS5XfOjqT",
  sentAt: "fldVMuWtrCG1RSeS5",
  notes: "fldgjbZ6qzH4SiQ1E",
  family: "fldvNuCszkwy0gB8o",
  lines: "fldCmBh6M92eJoVTW",
  options: "fldGHuPGdZ1zbUmeF",
  discountRate: "fldiQXF2LNtK5Auix",
} as const;

export const OPTION = {
  name: "fldCHIOvfWzmfS4vL",
  description: "fldlFCZXTxESWL8KB",
  sortOrder: "fldqiHTiJqZhNpGlk",
  recommended: "fldslboCP3IZCEhJj",
  lines: "fldYmOczi2hNUldJU",
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
  // Airtable's own per-line results — read only for the parity check.
  lineTotal: "fldtr6qmdjmWc1YFM",
  lineCost: "fld64HUgwqcRso3Br",
} as const;

export const airtableRecordUrl = (table: string, record: string) =>
  `https://airtable.com/${BASE_ID}/${table}/${record}`;

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
