drop policy if exists "Authenticated users can manage dj sessions" on public.dj_sessions;

drop policy if exists "Users can read dj sessions" on public.dj_sessions;
create policy "Users can read dj sessions"
  on public.dj_sessions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can insert dj sessions" on public.dj_sessions;
create policy "Users can insert dj sessions"
  on public.dj_sessions
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update dj sessions" on public.dj_sessions;
create policy "Users can update dj sessions"
  on public.dj_sessions
  for update
  to anon, authenticated
  using (true)
  with check (true);
