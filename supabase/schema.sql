-- The business-owner side of Nomi (src/server/store.ts). Paste this into the Supabase SQL editor once.
-- Three tables: the anonymous counters, the owner requests, and the short-lived rate limits.
-- Row Level Security is on with no policies, so the anon key reads nothing; the API routes use the
-- service_role key, which bypasses RLS and never leaves the server (src/app/api/*).

-- How often each business was shown and called, by Ulaanbaatar month. No install id, no text, no position.
create table if not exists public.place_counts (
  place_id text not null,
  month text not null,                       -- "YYYY-MM", Ulaanbaatar time
  kind text not null,                        -- view | open | call | map | share
  n integer not null default 0,
  primary key (place_id, month, kind)
);

-- Corrections and partner requests, waiting for the founder's call (/admin).
create table if not exists public.claims (
  id text primary key,
  kind text not null,                        -- claim | partner
  status text not null default 'pending',    -- pending | approved | rejected | called
  place_id text,                             -- null for a business not in the catalog yet
  business_name text not null default '',
  category text,
  service_style text,                         -- visit | callout | both | online, as the owner says it
  phones text[] not null default '{}',
  hours text not null default '',
  address_note text not null default '',
  service_areas text[] not null default '{}',
  owner_name text not null default '',
  contact_phone text not null default '',
  is_owner boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists claims_kind_created_at_idx on public.claims (kind, created_at desc);
create index if not exists claims_status_idx on public.claims (status);

-- One row per caller per window, thrown away when the window passes. The key is a digest, never an install id.
create table if not exists public.rate_limits (
  key text primary key,
  n integer not null default 0,
  expires_at timestamptz not null
);
create index if not exists rate_limits_expires_at_idx on public.rate_limits (expires_at);

alter table public.place_counts enable row level security;
alter table public.claims enable row level security;
alter table public.rate_limits enable row level security;

-- One anonymous count. Atomic, so two phones counting at once never lose one.
create or replace function public.add_place_event(p_place_id text, p_month text, p_kind text)
returns void
language sql
as $$
  insert into public.place_counts (place_id, month, kind, n)
  values (p_place_id, p_month, p_kind, 1)
  on conflict (place_id, month, kind) do update set n = public.place_counts.n + 1;
$$;

-- One step of a rate limit: the window's new count. Expired rows go first, so the table stays small on its own.
create or replace function public.bump_rate_limit(p_key text, p_window_seconds integer)
returns integer
language plpgsql
as $$
declare
  current_count integer;
begin
  delete from public.rate_limits where expires_at <= now();
  insert into public.rate_limits (key, n, expires_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set n = public.rate_limits.n + 1
  returning n into current_count;
  return current_count;
end;
$$;
