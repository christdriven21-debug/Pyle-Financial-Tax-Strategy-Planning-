-- ============================================================
-- Pyle QIR Builder — Quarterly Investment Review storage
--
-- Run this in Supabase SQL Editor AFTER add_auth.sql is in place.
-- Reuses the existing public.is_team() helper for RLS.
--
-- Each row is one saved snapshot of a client's QIR. To get
-- "quarter-over-quarter history," save multiple rows per client.
-- ============================================================

create table if not exists public.qir_reviews (
  id                uuid primary key default gen_random_uuid(),
  client_name       text not null,
  quarter           text,                          -- e.g. "Q1 2026" or "YTD through Apr 30, 2026"
  as_of_date        text,                          -- e.g. "April 30, 2026" (free-text label)
  data              jsonb not null,                -- the entire QIR_DATA object
  notes             text,                          -- optional advisor notes
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  created_by        uuid references auth.users(id) on delete set null,
  created_by_email  text                           -- email snapshot for audit
);

create index if not exists qir_reviews_client_idx
  on public.qir_reviews (client_name, as_of_date desc);

create index if not exists qir_reviews_created_by_idx
  on public.qir_reviews (created_by);

-- Auto-update updated_at on UPDATE
create or replace function public.qir_reviews_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists qir_reviews_updated_at on public.qir_reviews;
create trigger qir_reviews_updated_at
  before update on public.qir_reviews
  for each row execute function public.qir_reviews_set_updated_at();

-- ============================================================
-- RLS — reuse public.is_team() from add_auth.sql
-- Only team members (@pfs4u.com) can access. No client access yet.
-- ============================================================
alter table public.qir_reviews enable row level security;

-- Safe to re-run: drop existing policies first
drop policy if exists "qir_team_select" on public.qir_reviews;
drop policy if exists "qir_team_insert" on public.qir_reviews;
drop policy if exists "qir_team_update" on public.qir_reviews;
drop policy if exists "qir_team_delete" on public.qir_reviews;

create policy "qir_team_select" on public.qir_reviews
  for select to authenticated
  using (public.is_team());

create policy "qir_team_insert" on public.qir_reviews
  for insert to authenticated
  with check (public.is_team());

create policy "qir_team_update" on public.qir_reviews
  for update to authenticated
  using (public.is_team())
  with check (public.is_team());

create policy "qir_team_delete" on public.qir_reviews
  for delete to authenticated
  using (public.is_team());

-- ============================================================
-- DONE.
-- Verify with:
--   select * from public.qir_reviews limit 1;       -- should run without policy errors when signed in as team
-- ============================================================
