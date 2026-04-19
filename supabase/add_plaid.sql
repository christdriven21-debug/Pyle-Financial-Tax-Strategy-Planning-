-- ═══════════════════════════════════════════════════════════
-- PLAID INTEGRATION — plaid_items + plaid_accounts tables
-- ═══════════════════════════════════════════════════════════
-- Run this in the Supabase SQL Editor AFTER the base schema
-- (schema.sql + add_auth.sql + add_reviews.sql + add_checklist.sql).
--
-- Stores the long-lived Plaid access_token per user per linked
-- institution. RLS ensures each user can only read their own
-- linked items; the Vercel serverless functions use the SERVICE
-- ROLE KEY to write (bypassing RLS for insert from /api/plaid/exchange).
-- ═══════════════════════════════════════════════════════════

create table if not exists public.plaid_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  item_id             text not null unique,
  access_token        text not null,
  institution_name    text,
  institution_id      text,
  created_at          timestamptz not null default now(),
  last_balance_sync   timestamptz,
  status              text default 'active'
);

create index if not exists plaid_items_user_id_idx on public.plaid_items(user_id);

alter table public.plaid_items enable row level security;

-- Users can READ their own linked items (to know what's connected) but
-- NOT the access_token column. We handle this by creating a VIEW that
-- omits access_token and granting client-side read access only to the view.
drop view if exists public.plaid_items_safe;
create view public.plaid_items_safe as
select id, user_id, item_id, institution_name, institution_id,
       created_at, last_balance_sync, status
from public.plaid_items;

-- RLS policies on the base table: users can only operate on their own rows.
-- Clients use plaid_items_safe (view); server-side (service role) uses
-- plaid_items directly for reads/writes including access_token.
drop policy if exists "users see own plaid_items" on public.plaid_items;
create policy "users see own plaid_items"
  on public.plaid_items for select
  using (auth.uid() = user_id);

drop policy if exists "users delete own plaid_items" on public.plaid_items;
create policy "users delete own plaid_items"
  on public.plaid_items for delete
  using (auth.uid() = user_id);

-- No INSERT or UPDATE policy — only the service-role Vercel function
-- should write to this table (exchange.js) because the access_token
-- must never round-trip through the client.

-- ───────────────────────────────────────────────────────────
-- Optional: plaid_balance_snapshots — daily/weekly historical balances
-- Enables trend lines on net worth, tax-loss-harvesting alerts on
-- investment accounts, etc.
-- ───────────────────────────────────────────────────────────
create table if not exists public.plaid_balance_snapshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  account_id    text not null,
  item_id       text,
  institution   text,
  account_type  text,
  account_subtype text,
  balance       numeric,
  available     numeric,
  currency      text,
  captured_at   timestamptz not null default now()
);

create index if not exists plaid_snapshots_user_captured_idx
  on public.plaid_balance_snapshots(user_id, captured_at desc);
create index if not exists plaid_snapshots_account_captured_idx
  on public.plaid_balance_snapshots(account_id, captured_at desc);

alter table public.plaid_balance_snapshots enable row level security;

drop policy if exists "users read own snapshots" on public.plaid_balance_snapshots;
create policy "users read own snapshots"
  on public.plaid_balance_snapshots for select
  using (auth.uid() = user_id);

-- Snapshots written by service-role cron job (Vercel Cron or pg_cron)
-- — no INSERT policy for client-side.
