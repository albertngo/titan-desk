/**
 * GoHighLevel ids for Titan's sub-account. IDs, not secrets: the token lives only in
 * QUOTE_GHL_TOKEN on the server.
 */
export const GHL_LOCATION_ID = "4BwjVRlyDCR4ZRdcSrFR";

/** The contact's page in GHL, where staff edit customer details and the address. */
export const ghlContactUrl = (contactId: string) =>
  `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${encodeURIComponent(contactId)}`;

/** "(1) PROJECT: Lead Qualification": where every new opportunity from the quote app starts. */
export const LEADS_PIPELINE_ID = "z7ZevSnG9HnGMzC9nSHp";

/** Its stages, by the temperature the timing answer sets (Albert, 2026-10-14). */
export const LEAD_STAGE_IDS = {
  Cold: "264153de-4eb3-4611-9045-c5f836ba6000", // 0b. Far Out (Cold)
  Warm: "82445358-ac49-421a-be68-0797fe72a177", // 0b. Later Date (Warm)
  Hot: "48535faa-cc06-429c-942f-4248f1698f3d", // 0c. ASAP (Hot)
} as const;

/**
 * "(2) PROJECT: Sales Pipeline" and its booked stage, "*Meeting (Scheduled)* CCAM|GHL": where the
 * booking step puts a job that had no opportunity when its appointment was confirmed.
 * Read from GHL through Make's connection, 2026-10-15.
 */
export const SALES_PIPELINE_ID = "ZxYBFNifUNNxU7xgQclg";
export const MEETING_SCHEDULED_STAGE_ID = "eb038acb-82cd-494a-864b-4643d7e90a32";

/** Contact custom field "Do You Have A Flooring Project Coming Up? If so, when?" */
export const CONTACT_TIMING_FIELD = "AqDkCXA2JS0XZ3Hpwy5A";

/** Opportunity custom fields the quote app fills. */
export const OPP_FIELDS = {
  quoteNumber: "CbDr2iLoiuCtzWBADWNB",
  projectNumber: "HIToSWZ4w07LwzC2J04u",
  projectAddress: "LfzVYiftWBnKGnnsyna9",
  projectCity: "8xlNjiw1kf3MFNsII0jv",
  /** Per job: set once the job has its CompanyCam project (read through Make's GHL connection, 2026-10-15). */
  companyCamUrl: "fEZdUNuN9TWKjIOD6fBo",
} as const;
