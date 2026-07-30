-- ============================================================================
-- 20260724210000_playbook_synthesis.sql   (migration 0006)
-- VivahSync — unified operational playbook generation and versioning (FR-541.1).
--
-- app.generate_playbook(project) compiles the whole wedding — day-by-day
-- timeline, space allocations, and each ceremony's committed vendors (with
-- arrival/completion times and contacts) — into ONE denormalised snapshot,
-- stamps it with the next per-project version number and a timestamp, and
-- appends it to playbooks. The snapshot is FROZEN JSON: a later edit to an
-- event or booking can never rewrite what a version recorded (Project-Overview
-- §5, choice 1). If any schedule-change proposal is still pending, the playbook
-- is marked is_draft (FR-541.1 exception path).
--
-- playbooks are append-only: authenticated may SELECT but is granted no
-- UPDATE/DELETE, so a generated version is immutable to the application.
-- ============================================================================

create table if not exists public.playbooks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  version       int not null,
  is_draft      boolean not null default false,
  snapshot      jsonb not null,
  generated_by  uuid references public.app_users(id) default auth.uid(),
  generated_at  timestamptz not null default now(),
  unique (project_id, version)
);
create index if not exists idx_playbooks_project on public.playbooks(project_id);

create or replace function app.generate_playbook(p uuid) returns jsonb
  language plpgsql security definer set search_path = public as
$$
declare v_next int; v_pending int; v_draft boolean; v_snapshot jsonb; v_id uuid;
begin
  if not exists (
    select 1 from public.projects pr
     where pr.id = p
       and pr.id in (select project_id from public.project_access
                      where user_id = auth.uid() and scope = 'FULL')
  ) then
    raise exception 'Not authorized to generate a playbook for this project.' using errcode = '42501';
  end if;

  select count(*) into v_pending
    from public.schedule_change_proposals scp
    join public.events e on e.id = scp.event_id
   where e.project_id = p and scp.status = 'PROPOSED';
  v_draft := v_pending > 0;

  select coalesce(max(version), 0) + 1 into v_next from public.playbooks where project_id = p;

  select jsonb_build_object(
    'project', (select jsonb_build_object(
        'name', pr.name, 'city', pr.city,
        'start_date', to_char(pr.start_date, 'YYYY-MM-DD'),
        'end_date', to_char(pr.end_date, 'YYYY-MM-DD'),
        'expected_guest_count', pr.expected_guest_count,
        'status', pr.status::text)
      from public.projects pr where pr.id = p),
    'generated_at', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'),
    'is_draft', v_draft,
    'pending_changes', v_pending,
    'days', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', to_char(d.day_date, 'YYYY-MM-DD'),
          'day_index', d.day_index,
          'events', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'name', e.name,
                'starts_at', to_char(e.starts_at at time zone 'Asia/Kolkata', 'HH24:MI'),
                'ends_at', to_char(e.ends_at at time zone 'Asia/Kolkata', 'HH24:MI'),
                'setup_minutes', e.setup_minutes,
                'teardown_minutes', e.teardown_minutes,
                'expected_guest_count', e.expected_guest_count,
                'spaces', coalesce((
                  select jsonb_agg(distinct jsonb_build_object('venue', v.name, 'space', vs.name))
                    from public.space_bookings sb
                    join public.venue_spaces vs on vs.id = sb.space_id
                    join public.venues v on v.id = vs.venue_id
                   where sb.event_id = e.id), '[]'::jsonb),
                'vendors', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'category', r.category::text,
                      'scope', r.scope_notes,
                      'arrival', to_char(r.arrival_at at time zone 'Asia/Kolkata', 'HH24:MI'),
                      'completion', to_char(r.completion_at at time zone 'Asia/Kolkata', 'HH24:MI'),
                      'fulfillment', r.fulfillment_status::text,
                      'vendor', (
                        select jsonb_build_object('name', vp.name, 'phone', vp.contact_phone, 'status', b.status::text)
                          from public.booking_requests b
                          join public.vendor_profiles vp on vp.id = b.vendor_id
                         where b.requirement_id = r.id and b.status in ('ACCEPTED','CONFIRMED')
                         order by b.accepted_at desc nulls last
                         limit 1)
                    ) order by r.arrival_at)
                    from public.vendor_requirements r where r.event_id = e.id), '[]'::jsonb)
              ) order by e.starts_at)
              from public.events e
             where e.project_id = p
               and (e.starts_at at time zone 'Asia/Kolkata')::date = d.day_date
          ), '[]'::jsonb))
        order by d.day_index)
      from public.project_days d where d.project_id = p
    ), '[]'::jsonb)
  ) into v_snapshot;

  insert into public.playbooks (project_id, version, is_draft, snapshot)
  values (p, v_next, v_draft, v_snapshot)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'version', v_next, 'is_draft', v_draft);
end $$;

-- ============================================================================
-- RLS — read-only for the app; generation is via the SECURITY DEFINER function,
-- and the absence of UPDATE/DELETE grants makes versions immutable.
-- ============================================================================
alter table public.playbooks enable row level security;

drop policy if exists playbooks_select on public.playbooks;
create policy playbooks_select on public.playbooks for select to authenticated
  using (project_id in (select app.accessible_project_ids()));

grant select on public.playbooks to authenticated;   -- deliberately no insert/update/delete
grant execute on all functions in schema app to authenticated;
