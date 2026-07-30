-- ============================================================================
-- 20260725000000_playbook_render_queue.sql   (migration 0007)
-- VivahSync — playbook PDF render queue for the background worker.
--
-- Every generated playbook version enqueues one render row. The worker claims
-- PENDING rows (skip-locked), renders the PDF from the frozen snapshot, and
-- stores the bytes here. The PDF lives in the DB (a wedding playbook is a few
-- KB) — no object store needed yet; can move to Supabase Storage for large
-- media later. The web app never renders; it only reads finished bytes.
--
-- The worker writes via the owner connection; the app has SELECT only.
-- ============================================================================

create table if not exists public.playbook_renders (
  playbook_id  uuid primary key references public.playbooks(id) on delete cascade,
  status       text not null default 'PENDING'
                 check (status in ('PENDING','RENDERING','READY','FAILED')),
  pdf          bytea,
  error        text,
  requested_at timestamptz not null default now(),
  claimed_at   timestamptz,
  rendered_at  timestamptz
);
create index if not exists idx_renders_pending on public.playbook_renders(status) where status = 'PENDING';

-- enqueue a render whenever a playbook version is created
create or replace function app.tg_playbook_enqueue_render() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  insert into public.playbook_renders (playbook_id) values (new.id)
  on conflict (playbook_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_playbook_enqueue on public.playbooks;
create trigger trg_playbook_enqueue after insert on public.playbooks
  for each row execute function app.tg_playbook_enqueue_render();

-- backfill any playbooks that predate this queue
insert into public.playbook_renders (playbook_id)
select id from public.playbooks on conflict (playbook_id) do nothing;

alter table public.playbook_renders enable row level security;
drop policy if exists renders_select on public.playbook_renders;
create policy renders_select on public.playbook_renders for select to authenticated
  using (playbook_id in (
    select pb.id from public.playbooks pb
     where pb.project_id in (select app.accessible_project_ids())
  ));

grant select on public.playbook_renders to authenticated;   -- worker writes via owner
grant execute on all functions in schema app to authenticated;
