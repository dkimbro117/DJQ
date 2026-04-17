alter table public.song_requests
  add column if not exists set_phase text;

create index if not exists song_requests_set_phase_idx
  on public.song_requests (set_phase);
