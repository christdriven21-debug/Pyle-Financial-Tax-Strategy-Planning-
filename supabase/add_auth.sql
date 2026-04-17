-- ============================================================
-- Pyle Plan Builder — Auth + Role-Based Access migration
--
-- Run this in Supabase SQL Editor AFTER the initial schema.sql.
-- Replaces the permissive anon policies with:
--   * Team (emails ending in @pfs4u.com): full CRUD on all plans
--   * Client (any other signed-in email): SELECT/UPDATE their own plan(s)
--   * Anon (not signed in): no cloud access
-- ============================================================

-- Add ownership + client-assignment columns
alter table public.plans
  add column if not exists owner_id     uuid references auth.users(id),
  add column if not exists client_email text;

create index if not exists plans_owner_id_idx     on public.plans (owner_id);
create index if not exists plans_client_email_idx on public.plans (lower(client_email));

-- Helper: is the currently-signed-in user a team member?
-- Domain-based so new advisors at pfs4u.com are automatically team.
create or replace function public.is_team()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    lower(split_part(nullif(auth.jwt()->>'email', ''), '@', 2)) = 'pfs4u.com',
    false
  );
$$;

grant execute on function public.is_team() to authenticated, anon;

-- Drop any previous policies (MVP anon-full-access and any partial
-- re-runs of this migration), so this script is safe to run multiple times.
drop policy if exists "anon_read"         on public.plans;
drop policy if exists "anon_insert"       on public.plans;
drop policy if exists "anon_update"       on public.plans;
drop policy if exists "anon_delete"       on public.plans;
drop policy if exists "team_select"       on public.plans;
drop policy if exists "team_insert"       on public.plans;
drop policy if exists "team_update"       on public.plans;
drop policy if exists "team_delete"       on public.plans;
drop policy if exists "client_select_own" on public.plans;
drop policy if exists "client_update_own" on public.plans;

-- ============================================================
-- TEAM policies (full CRUD on every plan)
-- ============================================================
create policy "team_select" on public.plans
  for select to authenticated
  using (public.is_team());

create policy "team_insert" on public.plans
  for insert to authenticated
  with check (public.is_team());

create policy "team_update" on public.plans
  for update to authenticated
  using (public.is_team())
  with check (public.is_team());

create policy "team_delete" on public.plans
  for delete to authenticated
  using (public.is_team());

-- ============================================================
-- CLIENT policies (only their own plan, SELECT + UPDATE)
-- Clients cannot INSERT new plans or DELETE any plan.
-- The UPDATE policy's with-check prevents them from reassigning
-- client_email to a different address (which would steal the row).
-- ============================================================
create policy "client_select_own" on public.plans
  for select to authenticated
  using (
    not public.is_team()
    and lower(client_email) = lower(auth.jwt()->>'email')
  );

create policy "client_update_own" on public.plans
  for update to authenticated
  using (
    not public.is_team()
    and lower(client_email) = lower(auth.jwt()->>'email')
  )
  with check (
    not public.is_team()
    and lower(client_email) = lower(auth.jwt()->>'email')
  );
