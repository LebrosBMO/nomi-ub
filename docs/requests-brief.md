# Brief: Дуудлага — the request board

The catalog answers "who is there?". It cannot answer "who will come to me today?", because for that side of the market there is
almost nobody to list: of the 272 come-to-you categories, **165 have not a single business**, and the ones everybody needs have
one or three — 1 Бохир соруулах, 3 Сантехникч, 3 Цахилгаанчин, 0 Гэрийн жижиг засвар, 0 Угаалгын машин засвар. No amount of
collecting fixes that quickly: these people have no office, no sign and no website. They are in Facebook groups.

So for them Nomi stops being a directory and becomes a **board**: the customer says the job once, and the people who do that job
in that district answer it. This is the Facebook post, with the four things wrong with it fixed.

## What it replaces

A customer writes in a group: "Арзетк гаргуулах гэсэн юм, БЗД, хэн байна?" Then:

| In the group | Here |
| --- | --- |
| They post in five groups and wait; admins approve posts late at night | One request, sent at once to whoever does that job in that district |
| 40 comments: "чат", "дугаараа үлдээ", a number with no price | Every answer carries a price and when they can come |
| Nobody knows who the number belongs to | Every answer is a named business with a record: verified badge, how many customers called them through Nomi |
| Their number stays in a public group forever and gets sales calls for years | Their number is never shown; the request disappears in a day |

And for the tradesperson the group is a scroll race — first comment wins, whoever was holding their phone. Here the job arrives
already filtered to their category and their districts, and their answer has their price on it.

## 1. The flow

1. **The chat notices.** The customer types what they want: "арзетк гаргуулах гэсэн юм". `matchCategories` gives
   `septic_pumping`, `categoryMode` is `callout`, and Nomi has fewer than 3 businesses for it in that district. Instead of
   apologising, the chat offers the board:
   *"Nomi дээр ийм үйлчилгээ 1 л бүртгэлтэй байна. Дуудлага тавих уу? Таны хүсэлтийг энэ ажлыг хийдэг хүмүүст харуулна."*
   The offer also sits on a category page and on the "олдсонгүй" answer of any come-to-you category.
2. **Four questions**, nothing more (`/request`):
   - **Юу хийх вэ?** free text, prefilled from what they already typed, ≤ 300 characters.
   - **Хаана?** one of the nine districts, plus an optional landmark ("3-р хороолол, Их дэлгүүрийн баруун талд").
   - **Хэзээ?** `now` Яаралтай, одоо · `today` Өнөөдөр · `soon` 2-3 хоногт.
   - **Таны дугаар** — optional, and off by default: *"Таны дугаар хэнд ч харагдахгүй. Та өөрөө сонгож залгана."*
     A switch underneath: *"Над руу залгаж болно"* — then the number is shown **only to a business that has already answered**,
     and only while the request is open.
3. **The request is stored** `open`, with no account: the page gets back a signed owner token `q1.<id>.<hmac>` and remembers it
   on the device (`src/screens/business/remember.ts` already does this for report links). The same token is the link they can
   keep or send to a family member.
4. **The business app shows it.** `/business/jobs` lists open requests where the category is the business's own and the district
   is one it serves (`serviceAreas`, or its own district for a `visit` business), newest first, with the age in words
   ("12 минутын өмнө"). Phase 2 turns this into a push notification; phase 1 is a list with a count on the tab.
5. **"Би хийж чадна"** — the answer, three fields, all prefilled where Nomi knows them:
   - **Үнэ**: a number ("80,000₮-с") or *"Үзээд хэлнэ"*.
   - **Хэзээ ирж чадах вэ?**: `30min` · `1-2h` · `today` · `tomorrow` · `later`.
   - **Залгах дугаар**: the catalog's number, editable for this answer only.
   One answer per business per request; sending again replaces it, so a price can be corrected.
6. **The customer sees the answers** on their own request page: business name, the verified badge where it is earned, the Nomi
   record ("Энэ сард 14 хүн залгасан"), the price, when they can come, and a call button. They call whoever they like. Nothing
   is booked and nothing is paid through Nomi.
7. **The customer closes it**: *"Хэн нэгэнтэй тохирлоо"* or *"Болихоо больсон"*. It also closes on its own after 24 hours
   (`now`/`today`) or 3 days (`soon`), because an old job wastes everybody's call.
8. **The founder sees everything** on `/admin`: the requests and their answers, so a category that keeps getting requests and no
   answers is the next call list — this is how the board tells us who to recruit.
9. **The counters** get two more kinds, so the monthly report an owner already reads can say what the board brought them:
   `lead` (a request they were shown) and `answer` (one they answered). Phase 2.

## 2. Who may answer, and how it starts with nobody

Only a listed business, holding a **business key** `b1.<placeId>.<hmac>` — the same HMAC-SHA256 over `NOMI_SIGNING_SECRET` as the
install keys and the report links, with no expiry. The key is what the answer's name, badge and record hang off; without it an
answer is an anonymous comment, which is the thing we are replacing.

The key is issued on `/admin` (`GET /api/admin/business-key?placeId=`) and handed over in the call Nomi already makes before a
correction is accepted. So the board is also the recruiting pitch, and a far better one than a listing: *"БЗД-д арзатик дуудсан
хүн байна. Ажил авах уу? Тэгвэл танд холбоос явуулъя."* The first fifty keys are the launch work —
`node scripts/callout-call-list.mjs` already prints who to phone.

Until a category has anybody keyed, the request still arrives on `/admin` and the founder relays it by phone. That is slow and it
does not scale, and it is exactly how the supply gets built: every relayed job ends with a key.

Nobody else can answer. An owner who is not in the catalog yet must go through `/business` first, which is the existing claim
flow and already ends in a phone call from Nomi.

## 3. What is stored, and for how long

- The request: category, district, the landmark line, the customer's own text, when they need it, the optional number, the
  open/closed state and two timestamps. **No install id, no position, no name.**
- The answer: the place id, the price, the eta, the number and an optional line of text.
- A closed request and its answers are deleted after **30 days** (`purge_requests()`, the same shape as the rate-limit cleanup).
  Nothing about the board belongs in a long archive.
- Links and phone numbers are stripped out of the customer's text before it is stored, so the board cannot be used to publish a
  number or an advert.

## 4. The rules

| | |
| --- | --- |
| Open requests per device | 3 |
| Requests per address per hour | 5 |
| Answers per business key per hour | 20 |
| Answers per business per request | 1 (replaces) |
| Text | ≤ 300 characters, no links, no phone numbers |
| Request life | 24 hours (`now`, `today`), 3 days (`soon`) |
| Answers shown to the customer | all of them, newest first |

## 5. Money (not phase 1)

A lead is worth much more than a listing, and charging for one is the only part of Nomi a tradesperson with no shop can be sold.
Phase 1 is free in both directions, because without answers the board is worthless. Then, and only in the categories where
answers outnumber requests:

- the customer never pays, ever;
- a business gets **5 answers a month free**, so trying it costs nothing;
- after that **29,000₮ a month** for one category and three districts, unlimited answers, or **2,500₮ per answer** in credits of
  ten. Cash or bank transfer, the same as the partner offer; no online payment and no card in the app.

At 300 requests a month in Ulaanbaatar and 3 answers each, that is 900 answers — about 20 businesses on a monthly plan, 580,000₮
a month, from one vertical that the directory cannot serve at all. The listing partner offer (49,000₮ for three months) stays
what it is: a different product for businesses with an address.

## 6. Data

```sql
create table if not exists public.requests (
  id text primary key,                       -- rq_<time36><random>
  category text not null,
  district text not null,
  landmark text not null default '',
  text text not null default '',
  need text not null default 'today',        -- now | today | soon
  phone text not null default '',            -- '' unless the customer asked to be called
  call_me boolean not null default false,
  status text not null default 'open',       -- open | taken | closed
  created_at timestamptz not null default now(),
  closes_at timestamptz not null
);
create table if not exists public.request_answers (
  request_id text not null references public.requests(id) on delete cascade,
  place_id text not null,
  price integer,                             -- null means "үзээд хэлнэ"
  eta text not null,                         -- 30min | 1-2h | today | tomorrow | later
  phone text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (request_id, place_id)
);
```

RLS on with no policies, as the other three tables; the routes use the service key.

## 7. Routes

| Route | Auth | What |
| --- | --- | --- |
| `POST /api/requests` | install key | stores a request, returns `{id, token}` |
| `GET /api/requests?k=` | the owner token | the request and its answers |
| `POST /api/requests/close` | the owner token | `taken` or `closed` |
| `GET /api/business/jobs` | business key | the open requests this business matches |
| `POST /api/business/answer` | business key | one answer |
| `GET /api/admin/requests` | `NOMI_ADMIN_TOKEN` | everything, newest first |
| `GET /api/admin/business-key?placeId=` | `NOMI_ADMIN_TOKEN` | the key to hand an owner |

## 8. Build order

1. `src/utils/requests.ts` — the types, `readRequest`, `readAnswer`, the labels, `matchesBusiness(place, request)`; tests.
2. `supabase/schema.sql` — the two tables and `purge_requests()`; `src/server/store.ts` — the six operations, in memory and over
   PostgREST.
3. `src/server/portal.ts` — the routes above, the business key `b1.`, the caps; tests.
4. The customer side: `src/app/request.tsx` + `src/screens/requests/`, and the offer in the chat when a come-to-you category is
   thin.
5. The business side: `/business/jobs` in the owner app, with the count on the page.
6. `/admin`: the requests, their answers, and the empty categories they expose.
7. Phase 2: push notifications in the business app, the two new counter kinds, and the free-answer allowance.
