-- ============================================================================
-- 20260724120000_core_operations.sql   (migration 0003)
-- VivahSync — venues, spaces, day structure, ceremonies, and the headline
-- overlap guarantee.
--
-- The product thesis lives here: a double-booking of a venue space is not
-- flagged after the fact — it is PHYSICALLY IMPOSSIBLE to store, via an
-- EXCLUDE constraint over a STORED GENERATED range column. Two related, hard
-- guarantees ship alongside it:
--   * an event cannot be scheduled outside its project's timeline (FR-041.1)
--   * a space cannot be booked beyond its legal-maximum capacity (FR-081.1)
--
-- TRAP (from Project-Overview §7): Prisma silently recreated this generated
-- column as a plain nullable range once, and an EXCLUDE over NULL never
-- conflicts — so the constraint existed and enforced nothing. Raw SQL owns this
-- column, and the test suite ATTEMPTS the double-booking rather than asserting
-- the constraint exists.
-- ============================================================================

-- --- venues (org-scoped: an agency owns its venue records) ------------------
create table if not exists public.venues (
  id            uuid primary key default gen_random_uuid(),
  owner_org_id  uuid not null references public.organizations(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  address       text,
  contact_name  text,
  contact_phone text,
  access_open   time,
  access_close  time,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_venues_org on public.venues(owner_org_id);

create table if not exists public.venue_spaces (
  id                 uuid primary key default gen_random_uuid(),
  venue_id           uuid not null references public.venues(id) on delete cascade,
  name               text not null check (length(trim(name)) > 0),
  comfort_capacity   int check (comfort_capacity is null or comfort_capacity >= 0),
  legal_max_capacity int check (legal_max_capacity is null or legal_max_capacity >= 0),
  created_at         timestamptz not null default now()
);
create index if not exists idx_spaces_venue on public.venue_spaces(venue_id);

-- --- day-by-day structure (FR-021.1), maintained by trigger from project dates
create table if not exists public.project_days (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  day_date    date not null,
  day_index   int not null,
  unique (project_id, day_date)
);
create index if not exists idx_days_project on public.project_days(project_id);

-- --- ceremonies / events (FR-041.1) -----------------------------------------
create table if not exists public.events (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  name                 text not null check (length(trim(name)) > 0),
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  setup_minutes        int not null default 0 check (setup_minutes >= 0),
  teardown_minutes     int not null default 0 check (teardown_minutes >= 0),
  expected_guest_count int check (expected_guest_count is null or expected_guest_count >= 0),
  primary_owner_id     uuid references public.app_users(id),
  created_at           timestamptz not null default now(),
  constraint event_times_ordered check (ends_at > starts_at)
);
create index if not exists idx_events_project on public.events(project_id);

-- --- space bookings: THE overlap guarantee ----------------------------------
-- period spans setup_start → teardown_end and is STORED GENERATED, so the
-- EXCLUDE constraint always has a non-null range to compare. Reusing the same
-- space later in the day (Haldi → Sangeet) is fine as long as the setup/teardown
-- windows don't overlap.
create table if not exists public.space_bookings (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  space_id     uuid not null references public.venue_spaces(id) on delete cascade,
  setup_start  timestamptz not null,
  teardown_end timestamptz not null,
  period       tstzrange generated always as (tstzrange(setup_start, teardown_end, '[)')) stored,
  created_at   timestamptz not null default now(),
  constraint booking_times_ordered check (teardown_end > setup_start),
  constraint no_space_overlap exclude using gist (space_id with =, period with &&)
);
create index if not exists idx_bookings_event on public.space_bookings(event_id);
create index if not exists idx_bookings_space on public.space_bookings(space_id);

-- ============================================================================
-- triggers / functions
-- ============================================================================

-- day structure: fully rebuild the consecutive days for a project
create or replace function app.rebuild_project_days(p uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare s date; e date;
begin
  select start_date, end_date into s, e from public.projects where id = p;
  if s is null then return; end if;
  delete from public.project_days where project_id = p;
  insert into public.project_days (project_id, day_date, day_index)
  select p, d::date, (d::date - s)
    from generate_series(s::timestamp, e::timestamp, interval '1 day') as g(d);
end $$;

create or replace function app.tg_project_days() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  perform app.rebuild_project_days(new.id);
  return new;
end $$;

drop trigger if exists trg_project_days on public.projects;
create trigger trg_project_days
  after insert or update of start_date, end_date on public.projects
  for each row execute function app.tg_project_days();

-- event must fall within the project's timeline (FR-041.1). errcode 23514 so
-- the message reaches the planner via translateDbError.
create or replace function app.tg_event_within_project() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare s date; e date;
begin
  select start_date, end_date into s, e from public.projects where id = new.project_id;
  if (new.starts_at at time zone 'Asia/Kolkata')::date < s
     or (new.ends_at   at time zone 'Asia/Kolkata')::date > e then
    raise exception 'Ceremony "%" is scheduled outside the project timeline (% to %).',
      new.name, to_char(s, 'DD Mon YYYY'), to_char(e, 'DD Mon YYYY')
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_event_within_project on public.events;
create trigger trg_event_within_project
  before insert or update on public.events
  for each row execute function app.tg_event_within_project();

-- a space cannot be booked beyond its legal-maximum capacity (FR-081.1)
create or replace function app.tg_space_capacity() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare g int; lm int; sname text;
begin
  select expected_guest_count into g from public.events where id = new.event_id;
  select legal_max_capacity, name into lm, sname from public.venue_spaces where id = new.space_id;
  if g is not null and lm is not null and g > lm then
    raise exception 'Guest count (%) exceeds the legal maximum capacity (%) of space "%".',
      g, lm, sname using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_space_capacity on public.space_bookings;
create trigger trg_space_capacity
  before insert or update on public.space_bookings
  for each row execute function app.tg_space_capacity();

-- ============================================================================
-- RLS helpers
-- ============================================================================
create or replace function app.my_venue_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select id from public.venues where owner_org_id in (select app.member_org_ids()) $$;

create or replace function app.accessible_event_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select id from public.events where project_id in (select app.accessible_project_ids()) $$;

create or replace function app.full_scope_event_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select id from public.events where project_id in (select app.full_scope_project_ids()) $$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.venues         enable row level security;
alter table public.venue_spaces   enable row level security;
alter table public.project_days   enable row level security;
alter table public.events         enable row level security;
alter table public.space_bookings enable row level security;

-- venues (org-scoped) --------------------------------------------------------
drop policy if exists venues_select on public.venues;
create policy venues_select on public.venues for select to authenticated
  using (owner_org_id in (select app.member_org_ids()));
drop policy if exists venues_insert on public.venues;
create policy venues_insert on public.venues for insert to authenticated
  with check (owner_org_id in (select app.member_org_ids()));
drop policy if exists venues_update on public.venues;
create policy venues_update on public.venues for update to authenticated
  using (owner_org_id in (select app.member_org_ids()))
  with check (owner_org_id in (select app.member_org_ids()));
drop policy if exists venues_delete on public.venues;
create policy venues_delete on public.venues for delete to authenticated
  using (owner_org_id in (select app.member_org_ids()));

-- venue_spaces (via venue's org) --------------------------------------------
drop policy if exists spaces_select on public.venue_spaces;
create policy spaces_select on public.venue_spaces for select to authenticated
  using (venue_id in (select app.my_venue_ids()));
drop policy if exists spaces_insert on public.venue_spaces;
create policy spaces_insert on public.venue_spaces for insert to authenticated
  with check (venue_id in (select app.my_venue_ids()));
drop policy if exists spaces_update on public.venue_spaces;
create policy spaces_update on public.venue_spaces for update to authenticated
  using (venue_id in (select app.my_venue_ids()))
  with check (venue_id in (select app.my_venue_ids()));
drop policy if exists spaces_delete on public.venue_spaces;
create policy spaces_delete on public.venue_spaces for delete to authenticated
  using (venue_id in (select app.my_venue_ids()));

-- project_days (read-only; trigger-maintained) -------------------------------
drop policy if exists days_select on public.project_days;
create policy days_select on public.project_days for select to authenticated
  using (project_id in (select app.accessible_project_ids()));

-- events (project-scoped; writes require FULL) -------------------------------
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (project_id in (select app.accessible_project_ids()));
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated
  with check (project_id in (select app.full_scope_project_ids()));
drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated
  using (project_id in (select app.full_scope_project_ids()))
  with check (project_id in (select app.full_scope_project_ids()));
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
  using (project_id in (select app.full_scope_project_ids()));

-- space_bookings (via event's project) ---------------------------------------
drop policy if exists bookings_select on public.space_bookings;
create policy bookings_select on public.space_bookings for select to authenticated
  using (event_id in (select app.accessible_event_ids()));
drop policy if exists bookings_insert on public.space_bookings;
create policy bookings_insert on public.space_bookings for insert to authenticated
  with check (event_id in (select app.full_scope_event_ids()));
drop policy if exists bookings_update on public.space_bookings;
create policy bookings_update on public.space_bookings for update to authenticated
  using (event_id in (select app.full_scope_event_ids()))
  with check (event_id in (select app.full_scope_event_ids()));
drop policy if exists bookings_delete on public.space_bookings;
create policy bookings_delete on public.space_bookings for delete to authenticated
  using (event_id in (select app.full_scope_event_ids()));

-- --- grants -----------------------------------------------------------------
grant select, insert, update, delete on public.venues         to authenticated;
grant select, insert, update, delete on public.venue_spaces   to authenticated;
grant select                         on public.project_days   to authenticated;
grant select, insert, update, delete on public.events         to authenticated;
grant select, insert, update, delete on public.space_bookings to authenticated;
grant execute on all functions in schema app to authenticated;

-- --- backfill day structure for any pre-existing projects -------------------
do $$
declare r record;
begin
  for r in select id from public.projects loop
    perform app.rebuild_project_days(r.id);
  end loop;
end $$;
