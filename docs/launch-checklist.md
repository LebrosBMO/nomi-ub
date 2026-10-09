# Launching the business-owner side

Everything in the code is done. These are the steps only you can do, in order.
Tick them off as you go.

## 1. Supabase — the database

- [ ] Open the project at supabase.com. (Settings → General → rename it `nomi-ub`, so it is never confused with the document app again.)
- [ ] SQL Editor → New query → paste the whole of `supabase/schema.sql` → **Run**.
- [ ] Check it with this query — you want exactly three tables, all empty:

```sql
select table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::int as row_count
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
```

```
claims         0
place_counts   0
rate_limits    0
```

- [ ] Project Settings → API. Copy two things:
  - **Project URL** → this is `SUPABASE_URL`
  - **service_role** key (the secret one, NOT anon) → this is `SUPABASE_SERVICE_ROLE_KEY`

The service_role key is a password to the whole database. It goes in expo.dev and nowhere else:
never in the code, never in git, never in a chat.

## 2. expo.dev — the settings the server reads

- [ ] expo.dev → project `nomi` → **Environment variables**.
- [ ] Add three, each with environment **production** and visibility **Sensitive**
      (not Secret — EAS Hosting cannot read Secret variables):

| Name | Value |
|---|---|
| `SUPABASE_URL` | from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
| `NOMI_ADMIN_TOKEN` | you invent it: ~30 random characters. This is your /admin password — save it in your password manager. |

- [ ] Check `NOMI_SIGNING_SECRET` is already there (it should be — the app's install keys use it).
      The owner report links are signed with it too.

## 3. Your laptop — deploy

```powershell
cd C:\Users\Handashka\Documents\Nomi\nomi
git pull https://github.com/LebrosBMO/Nomi.git business-portal
npm install
npx expo export --platform web
npx eas-cli deploy --prod --environment production
```

- [ ] Deployed without errors.

## 4. Check it is really working

- [ ] Open `https://nomi-ub.expo.app/business` on your phone.
- [ ] Search your own business by name, pick it, fill the form, tick the owner box, send.
- [ ] Open `https://nomi-ub.expo.app/admin`, paste your admin token, press "Жагсаалт харах".
      Your test request should be in the list.
- [ ] In Supabase → Table Editor → `claims`, the same request should be there as a row.
- [ ] Mark it "Зөвшөөрөх" on /admin, then refresh the Supabase row: status should read `approved`.

If /admin says "Сервер хариу өгсөнгүй", the three variables in step 2 are wrong or the deploy
did not pick them up. Redeploy after fixing them.

## 5. Keep the free database awake (do this within a week)

Supabase's free plan pauses a project after about 7 days with no queries, and a paused project
has to be restored by hand — which would leave an owner's report link dead.
`.github/workflows/supabase-keepalive.yml` pings it every three days, but it needs two secrets:

- [ ] GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret:
  - `SUPABASE_URL` — the same project URL
  - `SUPABASE_ANON_KEY` — the **anon** key this time, not service_role (it reads nothing, RLS blocks it)
- [ ] Actions tab → "Keep Supabase awake" → Run workflow, to check it passes.

## After launch

- One deploy ships the new `TERMS_VERSION`, so every existing user sees the first screen once more
  and accepts again. That is intended: the Privacy Policy now states the anonymous counters.
- Owner corrections reach the catalog only after you call the owner. Then:

```powershell
$env:NOMI_ADMIN_TOKEN="your admin token"
node scripts/export-owner-edits.mjs    # approved claims -> data/owner-edits.json
node scripts/apply-owner-edits.mjs     # -> src/data/directory.json
node scripts/build-place-index.mjs     # refresh the index the owner routes read
npm test                               # then commit, and deploy again
```
