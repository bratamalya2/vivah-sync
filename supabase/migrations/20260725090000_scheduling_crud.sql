-- ============================================================================
-- 20260725090000_scheduling_crud.sql   (migration 0011)
-- VivahSync — finish scheduling CRUD: edit/delete ceremonies + multi-space
-- events with AGGREGATE capacity (FR-081.1).
--
-- Capacity change: the legal-max ceiling now applies to the COMBINED capacity
-- of every space a ceremony occupies (Lawn + Terrace), not each space alone.
-- To let a planner build up a multi-space assignment (adding one space at a
-- time would transiently exceed a single space), the aggregate check is a
-- DEFERRED constraint trigger — it fires once at COMMIT, when the full set of
-- spaces is present. A space with an unspecified legal max is treated as
-- unbounded (no ceiling).
--
-- Also: a ceremony with ACCEPTED/CONFIRMED vendor commitments can't be deleted
-- out from under them — cancel the vendors first.
-- ============================================================================

-- --- replace per-space capacity with aggregate event capacity ---------------
drop trigger if exists trg_space_capacity on public.space_bookings;
drop function if exists app.tg_space_capacity();

create or replace function app.check_event_capacity(p_event uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare g int; n int; unbounded int; total_cap bigint;
begin
  select expected_guest_count into g from public.events where id = p_event;
  if g is null then return; end if;

  select count(*),
         count(*) filter (where vs.legal_max_capacity is null),
         coalesce(sum(vs.legal_max_capacity), 0)
    into n, unbounded, total_cap
    from public.space_bookings sb
    join public.venue_spaces vs on vs.id = sb.space_id
   where sb.event_id = p_event;

  if n = 0 or unbounded > 0 then return; end if;  -- no spaces yet, or an unbounded space
  if g > total_cap then
    raise exception
      'Guest count (%) exceeds the legal maximum capacity of the assigned space(s) (combined %).',
      g, total_cap using errcode = '23514';
  end if;
end $$;

-- deferred: checked at COMMIT, so multi-space assignments are evaluated whole
create or replace function app.tg_booking_capacity() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  perform app.check_event_capacity(coalesce(new.event_id, old.event_id));
  return null;
end $$;

drop trigger if exists trg_booking_capacity on public.space_bookings;
create constraint trigger trg_booking_capacity
  after insert or update on public.space_bookings
  deferrable initially deferred
  for each row execute function app.tg_booking_capacity();

-- guest-count changes re-check immediately (single mutation, spaces already set)
create or replace function app.tg_event_capacity() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  perform app.check_event_capacity(new.id);
  return new;
end $$;

drop trigger if exists trg_event_capacity on public.events;
create trigger trg_event_capacity
  after update of expected_guest_count on public.events
  for each row execute function app.tg_event_capacity();

-- --- delete guard: protect accepted vendor commitments ----------------------
create or replace function app.tg_event_delete_guard() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if exists (
    select 1 from public.booking_requests b
      join public.vendor_requirements r on r.id = b.requirement_id
     where r.event_id = old.id and b.status in ('ACCEPTED','CONFIRMED')
  ) then
    raise exception
      'This ceremony has accepted vendor commitments; cancel those bookings before deleting it.'
      using errcode = '23514';
  end if;
  return old;
end $$;

drop trigger if exists trg_event_delete_guard on public.events;
create trigger trg_event_delete_guard before delete on public.events
  for each row execute function app.tg_event_delete_guard();
