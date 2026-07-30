-- ============================================================================
-- 20260724093000_projects_select_owner_path.sql   (migration 0002)
--
-- Fix: INSERT ... RETURNING on projects re-checks the new row against the
-- SELECT policy, but the owner's project_access row is only created by the
-- AFTER-INSERT flattening trigger — so at RETURNING time id ∈ accessible ids
-- is briefly false and the insert errors with a bogus RLS violation.
--
-- The real fix is a more correct SELECT policy: a project is visible if you can
-- access it via a grant (project_access) OR you are a member of its owning org
-- directly. The owning-org path is a first-class truth that does not depend on
-- the flattening trigger having run, and it matches the intent ("your agency
-- owns it → you see it").
-- ============================================================================

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (
    owner_org_id in (select app.member_org_ids())
    or id in (select app.accessible_project_ids())
  );
