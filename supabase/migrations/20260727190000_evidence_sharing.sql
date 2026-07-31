-- ============================================================================
-- 20260727190000_evidence_sharing.sql   (migration 0015)
-- VivahSync — evidence on the vendor + family sides.
--
-- Two additions, both built on migration 0014's vendor identity and the existing
-- private-bucket / signed-URL evidence plumbing (0012):
--
--   1. A vendor may attach photo/video PROOF to a ceremony it is booked on, and
--      see the proof it uploaded — scoped to its own booking-events, via
--      SECURITY DEFINER RPCs (no project_access, mirroring the vendor portal).
--   2. The family (READ_ONLY) may now VIEW that proof on their portal. The
--      redacted family_runsheet gains a per-ceremony `media` list, and a shared,
--      role-agnostic path resolver lets family (and vendors) mint signed URLs.
--
-- No sensitive table's SELECT policy is relaxed — family/vendor byte access is
-- mediated entirely by SECURITY DEFINER functions keyed on auth.uid().
-- ============================================================================

-- --- vendor identity: the events a vendor is booked on ----------------------
create or replace function app.my_booking_event_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select distinct vr.event_id
     from public.booking_requests br
     join public.vendor_requirements vr on vr.id = br.requirement_id
    where br.vendor_id in (select app.my_vendor_ids()) $$;

-- --- pre-upload access check: the project of an event the vendor is on -------
create or replace function app.vendor_event_project(p_event uuid) returns uuid
  language sql stable security definer set search_path = public as
$$ select e.project_id from public.events e
    where e.id = p_event and e.id in (select app.my_booking_event_ids()) $$;

-- --- vendor records evidence on one of its own booking-events ----------------
create or replace function app.vendor_record_evidence(
  p_id uuid, p_event uuid, p_storage_path text,
  p_content_type text, p_file_name text, p_byte_size bigint
) returns void language plpgsql security definer set search_path = public as
$$
declare v_project uuid;
begin
  select app.vendor_event_project(p_event) into v_project;
  if v_project is null then
    raise exception 'Not authorized to add evidence to this ceremony.' using errcode = '42501';
  end if;
  insert into public.evidence_media
    (id, project_id, entity_type, entity_id, uploader_user_id,
     storage_path, content_type, file_name, byte_size)
  values (p_id, v_project, 'event', p_event, auth.uid(),
     p_storage_path, p_content_type, p_file_name, p_byte_size);
end $$;

-- --- the evidence a vendor itself uploaded, by ceremony ----------------------
create or replace function app.vendor_evidence()
returns table (event_id uuid, id uuid, file_name text, content_type text, created_at text)
language sql stable security definer set search_path = public as
$$
  select em.entity_id, em.id, em.file_name, em.content_type,
         to_char(em.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')
    from public.evidence_media em
   where em.entity_type = 'event'
     and em.uploader_user_id = auth.uid()
     and em.entity_id in (select app.my_booking_event_ids())
   order by em.created_at desc
$$;

-- --- role-agnostic storage-path resolver ------------------------------------
-- Returns a media's storage path IF the caller may see it by ANY route:
--   * project_access on its project (planner FULL, production, family READ_ONLY)
--   * a vendor booked on its ceremony
-- Used by the shared /media/[id] route to mint a short-lived signed URL.
create or replace function app.my_evidence_path(p_media uuid) returns text
  language sql stable security definer set search_path = public as
$$
  select em.storage_path from public.evidence_media em
   where em.id = p_media
     and (
       em.project_id in (select project_id from public.project_access where user_id = auth.uid())
       or (em.entity_type = 'event' and em.entity_id in (select app.my_booking_event_ids()))
     )
$$;

-- --- extend the redacted family run-sheet with per-ceremony media ------------
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
                   where r.event_id = e.id), '[]'::jsonb),
                'media', coalesce((
                  select jsonb_agg(jsonb_build_object(
                      'id', em.id, 'file_name', em.file_name, 'content_type', em.content_type)
                    order by em.created_at)
                    from public.evidence_media em
                   where em.entity_type = 'event' and em.entity_id = e.id), '[]'::jsonb)
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
