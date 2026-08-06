-- ============================================================================
-- 20260727230000_hotels_rooms.sql   (migration 0019)
-- VivahSync — hotel room blocks + per-party room allocations + front-desk
-- check-in/out console + welcome-kit tracking.
--
-- A project holds room BLOCKS at one or more hotels (a type of room, a count,
-- a nightly rate). Guest parties are ALLOCATED individual rooms drawn from a
-- hotel + room type; each allocation carries a stay lifecycle (RESERVED →
-- ARRIVED → CHECKED_IN → CHECKED_OUT), a key-handover flag, and a welcome-kit
-- flag. Everything scopes to the project via the hotel (blocks/allocations) or
-- the party (allocations must also belong to a party in the same project).
-- ============================================================================

do $$ begin create type stay_status as enum ('RESERVED', 'ARRIVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'); exception when duplicate_object then null; end $$;

create table if not exists public.hotels (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null,
  address     text,
  phone       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_hotels_project on public.hotels(project_id);

create table if not exists public.room_blocks (
  id           uuid primary key default gen_random_uuid(),
  hotel_id     uuid not null references public.hotels(id) on delete cascade,
  room_type    text not null,
  total_rooms  int not null default 0 check (total_rooms >= 0),
  rate         numeric(14,2) not null default 0 check (rate >= 0),
  created_at   timestamptz not null default now()
);
create index if not exists idx_blocks_hotel on public.room_blocks(hotel_id);

create table if not exists public.room_allocations (
  id             uuid primary key default gen_random_uuid(),
  hotel_id       uuid not null references public.hotels(id) on delete cascade,
  party_id       uuid not null references public.guest_parties(id) on delete cascade,
  room_type      text not null,
  room_number    text,
  occupancy      int not null default 1 check (occupancy > 0),
  check_in_date  date,
  check_out_date date,
  status         stay_status not null default 'RESERVED',
  key_handed     boolean not null default false,
  welcome_kit    boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_alloc_hotel on public.room_allocations(hotel_id);
create index if not exists idx_alloc_party on public.room_allocations(party_id);

-- ── project-scoped hotel-id helpers (mirror the party helpers) ──────────────
create or replace function app.accessible_hotel_ids() returns setof uuid
  language sql stable security definer set search_path = public, app as $$
  select id from public.hotels where project_id in (select app.operational_project_ids());
$$;
create or replace function app.full_scope_hotel_ids() returns setof uuid
  language sql stable security definer set search_path = public, app as $$
  select id from public.hotels where project_id in (select app.full_scope_project_ids());
$$;

alter table public.hotels enable row level security;
alter table public.room_blocks enable row level security;
alter table public.room_allocations enable row level security;

drop policy if exists hotels_select on public.hotels;
create policy hotels_select on public.hotels for select to authenticated
  using (project_id in (select app.operational_project_ids()));
drop policy if exists hotels_write on public.hotels;
create policy hotels_write on public.hotels for all to authenticated
  using (project_id in (select app.full_scope_project_ids()))
  with check (project_id in (select app.full_scope_project_ids()));

drop policy if exists blocks_select on public.room_blocks;
create policy blocks_select on public.room_blocks for select to authenticated
  using (hotel_id in (select app.accessible_hotel_ids()));
drop policy if exists blocks_write on public.room_blocks;
create policy blocks_write on public.room_blocks for all to authenticated
  using (hotel_id in (select app.full_scope_hotel_ids()))
  with check (hotel_id in (select app.full_scope_hotel_ids()));

drop policy if exists alloc_select on public.room_allocations;
create policy alloc_select on public.room_allocations for select to authenticated
  using (hotel_id in (select app.accessible_hotel_ids()));
drop policy if exists alloc_write on public.room_allocations;
create policy alloc_write on public.room_allocations for all to authenticated
  using (hotel_id in (select app.full_scope_hotel_ids()) and party_id in (select app.full_scope_party_ids()))
  with check (hotel_id in (select app.full_scope_hotel_ids()) and party_id in (select app.full_scope_party_ids()));

grant select, insert, update, delete on public.hotels to authenticated;
grant select, insert, update, delete on public.room_blocks to authenticated;
grant select, insert, update, delete on public.room_allocations to authenticated;
