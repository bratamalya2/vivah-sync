-- ============================================================================
-- 20260724090000_tenancy_core.sql   (migration 0001)
-- VivahSync — tenancy, access model, Row Level Security.
--
-- Canonical DDL. Supabase SQL migrations are the source of truth; Prisma (if
-- used) only introspects. Prisma must NEVER own these objects — it cannot
-- express the RLS policies, SECURITY DEFINER helpers, or the generated columns
-- and EXCLUDE constraints that arrive in later migrations.
--
-- Access model recap:
--   organizations(type)   PLANNER | PRODUCTION | VENDOR | VENUE_CHAIN | FAMILY
--   memberships           which users belong to which orgs
--   projects(owner_org_id)
--   project_grants        cross-org access to a project (OWNER, COLLABORATOR, …)
--   project_access        FLATTENED membership ⋈ grant — maintained ONLY by
--                         triggers, read by every policy, never written by app.
--
-- Every cross-table lookup inside a policy goes through a STABLE SECURITY
-- DEFINER helper in schema `app` (runs as owner, bypasses RLS) to avoid the
-- policy-recursion trap. The app connects as a bypassrls role and MUST
-- SET LOCAL ROLE authenticated per request (see packages/db withUser()).
-- ============================================================================

-- --- extensions -------------------------------------------------------------
create extension if not exists btree_gist;
create extension if not exists pg_trgm;

-- --- helper schema ----------------------------------------------------------
create schema if not exists app;
grant usage on schema app to authenticated, anon;
grant usage on schema public to authenticated, anon;

-- --- enums ------------------------------------------------------------------
do $$ begin create type org_type as enum
  ('PLANNER','PRODUCTION','VENDOR','VENUE_CHAIN','FAMILY');
exception when duplicate_object then null; end $$;

do $$ begin create type grant_role as enum
  ('OWNER','COLLABORATOR','VENDOR','FAMILY_VIEW');
exception when duplicate_object then null; end $$;

do $$ begin create type access_scope as enum
  ('FULL','ASSIGNED_ONLY','READ_ONLY');
exception when duplicate_object then null; end $$;

do $$ begin create type project_status as enum
  ('DRAFT','ACTIVE','COMPLETED','CANCELLED');
exception when duplicate_object then null; end $$;

-- --- tables -----------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  type        org_type not null,
  name        text not null check (length(trim(name)) > 0),
  gstin       text,
  state_code  text,
  created_at  timestamptz not null default now()
);

-- Profile mirror of auth.users (Supabase Auth owns identity + credentials).
create table if not exists public.app_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id     uuid not null references public.app_users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  role        text not null default 'MEMBER',
  created_at  timestamptz not null default now(),
  primary key (user_id, org_id)
);

create table if not exists public.projects (
  id                   uuid primary key default gen_random_uuid(),
  owner_org_id         uuid not null references public.organizations(id),
  name                 text not null check (length(trim(name)) > 0),
  city                 text not null check (length(trim(city)) > 0),
  start_date           date not null,
  end_date             date not null,
  expected_guest_count integer check (expected_guest_count is null or expected_guest_count >= 0),
  currency             text not null default 'INR',
  status               project_status not null default 'DRAFT',
  created_by           uuid references public.app_users(id) default auth.uid(),
  created_at           timestamptz not null default now(),
  constraint project_dates_ordered check (end_date >= start_date)
);

create table if not exists public.project_grants (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  role        grant_role not null,
  scope       access_scope not null,
  created_at  timestamptz not null default now(),
  unique (project_id, org_id)
);

-- Flattened. Maintained ONLY by the triggers below. App code never writes it.
create table if not exists public.project_access (
  user_id     uuid not null references public.app_users(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  scope       access_scope not null,
  primary key (user_id, project_id)
);

create index if not exists idx_project_access_user    on public.project_access(user_id);
create index if not exists idx_project_access_project on public.project_access(project_id);
create index if not exists idx_memberships_org        on public.memberships(org_id);
create index if not exists idx_grants_org             on public.project_grants(org_id);
create index if not exists idx_projects_owner_org     on public.projects(owner_org_id);

-- ============================================================================
-- SECURITY DEFINER helpers (schema app). STABLE so they evaluate once per
-- statement. They run as the owner and therefore bypass RLS — which is exactly
-- why policies can call them without recursing into the caller's policies.
-- ============================================================================
create or replace function app.scope_rank(s access_scope) returns int
  language sql immutable as
$$ select case s when 'FULL' then 3 when 'ASSIGNED_ONLY' then 2 when 'READ_ONLY' then 1 end $$;

create or replace function app.accessible_project_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select project_id from public.project_access where user_id = auth.uid() $$;

create or replace function app.full_scope_project_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select project_id from public.project_access where user_id = auth.uid() and scope = 'FULL' $$;

create or replace function app.member_org_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select org_id from public.memberships where user_id = auth.uid() $$;

create or replace function app.visible_org_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$
  select org_id from public.memberships where user_id = auth.uid()
  union
  select g.org_id from public.project_grants g
   where g.project_id in (select project_id from public.project_access where user_id = auth.uid())
$$;

create or replace function app.colleague_user_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$
  select user_id from public.memberships
   where org_id in (select org_id from public.memberships where user_id = auth.uid())
$$;

-- ============================================================================
-- project_access maintenance
-- ============================================================================
create or replace function app.rebuild_access_for_project(p uuid) returns void
  language sql security definer set search_path = public as
$$
  delete from public.project_access where project_id = p;
  insert into public.project_access (user_id, project_id, scope)
  select m.user_id, g.project_id,
         (array_agg(g.scope order by app.scope_rank(g.scope) desc))[1]
    from public.project_grants g
    join public.memberships m on m.org_id = g.org_id
   where g.project_id = p
   group by m.user_id, g.project_id;
$$;

create or replace function app.rebuild_access_for_user(u uuid) returns void
  language sql security definer set search_path = public as
$$
  delete from public.project_access where user_id = u;
  insert into public.project_access (user_id, project_id, scope)
  select m.user_id, g.project_id,
         (array_agg(g.scope order by app.scope_rank(g.scope) desc))[1]
    from public.project_grants g
    join public.memberships m on m.org_id = g.org_id
   where m.user_id = u
   group by m.user_id, g.project_id;
$$;

create or replace function app.tg_grants_sync() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if tg_op = 'DELETE' then
    perform app.rebuild_access_for_project(old.project_id);
    return old;
  end if;
  perform app.rebuild_access_for_project(new.project_id);
  if tg_op = 'UPDATE' and new.project_id <> old.project_id then
    perform app.rebuild_access_for_project(old.project_id);
  end if;
  return new;
end $$;

create or replace function app.tg_memberships_sync() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if tg_op = 'DELETE' then
    perform app.rebuild_access_for_user(old.user_id);
    return old;
  end if;
  perform app.rebuild_access_for_user(new.user_id);
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    perform app.rebuild_access_for_user(old.user_id);
  end if;
  return new;
end $$;

-- When a project is created, the owning org automatically gets an OWNER/FULL grant.
create or replace function app.tg_project_owner_grant() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  insert into public.project_grants (project_id, org_id, role, scope)
  values (new.id, new.owner_org_id, 'OWNER', 'FULL')
  on conflict (project_id, org_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_grants_sync on public.project_grants;
create trigger trg_grants_sync after insert or update or delete on public.project_grants
  for each row execute function app.tg_grants_sync();

drop trigger if exists trg_memberships_sync on public.memberships;
create trigger trg_memberships_sync after insert or update or delete on public.memberships
  for each row execute function app.tg_memberships_sync();

drop trigger if exists trg_project_owner_grant on public.projects;
create trigger trg_project_owner_grant after insert on public.projects
  for each row execute function app.tg_project_owner_grant();

-- ============================================================================
-- Onboarding seam — the sanctioned privileged path to bootstrap a new tenant.
-- A brand-new authenticated user cannot self-INSERT under fail-closed RLS, so
-- signup calls this SECURITY DEFINER RPC once, right after Supabase sign-up.
-- ============================================================================
create or replace function app.ensure_profile(p_full_name text default null, p_email text default null)
  returns void language plpgsql security definer set search_path = public as
$$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.app_users (id, full_name, email)
  values (auth.uid(), p_full_name, p_email)
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.app_users.full_name),
    email     = coalesce(excluded.email,     public.app_users.email);
end $$;

create or replace function app.onboard_planner(
  p_org_name text, p_full_name text default null, p_email text default null)
  returns uuid language plpgsql security definer set search_path = public as
$$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if length(trim(coalesce(p_org_name,''))) = 0 then raise exception 'org name required'; end if;
  perform app.ensure_profile(p_full_name, p_email);
  insert into public.organizations (type, name) values ('PLANNER', p_org_name) returning id into v_org;
  insert into public.memberships (user_id, org_id, role) values (auth.uid(), v_org, 'OWNER');
  return v_org;
end $$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.organizations  enable row level security;
alter table public.app_users      enable row level security;
alter table public.memberships    enable row level security;
alter table public.projects       enable row level security;
alter table public.project_grants enable row level security;
alter table public.project_access enable row level security;

-- organizations ------------------------------------------------------------
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select to authenticated
  using (id in (select app.visible_org_ids()));
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update to authenticated
  using (id in (select app.member_org_ids()))
  with check (id in (select app.member_org_ids()));

-- app_users -----------------------------------------------------------------
drop policy if exists users_select on public.app_users;
create policy users_select on public.app_users for select to authenticated
  using (id = auth.uid() or id in (select app.colleague_user_ids()));
drop policy if exists users_update on public.app_users;
create policy users_update on public.app_users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships (reads only via RLS; writes go through onboarding/invite RPCs) --
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or org_id in (select app.member_org_ids()));

-- projects ------------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (id in (select app.accessible_project_ids()));
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_org_id in (select app.member_org_ids()));
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using (id in (select app.full_scope_project_ids()))
  with check (id in (select app.full_scope_project_ids()));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated
  using (id in (select app.full_scope_project_ids()));

-- project_grants (FULL-scope users manage cross-org collaborators) -----------
drop policy if exists grants_select on public.project_grants;
create policy grants_select on public.project_grants for select to authenticated
  using (project_id in (select app.accessible_project_ids()));
drop policy if exists grants_insert on public.project_grants;
create policy grants_insert on public.project_grants for insert to authenticated
  with check (project_id in (select app.full_scope_project_ids()));
drop policy if exists grants_update on public.project_grants;
create policy grants_update on public.project_grants for update to authenticated
  using (project_id in (select app.full_scope_project_ids()))
  with check (project_id in (select app.full_scope_project_ids()));
drop policy if exists grants_delete on public.project_grants;
create policy grants_delete on public.project_grants for delete to authenticated
  using (project_id in (select app.full_scope_project_ids()));

-- project_access (read your own rows only; no writes) ------------------------
drop policy if exists access_select on public.project_access;
create policy access_select on public.project_access for select to authenticated
  using (user_id = auth.uid());

-- --- grants (RLS still restricts row visibility) ----------------------------
grant select                         on public.project_access to authenticated;
grant select, update                 on public.organizations  to authenticated;
grant select, update                 on public.app_users      to authenticated;
grant select                         on public.memberships    to authenticated;
grant select, insert, update, delete on public.projects       to authenticated;
grant select, insert, update, delete on public.project_grants to authenticated;

grant execute on all functions in schema app to authenticated;
