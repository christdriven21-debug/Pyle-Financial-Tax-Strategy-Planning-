-- SECURITY HARDENING #2: explicit team membership allowlist.
-- Run this AFTER security_hardening.sql.
--
-- Replaces domain-based team detection (which trusted any authenticated
-- @pfs4u.com email) with an explicit allowlist of Supabase user UUIDs.
-- Domain-based was vulnerable to:
--   - Catch-all mailbox compromise at pfs4u.com
--   - A misconfigured Supabase auth signup policy
--   - Typosquatted vanity address acceptance by the MX
--
-- The domain check is retained as a fallback during transition so
-- existing team sessions keep working. Once you've seeded
-- public.team_members with every advisor's UUID, run the block at
-- the bottom of this file to drop the domain fallback entirely.

-- ---------- TEAM_MEMBERS TABLE ----------

create table if not exists public.team_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  added_at   timestamptz not null default now(),
  added_by   uuid references auth.users(id)
);

alter table public.team_members enable row level security;

-- Only existing team members can read the allowlist.
drop policy if exists "team read team_members" on public.team_members;
create policy "team read team_members"
  on public.team_members for select
  using (public.is_team());

-- No INSERT/UPDATE/DELETE policy — writes must come from the SQL Editor
-- running with service-role privileges. RLS denies writes by default.

-- ---------- UPDATED is_team() (allowlist + domain fallback) ----------

create or replace function public.is_team()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid()
    )
    OR lower(split_part(nullif(auth.jwt()->>'email', ''), '@', 2)) = 'pfs4u.com',
    false
  );
$$;

grant execute on function public.is_team() to authenticated, anon;

-- ---------- SEED YOUR TEAM ----------
-- Find every current team user:
--
--     select id, email, created_at from auth.users
--     where email ilike '%@pfs4u.com' order by created_at;
--
-- Then run for each one (replace the UUIDs and emails):
--
--     insert into public.team_members (user_id, email)
--     values
--       ('00000000-0000-0000-0000-000000000000', 'scott@pfs4u.com'),
--       ('11111111-1111-1111-1111-111111111111', 'someone@pfs4u.com')
--     on conflict (user_id) do nothing;
--
-- Once seeded, test by running this as each team user (Supabase SQL
-- Editor lets you "run as" when you paste in their JWT, or just test
-- in the app):
--
--     select public.is_team();   -- should return true

-- ---------- FINAL STEP (run only after team_members is seeded) ----------
-- Uncomment and run this block to drop the domain fallback so team
-- membership is 100% explicit from that point forward.
--
-- create or replace function public.is_team()
-- returns boolean
-- language sql stable security definer
-- set search_path = public
-- as $$
--   select exists (
--     select 1 from public.team_members tm
--     where tm.user_id = auth.uid()
--   );
-- $$;
-- grant execute on function public.is_team() to authenticated, anon;
