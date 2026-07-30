-- ============================================================================
-- 20260724180000_schedule_change_protocol.sql   (migration 0005)
-- VivahSync — post-agreement schedule modification protocol (FR-261.1).
--
-- Once a ceremony has a LOCKED vendor commitment (an ACCEPTED/CONFIRMED
-- booking), its time cannot simply be edited. A direct change is BLOCKED at the
-- database; the planner must raise a schedule_change_proposal, and every
-- impacted vendor must acknowledge it before it can be applied. The original
-- schedule stays live until then. Applying the proposal is the ONLY path that
-- may move a locked ceremony — it flips a transaction-local flag the block
-- trigger recognises.
--
-- Rescheduling (direct or via proposal) always recomputes the affected space
-- bookings, so the EXCLUDE overlap guarantee is re-checked against the new time.
-- ============================================================================

do $$ begin create type proposal_status as enum ('PROPOSED','APPLIED','CANCELLED');
exception when duplicate_object then null; end $$;

create table if not exists public.schedule_change_proposals (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events(id) on delete cascade,
  proposed_starts_at  timestamptz not null,
  proposed_ends_at    timestamptz not null,
  status              proposal_status not null default 'PROPOSED',
  created_by          uuid references public.app_users(id) default auth.uid(),
  created_at          timestamptz not null default now(),
  applied_at          timestamptz,
  constraint proposed_times_ordered check (proposed_ends_at > proposed_starts_at)
);
create index if not exists idx_proposals_event on public.schedule_change_proposals(event_id);
-- at most one pending proposal per ceremony
create unique index if not exists uniq_pending_proposal
  on public.schedule_change_proposals(event_id) where status = 'PROPOSED';

create table if not exists public.change_acknowledgements (
  id                     uuid primary key default gen_random_uuid(),
  proposal_id            uuid not null references public.schedule_change_proposals(id) on delete cascade,
  booking_id             uuid not null references public.booking_requests(id) on delete cascade,
  acknowledged           boolean not null default false,
  acknowledged_at        timestamptz,
  acknowledgement_source acceptance_source,
  unique (proposal_id, booking_id)
);
create index if not exists idx_acks_proposal on public.change_acknowledgements(proposal_id);

-- ============================================================================
-- triggers
-- ============================================================================

-- BLOCK a direct time change on a ceremony with locked commitments (FR-261.1),
-- unless we are applying an acknowledged proposal (transaction-local flag).
create or replace function app.tg_event_lock_check() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at)
     and coalesce(current_setting('app.applying_proposal', true), '') <> 'on'
     and exists (
       select 1 from public.booking_requests b
         join public.vendor_requirements r on r.id = b.requirement_id
        where r.event_id = new.id and b.status in ('ACCEPTED','CONFIRMED')
     ) then
    raise exception
      'This ceremony has locked vendor commitments; reschedule it through a change proposal that impacted vendors acknowledge.'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_event_lock_check on public.events;
create trigger trg_event_lock_check before update on public.events
  for each row execute function app.tg_event_lock_check();

-- keep space bookings aligned with the ceremony's (possibly new) time; this
-- re-runs the EXCLUDE overlap + capacity checks on the new window.
create or replace function app.tg_event_reschedule_bookings() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  update public.space_bookings sb
     set setup_start  = new.starts_at - make_interval(mins => new.setup_minutes),
         teardown_end = new.ends_at   + make_interval(mins => new.teardown_minutes)
   where sb.event_id = new.id;
  return new;
end $$;

drop trigger if exists trg_event_reschedule_bookings on public.events;
create trigger trg_event_reschedule_bookings
  after update of starts_at, ends_at, setup_minutes, teardown_minutes on public.events
  for each row execute function app.tg_event_reschedule_bookings();

-- Apply an acknowledged proposal. The ONLY sanctioned path to move a locked
-- ceremony. Checks access, checks every impacted vendor has acknowledged, then
-- flips the flag and applies.
create or replace function app.finalize_proposal(p uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_event uuid; v_start timestamptz; v_end timestamptz; v_status proposal_status; n_pending int;
begin
  select event_id, proposed_starts_at, proposed_ends_at, status
    into v_event, v_start, v_end, v_status
    from public.schedule_change_proposals where id = p;
  if not found then raise exception 'Proposal not found.' using errcode = '23514'; end if;
  if v_status <> 'PROPOSED' then
    raise exception 'This proposal is no longer pending.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.events e
     where e.id = v_event
       and e.project_id in (select project_id from public.project_access
                             where user_id = auth.uid() and scope = 'FULL')
  ) then
    raise exception 'Not authorized to apply this change.' using errcode = '42501';
  end if;

  select count(*) into n_pending
    from public.change_acknowledgements where proposal_id = p and acknowledged = false;
  if n_pending > 0 then
    raise exception 'All impacted vendors must acknowledge first (% still pending).', n_pending
      using errcode = '23514';
  end if;

  perform set_config('app.applying_proposal', 'on', true);
  update public.events set starts_at = v_start, ends_at = v_end where id = v_event;
  update public.schedule_change_proposals set status = 'APPLIED', applied_at = now() where id = p;
end $$;

-- ============================================================================
-- RLS helpers
-- ============================================================================
create or replace function app.accessible_proposal_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select p.id from public.schedule_change_proposals p
     where p.event_id in (select app.accessible_event_ids()) $$;

create or replace function app.full_scope_proposal_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select p.id from public.schedule_change_proposals p
     where p.event_id in (select app.full_scope_event_ids()) $$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.schedule_change_proposals enable row level security;
alter table public.change_acknowledgements   enable row level security;

drop policy if exists proposals_select on public.schedule_change_proposals;
create policy proposals_select on public.schedule_change_proposals for select to authenticated
  using (event_id in (select app.accessible_event_ids()));
drop policy if exists proposals_insert on public.schedule_change_proposals;
create policy proposals_insert on public.schedule_change_proposals for insert to authenticated
  with check (event_id in (select app.full_scope_event_ids()));
drop policy if exists proposals_update on public.schedule_change_proposals;
create policy proposals_update on public.schedule_change_proposals for update to authenticated
  using (event_id in (select app.full_scope_event_ids()))
  with check (event_id in (select app.full_scope_event_ids()));
drop policy if exists proposals_delete on public.schedule_change_proposals;
create policy proposals_delete on public.schedule_change_proposals for delete to authenticated
  using (event_id in (select app.full_scope_event_ids()));

drop policy if exists acks_select on public.change_acknowledgements;
create policy acks_select on public.change_acknowledgements for select to authenticated
  using (proposal_id in (select app.accessible_proposal_ids()));
drop policy if exists acks_insert on public.change_acknowledgements;
create policy acks_insert on public.change_acknowledgements for insert to authenticated
  with check (proposal_id in (select app.full_scope_proposal_ids()));
drop policy if exists acks_update on public.change_acknowledgements;
create policy acks_update on public.change_acknowledgements for update to authenticated
  using (proposal_id in (select app.full_scope_proposal_ids()))
  with check (proposal_id in (select app.full_scope_proposal_ids()));
drop policy if exists acks_delete on public.change_acknowledgements;
create policy acks_delete on public.change_acknowledgements for delete to authenticated
  using (proposal_id in (select app.full_scope_proposal_ids()));

grant select, insert, update, delete on public.schedule_change_proposals to authenticated;
grant select, insert, update, delete on public.change_acknowledgements   to authenticated;
grant execute on all functions in schema app to authenticated;
