# Putting Nomi in Google Play

**Two apps, one database.** The same codebase builds both (`app.config.ts`):

| | Customer app | Owner app |
|---|---|---|
| Store name | Nomi | Nomi бизнес |
| Application id | `mn.nomi.app` | `mn.nomi.business` |
| Opens on | the chat | the owner pages |
| Build profile | `production` | `production-business` |
| Asks for location / notifications | yes | no — those native parts are left out |

They are separate listings in the store, so an owner installs the owner app and never sees the chat. Both
call the same API (`src/app/api`) and therefore the same Supabase database: a correction sent from the owner
app lands in the same `claims` table as one sent from the web page, and the counts the customer app sends are
the numbers the owner app reports. The website keeps serving the owner pages too, for owners who would rather
tap a link than install anything.

What follows is everything Play Console asks for, drafted. Nothing here is submitted automatically: you paste
and press the buttons.

## The owner app needs its own EAS project (once)

EAS keys a project by slug, so the owner app is a second project on your account:

```powershell
$env:EXPO_PUBLIC_APP_VARIANT="business"
npx eas-cli init          # prints a project id — keep it
$env:EAS_PROJECT_ID_BUSINESS="<that id>"
```

Set `EAS_PROJECT_ID_BUSINESS` in the EAS production environment as well, so cloud builds pick it up. Without
it the owner app builds without over-the-air updates, which still works but means every change needs a new
build.

## Decided before the first upload (these are permanent)

| | Value | Why it matters |
|---|---|---|
| Application ID | `mn.nomi.app` and `mn.nomi.business` | **Can never change after publishing.** The customer one was `mn.nomi.pilot`; "pilot" would have been in the store URL forever. |
| App name | Nomi · Nomi бизнес | 30 characters max each. |
| Default language | Mongolian (mn-MN) | Add English later if you want; Mongolian is the audience. |

The iOS bundle identifier was changed to match. Any preview build already on a phone has the old id, so it
stays as a separate app — uninstall it to avoid confusion.

## Build and upload

```powershell
npx eas-cli build --platform android --profile production            # Nomi
npx eas-cli build --platform android --profile production-business   # Nomi бизнес
```

Produces an `.aab`. Upload it under Play Console → Testing (closed) → Create release, or
`npx eas-cli submit --platform android` once a Google service-account key is set up
(Play Console → Setup → API access; the key is a secret — keep it out of this repository).

`version` in `app.json` is the user-visible one (1.0.0). `versionCode` increases on its own
(`autoIncrement` in eas.json), and Play refuses an upload that reuses one.

## Store listing — Mongolian

**App name** (30)

```
Nomi
```

**Short description** (80)

```
Улаанбаатарын эмийн сан, засвар, үйлчилгээг чатаар олоод шууд залгаарай.
```

**Full description** (4000)

```
Nomi бол Улаанбаатарын үйлчилгээний газруудыг олоход туслах монгол чат.

“Ойрхон эмийн сан”, “дугуй засвар БЗД”, “шөнө ажилладаг эмийн сан” гэж бичихэд Nomi
хамгийн таарах газруудыг олж, утас, хаяг, ажиллах цагийг нь харуулна. Утасны дугаар дээр
дарахад шууд залгана.

Юу байдаг вэ:
• 6,370 газар, 572 төрлийн үйлчилгээ — эмийн сан, дугуй засвар, шүдний эмнэлэг, сантехник,
  цоожны мастер, хувцас засвар, жолооны курс гэх мэт.
• Ойролцоох хайлт: та зөвшөөрвөл байршлыг нэг удаа ашиглаж, хамгийн ойрыг эхэнд харуулна.
  Байршил утсанд л үлдэнэ, хаашаа ч илгээгдэхгүй.
• Танай хаяг дээр очиж үйлчилдэг газрууд (сантехник, чирэгч, цэвэрлэгээ) тусад нь харагдана.
• Баталгаажуулалт: Nomi өөрөө утсаар шалгасан газрыг “Баталгаажсан” гэж тэмдэглэнэ.
  Шалгаагүйг нь “Шалгаагүй” гэж шулуухан хэлнэ.
• Хувийн туслах: хийх ажил, сарын төлбөр, зардал, сануулга — бүгд зөвхөн таны утсанд.

Нууцлал:
Яриа, ажил, санамж, төлбөр, байршил таны утсанд хадгалагдана. Nomi эдгээрийг зардаггүй,
зар сурталчилгаанд ашигладаггүй. AI-г асаасан үед таны бичсэн хүсэлт л сервер рүү явна —
Тохиргооноос хэдийд ч унтрааж болно.

Nomi эмийн талаар зөвлөгөө өгөхгүй. Эмийн талаар эм зүйч, эмчээс асуугаарай.
Яаралтай тусламж 103.

Газрын мэдээлэл хуучирсан байж болох тул очихоосоо өмнө утсаар лавлаарай.
Алдаа олбол аппаас шууд мэдэгдэж болно.

Бизнес эрхлэгч үү? nomi-ub.expo.app/business хаягаар мэдээллээ үнэгүй засуулаарай.
```

**Category:** Maps & Navigation (or Lifestyle). **Tags:** local services, directory, Mongolia.
**Contact email:** needed, and shown publicly — use a support address, not a personal one.
**Privacy policy URL:** `https://nomi-ub.expo.app/privacy` — already live, which Play requires.

## Data safety form

Answer it from what the app actually does (`src/utils/legal.ts` is the same statement in Mongolian).

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share user data? | **Yes** | Only because of the AI. Everything else stays on the phone. |
| Location | **Not collected** | A nearby search uses one fix on the device and drops it. It never reaches a server (`src/utils/location.ts`, AC 7.3). |
| Personal info (name, email, phone) | **Not collected** | There is no sign-up. |
| Messages → Other in-app messages | **Collected and shared**, not linked to the user, not stored | With the AI on, the typed request goes to Nomi's server and on to OpenAI with `store: false`. Purpose: **App functionality**. Users can switch it off in Settings. |
| Files, photos, contacts, calendar, health | **Not collected** | The app never asks. |
| App activity / app info and performance | **Not collected** | The activity history and usage counts stay on the phone. |
| Is data encrypted in transit? | **Yes** | HTTPS throughout. |
| Can users request deletion? | **Yes** | Settings → "Миний өгөгдлийг устгах" removes everything on the device; the server keeps nothing to delete. |

The anonymous business counters are not user data: a count holds a place id, a month and a kind, with no
identifier of any device or person (`supabase/schema.sql`, `src/utils/counters.ts`). It is still honest to
mention them in the listing's privacy section, which the Privacy Policy already does.

## Permissions to justify

| Permission | Where | What to write |
|---|---|---|
| Location (foreground, approximate/precise) | expo-location | "Хэрэглэгч зөвшөөрсөн үед ойролцоох үйлчилгээг эрэмбэлэхэд нэг удаа ашиглана. Байршил утсанд л үлдэнэ." Background location is explicitly off in app.json. |
| Notifications | expo-notifications | Reminders the user sets themselves. |
| Internet | — | The AI request and the anonymous counters. |

## Content rating

Everyone / 3+. No violence, no gambling, no user-generated content shown to others, no ads, no purchases
inside the app. The partner offer is sold by phone, outside the app, so it is not an in-app purchase.

## Screenshots

Play needs at least 2 phone screenshots (16:9 or 9:16, 320–3840 px). Drafts rendered from the web build are
in `docs/store/` — good enough to submit, better retaken on a real phone with `scripts/phone-check.mjs`.

Order matters; the first two are what people see without scrolling:
1. A search with results — the thing the app does.
2. A card with the verified badge, hours and the call button.
3. The nearby question, which shows location is asked for, not taken.
4. "Миний" — tasks, payments, reminders.
5. Бүх ангилал — the breadth of the catalog.

## Closed testing

Personal developer accounts created after 13 Nov 2023 need 12 testers opted in for 14 continuous days
before production. Organization accounts are exempt. Check which yours is before planning the date:
the clock is calendar time, so start it early and do the listing while it runs.

## The owner app's listing — Mongolian

**App name** (30)

```
Nomi бизнес
```

**Short description** (80)

```
Nomi дээрх газраа зөв болгож, хэдэн хүн харж залгасныг хараарай.
```

**Full description**

```
Nomi бизнес бол Улаанбаатарын үйлчилгээний газруудыг олдог Nomi аппад бүртгэлтэй бизнес
эрхлэгчдэд зориулсан апп.

Юу хийж болох вэ:
• Газраа нэр эсвэл утсаараа хайж олоод, Nomi дээр яг хэрхэн харагдаж байгааг харах.
• Утас, ажиллах цаг, хаяг, очиж үйлчилдэг дүүргээ зөв болгуулах хүсэлт илгээх.
• Сарын тайлан: энэ сард хэдэн хүн таныг харсан, хэдэн хүн залгасан, газрын зураг хэд дарсан.
• Nomi-д бүртгэлгүй бол газраа шинээр нэмүүлэх.
• Түнш болох хүсэлт илгээх.

Үнэгүй. Бүртгүүлэх, нэвтрэх шаардлагагүй.

Мэдээлэл шууд өөрчлөгдөхгүй: Nomi таны бичсэн дугаар луу залгаж батлуулсны дараа л оруулна.
Ингэснээр өөр хүн таны газрын мэдээллийг өөрчилж чадахгүй.

Тоолол нэргүй: хэн харсан, юу бичсэн нь хадгалагддаггүй. Зөвхөн газрын дугаар, сар,
үйлдлийн төрөл л тоологдоно.
```

**Data safety for the owner app:** it collects the name and phone a business owner types into a correction or
a partner request, so that Nomi can call them back. Declare **Personal info → Name, Phone number**:
collected, not shared, purpose **App functionality**, and deletion by request (you remove the row in Supabase).
It has no location and no notifications at all.

**Screenshots:** the owner page, a filled correction form, and the monthly report.

## After release

- A JavaScript-only change ships without a new build: `npx eas-cli update --channel production`.
- A native change (new package, permission, plugin) needs `expo.version` raised and a new build.
- The owner side (`/business`) is web and is not in this app at all; it deploys with the GitHub button.
