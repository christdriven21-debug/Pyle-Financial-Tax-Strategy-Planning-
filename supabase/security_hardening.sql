-- SECURITY HARDENING: tightens RLS policies for audit_log and storage.objects.
-- Run this in Supabase SQL Editor AFTER add_audit_log.sql and add_documents.sql.
--
-- Fixes:
--  1. audit_log INSERT previously allowed any authed user to forge any
--     row (any actor_id, actor_email, action). Now actor fields are
--     forced to match the caller's identity, and a BEFORE trigger
--     prevents spoofing at the database level.
--  2. Storage bucket "plan-documents" previously allowed any authed user
--     to write to any path. Now the path must start with a plan UUID
--     the user is authorized to access.

-- ---------- AUDIT LOG INTEGRITY ----------

drop policy if exists "auth insert audit_log" on public.audit_log;
create policy "auth insert audit_log"
  on public.audit_log for insert
  with check (
    auth.role() = 'authenticated'
    -- Force actor_id to match the caller's JWT sub claim.
    AND actor_id = auth.uid()
    -- Force actor_email to match the caller's JWT email claim.
    AND lower(coalesce(actor_email, '')) = lower(auth.jwt() ->> 'email')
  );

-- Defense-in-depth: BEFORE INSERT trigger overwrites client-supplied
-- actor fields with the server-side truth. Protects even against a
-- future RLS bypass or service-role write by accident.
create or replace function public.audit_log_force_actor()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null then
    NEW.actor_id    := auth.uid();
    NEW.actor_email := auth.jwt() ->> 'email';
    -- Derive actor_role from is_team() rather than trusting the client.
    NEW.actor_role  := case when public.is_team() then 'team' else 'client' end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_audit_log_force_actor on public.audit_log;
create trigger trg_audit_log_force_actor
  before insert on public.audit_log
  for each row execute function public.audit_log_force_actor();

-- ---------- STORAGE BUCKET PATH ENFORCEMENT ----------

-- Replace the loose upload policy with one that requires the object
-- name to begin with a plan_id the caller is authorized to touch.
drop policy if exists "plan_documents_upload" on storage.objects;
create policy "plan_documents_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'plan-documents'
    AND auth.role() = 'authenticated'
    AND exists (
      select 1 from public.plans p
      where p.id::text = split_part(storage.objects.name, '/', 1)
        AND (
          public.is_team()
          OR lower(coalesce(p.client_email, '')) = lower(auth.jwt() ->> 'email')
        )
    )
  );

