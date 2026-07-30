-- ============================================================================
-- 20260725030000_venue_rule_exceptions.sql   (migration 0008)
-- VivahSync — venue rule exception management (FR-061.1) + the audit trail.
--
-- A venue's baseline rules (access timings, curfews) apply to every event
-- unless explicitly overridden for a specific ceremony — and an override MUST
-- carry a documented rationale (FR-061.1 blocks it otherwise). Every override
-- is written to audit_logs, which until now existed only in intent. audit_logs
-- is append-only and project-scoped: the app can read its own project's trail
-- but never write it directly — writes happen inside SECURITY DEFINER triggers.
-- ============================================================================

-- --- audit trail (append-only) ----------------------------------------------
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.projects(id) on delete cascade,
  actor_user_id uuid references public.app_users(id),
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  detail        jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_audit_project on public.audit_logs(project_id, created_at desc);

-- --- venue rule overrides ---------------------------------------------------
do $$ begin create type venue_rule_key as enum
  ('ACCESS_OPEN','ACCESS_CLOSE','NOISE_CURFEW','OTHER');
exception when duplicate_object then null; end $$;

create table if not exists public.venue_rule_overrides (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  rule_key       venue_rule_key not null,
  override_value text not null,
  rationale      text not null,
  created_by     uuid references public.app_users(id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists idx_overrides_event on public.venue_rule_overrides(event_id);

-- FR-061.1: block an override that lacks documentation (friendly message)
create or replace function app.tg_override_requires_rationale() returns trigger
  language plpgsql set search_path = public as
$$
begin
  if length(trim(coalesce(new.override_value, ''))) = 0 then
    raise exception 'An override value is required.' using errcode = '23514';
  end if;
  if length(trim(coalesce(new.rationale, ''))) = 0 then
    raise exception 'A documented rationale is required to override a venue rule.'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_override_rationale on public.venue_rule_overrides;
create trigger trg_override_rationale before insert or update on public.venue_rule_overrides
  for each row execute function app.tg_override_requires_rationale();

-- write the audit entry for every override (the one sanctioned audit write path)
create or replace function app.tg_override_audit() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare v_project uuid;
begin
  select project_id into v_project from public.events where id = new.event_id;
  insert into public.audit_logs (project_id, actor_user_id, action, entity_type, entity_id, detail)
  values (v_project, new.created_by, 'VENUE_RULE_OVERRIDE', 'event', new.event_id,
          jsonb_build_object(
            'rule_key', new.rule_key::text,
            'override_value', new.override_value,
            'rationale', new.rationale));
  return new;
end $$;

drop trigger if exists trg_override_audit on public.venue_rule_overrides;
create trigger trg_override_audit after insert on public.venue_rule_overrides
  for each row execute function app.tg_override_audit();

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.audit_logs           enable row level security;
alter table public.venue_rule_overrides enable row level security;

-- audit_logs: read your own project's trail; never app-writable
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated
  using (project_id in (select app.accessible_project_ids()));

-- overrides: read via the event's project; write requires FULL scope
drop policy if exists overrides_select on public.venue_rule_overrides;
create policy overrides_select on public.venue_rule_overrides for select to authenticated
  using (event_id in (select app.accessible_event_ids()));
drop policy if exists overrides_insert on public.venue_rule_overrides;
create policy overrides_insert on public.venue_rule_overrides for insert to authenticated
  with check (event_id in (select app.full_scope_event_ids()));
drop policy if exists overrides_update on public.venue_rule_overrides;
create policy overrides_update on public.venue_rule_overrides for update to authenticated
  using (event_id in (select app.full_scope_event_ids()))
  with check (event_id in (select app.full_scope_event_ids()));
drop policy if exists overrides_delete on public.venue_rule_overrides;
create policy overrides_delete on public.venue_rule_overrides for delete to authenticated
  using (event_id in (select app.full_scope_event_ids()));

grant select                         on public.audit_logs           to authenticated;
grant select, insert, update, delete on public.venue_rule_overrides to authenticated;
grant execute on all functions in schema app to authenticated;
