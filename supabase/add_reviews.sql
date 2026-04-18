-- ============================================================
-- Pyle Plan Builder — Plan Reviews migration
--
-- Run this in Supabase SQL Editor AFTER schema.sql + add_auth.sql.
-- Creates the plan_reviews table so team members can leave
-- comments and approval stamps on saved plans. Clients get
-- read-only access to reviews on the plan assigned to them.
-- Safe to re-run — uses `if not exists` + idempotent policy drops.
-- ============================================================

create table if not exists public.plan_reviews (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.plans(id) on delete cascade,
  reviewer_email text not null,
  comment        text,
  status         text not null default 'comment'
                 check (status in ('comment', 'approved', 'changes_requested')),
  created_at     timestamptz not null default now()
);

create index if not exists plan_reviews_plan_id_idx
  on public.plan_reviews (plan_id);
create index if not exists plan_reviews_created_at_idx
  on public.plan_reviews (created_at desc);

alter table public.plan_reviews enable row level security;

-- Clean slate for idempotent re-runs
drop policy if exists "team_reviews_all"    on public.plan_reviews;
drop policy if exists "client_reviews_read" on public.plan_reviews;

-- Team (any email @pfs4u.com via is_team()): full CRUD on any review
create policy "team_reviews_all" on public.plan_reviews
  for all to authenticated
  using (public.is_team())
  with check (public.is_team());

-- Clients: read-only access to reviews on their own assigned plan
create policy "client_reviews_read" on public.plan_reviews
  for select to authenticated
  using (
    not public.is_team()
    and exists (
      select 1 from public.plans p
      where p.id = plan_reviews.plan_id
        and lower(p.client_email) = lower(auth.jwt()->>'email')
    )
  );
