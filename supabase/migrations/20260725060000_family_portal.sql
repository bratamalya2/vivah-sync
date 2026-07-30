-- ============================================================================
-- 20260725060000_family_portal.sql   (migration 0010)
-- VivahSync — family read-only portal (BR-561 / FR-561.1).
--
-- The access model already has three scopes; only FULL/ASSIGNED_ONLY were used.
-- This activates READ_ONLY (family) and — crucially — makes it BLIND at the
-- database to every operational/commercial/audit table. Family sees only:
--   * the project row (name, city, dates)
--   * the day structure and ceremonies (schedule)
--   * a curated, REDACTED run-sheet (spaces + committed vendor arrival times,
--     no phone numbers, no scope, no financial data) via a SECURITY DEFINER fn
--
-- "operational" scope = FULL + ASSIGNED_ONLY. Sensitive tables' SELECT policies
-- are re-scoped from accessible (any scope) to operational, so a family member
-- navigating straight to e.g. booking_requests gets ZERO rows (FR-561.1).
--
-- Provisioning avoids the Admin API: planner invites by email → family
-- self-signs-up → invitations are claimed on first login, creating a FAMILY org
-- + READ_ONLY grant through the existing project_access machinery.
-- ============================================================================

-- --- operational (non-family) scope helpers ---------------------------------
create or replace function app.operational_project_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select project_id from public.project_access
    where user_id = auth.uid() and scope in ('FULL','ASSIGNED_ONLY') $$;

create or replace function app.operational_event_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select id from public.events where project_id in (select app.operational_project_ids()) $$;

create or replace function app.operational_requirement_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select r.id from public.vendor_requirements r
     join public.events e on e.id = r.event_id
    where e.project_id in (select app.operational_project_ids()) $$;

create or replace function app.operational_proposal_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select p.id from public.schedule_change_proposals p
     join public.events e on e.id = p.event_id
    where e.project_id in (select app.operational_project_ids()) $$;

-- --- re-scope sensitive SELECTs to operational (family excluded) -------------
drop policy if exists bookings_select on public.space_bookings;
create policy bookings_select on public.space_bookings for select to authenticated
  using (event_id in (select app.operational_event_ids()));

drop policy if exists reqs_select on public.vendor_requirements;
create policy reqs_select on public.vendor_requirements for select to authenticated
  using (event_id in (select app.operational_event_ids()));

drop policy if exists bookings_req_select on public.booking_requests;
create policy bookings_req_select on public.booking_requests for select to authenticated
  using (requirement_id in (select app.operational_requirement_ids()));

drop policy if exists proposals_select on public.schedule_change_proposals;
create policy proposals_select on public.schedule_change_proposals for select to authenticated
  using (event_id in (select app.operational_event_ids()));

drop policy if exists acks_select on public.change_acknowledgements;
create policy acks_select on public.change_acknowledgements for select to authenticated
  using (proposal_id in (select app.operational_proposal_ids()));

drop policy if exists overrides_select on public.venue_rule_overrides;
create policy overrides_select on public.venue_rule_overrides for select to authenticated
  using (event_id in (select app.operational_event_ids()));

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated
  using (project_id in (select app.operational_project_ids()));

drop policy if exists playbooks_select on public.playbooks;
create policy playbooks_select on public.playbooks for select to authenticated
  using (project_id in (select app.operational_project_ids()));

drop policy if exists renders_select on public.playbook_renders;
create policy renders_select on public.playbook_renders for select to authenticated
  using (playbook_id in (
    select pb.id from public.playbooks pb
     where pb.project_id in (select app.operational_project_ids())
  ));

-- NOTE: projects / project_days / events keep their `accessible_*` SELECT
-- policies — family is meant to see the schedule. Everything else is now
-- operational-only.

-- --- family invitations -----------------------------------------------------
create table if not exists public.family_invitations (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  email        text not null,
  invitee_name text,
  created_by   uuid references public.app_users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  unique (project_id, email)
);
create index if not exists idx_family_inv_email on public.family_invitations(lower(email));

alter table public.family_invitations enable row level security;
drop policy if exists family_inv_select on public.family_invitations;
create policy family_inv_select on public.family_invitations for select to authenticated
  using (project_id in (select app.full_scope_project_ids()));
grant select on public.family_invitations to authenticated;

-- planner invites a family member (FULL scope required)
create or replace function app.invite_family(p_project uuid, p_email text, p_name text default null)
  returns void language plpgsql security definer set search_path = public as
$$
begin
  if p_project not in (select project_id from public.project_access
                        where user_id = auth.uid() and scope = 'FULL') then
    raise exception 'Not authorized to invite family to this project.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_email, ''))) = 0 then
    raise exception 'An email address is required.' using errcode = '23514';
  end if;
  insert into public.family_invitations (project_id, email, invitee_name)
  values (p_project, lower(trim(p_email)), nullif(trim(p_name), ''))
  on conflict (project_id, email) do update set invitee_name = excluded.invitee_name;
end $$;

-- family member claims any invitations matching their email (on first login)
create or replace function app.claim_family_invitations() returns int
  language plpgsql security definer set search_path = public as
$$
declare v_email text; v_org uuid; v_name text; n int := 0; inv record;
begin
  if auth.uid() is null then return 0; end if;
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;

  if not exists (select 1 from public.family_invitations
                  where lower(email) = lower(v_email) and claimed_at is null) then
    return 0;
  end if;

  -- ensure a profile row
  insert into public.app_users (id, email) values (auth.uid(), v_email)
  on conflict (id) do nothing;

  -- ensure one FAMILY org for this user
  select o.id into v_org from public.organizations o
    join public.memberships m on m.org_id = o.id
   where m.user_id = auth.uid() and o.type = 'FAMILY' limit 1;
  if v_org is null then
    select invitee_name into v_name from public.family_invitations
      where lower(email) = lower(v_email) and invitee_name is not null limit 1;
    insert into public.organizations (type, name)
      values ('FAMILY', coalesce(v_name, v_email) || ' (family)') returning id into v_org;
    insert into public.memberships (user_id, org_id, role) values (auth.uid(), v_org, 'FAMILY');
  end if;

  for inv in select * from public.family_invitations
              where lower(email) = lower(v_email) and claimed_at is null loop
    insert into public.project_grants (project_id, org_id, role, scope)
      values (inv.project_id, v_org, 'FAMILY_VIEW', 'READ_ONLY')
    on conflict (project_id, org_id) do nothing;
    update public.family_invitations set claimed_at = now() where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- the redacted run-sheet the family portal reads — the ONLY family data path
-- for schedule detail. No phone numbers, no scope, no financial data.
create or replace function app.family_runsheet(p uuid) returns jsonb
  language plpgsql security definer set search_path = public as
$$
declare v jsonb;
begin
  if p not in (select project_id from public.project_access where user_id = auth.uid()) then
    raise exception 'Not authorized to view this wedding.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'project', (select jsonb_build_object('name', pr.name, 'city', pr.city,
        'start_date', to_char(pr.start_date, 'YYYY-MM-DD'),
        'end_date', to_char(pr.end_date, 'YYYY-MM-DD'))
      from public.projects pr where pr.id = p),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
          'date', to_char(d.day_date, 'YYYY-MM-DD'),
          'day_index', d.day_index,
          'events', coalesce((
            select jsonb_agg(jsonb_build_object(
                'name', e.name,
                'starts_at', to_char(e.starts_at at time zone 'Asia/Kolkata', 'HH24:MI'),
                'ends_at', to_char(e.ends_at at time zone 'Asia/Kolkata', 'HH24:MI'),
                'spaces', coalesce((
                  select jsonb_agg(distinct jsonb_build_object('venue', ve.name, 'space', vs.name))
                    from public.space_bookings sb
                    join public.venue_spaces vs on vs.id = sb.space_id
                    join public.venues ve on ve.id = vs.venue_id
                   where sb.event_id = e.id), '[]'::jsonb),
                'vendors', coalesce((
                  select jsonb_agg(jsonb_build_object(
                      'category', r.category::text,
                      'name', vp.name,
                      'arrival', to_char(r.arrival_at at time zone 'Asia/Kolkata', 'HH24:MI'),
                      'completion', to_char(r.completion_at at time zone 'Asia/Kolkata', 'HH24:MI'))
                    order by r.arrival_at)
                    from public.vendor_requirements r
                    join public.booking_requests b on b.requirement_id = r.id
                       and b.status in ('ACCEPTED','CONFIRMED')
                    join public.vendor_profiles vp on vp.id = b.vendor_id
                   where r.event_id = e.id), '[]'::jsonb)
              ) order by e.starts_at)
              from public.events e
             where e.project_id = p
               and (e.starts_at at time zone 'Asia/Kolkata')::date = d.day_date
          ), '[]'::jsonb))
        order by d.day_index)
      from public.project_days d where d.project_id = p
    ), '[]'::jsonb)
  ) into v;
  return v;
end $$;

grant execute on all functions in schema app to authenticated;
