alter table public.song_requests
  add column if not exists energy text,
  add column if not exists genre text,
  add column if not exists bpm_range text,
  add column if not exists played boolean not null default false,
  add column if not exists played_at timestamptz,
  add column if not exists queue_position bigint;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'song_requests'
      and column_name = 'created_at'
  ) then
    update public.song_requests
    set queue_position = coalesce(
      queue_position,
      floor(extract(epoch from created_at) * 1000)::bigint
    );
  else
    update public.song_requests
    set queue_position = coalesce(queue_position, floor(extract(epoch from now()) * 1000)::bigint);
  end if;
end $$;

alter table public.song_requests
  alter column queue_position set not null;

create index if not exists song_requests_queue_position_idx
  on public.song_requests (played, queue_position);

create index if not exists song_requests_played_at_idx
  on public.song_requests (played, played_at desc);
