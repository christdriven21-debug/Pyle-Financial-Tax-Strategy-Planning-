-- ============================================================
-- Wavvest Plan Builder — Supabase schema
-- Run this in Supabase > SQL Editor once per project.
--
-- NOTE: No auth is configured yet. RLS is enabled and policies
-- allow anonymous read/write. Lock these down before storing
-- any real client PII.
-- ============================================================

-- Core table ---------------------------------------------------
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists plans_updated_at_idx
  on public.plans (updated_at desc);

-- Auto-update updated_at on row update ------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- RLS: anon read/write (MVP — replace with auth later) ---------
alter table public.plans enable row level security;

drop policy if exists "anon_read"   on public.plans;
drop policy if exists "anon_insert" on public.plans;
drop policy if exists "anon_update" on public.plans;
drop policy if exists "anon_delete" on public.plans;

create policy "anon_read"   on public.plans for select using (true);
create policy "anon_insert" on public.plans for insert with check (true);
create policy "anon_update" on public.plans for update using (true) with check (true);
create policy "anon_delete" on public.plans for delete using (true);
