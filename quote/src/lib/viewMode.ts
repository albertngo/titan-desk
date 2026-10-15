/**
 * Customer view (Albert, 2026-10-15): for quoting with the customer beside or behind you. While
 * it is on, pages are rendered without cost, margin, profit, contractors, card rates or checks:
 * the server leaves them out, so they are not on the screen or in the page at all. Charge rates,
 * line totals, the discount, HST and the payment schedule stay. A cookie, so it holds per device
 * across pages until switched off.
 */
export const VIEW_COOKIE = "quote_view";
export const CUSTOMER_VIEW = "customer";
