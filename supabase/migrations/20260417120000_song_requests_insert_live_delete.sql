-- Guests may insert song requests only while a DJ session is live (wall clock, duration window).
-- DJs (anon client) may delete requests for queue management.

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'song_requests'
      and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.song_requests', r.policyname);
  end loop;
end $$;

create policy "song_requests_insert_while_dj_session_live"
  on public.song_requests
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.dj_sessions s
      where now() >= s.start_time
        and now()
          < s.start_time
            + ((coalesce(s.set_duration_minutes, 0)::double precision + 180.0) * interval '1 minute')
    )
  );

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'song_requests'
      and cmd = 'DELETE'
  loop
    execute format('drop policy if exists %I on public.song_requests', r.policyname);
  end loop;
end $$;

create policy "song_requests_delete_anon_authenticated"
  on public.song_requests
  for delete
  to anon, authenticated
  using (true);
