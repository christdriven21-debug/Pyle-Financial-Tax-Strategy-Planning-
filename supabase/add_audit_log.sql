-- ═══════════════════════════════════════════════════════════
-- AUDIT LOG — SOC 2 / fiduciary compliance change tracking
-- ═══════════════════════════════════════════════════════════
-- Run this AFTER the base Supabase schema.
--
-- Captures every plan create/update/delete + sign-in + document
-- upload/delete + share-link issuance. Used for fiduciary audit
-- defense ("when did we ask the client about the SLAT?") and
-- SOC 2 Type II evidence ("show access logs for client X").
--
-- The application also writes to this table directly for events
-- that aren't database mutations (sign-in, AI Q&A, exports).
-- ═══════════════════════════════════════════════════════════

create table if not exists public.audit_log (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid references auth.users(id) on delete set null,
  actor_email   text,
  actor_role    text,                 -- 'team' or 'client'
  action        text not null,        -- 'plan.create','plan.update','plan.delete','doc.upload','doc.delete','share.create','signin','ai.ask','export.pdf'
  entity_type   text,                 -- 'plan','document','share_link','session'
  entity_id     text,                 -- uuid or path
  plan_id       uuid references public.plans(id) on delete set null,
  client_email  text,
  ip_address    inet,
  user_agent    text,
  metadata      jsonb default '{}'::jsonb,  -- field-level diffs, file size, AI prompt hash, etc.
  diff          jsonb                       -- for updates: { field: [old, new], ... }
);

create index if not exists audit_log_occurred_idx on public.audit_log(occurred_at desc);
create index if not exists audit_log_actor_idx on public.audit_log(actor_id, occurred_at desc);
create index if not exists audit_log_plan_idx on public.audit_log(plan_id, occurred_at desc);
create index if not exists audit_log_action_idx on public.audit_log(action, occurred_at desc);

alter table public.audit_log enable row level security;

-- Only team members can read the audit log. Clients should not see
-- when team accessed their plan, what diffs were applied, etc.
drop policy if exists "team read audit_log" on public.audit_log;
create policy "team read audit_log"
  on public.audit_log for select
  using (public.is_team());

-- Anyone authenticated can write (the app self-reports events).
-- Note: append-only — no UPDATE or DELETE policy, so even team
-- members cannot retroactively edit the log.
drop policy if exists "auth insert audit_log" on public.audit_log;
create policy "auth insert audit_log"
  on public.audit_log for insert
  with check (auth.role() = 'authenticated');

-- ───────────────────────────────────────────────────────────
-- Trigger function: auto-log mutations to public.plans
-- App-side logging covers events that aren't DB mutations.
-- ───────────────────────────────────────────────────────────
create or replace function public.log_plan_change()
returns trigger language plpgsql security definer as $$
declare
  v_action text;
  v_diff jsonb := '{}'::jsonb;
  v_client_email text;
  v_plan_id uuid;
  k text;
  old_val jsonb;
  new_val jsonb;
begin
  if TG_OP = 'INSERT' then
    v_action := 'plan.create';
    v_plan_id := NEW.id;
    v_client_email := NEW.client_email;
  elsif TG_OP = 'UPDATE' then
    v_action := 'plan.update';
    v_plan_id := NEW.id;
    v_client_email := NEW.client_email;
    -- Compute field-level diff (top-level cols only; data jsonb is
    -- diffed coarsely as "data changed").
    if OLD.name is distinct from NEW.name then
      v_diff := v_diff || jsonb_build_object('name', jsonb_build_array(OLD.name, NEW.name));
    end if;
    if OLD.client_email is distinct from NEW.client_email then
      v_diff := v_diff || jsonb_build_object('client_email', jsonb_build_array(OLD.client_email, NEW.client_email));
    end if;
    if OLD.data is distinct from NEW.data then
      v_diff := v_diff || jsonb_build_object('data', 'changed');
    end if;
  elsif TG_OP = 'DELETE' then
    v_action := 'plan.delete';
    v_plan_id := OLD.id;
    v_client_email := OLD.client_email;
  end if;

  insert into public.audit_log(
    actor_id, actor_email, action, entity_type, entity_id,
    plan_id, client_email, diff
  ) values (
    auth.uid(),
    auth.jwt() ->> 'email',
    v_action,
    'plan',
    v_plan_id::text,
    v_plan_id,
    v_client_email,
    case when v_diff = '{}'::jsonb then null else v_diff end
  );

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_plans_audit on public.plans;
create trigger trg_plans_audit
  after insert or update or delete on public.plans
  for each row execute function public.log_plan_change();

-- ───────────────────────────────────────────────────────────
-- Trigger: auto-log document upload + delete
-- ───────────────────────────────────────────────────────────
create or replace function public.log_doc_change()
returns trigger language plpgsql security definer as $$
declare
  v_action text;
  v_plan_id uuid;
  v_meta jsonb;
begin
  if TG_OP = 'INSERT' then
    v_action := 'doc.upload';
    v_plan_id := NEW.plan_id;
    v_meta := jsonb_build_object(
      'file_name', NEW.file_name,
      'file_size', NEW.file_size,
      'category', NEW.category,
      'is_client_visible', NEW.is_client_visible
    );
  elsif TG_OP = 'DELETE' then
    v_action := 'doc.delete';
    v_plan_id := OLD.plan_id;
    v_meta := jsonb_build_object('file_name', OLD.file_name, 'category', OLD.category);
  end if;

  insert into public.audit_log(
    actor_id, actor_email, action, entity_type, entity_id,
    plan_id, metadata
  ) values (
    auth.uid(),
    auth.jwt() ->> 'email',
    v_action,
    'document',
    coalesce(NEW.id, OLD.id)::text,
    v_plan_id,
    v_meta
  );

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_documents_audit on public.plan_documents;
create trigger trg_documents_audit
  after insert or delete on public.plan_documents
  for each row execute function public.log_doc_change();

-- ───────────────────────────────────────────────────────────
-- Convenience view: human-readable audit feed for the UI
-- ───────────────────────────────────────────────────────────
drop view if exists public.audit_log_feed;
create view public.audit_log_feed as
select
  al.id,
  al.occurred_at,
  al.actor_email,
  al.action,
  al.entity_type,
  al.entity_id,
  al.plan_id,
  p.name as plan_name,
  al.client_email,
  al.metadata,
  al.diff
from public.audit_log al
left join public.plans p on p.id = al.plan_id
order by al.occurred_at desc;

-- View inherits RLS from the underlying audit_log table (team-only).
