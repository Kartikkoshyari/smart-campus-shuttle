-- Smart Campus Shuttle: Row Level Security, permissions and realtime
--
-- The browser uses the public "publishable" (anon) key, so everything below
-- assumes the person using the app may try anything. Rules:
-- * Anyone may READ the network: routes, stops, shuttles, timetables, clocks.
-- * Signed-in people may read their OWN profile and their OWN bookings.
-- * Administrators may read every profile and every booking.
-- * Nobody may write to any table directly. Bookings, cancellations and
--   simulation controls go through the functions in the previous migration.

alter table public.routes enable row level security;
alter table public.stops enable row level security;
alter table public.route_stops enable row level security;
alter table public.shuttles enable row level security;
alter table public.shuttle_visits enable row level security;
alter table public.shuttle_clocks enable row level security;
alter table public.profiles enable row level security;
alter table public.bookings enable row level security;

-- Public network data ----------------------------------------------------------

create policy "Anyone can read routes" on public.routes for select to anon, authenticated using (true);
create policy "Anyone can read stops" on public.stops for select to anon, authenticated using (true);
create policy "Anyone can read route stops" on public.route_stops for select to anon, authenticated using (true);
create policy "Anyone can read shuttles" on public.shuttles for select to anon, authenticated using (true);
create policy "Anyone can read timetables" on public.shuttle_visits for select to anon, authenticated using (true);
create policy "Anyone can read simulation clocks" on public.shuttle_clocks for select to anon, authenticated using (true);

-- Profiles -------------------------------------------------------------------------

create policy "People can read their own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "Administrators can read every profile" on public.profiles
  for select to authenticated using (public.current_user_role() = 'admin');

-- Bookings -------------------------------------------------------------------------

create policy "Students can read their own bookings" on public.bookings
  for select to authenticated using (user_id = auth.uid());

create policy "Administrators can read every booking" on public.bookings
  for select to authenticated using (public.current_user_role() = 'admin');

-- Table permissions ------------------------------------------------------------------
-- Supabase grants write access to these roles by default. Taking it away means
-- that even a missing policy can never let the browser change data directly.

revoke all on all tables in schema public from anon, authenticated;
grant select on public.routes, public.stops, public.route_stops, public.shuttles, public.shuttle_visits,
  public.shuttle_clocks to anon, authenticated;
grant select on public.profiles, public.bookings to authenticated;

-- Function permissions ---------------------------------------------------------------

revoke execute on function public.current_user_role() from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.control_shuttle(text, text, integer) from public;
revoke execute on function public.book_seat(text, text, text) from public;
revoke execute on function public.cancel_booking(uuid) from public;
revoke execute on function public.get_seat_holds() from public;
revoke execute on function public.get_sim_state() from public;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.control_shuttle(text, text, integer) to authenticated;
grant execute on function public.book_seat(text, text, text) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.get_seat_holds() to anon, authenticated;
grant execute on function public.get_sim_state() to anon, authenticated;
grant execute on function public.sim_elapsed(public.shuttle_clocks, timestamptz) to anon, authenticated;

-- Realtime ---------------------------------------------------------------------------
-- Clock changes (pause, reset...) and seat changes reach every open screen at once.
-- Realtime respects the policies above, so students only receive their own bookings.

alter publication supabase_realtime add table public.shuttle_clocks, public.shuttles, public.bookings;
