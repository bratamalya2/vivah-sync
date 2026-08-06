-- ============================================================================
-- 20260727210000_guests_rsvp.sql   (migration 0017)
-- VivahSync — guest hospitality: parties, guests, per-sub-event RSVP.
--
-- The foundation of the hospitality module. A GUEST PARTY (family unit) is the
-- unit of invitation and response: one primary contact RSVPs on behalf of the
-- household. Guests belong to a party; each party is invited to a set of
-- sub-events (the ceremonies), and every guest RSVPs per invited sub-event.
--
-- Each party carries an opaque rsvp_token — the low-friction, no-login web link a
-- planner shares over WhatsApp/SMS. The public RSVP page reads/writes strictly
-- through that token (server-side, token-scoped); the planner side is RLS-scoped
-- to the project like everything else.
-- ============================================================================

do $$ begin create type rsvp_status as enum ('PENDING', 'YES', 'NO', 'MAYBE'); exception when duplicate_object then null; end $$;

create table if not exists public.guest_parties (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  name              text not null check (length(trim(name)) > 0),
  contact_name      text,
  contact_phone     text,
  contact_email     text,
  plus_ones_allowed int not null default 0 check (plus_ones_allowed >= 0),
  rsvp_token        uuid not null default gen_random_uuid() unique,
  rsvp_submitted_at timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists idx_parties_project on public.guest_parties(project_id);

create table if not exists public.guests (
  id          uuid primary key default gen_random_uuid(),
  party_id    uuid not null references public.guest_parties(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  is_child    boolean not null default false,
  is_plus_one boolean not null default false,
  dietary     text,
  assistance  text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_guests_party on public.guests(party_id);

create table if not exists public.party_event_invites (
  party_id uuid not null references public.guest_parties(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  primary key (party_id, event_id)
);

create table if not exists public.guest_rsvps (
  guest_id     uuid not null references public.guests(id) on delete cascade,
  event_id     uuid not null references public.events(id) on delete cascade,
  status       rsvp_status not null default 'PENDING',
  responded_at timestamptz,
  primary key (guest_id, event_id)
);

-- ============================================================================
-- RLS (planner side; the public RSVP path is token-scoped server-side)
-- ============================================================================
create or replace function app.accessible_party_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select id from public.guest_parties where project_id in (select app.operational_project_ids()) $$;

create or replace function app.full_scope_party_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select id from public.guest_parties where project_id in (select app.full_scope_project_ids()) $$;

alter table public.guest_parties       enable row level security;
alter table public.guests              enable row level security;
alter table public.party_event_invites enable row level security;
alter table public.guest_rsvps         enable row level security;

drop policy if exists parties_select on public.guest_parties;
create policy parties_select on public.guest_parties for select to authenticated
  using (project_id in (select app.operational_project_ids()));
drop policy if exists parties_insert on public.guest_parties;
create policy parties_insert on public.guest_parties for insert to authenticated
  with check (project_id in (select app.full_scope_project_ids()));
drop policy if exists parties_update on public.guest_parties;
create policy parties_update on public.guest_parties for update to authenticated
  using (project_id in (select app.full_scope_project_ids()))
  with check (project_id in (select app.full_scope_project_ids()));
drop policy if exists parties_delete on public.guest_parties;
create policy parties_delete on public.guest_parties for delete to authenticated
  using (project_id in (select app.full_scope_project_ids()));

drop policy if exists guests_select on public.guests;
create policy guests_select on public.guests for select to authenticated
  using (party_id in (select app.accessible_party_ids()));
drop policy if exists guests_insert on public.guests;
create policy guests_insert on public.guests for insert to authenticated
  with check (party_id in (select app.full_scope_party_ids()));
drop policy if exists guests_update on public.guests;
create policy guests_update on public.guests for update to authenticated
  using (party_id in (select app.full_scope_party_ids()))
  with check (party_id in (select app.full_scope_party_ids()));
drop policy if exists guests_delete on public.guests;
create policy guests_delete on public.guests for delete to authenticated
  using (party_id in (select app.full_scope_party_ids()));

drop policy if exists invites_select on public.party_event_invites;
create policy invites_select on public.party_event_invites for select to authenticated
  using (party_id in (select app.accessible_party_ids()));
drop policy if exists invites_insert on public.party_event_invites;
create policy invites_insert on public.party_event_invites for insert to authenticated
  with check (party_id in (select app.full_scope_party_ids()));
drop policy if exists invites_delete on public.party_event_invites;
create policy invites_delete on public.party_event_invites for delete to authenticated
  using (party_id in (select app.full_scope_party_ids()));

drop policy if exists rsvps_select on public.guest_rsvps;
create policy rsvps_select on public.guest_rsvps for select to authenticated
  using (guest_id in (select id from public.guests where party_id in (select app.accessible_party_ids())));
drop policy if exists rsvps_write on public.guest_rsvps;
create policy rsvps_write on public.guest_rsvps for all to authenticated
  using (guest_id in (select id from public.guests where party_id in (select app.full_scope_party_ids())))
  with check (guest_id in (select id from public.guests where party_id in (select app.full_scope_party_ids())));

grant select, insert, update, delete on public.guest_parties       to authenticated;
grant select, insert, update, delete on public.guests              to authenticated;
grant select, insert, update, delete on public.party_event_invites to authenticated;
grant select, insert, update, delete on public.guest_rsvps         to authenticated;
grant execute on all functions in schema app to authenticated;
