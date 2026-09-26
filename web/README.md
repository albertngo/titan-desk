# titan-desk web

Next.js 16 (App Router) PWA for staff. Talks to Supabase directly with the anon key; the
signed-in user's JWT makes it `authenticated`. All reads go through `src/lib/db/queries.ts`.

```
npm install
cp .env.local.example .env.local   # fill in the local Supabase URL/anon key
npm run dev
npm run lint && npm run typecheck && npm test
```

## Structure

| Path | What |
|---|---|
| `src/proxy.ts` | Next 16 proxy: refreshes the session, redirects anonymous visitors to `/login`; matcher excludes manifest, sw, icons, offline, login, auth, trigger |
| `src/app/login` | "Sign in with Microsoft 365" (Supabase Azure provider, PKCE, `skipBrowserRedirect` + `location.assign` for installed iOS apps) |
| `src/app/auth/callback` | code exchange; only relative `next` targets |
| `src/app/(app)/page.tsx` | search: debounced `search_staff` RPC, URL-backed filters, parsed-token chips, infinite "show more", fire-and-forget `search_log` |
| `src/app/(app)/p/[sku]` | server-rendered detail from `catalogue_staff` (variants, pairs, images, price block, design strip, report link) |
| `src/app/api/sync/trigger` | "Sync now": `repository_dispatch` via a server-side PAT; 5-minute cooldown from `sync_status` |
| `src/app/sw.ts` | Serwist service worker: precache shell, CacheFirst for Storage images, NetworkOnly for `/rest` and `/auth`, offline fallback |
| `src/lib/image-loader.ts` | `next/image` custom loader: picks the 200/600/1600 WebP variant, serves straight from the Storage CDN |
| `src/lib/db/types.ts` | hand-maintained types for the `api` schema (regenerate with `make types` when a Supabase project exists) |

## Environment

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_STORAGE_HOST`,
`GITHUB_DISPATCH_TOKEN` (fine-grained PAT for `repository_dispatch`), `GITHUB_DISPATCH_REPO`,
`SYNC_TRIGGER_SECRET`. Vercel: set the function region to `yul1`.

## Supabase Auth checklist

- Azure app registration: single tenant; redirect URI copied from Dashboard → Auth → Providers → Azure.
- Auth → URL configuration: Site URL = prod origin; Redirect URLs = `https://<prod>/auth/callback`,
  `https://*-<team>.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`.
- Auth → Hooks: Before User Created → `mirror.hook_restrict_signup` (domain allow-list in `mirror.settings`).

## Tests

- `npm test` — vitest unit tests (filters ⇄ URL, image loader).
- `npm run test:boundary` — HTTP boundary against a running Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`): anon reads the public view only, no staff/system keys, `mirror` not exposed, `search_staff` denied, originals not readable.
- `npm run e2e` — Playwright: manifest served without cookies, anonymous redirect, and (with `E2E_SESSION_COOKIE`) search → detail → report link.

iOS: install first (Share → Add to Home Screen), then sign in inside the installed app; the
installed app does not share Safari's cookies.
