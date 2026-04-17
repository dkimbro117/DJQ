alter table public.dj_sessions
  add column if not exists is_paused boolean not null default false,
  add column if not exists paused_at timestamptz,
  add column if not exists total_paused_seconds integer not null default 0;
