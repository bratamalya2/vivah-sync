-- ============================================================================
-- 20260727200000_vendor_contracts.sql   (migration 0016)
-- VivahSync — vendor contracts + payment milestones (the money layer).
--
-- A contract formalises a vendor's commercials on a wedding: a total value and a
-- payment plan broken into milestones with due dates. The headline guarantee
-- (from the product vision) lives here:
--   * milestones can NEVER sum to more than the contract total (>100% is
--     refused, checked at COMMIT so a whole grid of edits is evaluated together)
--   * a contract can only be ACTIVATED when its milestones total EXACTLY 100%.
-- A DRAFT may be under- or partially-planned; activation is the gate.
--
-- Contracts are operational/planner data — vendors and family don't see them.
-- ============================================================================

do $$ begin create type contract_status as enum ('DRAFT', 'ACTIVE'); exception when duplicate_object then null; end $$;
do $$ begin create type contract_source as enum ('MANUAL', 'PDF_EXTRACTED'); exception when duplicate_object then null; end $$;

create table if not exists public.vendor_contracts (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  vendor_id    uuid not null references public.vendor_profiles(id),
  title        text not null check (length(trim(title)) > 0),
  total_amount numeric(14, 2) not null check (total_amount > 0),
  status       contract_status not null default 'DRAFT',
  source       contract_source not null default 'MANUAL',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_contracts_project on public.vendor_contracts(project_id);
create index if not exists idx_contracts_vendor on public.vendor_contracts(vendor_id);

create table if not exists public.contract_milestones (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.vendor_contracts(id) on delete cascade,
  label       text not null check (length(trim(label)) > 0),
  amount      numeric(14, 2) not null check (amount > 0),
  due_date    date,
  paid        boolean not null default false,
  paid_at     timestamptz,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_milestones_contract on public.contract_milestones(contract_id);
create index if not exists idx_milestones_due on public.contract_milestones(due_date) where paid = false;

-- ============================================================================
-- enforcement
-- ============================================================================

-- milestones must never sum to more than the contract total (>100%)
create or replace function app.check_contract_balance(p_contract uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_total numeric; v_sum numeric;
begin
  select total_amount into v_total from public.vendor_contracts where id = p_contract;
  if v_total is null then return; end if;  -- contract already gone
  select coalesce(sum(amount), 0) into v_sum from public.contract_milestones where contract_id = p_contract;
  if v_sum > v_total then
    raise exception
      'The payment milestones total %, which is more than the contract value of %. They can''t add up to over 100%%.',
      v_sum, v_total using errcode = '23514';
  end if;
end $$;

create or replace function app.tg_milestone_balance() returns trigger
  language plpgsql security definer set search_path = public as
$$ begin perform app.check_contract_balance(coalesce(new.contract_id, old.contract_id)); return null; end $$;

drop trigger if exists trg_milestone_balance on public.contract_milestones;
create constraint trigger trg_milestone_balance
  after insert or update or delete on public.contract_milestones
  deferrable initially deferred
  for each row execute function app.tg_milestone_balance();

-- re-check the balance if the contract total is lowered (also deferred, so it
-- composes with a milestone rewrite in the same transaction)
create or replace function app.tg_contract_balance() returns trigger
  language plpgsql security definer set search_path = public as
$$ begin perform app.check_contract_balance(new.id); return null; end $$;

drop trigger if exists trg_contract_balance on public.vendor_contracts;
create constraint trigger trg_contract_balance
  after update on public.vendor_contracts
  deferrable initially deferred
  for each row execute function app.tg_contract_balance();

-- a contract can only be activated when its plan totals EXACTLY 100%
create or replace function app.tg_contract_activate() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare v_sum numeric; v_n int;
begin
  new.updated_at := now();
  if new.status = 'ACTIVE' and old.status is distinct from 'ACTIVE' then
    select count(*), coalesce(sum(amount), 0) into v_n, v_sum
      from public.contract_milestones where contract_id = new.id;
    if v_n = 0 then
      raise exception 'Add a payment milestone before activating the contract.' using errcode = '23514';
    end if;
    if v_sum <> new.total_amount then
      raise exception
        'The payment plan totals % of % — it must add up to exactly 100%% before the contract can be activated.',
        v_sum, new.total_amount using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_contract_activate on public.vendor_contracts;
create trigger trg_contract_activate before update on public.vendor_contracts
  for each row execute function app.tg_contract_activate();

-- ============================================================================
-- RLS
-- ============================================================================
create or replace function app.accessible_contract_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select id from public.vendor_contracts where project_id in (select app.operational_project_ids()) $$;

create or replace function app.full_scope_contract_ids() returns setof uuid
  language sql stable security definer set search_path = public as
$$ select id from public.vendor_contracts where project_id in (select app.full_scope_project_ids()) $$;

alter table public.vendor_contracts    enable row level security;
alter table public.contract_milestones enable row level security;

drop policy if exists contracts_select on public.vendor_contracts;
create policy contracts_select on public.vendor_contracts for select to authenticated
  using (project_id in (select app.operational_project_ids()));
drop policy if exists contracts_insert on public.vendor_contracts;
create policy contracts_insert on public.vendor_contracts for insert to authenticated
  with check (project_id in (select app.full_scope_project_ids()));
drop policy if exists contracts_update on public.vendor_contracts;
create policy contracts_update on public.vendor_contracts for update to authenticated
  using (project_id in (select app.full_scope_project_ids()))
  with check (project_id in (select app.full_scope_project_ids()));
drop policy if exists contracts_delete on public.vendor_contracts;
create policy contracts_delete on public.vendor_contracts for delete to authenticated
  using (project_id in (select app.full_scope_project_ids()));

drop policy if exists milestones_select on public.contract_milestones;
create policy milestones_select on public.contract_milestones for select to authenticated
  using (contract_id in (select app.accessible_contract_ids()));
drop policy if exists milestones_insert on public.contract_milestones;
create policy milestones_insert on public.contract_milestones for insert to authenticated
  with check (contract_id in (select app.full_scope_contract_ids()));
drop policy if exists milestones_update on public.contract_milestones;
create policy milestones_update on public.contract_milestones for update to authenticated
  using (contract_id in (select app.full_scope_contract_ids()))
  with check (contract_id in (select app.full_scope_contract_ids()));
drop policy if exists milestones_delete on public.contract_milestones;
create policy milestones_delete on public.contract_milestones for delete to authenticated
  using (contract_id in (select app.full_scope_contract_ids()));

grant select, insert, update, delete on public.vendor_contracts    to authenticated;
grant select, insert, update, delete on public.contract_milestones to authenticated;
grant execute on all functions in schema app to authenticated;
