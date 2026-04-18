-- ============================================================
-- Pyle Plan Builder — Implementation Checklist persistence
--
-- Run AFTER schema.sql + add_auth.sql + add_reviews.sql.
-- Tracks per-plan implementation checklist state (which
-- action items have been completed and when). Team members
-- tick the box, stamp appears with their email + timestamp.
-- Safe to re-run.
-- ============================================================

create table if not exists public.plan_checklist (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.plans(id) on delete cascade,
  item_key    text not null,
  checked     boolean not null default false,
  checked_by  text,
  checked_at  timestamptz,
  notes       text,
  updated_at  timestamptz not null default now(),
  unique (plan_id, item_key)
);

create index if not exists plan_checklist_plan_id_idx
  on public.plan_checklist (plan_id);

alter table public.plan_checklist enable row level security;

drop policy if exists "team_checklist_all"    on public.plan_checklist;
drop policy if exists "client_checklist_read" on public.plan_checklist;

create policy "team_checklist_all" on public.plan_checklist
  for all to authenticated
  using (public.is_team())
  with check (public.is_team());

create policy "client_checklist_read" on public.plan_checklist
  for select to authenticated
  using (
    not public.is_team()
    and exists (
      select 1 from public.plans p
      where p.id = plan_checklist.plan_id
        and lower(p.client_email) = lower(auth.jwt()->>'email')
    )
  );
