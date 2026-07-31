-- ============================================================================
-- 20260727180000_vendor_portal.sql   (migration 0014)
-- VivahSync — vendor self-service portal.
--
-- Until now a vendor was a stub record on the planner's roster (vendor_profiles)
-- with no login. This activates the long-reserved scaffolding so a vendor can
-- sign in and see ONLY the bookings assigned to them — never other vendors,
-- pricing, the audit trail, or anything else on the wedding.
--
-- Model (mirrors the family portal, migration 0010):
--   * The planner invites a roster vendor by email  -> vendor_invitations.
--   * On the invitee's first login they claim it: a VENDOR-type organization is
--     provisioned and bound to the vendor_profile via the (until-now unused)
--     vendor_profiles.org_id column, plus a membership.  claim is idempotent.
--   * The vendor's identity therefore flows auth.uid() -> memberships -> the
--     vendor org -> vendor_profiles.org_id -> their vendor_id(s).
--
-- Reads go through ONE SECURITY DEFINER function (app.vendor_bookings) keyed on
-- auth.uid(); writes (accept/reject own SENT booking, acknowledge own change)
-- go through SECURITY DEFINER RPCs that check ownership and stamp source
-- VENDOR_SELF. NO existing policy is modified and the vendor is never granted a
-- project_access row — so the whole-project ASSIGNED_ONLY read path is bypassed
-- and a vendor is confined to their own rows. The booking state-machine trigger
-- (0004) still enforces every legal transition regardless of who calls.
-- ============================================================================

-- --- invitations (planner-side, mirrors family_invitations) -----------------
create table if not exists public.vendor_invitations (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendor_profiles(id) on delete cascade,
  email       text not null,
  created_by  uuid references public.app_users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  unique (vendor_id, email)
);
create index if not exists idx_vendor_inv_email on public.vendor_invitations(lower(email));

alter table public.vendor_invitations enable row level security;
-- the planner who owns the roster vendor can see (and thus manage) its invites
drop policy if exists vendor_inv_select on public.vendor_invitations;
create policy vendor_inv_select on public.vendor_invitations for select to authenticated
  using (vendor_id in (select id from public.vendor_profiles
                        where created_by_org_id in (select app.member_org_ids())));
grant select on public.vendor_invitations to authenticated;

-- --- planner invites a roster vendor by email -------------------------------
create or replace function app.invite_vendor(p_vendor uuid, p_email text)
  returns void language plpgsql security definer set search_path = public as
$$
begin
  if p_vendor not in (select id from public.vendor_profiles
                       where created_by_org_id in (select app.member_org_ids())) then
    raise exception 'Not authorized to invite this vendor.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_email, ''))) = 0 then
    raise exception 'An email address is required.' using errcode = '23514';
  end if;
  insert into public.vendor_invitations (vendor_id, email)
  values (p_vendor, lower(trim(p_email)))
  on conflict (vendor_id, email) do nothing;
end $$;

-- --- vendor claims any invitations matching their email ---------------------
create or replace function app.claim_vendor_invitations() returns int
  language plpgsql security definer set search_path = public as
$$
declare v_email text; v_org uuid; v_name text; n int := 0; inv record;
begin
  if auth.uid() is null then return 0; end if;
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;

  if not exists (select 1 from public.vendor_invitations
                  where lower(email) = lower(v_email) and claimed_at is null) then
    return 0;
  end if;

  -- ensure a profile row exists for the caller
  insert into public.app_users (id, email) values (auth.uid(), v_email)
  on conflict (id) do nothing;

  -- ensure exactly one VENDOR org for this user
  select o.id into v_org from public.organizations o
    join public.memberships m on m.org_id = o.id
   where m.user_id = auth.uid() and o.type = 'VENDOR' limit 1;
  if v_org is null then
    select vp.name into v_name from public.vendor_invitations vi
      join public.vendor_profiles vp on vp.id = vi.vendor_id
     where lower(vi.email) = lower(v_email) limit 1;
    insert into public.organizations (type, name)
      values ('VENDOR', coalesce(v_name, v_email)) returning id into v_org;
    insert into public.memberships (user_id, org_id, role) values (auth.uid(), v_org, 'VENDOR');
  end if;

  for inv in select * from public.vendor_invitations
              where lower(email) = lower(v_email) and claimed_at is null loop
    -- bind the roster profile to this vendor org (the reserved org_id column)
    update public.vendor_profiles set org_id = v_org where id = inv.vendor_id;
    update public.vendor_invitations set claimed_at = now() where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- --- vendor identity helper -------------------------------------------------
create or replace function app.my_vendor_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select vp.id from public.vendor_profiles vp
    where vp.org_id is not null
      and vp.org_id in (select org_id from public.memberships where user_id = auth.uid()) $$;

-- --- the vendor's own bookings, denormalised (the ONLY read path) -----------
create or replace function app.vendor_bookings()
returns table (
  booking_id       uuid,
  status           text,
  rejection_reason text,
  vendor_name      text,
  category         text,
  scope_notes      text,
  arrival          text,
  completion       text,
  event_id         uuid,
  event_name       text,
  event_date       text,
  starts           text,
  ends             text,
  project_id       uuid,
  project_name     text,
  city             text,
  start_date       text,
  end_date         text,
  spaces           text,
  pending_ack_id   uuid,
  proposed_start   text,
  proposed_end     text
)
language sql stable security definer set search_path = public as
$$
  select
    br.id,
    br.status::text,
    br.rejection_reason,
    vp.name,
    vr.category::text,
    vr.scope_notes,
    to_char(vr.arrival_at    at time zone 'Asia/Kolkata', 'HH24:MI'),
    to_char(vr.completion_at at time zone 'Asia/Kolkata', 'HH24:MI'),
    e.id,
    e.name,
    to_char(e.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon'),
    to_char(e.starts_at at time zone 'Asia/Kolkata', 'HH24:MI'),
    to_char(e.ends_at   at time zone 'Asia/Kolkata', 'HH24:MI'),
    p.id,
    p.name,
    p.city,
    to_char(p.start_date, 'DD Mon YYYY'),
    to_char(p.end_date,   'DD Mon YYYY'),
    coalesce((
      select string_agg(v.name || ' · ' || vs.name, ', ' order by vs.name)
        from public.space_bookings sb
        join public.venue_spaces vs on vs.id = sb.space_id
        join public.venues v on v.id = vs.venue_id
       where sb.event_id = e.id
    ), ''),
    chg.ack_id,
    to_char(chg.proposed_starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon HH24:MI'),
    to_char(chg.proposed_ends_at   at time zone 'Asia/Kolkata', 'HH24:MI')
  from public.booking_requests br
  join public.vendor_requirements vr on vr.id = br.requirement_id
  join public.events e on e.id = vr.event_id
  join public.projects p on p.id = e.project_id
  join public.vendor_profiles vp on vp.id = br.vendor_id
  left join lateral (
    select ca.id as ack_id, scp.proposed_starts_at, scp.proposed_ends_at
      from public.change_acknowledgements ca
      join public.schedule_change_proposals scp on scp.id = ca.proposal_id
     where ca.booking_id = br.id and ca.acknowledged = false and scp.status = 'PROPOSED'
     order by scp.created_at desc limit 1
  ) chg on true
  where br.vendor_id in (select app.my_vendor_ids())
    and br.status <> 'DRAFT'
  order by e.starts_at
$$;

-- --- vendor accepts / declines its own SENT booking (source VENDOR_SELF) -----
create or replace function app.vendor_respond_booking(p_booking uuid, p_accept boolean, p_reason text default null)
  returns void language plpgsql security definer set search_path = public as
$$
declare v_status booking_status;
begin
  select status into v_status from public.booking_requests
   where id = p_booking and vendor_id in (select app.my_vendor_ids());
  if not found then
    raise exception 'Not authorized to respond to this booking.' using errcode = '42501';
  end if;
  if v_status <> 'SENT' then
    raise exception 'Only a pending (Sent) booking can be accepted or declined.' using errcode = '23514';
  end if;

  if p_accept then
    update public.booking_requests
       set status = 'ACCEPTED', acceptance_source = 'VENDOR_SELF'
     where id = p_booking;
  else
    if length(trim(coalesce(p_reason, ''))) = 0 then
      raise exception 'A reason is required to decline a booking.' using errcode = '23514';
    end if;
    update public.booking_requests
       set status = 'REJECTED', rejection_reason = trim(p_reason)
     where id = p_booking;
  end if;
end $$;

-- --- vendor acknowledges a schedule change on its own booking ---------------
create or replace function app.vendor_acknowledge(p_ack uuid)
  returns void language plpgsql security definer set search_path = public as
$$
begin
  if not exists (
    select 1 from public.change_acknowledgements ca
      join public.booking_requests br on br.id = ca.booking_id
     where ca.id = p_ack and br.vendor_id in (select app.my_vendor_ids())
  ) then
    raise exception 'Not authorized to acknowledge this change.' using errcode = '42501';
  end if;
  update public.change_acknowledgements
     set acknowledged = true, acknowledged_at = now(), acknowledgement_source = 'VENDOR_SELF'
   where id = p_ack;
end $$;

-- new app.* functions must be granted to the authenticated role
grant execute on all functions in schema app to authenticated;
