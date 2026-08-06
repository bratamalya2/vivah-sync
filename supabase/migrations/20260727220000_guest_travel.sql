-- ============================================================================
-- 20260727220000_guest_travel.sql   (migration 0018)
-- VivahSync — guest travel manifest, pickup windows, fleet dispatch.
--
-- One row per travel LEG (a party's arrival or departure). Arrivals auto-group
-- into pickup windows (by hotel + 30-min bucket) for the dispatch sheet; a
-- driver/vehicle can be assigned per leg. Live flight/train status is captured
-- MANUALLY here (status + delay note); an external tracking API can update it
-- later. Scoped to the project via the party, like the rest of guest data.
-- ============================================================================

do $$ begin create type travel_direction as enum ('ARRIVAL', 'DEPARTURE'); exception when duplicate_object then null; end $$;
do $$ begin create type travel_mode as enum ('FLIGHT', 'TRAIN', 'CAR', 'OTHER'); exception when duplicate_object then null; end $$;
do $$ begin create type travel_status as enum ('SCHEDULED', 'DELAYED', 'ARRIVED', 'DEPARTED', 'CANCELLED'); exception when duplicate_object then null; end $$;

create table if not exists public.guest_travel (
  id             uuid primary key default gen_random_uuid(),
  party_id       uuid not null references public.guest_parties(id) on delete cascade,
  direction      travel_direction not null,
  mode           travel_mode not null default 'FLIGHT',
  carrier_number text,                        -- flight / train number
  scheduled_at   timestamptz not null,
  location       text,                        -- terminal / station
  hotel          text,                        -- destination hotel
  headcount      int not null default 1 check (headcount > 0),
  status         travel_status not null default 'SCHEDULED',
  delay_note     text,
  driver_name    text,
  driver_phone   text,
  vehicle        text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_travel_party on public.guest_travel(party_id);

alter table public.guest_travel enable row level security;

drop policy if exists travel_select on public.guest_travel;
create policy travel_select on public.guest_travel for select to authenticated
  using (party_id in (select app.accessible_party_ids()));
drop policy if exists travel_write on public.guest_travel;
create policy travel_write on public.guest_travel for all to authenticated
  using (party_id in (select app.full_scope_party_ids()))
  with check (party_id in (select app.full_scope_party_ids()));

grant select, insert, update, delete on public.guest_travel to authenticated;
