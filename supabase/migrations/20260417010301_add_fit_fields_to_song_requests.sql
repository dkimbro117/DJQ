alter table public.song_requests
  add column if not exists fit text,
  add column if not exists fit_reason text;

create index if not exists song_requests_fit_idx
  on public.song_requests (fit);
