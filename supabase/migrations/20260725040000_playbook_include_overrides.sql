-- ============================================================================
-- 20260725040000_playbook_include_overrides.sql   (migration 0009)
-- Include venue rule exceptions (FR-061) in the playbook snapshot, so an
-- approved exception (e.g. "access extended to 02:00") appears in the run-sheet
-- and the rendered PDF — where event-day staff actually need it.
-- Only the per-event 'overrides' array is added; everything else is unchanged.
-- ============================================================================

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
                'overrides', coalesce((
                  select jsonb_agg(
                    jsonb_build_object('rule_key', o.rule_key::text, 'value', o.override_value, 'rationale', o.rationale)
                    order by o.created_at)
                    from public.venue_rule_overrides o where o.event_id = e.id), '[]'::jsonb),
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
