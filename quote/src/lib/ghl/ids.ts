/**
 * GoHighLevel ids for Titan's sub-account. IDs, not secrets: the token lives only in
 * QUOTE_GHL_TOKEN on the server.
 */
export const GHL_LOCATION_ID = "4BwjVRlyDCR4ZRdcSrFR";

/** The contact's page in GHL, where staff edit customer details and the address. */
export const ghlContactUrl = (contactId: string) =>
  `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${encodeURIComponent(contactId)}`;

/** An opportunity's details in GHL, where its Project Address and Project City are edited (format from GHL's changelog, 2026-10-21). */
export const ghlOpportunityUrl = (opportunityId: string) =>
  `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/opportunities/list/${encodeURIComponent(opportunityId)}?tab=OpportunityDetails`;

/** A conversation in GHL's inbox, where staff reply (the app only reads it). */
export const ghlConversationUrl = (conversationId: string) =>
  `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/conversations/conversations/${encodeURIComponent(conversationId)}`;

/**
 * The two booking pages a preliminary's email offers (GHL calendar widgets; ids, not secrets, like
 * everything else in this file). In-store is the calendar the old "Rough quote is ready" emails
 * linked (read back 2026-10-22) and is the email's button: picking a material comes first. In-home
 * (Albert, 2026-10-23) is the measurement, linked from the "We measure and confirm" step, for a
 * preliminary made over the phone or at the counter where nobody has been to the house yet.
 */
export const BOOKING_CALENDAR_IDS = { inStore: "c6Ah9rvmM9KZtmMYV0tZ", inHome: "9wHcUAkAFKWUwN75TbtW" } as const;
const bookingPage = (id: string) => `https://api.leadconnectorhq.com/widget/booking/${id}`;
export const BOOKING_URLS = { inStore: bookingPage(BOOKING_CALENDAR_IDS.inStore), inHome: bookingPage(BOOKING_CALENDAR_IDS.inHome) } as const;

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

/**
 * The Sales pipeline's won stage, "2. *Project Won* " (trailing space and all). Its id is opaque and
 * isn't recorded anywhere, so accepting a quote finds it by name in GHL's own pipeline list when it
 * needs it (`wonStageId()` in src/lib/link/ghlRequest.ts). GHL's "Project Won" workflow fires on this
 * stage OR on status won (Albert, 2026-10-27); accepting sets both, in one request.
 */
export const PROJECT_WON_STAGE_NAME = /project won/i;

/**
 * The pipelines a job (a quote, a folder, a CompanyCam project) lives in. "STORE: Material
 * Pipeline" (ySvXh8g1u1TSjUB5A1Zg) holds counter sales and is never a job.
 */
export const PROJECT_PIPELINE_IDS: readonly string[] = [LEADS_PIPELINE_ID, SALES_PIPELINE_ID];

/** Contact custom field "Do You Have A Flooring Project Coming Up? If so, when?" */
export const CONTACT_TIMING_FIELD = "AqDkCXA2JS0XZ3Hpwy5A";

/** The contact's "Quote Origin" custom field (contact.quote_origin, text): where they found us (2026-10-27). */
export const CONTACT_ORIGIN_FIELD = "fWIPg1bx2NbQwUXkVRBL";

/** Opportunity custom fields the quote app fills. */
export const OPP_FIELDS = {
  quoteNumber: "CbDr2iLoiuCtzWBADWNB",
  projectNumber: "HIToSWZ4w07LwzC2J04u",
  projectAddress: "LfzVYiftWBnKGnnsyna9",
  projectCity: "8xlNjiw1kf3MFNsII0jv",
  /** Per job: set once the job has its CompanyCam project (read through Make's GHL connection, 2026-10-15). */
  companyCamUrl: "fEZdUNuN9TWKjIOD6fBo",
} as const;

/**
 * Opportunity fields for acceptance (2026-10-27), made in GHL by Albert the same day (ids read from
 * GHL's custom field list). Nothing is written to a field set to null here.
 * - acceptedQuote: the link to the accepted quote (then the newest change). Make 3710214 puts it in
 *   the Notion project's Quote Link. Since 2026-10-28 it is the staff app's page for that version
 *   (Albert: open the quote with its details, not the customer's accepted page); the customer link
 *   only when the staff app's address is unknown.
 * - notionProjectUrl: the Notion project's page, written back by Make 3710214 with the PP number
 *   (OPP_FIELDS.projectNumber), so the quote picks both up the next time it opens.
 */
export const ACCEPT_FIELDS: { acceptedQuote: string | null; notionProjectUrl: string | null } = {
  acceptedQuote: "NSaXdQWlPFMvihL3LKjF",
  notionProjectUrl: "blsXznbxF6YoZ88ZeD94",
};

/**
 * Who a measured quote's activity comment tags when neither the sender nor the opportunity's assigned
 * user can be found in GHL (Albert, 2026-10-27): Albert's GHL user. An id, not a secret.
 */
export const FALLBACK_MENTION_USER_ID = "ooPNab06Ka04uZ1yQ4w6";

/**
 * The follow-up tags (Albert, 2026-10-27). Each starts its own GHL workflow ("Quote FU: preliminary",
 * "Quote FU: measured"), whose goal is the tag being removed. Every send removes both and adds the
 * current one, so a new version restarts the sequence and a measured quote ends the preliminary's.
 * Make 4975508's `tags` route refuses any other tag.
 */
export const FOLLOW_UP_TAGS = { preliminary: "quote sent: preliminary", measured: "quote sent: measured" } as const;
