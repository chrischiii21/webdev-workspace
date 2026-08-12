-- Replaces the JSON-file stores (data/kanban.json, data/eodReports.json,
-- data/activity.json) with real tables. Checklist/history/comments stay as
-- JSONB since they're always read/written as a whole with their task, not
-- queried independently -- normalizing them would just add joins for no
-- benefit here.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assigned_to text not null default '',
  status text not null default 'todo' check (status in ('todo', 'in-progress', 'done')),
  checklist jsonb not null default '[]',
  history jsonb not null default '[]',
  comments jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now()
);

create table if not exists public.eod_reports (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  author_name text,
  date date not null,
  did_today text not null,
  next_up text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author, date)
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  target text not null,
  at timestamptz not null default now()
);
create index if not exists activity_events_at_idx on public.activity_events (at desc);

-- New projects no longer auto-expose tables to the API roles; RLS alone
-- isn't enough, base privileges must be granted explicitly too.
grant select, insert, update, delete on public.tasks to authenticated, service_role;
grant select, insert, update, delete on public.eod_reports to authenticated, service_role;
grant select, insert, update, delete on public.activity_events to authenticated, service_role;

alter table public.tasks enable row level security;
alter table public.eod_reports enable row level security;
alter table public.activity_events enable row level security;

-- Internal tool: any signed-in user can read/write everything, same as the
-- JSON-file stores had no per-user access control.
create policy "authenticated full access" on public.tasks
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.eod_reports
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.activity_events
  for all to authenticated using (true) with check (true);
