# Titan Quotes (`quote/`)

Quoting app for Titan Flooring. Next.js 16, deployed as its **own Vercel project** from this
repo with Root Directory `quote`. Rules for changing it: `CLAUDE.md` in this folder.

## Status

| Milestone | What | State |
|---|---|---|
| 1 | Sign-in, allowlist, quote list, read-only quote view with Airtable parity check, Analysis tab | **this build** |
| 2 | The editor: pick description → contractor → card rate, overrides with revert, keyboard grid | next |
| 3 | Save to Airtable (writes limited to the four quote tables) | after 2 |
| 4 | Send: PDF → OneDrive → GHL, summary to Notion | after 3 |

## How it is put together

| Path | What |
|---|---|
| `src/proxy.ts` | session refresh; anonymous → `/login`; signed in but not a quoter → `/denied` |
| `src/lib/access.ts` | `QUOTE_ALLOWED_EMAILS` parsing; fails closed |
| `src/lib/auth.ts` | `requireQuoter()`, the second lock every loader calls |
| `src/lib/airtable/client.ts` | the only Airtable caller (GET only in milestone 1) |
| `src/lib/airtable/fields.ts` | table and field IDs (not secrets) |
| `src/lib/quotes/load.ts` | Airtable records → quotes, options, lines |
| `src/lib/calc.ts` | all quote maths, mirroring the Airtable formulas |
| `src/components/OptionSheet.tsx` | one option: sections, lines, flags, totals, parity banner |
| `src/components/Analysis.tsx` | options side by side and where they differ |
| `tests/` | maths to the cent (invented numbers), allowlist, structural boundary |

## Environment (Vercel project for this app only)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | same as the desk |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as the desk |
| `QUOTE_AIRTABLE_TOKEN` | its own Airtable token: Bert base only; `data.records:read` for milestone 1 |
| `QUOTE_ALLOWED_EMAILS` | comma-separated Microsoft emails allowed to quote |

Function region `yul1` (Montréal), same as the desk — set in `vercel.json`, not the dashboard.

## Supabase Auth

Add this app's callback to Dashboard → Authentication → URL Configuration → Redirect URLs:
`https://<this app's domain>/auth/callback` (and the preview pattern
`https://*-<team>.vercel.app/auth/callback` if previews should sign in). Leave the Site URL
pointing at the desk.

## If it is down

Quote in the Excel template. Sent quotes are PDFs in each customer's OneDrive folder, so
nothing a customer has been sent depends on this app being up.
