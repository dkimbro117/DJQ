alter table public.song_requests
  add column if not exists recognized boolean,
  add column if not exists confidence text,
  add column if not exists content_flag text;

create index if not exists song_requests_confidence_idx
  on public.song_requests (confidence);
