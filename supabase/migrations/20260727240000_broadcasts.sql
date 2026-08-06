-- ============================================================================
-- 20260727240000_broadcasts.sql   (migration 0020)
-- VivahSync — broadcast messaging log (send is STUBBED; no external provider is
-- wired). A planner composes a message to an audience segment; we snapshot the
-- resolved recipient list and mark it SENT. A real WhatsApp/SMS/email provider
-- can later read QUEUED rows and flip them to SENT/FAILED without a schema change.
--
-- Digital itineraries and QR guest passes need NO new tables — they read the
-- existing party / events / travel / room-allocation rows via the party's
-- rsvp_token (the same no-login token used for RSVP).
-- ============================================================================

do $$ begin create type broadcast_channel as enum ('WHATSAPP', 'SMS', 'EMAIL'); exception when duplicate_object then null; end $$;
do $$ begin create type broadcast_state as enum ('QUEUED', 'SENT', 'FAILED'); exception when duplicate_object then null; end $$;

create table if not exists public.broadcasts (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  channel      broadcast_channel not null default 'WHATSAPP',
  audience     text not null default 'ALL',       -- ALL | PENDING_RSVP | ATTENDING | ARRIVING
  subject      text,
  body         text not null,
  state        broadcast_state not null default 'SENT',   -- stub: recorded as SENT
  recipients   int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_broadcasts_project on public.broadcasts(project_id);

-- Per-recipient snapshot so the log can show who a message reached.
create table if not exists public.broadcast_recipients (
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  party_id     uuid not null references public.guest_parties(id) on delete cascade,
  party_name   text not null,
  channel_addr text,                              -- phone / email at send time
  primary key (broadcast_id, party_id)
);

alter table public.broadcasts enable row level security;
alter table public.broadcast_recipients enable row level security;

drop policy if exists broadcasts_select on public.broadcasts;
create policy broadcasts_select on public.broadcasts for select to authenticated
  using (project_id in (select app.operational_project_ids()));
drop policy if exists broadcasts_write on public.broadcasts;
create policy broadcasts_write on public.broadcasts for all to authenticated
  using (project_id in (select app.full_scope_project_ids()))
  with check (project_id in (select app.full_scope_project_ids()));

drop policy if exists brecipients_select on public.broadcast_recipients;
create policy brecipients_select on public.broadcast_recipients for select to authenticated
  using (broadcast_id in (select id from public.broadcasts where project_id in (select app.operational_project_ids())));
drop policy if exists brecipients_write on public.broadcast_recipients;
create policy brecipients_write on public.broadcast_recipients for all to authenticated
  using (broadcast_id in (select id from public.broadcasts where project_id in (select app.full_scope_project_ids())))
  with check (broadcast_id in (select id from public.broadcasts where project_id in (select app.full_scope_project_ids())));

grant select, insert, update, delete on public.broadcasts to authenticated;
grant select, insert, update, delete on public.broadcast_recipients to authenticated;
