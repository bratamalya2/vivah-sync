-- ============================================================================
-- 20260724150000_vendor_lifecycle.sql   (migration 0004)
-- VivahSync — vendor requirements and the procurement booking lifecycle.
--
--   vendor_profiles      the agency's vendor roster; org_id nullable = an
--                        UNCLAIMED stub (planner records "Ramesh Dhol Party"
--                        without waiting for them to sign up). v1 = stubs only.
--   vendor_requirements  a need on a ceremony: category, scope, required
--                        arrival→completion (FR-121.1, arrival must precede
--                        completion). fulfillment_status is derived.
--   booking_requests     the procurement state machine (FR-181.1): rigidly
--                        sequential DRAFT→SENT→ACCEPTED→CONFIRMED with
--                        REJECTED/CANCELLED branches. On ACCEPTED the scope is
--                        snapshotted and locked (FR-201.1); REJECTED demands a
--                        reason and flips the requirement to UNFULFILLED
--                        (FR-221.1) so it can never sit dormant.
--
-- All rule violations raise SQLSTATE 23514 with a planner-readable message, so
-- translateDbError() surfaces them verbatim. Enforcement lives here; the tests
-- ATTEMPT each violation.
-- ============================================================================

do $$ begin create type vendor_category as enum
  ('PHOTOGRAPHY','VIDEOGRAPHY','CATERING','DECOR','MUSIC_DJ','MAKEUP','MEHNDI',
   'PRIEST_PANDIT','TRANSPORT','LIGHTING','SECURITY','OTHER');
exception when duplicate_object then null; end $$;

do $$ begin create type booking_status as enum
  ('DRAFT','SENT','ACCEPTED','REJECTED','CANCELLED','CONFIRMED');
exception when duplicate_object then null; end $$;

do $$ begin create type requirement_status as enum
  ('OPEN','FULFILLED','UNFULFILLED');
exception when duplicate_object then null; end $$;

do $$ begin create type acceptance_source as enum
  ('PLANNER_RECORDED','VENDOR_SELF');
exception when duplicate_object then null; end $$;

-- --- vendor roster (org-scoped; org_id null = unclaimed stub) ----------------
create table if not exists public.vendor_profiles (
  id                 uuid primary key default gen_random_uuid(),
  created_by_org_id  uuid not null references public.organizations(id) on delete cascade,
  org_id             uuid references public.organizations(id),  -- set when claimed (v1: always null)
  name               text not null check (length(trim(name)) > 0),
  category           vendor_category not null,
  contact_name       text,
  contact_phone      text,
  contact_email      text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_vendors_org on public.vendor_profiles(created_by_org_id);

-- --- requirement on a ceremony (FR-121.1) -----------------------------------
create table if not exists public.vendor_requirements (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events(id) on delete cascade,
  category           vendor_category not null,
  scope_notes        text not null check (length(trim(scope_notes)) > 0),
  arrival_at         timestamptz not null,
  completion_at      timestamptz not null,
  fulfillment_status requirement_status not null default 'OPEN',
  created_at         timestamptz not null default now(),
  constraint arrival_precedes_completion check (completion_at > arrival_at)
);
create index if not exists idx_reqs_event on public.vendor_requirements(event_id);

-- --- booking request / procurement lifecycle --------------------------------
create table if not exists public.booking_requests (
  id                uuid primary key default gen_random_uuid(),
  requirement_id    uuid not null references public.vendor_requirements(id) on delete cascade,
  vendor_id         uuid not null references public.vendor_profiles(id),
  status            booking_status not null default 'DRAFT',
  rejection_reason  text,
  locked_scope      jsonb,
  accepted_at       timestamptz,
  acceptance_source acceptance_source,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_bookings_req on public.booking_requests(requirement_id);
create index if not exists idx_bookings_vendor on public.booking_requests(vendor_id);

-- ============================================================================
-- lifecycle triggers
-- ============================================================================

-- rigidly-sequential status machine + acceptance lock + rejection rationale
create or replace function app.tg_booking_transition() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare valid boolean;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('DRAFT','SENT') then
      raise exception 'A booking request must start as Draft or Sent.' using errcode = '23514';
    end if;
    return new;
  end if;

  new.updated_at := now();
  if new.status = old.status then
    return new;  -- non-status edit; the lock trigger guards protected fields
  end if;

  valid := case
    when old.status = 'DRAFT'    and new.status in ('SENT','CANCELLED')             then true
    when old.status = 'SENT'     and new.status in ('ACCEPTED','REJECTED','CANCELLED') then true
    when old.status = 'ACCEPTED' and new.status in ('CONFIRMED','CANCELLED')        then true
    else false
  end;
  if not valid then
    raise exception 'Cannot move a booking from % to % (out of sequence).', old.status, new.status
      using errcode = '23514';
  end if;

  if new.status = 'REJECTED' and (new.rejection_reason is null or length(trim(new.rejection_reason)) = 0) then
    raise exception 'A rejection reason is required to reject a booking.' using errcode = '23514';
  end if;

  if new.status = 'ACCEPTED' then
    new.accepted_at := now();
    select jsonb_build_object(
             'category', r.category::text, 'scope_notes', r.scope_notes,
             'arrival_at', r.arrival_at, 'completion_at', r.completion_at)
      into new.locked_scope
      from public.vendor_requirements r where r.id = new.requirement_id;
    if new.acceptance_source is null then new.acceptance_source := 'PLANNER_RECORDED'; end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_booking_transition on public.booking_requests;
create trigger trg_booking_transition before insert or update on public.booking_requests
  for each row execute function app.tg_booking_transition();

-- once ACCEPTED, the snapshot and acceptance stamp are immutable (FR-201.1)
create or replace function app.tg_booking_lock() returns trigger
  language plpgsql as
$$
begin
  if old.locked_scope is not null and new.locked_scope is distinct from old.locked_scope then
    raise exception 'The locked scope of an accepted booking cannot be changed.' using errcode = '23514';
  end if;
  if old.accepted_at is not null and new.accepted_at is distinct from old.accepted_at then
    raise exception 'The acceptance timestamp is immutable.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_booking_lock on public.booking_requests;
create trigger trg_booking_lock before update on public.booking_requests
  for each row execute function app.tg_booking_lock();

-- derive the requirement's fulfillment from its bookings
create or replace function app.recompute_requirement(req uuid) returns void
  language sql security definer set search_path = public as
$$
  update public.vendor_requirements r set fulfillment_status = (
    case
      when exists (select 1 from public.booking_requests b
                    where b.requirement_id = req and b.status in ('ACCEPTED','CONFIRMED')) then 'FULFILLED'
      when exists (select 1 from public.booking_requests b
                    where b.requirement_id = req and b.status in ('DRAFT','SENT')) then 'OPEN'
      when exists (select 1 from public.booking_requests b
                    where b.requirement_id = req and b.status in ('REJECTED','CANCELLED')) then 'UNFULFILLED'
      else 'OPEN'
    end
  )::requirement_status
  where r.id = req;
$$;

create or replace function app.tg_requirement_recompute() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  perform app.recompute_requirement(coalesce(new.requirement_id, old.requirement_id));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_requirement_recompute on public.booking_requests;
create trigger trg_requirement_recompute after insert or update or delete on public.booking_requests
  for each row execute function app.tg_requirement_recompute();

-- a requirement locked by an accepted commitment cannot have its scope/time edited
create or replace function app.tg_requirement_lock() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if exists (select 1 from public.booking_requests b
              where b.requirement_id = old.id and b.status in ('ACCEPTED','CONFIRMED')) then
    if new.scope_notes  is distinct from old.scope_notes
       or new.arrival_at    is distinct from old.arrival_at
       or new.completion_at is distinct from old.completion_at
       or new.category      is distinct from old.category then
      raise exception 'This requirement is locked by an accepted vendor commitment; changes need a formal exception.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_requirement_lock on public.vendor_requirements;
create trigger trg_requirement_lock before update on public.vendor_requirements
  for each row execute function app.tg_requirement_lock();

-- ============================================================================
-- RLS helpers
-- ============================================================================
create or replace function app.accessible_requirement_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select r.id from public.vendor_requirements r
     join public.events e on e.id = r.event_id
    where e.project_id in (select app.accessible_project_ids()) $$;

create or replace function app.full_scope_requirement_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select r.id from public.vendor_requirements r
     join public.events e on e.id = r.event_id
    where e.project_id in (select app.full_scope_project_ids()) $$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.vendor_profiles     enable row level security;
alter table public.vendor_requirements enable row level security;
alter table public.booking_requests    enable row level security;

-- vendor roster (org-scoped) -------------------------------------------------
drop policy if exists vendors_select on public.vendor_profiles;
create policy vendors_select on public.vendor_profiles for select to authenticated
  using (created_by_org_id in (select app.member_org_ids()));
drop policy if exists vendors_insert on public.vendor_profiles;
create policy vendors_insert on public.vendor_profiles for insert to authenticated
  with check (created_by_org_id in (select app.member_org_ids()));
drop policy if exists vendors_update on public.vendor_profiles;
create policy vendors_update on public.vendor_profiles for update to authenticated
  using (created_by_org_id in (select app.member_org_ids()))
  with check (created_by_org_id in (select app.member_org_ids()));
drop policy if exists vendors_delete on public.vendor_profiles;
create policy vendors_delete on public.vendor_profiles for delete to authenticated
  using (created_by_org_id in (select app.member_org_ids()));

-- requirements (via event's project) -----------------------------------------
drop policy if exists reqs_select on public.vendor_requirements;
create policy reqs_select on public.vendor_requirements for select to authenticated
  using (event_id in (select app.accessible_event_ids()));
drop policy if exists reqs_insert on public.vendor_requirements;
create policy reqs_insert on public.vendor_requirements for insert to authenticated
  with check (event_id in (select app.full_scope_event_ids()));
drop policy if exists reqs_update on public.vendor_requirements;
create policy reqs_update on public.vendor_requirements for update to authenticated
  using (event_id in (select app.full_scope_event_ids()))
  with check (event_id in (select app.full_scope_event_ids()));
drop policy if exists reqs_delete on public.vendor_requirements;
create policy reqs_delete on public.vendor_requirements for delete to authenticated
  using (event_id in (select app.full_scope_event_ids()));

-- bookings (via requirement) -------------------------------------------------
drop policy if exists bookings_req_select on public.booking_requests;
create policy bookings_req_select on public.booking_requests for select to authenticated
  using (requirement_id in (select app.accessible_requirement_ids()));
drop policy if exists bookings_req_insert on public.booking_requests;
create policy bookings_req_insert on public.booking_requests for insert to authenticated
  with check (requirement_id in (select app.full_scope_requirement_ids()));
drop policy if exists bookings_req_update on public.booking_requests;
create policy bookings_req_update on public.booking_requests for update to authenticated
  using (requirement_id in (select app.full_scope_requirement_ids()))
  with check (requirement_id in (select app.full_scope_requirement_ids()));
drop policy if exists bookings_req_delete on public.booking_requests;
create policy bookings_req_delete on public.booking_requests for delete to authenticated
  using (requirement_id in (select app.full_scope_requirement_ids()));

-- --- grants -----------------------------------------------------------------
grant select, insert, update, delete on public.vendor_profiles     to authenticated;
grant select, insert, update, delete on public.vendor_requirements to authenticated;
grant select, insert, update, delete on public.booking_requests    to authenticated;
grant execute on all functions in schema app to authenticated;
