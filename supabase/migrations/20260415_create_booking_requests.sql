create extension if not exists pgcrypto;

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  event_date date not null,
  event_type text not null,
  venue text,
  city text,
  guest_count int,
  budget text,
  message text,
  status text not null default 'new'
);

create index if not exists booking_requests_created_at_idx
  on public.booking_requests (created_at desc);

create index if not exists booking_requests_status_idx
  on public.booking_requests (status);

alter table public.booking_requests enable row level security;

drop policy if exists "Guests can create booking requests" on public.booking_requests;
create policy "Guests can create booking requests"
  on public.booking_requests
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Authenticated users can read booking requests" on public.booking_requests;
create policy "Authenticated users can read booking requests"
  on public.booking_requests
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can update booking requests" on public.booking_requests;
create policy "Authenticated users can update booking requests"
  on public.booking_requests
  for update
  to authenticated
  using (true)
  with check (true);
