-- ═══════════════════════════════════════════════════════════
-- DOCUMENT VAULT — metadata + storage bucket RLS
-- ═══════════════════════════════════════════════════════════
-- Run this AFTER the base Supabase schema.
--
-- 1. Creates plan_documents table (metadata for each uploaded file)
-- 2. Row-level security: team can read all; clients read only their
--    plan's docs; team can upload + delete; clients can upload to
--    their own plan but cannot delete
-- 3. You must ALSO create a Storage bucket named "plan-documents" in
--    Supabase Storage UI and set its RLS policies (see bottom)
-- ═══════════════════════════════════════════════════════════

create table if not exists public.plan_documents (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.plans(id) on delete cascade,
  uploader_id   uuid not null references auth.users(id) on delete cascade,
  uploader_email text,
  file_path     text not null,       -- relative path in the storage bucket
  file_name     text not null,
  file_size     bigint,
  mime_type     text,
  category      text default 'other', -- plan / tax_return / trust / insurance / statement / other
  description   text,
  is_client_visible boolean default true,  -- team can mark docs as advisor-only
  created_at    timestamptz not null default now()
);

create index if not exists plan_documents_plan_idx on public.plan_documents(plan_id);
create index if not exists plan_documents_uploader_idx on public.plan_documents(uploader_id);

alter table public.plan_documents enable row level security;

-- Team members see all documents. Clients see only their own plan's
-- documents AND only the ones marked is_client_visible.
drop policy if exists "team and client read plan_documents" on public.plan_documents;
create policy "team and client read plan_documents"
  on public.plan_documents for select
  using (
    public.is_team()
    OR exists (
      select 1 from public.plans
      where plans.id = plan_documents.plan_id
        AND plans.client_email = auth.jwt() ->> 'email'
        AND plan_documents.is_client_visible = true
    )
  );

-- Team can insert any document for any plan. Clients can insert only
-- for their own plan, and cannot set is_client_visible = false (can't
-- hide from themselves).
drop policy if exists "team insert plan_documents" on public.plan_documents;
create policy "team insert plan_documents"
  on public.plan_documents for insert
  with check (public.is_team());

drop policy if exists "client insert plan_documents" on public.plan_documents;
create policy "client insert plan_documents"
  on public.plan_documents for insert
  with check (
    exists (
      select 1 from public.plans
      where plans.id = plan_documents.plan_id
        AND plans.client_email = auth.jwt() ->> 'email'
    )
    AND is_client_visible = true
    AND uploader_id = auth.uid()
  );

-- Team can delete; clients cannot.
drop policy if exists "team delete plan_documents" on public.plan_documents;
create policy "team delete plan_documents"
  on public.plan_documents for delete
  using (public.is_team());

-- Team can update category/description/visibility.
drop policy if exists "team update plan_documents" on public.plan_documents;
create policy "team update plan_documents"
  on public.plan_documents for update
  using (public.is_team());

-- ═══════════════════════════════════════════════════════════
-- STORAGE BUCKET SETUP (run this in Supabase Storage UI)
-- ═══════════════════════════════════════════════════════════
-- 1. Navigate to: Supabase Dashboard → Storage → Create bucket
-- 2. Name: plan-documents
-- 3. Public: NO (private bucket)
-- 4. File size limit: 50MB (or whatever your plan supports)
--
-- Then add these RLS policies on storage.objects (SQL Editor):

-- Allow authenticated users to upload to their plan's folder
drop policy if exists "plan_documents_upload" on storage.objects;
create policy "plan_documents_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'plan-documents'
    AND auth.role() = 'authenticated'
  );

-- Team can read all plan documents; clients read only their own plan's
drop policy if exists "plan_documents_read" on storage.objects;
create policy "plan_documents_read"
  on storage.objects for select
  using (
    bucket_id = 'plan-documents'
    AND (
      public.is_team()
      OR exists (
        select 1 from public.plan_documents pd
        join public.plans p on p.id = pd.plan_id
        where pd.file_path = storage.objects.name
          AND p.client_email = auth.jwt() ->> 'email'
          AND pd.is_client_visible = true
      )
    )
  );

-- Team can delete; clients cannot
drop policy if exists "plan_documents_delete" on storage.objects;
create policy "plan_documents_delete"
  on storage.objects for delete
  using (
    bucket_id = 'plan-documents'
    AND public.is_team()
  );
