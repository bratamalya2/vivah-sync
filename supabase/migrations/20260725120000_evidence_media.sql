-- ============================================================================
-- 20260725120000_evidence_media.sql   (migration 0012)
-- VivahSync — ephemeral operational evidence capture (BR-581 / FR-581).
--
-- Photo/video proof of completed setups, attached to an operational entity
-- (a ceremony now; vendor requirements / milestones later). The bytes live in
-- the private Supabase Storage bucket 'evidence'; this table is the record
-- (uploader, entity, storage path, timestamp). Retention: 180 days, swept by
-- the worker, UNLESS legal_hold is set (don't destroy evidence for an open
-- dispute — the whole reason BR-581 exists).
--
-- Evidence is OPERATIONAL: planners/production/vendors (FULL + ASSIGNED_ONLY)
-- read and upload; the family portal (READ_ONLY) is blind to it. Access is
-- server-mediated via signed URLs after an RLS check — the bucket is private
-- and there are no Storage-level RLS policies.
-- ============================================================================

create table if not exists public.evidence_media (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  entity_type      text not null,       -- 'event' (later: 'vendor_requirement', 'milestone')
  entity_id        uuid not null,
  uploader_user_id uuid references public.app_users(id) default auth.uid(),
  storage_path     text not null,
  content_type     text,
  file_name        text,
  byte_size        bigint,
  legal_hold       boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists idx_evidence_entity on public.evidence_media(entity_type, entity_id);
create index if not exists idx_evidence_sweep on public.evidence_media(created_at) where legal_hold = false;

alter table public.evidence_media enable row level security;

drop policy if exists evidence_select on public.evidence_media;
create policy evidence_select on public.evidence_media for select to authenticated
  using (project_id in (select app.operational_project_ids()));

drop policy if exists evidence_insert on public.evidence_media;
create policy evidence_insert on public.evidence_media for insert to authenticated
  with check (project_id in (select app.operational_project_ids()));

drop policy if exists evidence_update on public.evidence_media;
create policy evidence_update on public.evidence_media for update to authenticated
  using (project_id in (select app.full_scope_project_ids()))
  with check (project_id in (select app.full_scope_project_ids()));

drop policy if exists evidence_delete on public.evidence_media;
create policy evidence_delete on public.evidence_media for delete to authenticated
  using (project_id in (select app.full_scope_project_ids()));

grant select, insert, update, delete on public.evidence_media to authenticated;
