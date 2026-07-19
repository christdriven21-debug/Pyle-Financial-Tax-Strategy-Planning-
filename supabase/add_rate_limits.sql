-- ============================================================
-- Pyle Plan Builder — per-user AI rate limiting
-- Run this in Supabase SQL Editor (any time; independent of other migrations).
--
-- Backs api/_lib/ratelimit.js. The AI proxy endpoints (ask-plan,
-- polish-narrative, meeting-prep, extract-tax-doc) call the RPC below via the
-- SERVICE-ROLE key after authenticating the user, to cap per-user call volume
-- and prevent Anthropic-credit burn from a scripted loop.
--
-- Fixed-window counter: one row per (user_id, bucket, window_start). Old rows
-- are harmless; prune with the optional cron at the bottom if desired.
-- ============================================================

create table if not exists public.ai_rate_limits (
  user_id      uuid        not null,
  bucket       text        not null,
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (user_id, bucket, window_start)
);

-- RLS on, no policies: only the service-role key (which bypasses RLS) writes
-- through the RPC. authenticated/anon get no direct access.
alter table public.ai_rate_limits enable row level security;

-- Atomically increment the current window's counter and report whether the
-- caller is still within the limit. SECURITY DEFINER so it can write the
-- counter table regardless of RLS. user_id is passed explicitly by the server
-- (which has already verified the JWT), so this never trusts client input.
create or replace function public.consume_rate_limit(
  p_user_id        uuid,
  p_bucket         text,
  p_limit          int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count  int;
begin
  -- Floor now() to the start of the fixed window.
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.ai_rate_limits (user_id, bucket, window_start, count)
  values (p_user_id, p_bucket, v_window, 1)
  on conflict (user_id, bucket, window_start)
    do update set count = public.ai_rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_limit;  -- true = allowed, false = over limit
end;
$$;

-- Only the service role may execute this (the server calls it with the
-- service-role key). Deny everyone else.
revoke all on function public.consume_rate_limit(uuid, text, int, int) from public;
revoke all on function public.consume_rate_limit(uuid, text, int, int) from anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, int, int) to service_role;

-- Optional cleanup (rows older than 2 days are never consulted again):
--   delete from public.ai_rate_limits where window_start < now() - interval '2 days';
