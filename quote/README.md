# Titan Quotes (`quote/`)

Quoting app for Titan Flooring. Next.js 16, deployed as its **own Vercel project** from this
repo with Root Directory `quote`. Rules for changing it: `CLAUDE.md` in this folder.

## Status

| Milestone | What | State |
|---|---|---|
| 1 | Sign-in, allowlist, quote list, read-only quote view with Airtable parity check, Analysis tab | done |
| 2 | The editor (`/q/<id>/edit`): options, work-type sections, rate-card picker, contractor switch, overrides with revert, exclusions; draft kept on the device | done |
| 2b | New quote (`/new`): the customer in GHL with their opportunity, then the timeline; creates the quote (Q-1234) and version 1. Two buttons since 2026-10-18: **New quote** (v1 Measured, opens the editor) and **Preliminary quote** (`/new?kind=preliminary`: the job first, the phone-first quick form with a rate and total beside each row and stair profiles, then customer and timeline; v1 Preliminary) | done |
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
| `src/lib/quotes/address.ts`, `src/components/AddressScan.tsx` | Address arrived: when the list or a quote opens, reads the messages of quotes still without an address, puts the one address the customer gave on their blank GHL contact through Make and on the quote as Unconfirmed (reading rules in `src/lib/link/addressReply.ts`, tested in `tests/addressReply.test.ts`) |
| `src/lib/make/client.ts` | the only caller of Make (starting, booking, linking, confirming an address, sending, Address arrived) |
| `src/lib/airtable/fields.ts` | table and field IDs (not secrets), including the read-only Stair Profiles table (2026-10-20) |
| `src/lib/quick/stairs.ts`, `src/lib/editor/stairBuilder.ts` | staircase profiles: the preset line for the preliminary and its customer wording; the editor's builder that expands a profile into Stair Item lines |
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
| `QUOTE_GHL_TOKEN` | its own GHL private integration token, used read-only: `contacts.readonly`, `opportunities.readonly`, `conversations.readonly`, `conversations/message.readonly` (the token may hold write scopes; the app's GHL client is GET-only and the boundary test keeps it so). Without it, New quote can only add new customers and no conversation shows |
| `QUOTE_ALLOWED_EMAILS` | comma-separated Microsoft emails allowed to quote |
| `QUOTE_LOGO_URL` | optional override for the email header logo and link preview image; unset = `public/brand/` served by the customer deployment |
| `QUOTE_CUSTOMER_URL` | the customer deployment's address (below), e.g. `https://titan-desk-quote-view.vercel.app`. Unset = sending is off |
| `QUOTE_COMPANY_NAME` · `_ADDRESS` · `_PHONE` · `_EMAIL` · `_WEBSITE` · `_HST` | the letterhead on every quote sent (name defaults to Titan Flooring; a blank one is left off). Frozen into each quote when it is sent |
| `QUOTE_ACTIVITY_KEY` | open tracking (2026-10-27): the key the customer deployment and the daily summary run send to `/api/activity` in the `x-quote-key` header. Same value on both deployments and in the GitHub secret. Unset = tracking is off. For the summaries' tags, `QUOTE_GHL_TOKEN` also needs `users.readonly`; without it they tag the opportunity's assigned user |

## The customer deployment (sending quotes)

Customer links (`/c/<token>`) and their PDFs are served by a **second Vercel project built from
this same folder**, because a public page never shares a deployment with a write token (root
CLAUDE.md). It holds these variables and nothing else (the last two only for open tracking):

| Variable | Value |
|---|---|
| `QUOTE_MODE` | `customer` |
| `QUOTE_AIRTABLE_TOKEN` | a **read-only** Airtable token: Bert base only, `data.records:read` |
| `QUOTE_STAFF_URL` | the staff app's address, e.g. `https://titan-desk-quote.vercel.app`: where opens and PDF downloads are reported (2026-10-27). Unset = tracking is off |
| `QUOTE_ACTIVITY_KEY` | the same key as the staff app's |

On that deployment every path except `/c/<token>` answers 404 and the Airtable client refuses
to write. Opens and downloads are reported to the staff app, which records them.

The three-day summaries run from `.github/workflows/quote-activity-summaries.yml` once a day; it needs
the repo secrets `QUOTE_STAFF_URL` and `QUOTE_ACTIVITY_KEY` and does nothing until both are set. On the staff app, `/c/` answers 404. Staff check what the customer will get with
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
