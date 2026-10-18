# Titan Quotes (`quote/`)

Quoting app for Titan Flooring. Next.js 16, deployed as its **own Vercel project** from this
repo with Root Directory `quote`. Rules for changing it: `CLAUDE.md` in this folder.

## Status

| Milestone | What | State |
|---|---|---|
| 1 | Sign-in, allowlist, quote list, read-only quote view with Airtable parity check, Analysis tab | done |
| 2 | The editor (`/q/<id>/edit`): options, work-type sections, rate-card picker, contractor switch, overrides with revert, exclusions; draft kept on the device | done |
| 2b | New quote (`/new`): find the customer in GHL, link or start an opportunity, timing question; creates the quote (Q-1234) and version 1. Two buttons since 2026-10-18: **New quote** (v1 Measured, opens the editor) and **Preliminary quote** (`/new?kind=preliminary`, the phone-first quick form with stair profiles; v1 Preliminary) | done |
| 3 | Save the editor to Airtable: **Save** overwrites a Draft version; **Save as new version** makes v2, v3… (Preliminary or Measured) and marks a replaced draft Superseded. Writes limited to the four quote tables; nothing deleted | **this build** |
| 4 | Send: PDF → OneDrive → GHL, summary to Notion | after 3 |

## How it is put together

| Path | What |
|---|---|
| `src/proxy.ts` | session refresh; anonymous → `/login`; signed in but not a quoter → `/denied` |
| `src/lib/access.ts` | `QUOTE_ALLOWED_EMAILS` parsing; fails closed |
| `src/lib/auth.ts` | `requireQuoter()`, the second lock every loader calls |
| `src/lib/airtable/client.ts` | the only Airtable caller; writes only to the four quote tables |
| `src/lib/ghl/client.ts` | the only GHL caller; read-only |
| `src/lib/link/` | matching a quote to GHL, names, phone and email rules, lead stage (pure, tested) |
| `src/lib/quotes/start.ts` | find customers, create a quote and its version 1, tell GHL through Make |
| `src/lib/quotes/savePlan.ts` | editor → the smallest set of Airtable writes (pure, tested in `tests/save.test.ts`) |
| `src/lib/quotes/save.ts` | Save and Save as new version: checks, then carries out the plan |
| `src/app/api/booking/route.ts`, `src/lib/quotes/booking.ts` | the booking step Make calls when an appointment is confirmed: find the job (or make its opportunity), find or start its quote, confirm the contact's address as the site, return the name and the opportunity update; then record the folder and CompanyCam links (rules in `src/lib/link/booking.ts`) |
| `src/lib/quotes/refresh.ts` | on every open, brings the quote's customer copy up to date from GHL (rules in `src/lib/link/refresh.ts`) |
| `src/lib/make/client.ts` | the only caller of Make (one request per new quote) |
| `src/lib/airtable/fields.ts` | table and field IDs (not secrets) |
| `src/lib/quotes/load.ts` | Airtable records → quotes, options, lines |
| `src/lib/calc.ts` | all quote maths, mirroring the Airtable formulas |
| `src/components/OptionSheet.tsx` | one option: sections, lines, flags, totals, parity banner |
| `src/components/Analysis.tsx` | options side by side and where they differ |
| `src/lib/editor/model.ts` | every editor change as a pure function (tested in `tests/editor.test.ts`) |
| `src/components/editor/` | the editor screen (browser-only), the add-a-line picker |
| `tests/` | maths to the cent (invented numbers), allowlist, structural boundary |

## Environment (Vercel project for this app only)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | same as the desk |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as the desk |
| `QUOTE_AIRTABLE_TOKEN` | its own Airtable token: Bert base only; `data.records:read` and `data.records:write` |
| `QUOTE_MAKE_GHL_HOOK` | the "Quote app → GHL" Make webhook address. Set only once that scenario is on |
| `QUOTE_MAKE_GHL_KEY` | the shared key that scenario's filters check. Kept in Make and Vercel only |
| `QUOTE_BOOKING_KEY` | the key the booking scenario (Make 3453735) sends to `/api/booking` in the `x-quote-key` header. Unset = the booking step is off. Kept in Make and Vercel only |
| `QUOTE_GHL_TOKEN` | its own GHL private integration token, read-only: `contacts.readonly`, `opportunities.readonly`. Without it, New quote can only add new customers |
| `QUOTE_ALLOWED_EMAILS` | comma-separated Microsoft emails allowed to quote |
| `QUOTE_CUSTOMER_URL` | the customer deployment's address (below), e.g. `https://titan-desk-quote-view.vercel.app`. Unset = sending is off |
| `QUOTE_COMPANY_NAME` · `_ADDRESS` · `_PHONE` · `_EMAIL` · `_WEBSITE` · `_HST` | the letterhead on every quote sent (name defaults to Titan Flooring; a blank one is left off). Frozen into each quote when it is sent |

## The customer deployment (sending quotes)

Customer links (`/c/<token>`) and their PDFs are served by a **second Vercel project built from
this same folder**, because a public page never shares a deployment with a write token (root
CLAUDE.md). It holds two variables and nothing else:

| Variable | Value |
|---|---|
| `QUOTE_MODE` | `customer` |
| `QUOTE_AIRTABLE_TOKEN` | a **read-only** Airtable token: Bert base only, `data.records:read` |

On that deployment every path except `/c/<token>` answers 404 and the Airtable client refuses
to write. On the staff app, `/c/` answers 404. Staff check what the customer will get with
**Preview** on the quote page (`/q/<id>/preview` and `/q/<id>/pdf`, signed in).

Function region `yul1` (Montréal), same as the desk — set in `vercel.json`, not the dashboard.

## Supabase Auth

Add this app's callback to Dashboard → Authentication → URL Configuration → Redirect URLs:
`https://<this app's domain>/auth/callback` (and the preview pattern
`https://*-<team>.vercel.app/auth/callback` if previews should sign in). Leave the Site URL
pointing at the desk.

## If it is down

Quote in the Excel template. A quote sent from this app is frozen on its version in Airtable
(Customer Copy) and its PDF went out attached to the email, so what a customer was sent never
depends on this app being up; only the link needs the customer deployment.
