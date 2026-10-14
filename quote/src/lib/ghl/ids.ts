/**
 * GoHighLevel ids for Titan's sub-account. IDs, not secrets: the token lives only in
 * QUOTE_GHL_TOKEN on the server.
 */
export const GHL_LOCATION_ID = "4BwjVRlyDCR4ZRdcSrFR";

/** The contact's page in GHL, where staff edit customer details and the address. */
export const ghlContactUrl = (contactId: string) =>
  `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${encodeURIComponent(contactId)}`;
