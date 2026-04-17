create table if not exists public.dj_sessions (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  crowd_age text not null,
  anchor_genres text[] not null,
  hard_avoids text[] not null default '{}',
  set_duration_minutes int not null,
  start_time timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists dj_sessions_created_at_idx
  on public.dj_sessions (created_at desc);

alter table public.dj_sessions enable row level security;

drop policy if exists "Authenticated users can manage dj sessions" on public.dj_sessions;
create policy "Authenticated users can manage dj sessions"
  on public.dj_sessions
  for all
  to authenticated
  using (true)
  with check (true);
