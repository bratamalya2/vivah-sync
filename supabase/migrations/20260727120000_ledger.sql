-- ============================================================================
-- 20260727120000_ledger.sql   (migration 0013)
-- VivahSync — payment ledger (a slice of FR-2961) with a 15-MINUTE EDIT WINDOW.
--
-- NOTE: this DEPARTS from FR-2961's strict "a ledger entry can never be edited"
-- rule (per an explicit product decision). Instead: an entry is freely editable
-- and deletable for 15 minutes after it is created; after that it LOCKS — no
-- edits or deletes — and the only correction is a REVERSING entry (append-only
-- accounting). Every in-window edit and every reversal is written to audit_logs.
--
-- The ledger is financial data: only FULL-scope users (planner / production) can
-- see or touch it. Family (READ_ONLY) and vendors (ASSIGNED_ONLY) are blind.
-- ============================================================================

do $$ begin create type ledger_direction as enum ('INFLOW','OUTFLOW');
exception when duplicate_object then null; end $$;
do $$ begin create type payment_mode as enum ('CASH','BANK','UPI','CARD');
exception when duplicate_object then null; end $$;
do $$ begin create type payer_entity as enum ('CLIENT','PLANNER','VENDOR','VENUE');
exception when duplicate_object then null; end $$;

create table if not exists public.ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  direction   ledger_direction not null,
  amount      numeric(14,2) not null check (amount > 0),
  currency    text not null default 'INR',
  mode        payment_mode not null,
  payer       payer_entity not null,
  vendor_id   uuid references public.vendor_profiles(id),
  note        text,
  paid_at     timestamptz not null default now(),
  reverses_id uuid references public.ledger_entries(id),
  created_by  uuid references public.app_users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (reverses_id)   -- an entry can be reversed at most once (nulls allowed many)
);
create index if not exists idx_ledger_project on public.ledger_entries(project_id, created_at desc);

-- 15-minute edit window: after it closes the row is frozen (correct via reversal)
create or replace function app.tg_ledger_edit_window() returns trigger
  language plpgsql set search_path = public as
$$
begin
  if tg_op = 'DELETE' then
    if now() - old.created_at > interval '15 minutes' then
      raise exception
        'This ledger entry is locked (over 15 minutes old) and cannot be deleted — post a reversing entry instead.'
        using errcode = '23514';
    end if;
    return old;
  end if;
  -- UPDATE
  if now() - old.created_at > interval '15 minutes' then
    raise exception
      'This ledger entry is locked (over 15 minutes old). Post a reversing entry to correct it.'
      using errcode = '23514';
  end if;
  new.project_id  := old.project_id;   -- these never change on edit
  new.created_at  := old.created_at;
  new.reverses_id := old.reverses_id;
  new.updated_at  := now();
  return new;
end $$;

drop trigger if exists trg_ledger_edit_window on public.ledger_entries;
create trigger trg_ledger_edit_window before update or delete on public.ledger_entries
  for each row execute function app.tg_ledger_edit_window();

-- a reversal must target a real, same-project, non-reversal entry
create or replace function app.tg_ledger_reversal_check() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if new.reverses_id is not null then
    if not exists (
      select 1 from public.ledger_entries e
       where e.id = new.reverses_id and e.project_id = new.project_id and e.reverses_id is null
    ) then
      raise exception 'That entry cannot be reversed (missing, from another wedding, or itself a reversal).'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_ledger_reversal_check on public.ledger_entries;
create trigger trg_ledger_reversal_check before insert on public.ledger_entries
  for each row execute function app.tg_ledger_reversal_check();

-- audit in-window edits and reversals
create or replace function app.tg_ledger_audit() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if tg_op = 'UPDATE' then
    insert into public.audit_logs (project_id, actor_user_id, action, entity_type, entity_id, detail)
    values (new.project_id, auth.uid(), 'LEDGER_EDIT', 'ledger_entry', new.id,
      jsonb_build_object(
        'from', jsonb_build_object('amount', old.amount, 'direction', old.direction::text, 'mode', old.mode::text),
        'to',   jsonb_build_object('amount', new.amount, 'direction', new.direction::text, 'mode', new.mode::text)));
  elsif tg_op = 'INSERT' and new.reverses_id is not null then
    insert into public.audit_logs (project_id, actor_user_id, action, entity_type, entity_id, detail)
    values (new.project_id, auth.uid(), 'LEDGER_REVERSAL', 'ledger_entry', new.id,
      jsonb_build_object('reverses', new.reverses_id, 'amount', new.amount, 'direction', new.direction::text));
  end if;
  return null;
end $$;

drop trigger if exists trg_ledger_audit on public.ledger_entries;
create trigger trg_ledger_audit after insert or update on public.ledger_entries
  for each row execute function app.tg_ledger_audit();

-- ============================================================================
-- RLS — ledger is FULL-scope only (planner / production). Family + vendors blind.
-- ============================================================================
alter table public.ledger_entries enable row level security;

drop policy if exists ledger_select on public.ledger_entries;
create policy ledger_select on public.ledger_entries for select to authenticated
  using (project_id in (select app.full_scope_project_ids()));
drop policy if exists ledger_insert on public.ledger_entries;
create policy ledger_insert on public.ledger_entries for insert to authenticated
  with check (project_id in (select app.full_scope_project_ids()));
drop policy if exists ledger_update on public.ledger_entries;
create policy ledger_update on public.ledger_entries for update to authenticated
  using (project_id in (select app.full_scope_project_ids()))
  with check (project_id in (select app.full_scope_project_ids()));
drop policy if exists ledger_delete on public.ledger_entries;
create policy ledger_delete on public.ledger_entries for delete to authenticated
  using (project_id in (select app.full_scope_project_ids()));

grant select, insert, update, delete on public.ledger_entries to authenticated;
grant execute on all functions in schema app to authenticated;
