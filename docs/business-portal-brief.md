# Brief: the business-owner side of Nomi

Build this in this repository (Expo SDK 57 / Expo Router; web output "server"; API routes under `src/app/api`; deployed on EAS Hosting, which is Cloudflare Workers). First read `AGENTS.md` (use the exact versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/) and `README.md`. Then study the existing patterns:
- `src/server/assistant.ts`: routes, CORS and same-site checks, per-install signed keys `i1.<id>.<hmac>` with `NOMI_SIGNING_SECRET`, rate limits.
- `src/app/api/*+api.ts`.
- `src/utils/install.ts`: client install keys and `hostedAsk`.
- `src/utils/hosted.ts`.
- `src/screens/chat/place-card.tsx`: call, map and share actions.
- `src/utils/legal.ts`: terms and privacy text, `TERMS_VERSION`.
- `src/data/directory.json`: the catalog and its place ids.
- `src/utils/category-match.ts`: `categoryMode` (visit, callout or both).

Match the code style: comment density, naming, Mongolian UI text, English comments. Every user-facing word is natural spoken Mongolian Cyrillic.

**Goal:** a phone-friendly web "app" for business owners at `/business`, with no store install. It also needs the anonymous counters it reports on, and a small admin page for the founder. No owner accounts or passwords.

## 1. Store
`src/server/store.ts`: a small key-value adapter over the Upstash Redis REST API.
- Configuration: the env vars `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Use plain fetch, no SDK.
- An in-memory implementation is used in tests, and in dev when those env vars are missing.
- Operations: hincrby, hgetall, set/get JSON with an optional TTL, and a list or sorted set for claims.
- In production without the env vars, routes that need the store answer 503 `{error:'store_not_configured'}`. They never crash.

## 2. Anonymous counters
- **Route:** `POST /api/events`, using the install key with the same auth as `/api/assistant`. The body is `{placeId, kind}`, with kind one of view, open, call, map or share.
- **Validation:** the `placeId` must be in the catalog.
- **Storage:** HINCRBY on `c:<placeId>:<YYYY-MM, Ulaanbaatar time>`, with the kind as the field.
- **Rate limit:** about 120 events a minute per install.
- **Privacy:** never store message text, location, or the install id with a count.
- **Client:** a fire-and-forget `recordPlaceEvent(placeId, kind)` in `src/utils/events.ts`.
  - The place card sends 'view' once when it is first shown, and 'call', 'map' or 'share' on those taps.
  - It never blocks and never retries, and it silently drops failures.
  - It sends nothing before the terms are accepted.
- **Terms:** add one honest line to PRIVACY: anonymous counts of how often each business is shown and called, used to tell businesses; never what you typed or where you are. Bump `TERMS_VERSION`.

## 3. Owner pages
Web routes go in `src/app/business/` and screens in `src/screens/business/`.

**a. `/business`**
- Explains what Nomi is and says "Таны газар Nomi дээр үнэгүй байна" ("your business is on Nomi for free").
- Search by name or phone. Reuse the skeleton matching from `category-match.ts`.
- Pick a business and see how it appears in Nomi.
- Correction form:
  - phones, hours, address note;
  - districts served: 9 checkboxes, shown prominently for callout and both categories;
  - owner name, contact phone;
  - a checkbox "Би энэ газрын эзэн/менежер" ("I am the owner or manager of this business").
- Submitting sends `POST /api/business/claim`, which stores a pending claim with an id and a timestamp.
  - Rate-limit by `x-real-ip`.
  - Validate field lengths, and accept only 8-digit Mongolian phone numbers.
- The confirmation says Nomi will call the listed number before anything changes.
- An "add my business" path for businesses not yet in the catalog, with a category picker.

**b. Partner offer, on the same page:**
- The "Санал болгож буй" (recommended) slot, the verified badge, and a monthly report.
- 49,000₮ for 3 months, paid upfront. A month with no calls makes the next month free. At most 3 partners per category per district.
- A button "Түнш болох хүсэлт илгээх" ("send a partner request") stores the business id plus contact name and phone. No online payment.

**c. `/business/report?k=<token>`**
- A read-only monthly report: views, opens, calls, map taps and shares for this month and last month.
- A plain summary line, for example "Энэ сард 312 хүн таныг харж, 14 хүн залгасан" ("312 people saw you this month, 14 called").
- The token is the placeId plus an expiry, signed with HMAC-SHA256 using `NOMI_SIGNING_SECRET` (Web Crypto).
- A bad or expired link shows a friendly message.
- API: `GET /api/business/report?k=`.

## 4. Admin
`/admin` (web) is protected by a token the founder types in.
- **Auth:** compare against the env var `NOMI_ADMIN_TOKEN`, sent as a bearer header, using the existing constant-time compare.
- **Lists:** pending claims and partner requests, newest first. Each can be marked approved, rejected or called.
- **Report links:** generate one for any place id with `GET /api/admin/report-link?placeId=`.
- **Export:** `scripts/export-owner-edits.mjs` pulls approved claims through the admin API (token from an env var) into `data/owner-edits.json`.
- **Import:** `scripts/import-directory.py`, or a separate pass, applies that file to the catalog: phones, hours, address and `serviceAreas` (already on `Place` and used by the search). `checkStatus` stays "Шалгаагүй" unless the edit marks a phone verification.

## 5. Quality
- **Tests** with node:test, in the style of `src/server/assistant.test.ts`, covering:
  - the memory store;
  - events validation, the rate limit and the month key;
  - claim validation;
  - report token sign, verify and expiry;
  - admin auth.
- **Checks:** `npx tsc --noEmit`, `npm test` and `npx expo lint` all pass, and `npx expo export --platform web` builds.
- **Layout:** pages work at 375px width.
- **Existing app:** unchanged, apart from the counters and the privacy line.

## 6. Delivery
- **Branch:** commit to a new branch `business-portal` with clear commits. End each commit message with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".
- **Don't deploy:** don't deploy or run any eas commands, and never add secrets to the repo.
- **Final report:**
  - files changed;
  - env var names the founder must add on expo.dev (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NOMI_ADMIN_TOKEN`);
  - how to try each page;
  - test results;
  - anything left undone.
