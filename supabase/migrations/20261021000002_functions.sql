-- Smart Campus Shuttle: secure database functions
--
-- Every change to bookings and simulation clocks goes through these
-- functions. They run with the table owner's rights (SECURITY DEFINER), check
-- who is calling with auth.uid(), and lock rows so that two requests can
-- never both take the last seat. Errors carry a short code in HINT, which the
-- app turns into a friendly message.

-- Who is calling? ------------------------------------------------------------

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- New accounts ---------------------------------------------------------------

-- Creates a profile for every new account. The role is always 'student';
-- anything the browser sends in the sign-up metadata about roles is ignored.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, 'student'), '@', 1)),
    coalesce(new.email, ''),
    'student'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Simulation clock -----------------------------------------------------------

-- Simulated seconds travelled at a given moment (same maths as src/simulator/clock.ts).
create or replace function public.sim_elapsed(clock public.shuttle_clocks, at_time timestamptz default now())
returns numeric
language sql
stable
as $$
  select case
    when clock.run_state = 'running'
      then clock.base_elapsed + greatest(0, extract(epoch from (at_time - clock.base_time)))::numeric * clock.speed
    else clock.base_elapsed
  end
$$;

-- All clocks plus the server time, so every device can line up its own clock.
create or replace function public.get_sim_state()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'server_time_ms', floor(extract(epoch from now()) * 1000),
    'clocks', coalesce(
      jsonb_object_agg(
        c.shuttle_id,
        jsonb_build_object(
          'runState', c.run_state,
          'speed', c.speed,
          'baseElapsed', c.base_elapsed,
          'baseTimeMs', floor(extract(epoch from c.base_time) * 1000),
          'generation', c.generation
        )
      ),
      '{}'::jsonb
    )
  )
  from public.shuttle_clocks c
$$;

-- Start, pause, resume, reset or change speed. Operators may control only
-- their assigned shuttle; administrators may control any shuttle.
create or replace function public.control_shuttle(p_shuttle_id text, p_action text, p_speed integer default null)
returns public.shuttle_clocks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_assigned text;
  v_clock public.shuttle_clocks;
  v_now timestamptz := now();
  v_elapsed numeric;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sign in to control a shuttle.', hint = 'not_signed_in';
  end if;

  select role, assigned_shuttle_id into v_role, v_assigned from public.profiles where id = auth.uid();
  if v_role is distinct from 'admin' and not (v_role = 'operator' and v_assigned = p_shuttle_id) then
    raise exception using errcode = '42501', message = 'You can only control the shuttle assigned to you.', hint = 'forbidden';
  end if;

  select * into v_clock from public.shuttle_clocks where shuttle_id = p_shuttle_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'That shuttle does not exist.', hint = 'unknown_shuttle';
  end if;

  v_elapsed := public.sim_elapsed(v_clock, v_now);

  case p_action
    when 'start' then
      if v_clock.run_state = 'idle' then
        v_clock.run_state := 'running';
        v_clock.base_time := v_now;
      end if;
    when 'pause' then
      if v_clock.run_state = 'running' then
        v_clock.run_state := 'paused';
        v_clock.base_elapsed := v_elapsed;
        v_clock.base_time := v_now;
      end if;
    when 'resume' then
      if v_clock.run_state = 'paused' then
        v_clock.run_state := 'running';
        v_clock.base_time := v_now;
      end if;
    when 'reset' then
      v_clock.run_state := 'idle';
      v_clock.base_elapsed := 0;
      v_clock.base_time := v_now;
      v_clock.generation := v_clock.generation + 1;
    when 'speed' then
      if p_speed is null or p_speed not in (1, 2, 5) then
        raise exception using errcode = '22023', message = 'Speed must be 1x, 2x or 5x.', hint = 'invalid_action';
      end if;
      if v_clock.speed <> p_speed then
        v_clock.base_elapsed := v_elapsed;
        v_clock.base_time := v_now;
        v_clock.speed := p_speed;
      end if;
    else
      raise exception using errcode = '22023', message = 'That simulation action is not recognised.', hint = 'invalid_action';
  end case;

  update public.shuttle_clocks
     set run_state = v_clock.run_state,
         speed = v_clock.speed,
         base_elapsed = v_clock.base_elapsed,
         base_time = v_clock.base_time,
         generation = v_clock.generation,
         updated_by = auth.uid(),
         updated_at = v_now
   where shuttle_id = p_shuttle_id
  returning * into v_clock;

  -- A reset ends open bookings, which frees their seats.
  if p_action = 'reset' then
    update public.shuttles set seat_version = seat_version + 1, updated_at = v_now where id = p_shuttle_id;
  end if;

  return v_clock;
end;
$$;

-- Bookings -------------------------------------------------------------------

-- Books one seat for the signed-in student on the shuttle's current run.
-- Applies the same rules as src/booking/journey.ts, inside one transaction.
create or replace function public.book_seat(p_shuttle_id text, p_pickup_stop_id text, p_destination_stop_id text)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_shuttle public.shuttles;
  v_clock public.shuttle_clocks;
  v_elapsed numeric;
  v_t numeric;
  v_run_start numeric;
  v_last_index integer;
  v_pickup public.shuttle_visits;
  v_destination public.shuttle_visits;
  v_active integer;
  v_existing text;
  v_code text;
  v_booking public.bookings;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sign in to book a seat.', hint = 'not_signed_in';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.role is distinct from 'student' then
    raise exception using errcode = '42501', message = 'Only student accounts can book seats.', hint = 'students_only';
  end if;

  -- Lock the shuttle. Other bookings for this shuttle wait here until this
  -- transaction ends, so the seat count below cannot change underneath us.
  select * into v_shuttle from public.shuttles where id = p_shuttle_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'That shuttle does not exist.', hint = 'unknown_shuttle';
  end if;

  if coalesce(p_pickup_stop_id, '') = '' or coalesce(p_destination_stop_id, '') = '' then
    raise exception using errcode = '22023', message = 'Choose a pickup stop and a destination.', hint = 'missing_stop';
  end if;
  if p_pickup_stop_id = p_destination_stop_id then
    raise exception using errcode = '22023', message = 'Pickup and destination must be different stops.', hint = 'same_stop';
  end if;
  if not exists (select 1 from public.stops where id = p_pickup_stop_id)
     or not exists (select 1 from public.stops where id = p_destination_stop_id) then
    raise exception using errcode = '22023', message = 'That stop is not in the campus network.', hint = 'unknown_stop';
  end if;
  if not exists (select 1 from public.route_stops where route_id = v_shuttle.route_id and stop_id = p_pickup_stop_id) then
    raise exception using errcode = '22023',
      message = format('%s does not stop at %s.', v_shuttle.code, (select name from public.stops where id = p_pickup_stop_id)),
      hint = 'not_served';
  end if;
  if not exists (select 1 from public.route_stops where route_id = v_shuttle.route_id and stop_id = p_destination_stop_id) then
    raise exception using errcode = '22023',
      message = format('%s does not stop at %s.', v_shuttle.code, (select name from public.stops where id = p_destination_stop_id)),
      hint = 'not_served';
  end if;

  -- Where is the shuttle on its current run?
  select * into v_clock from public.shuttle_clocks where shuttle_id = v_shuttle.id;
  v_elapsed := public.sim_elapsed(v_clock);
  v_t := mod(v_elapsed + v_shuttle.start_offset_seconds, v_shuttle.cycle_seconds);
  if v_t < 0 then
    v_t := v_t + v_shuttle.cycle_seconds;
  end if;
  v_run_start := v_elapsed - v_t;
  select max(visit_index) into v_last_index from public.shuttle_visits where shuttle_id = v_shuttle.id;

  -- The pickup must be a stop the shuttle has not left yet on this run.
  select * into v_pickup
    from public.shuttle_visits
   where shuttle_id = v_shuttle.id and stop_id = p_pickup_stop_id and visit_index < v_last_index and depart_at > v_t
   order by visit_index
   limit 1;
  if not found then
    raise exception using errcode = '22023',
      message = format(
        '%s has already left %s on this run. Choose a stop it has not reached yet, or try another shuttle.',
        v_shuttle.code, (select name from public.stops where id = p_pickup_stop_id)),
      hint = 'pickup_passed';
  end if;

  -- The destination must come after the pickup on this run.
  select * into v_destination
    from public.shuttle_visits
   where shuttle_id = v_shuttle.id and stop_id = p_destination_stop_id and visit_index > v_pickup.visit_index
   order by visit_index
   limit 1;
  if not found then
    raise exception using errcode = '22023',
      message = format(
        'On this run, %s does not reach %s after %s. The run ends at %s.',
        v_shuttle.code,
        (select name from public.stops where id = p_destination_stop_id),
        (select name from public.stops where id = p_pickup_stop_id),
        (select s.name from public.shuttle_visits v join public.stops s on s.id = v.stop_id
          where v.shuttle_id = v_shuttle.id and v.visit_index = v_last_index)),
      hint = 'wrong_order';
  end if;

  -- Seats in use: confirmed bookings from this run generation not yet dropped off.
  select count(*) into v_active
    from public.bookings
   where shuttle_id = v_shuttle.id and status = 'confirmed' and generation = v_clock.generation
     and dropoff_elapsed > v_elapsed;

  select code into v_existing
    from public.bookings
   where shuttle_id = v_shuttle.id and status = 'confirmed' and generation = v_clock.generation
     and dropoff_elapsed > v_elapsed and user_id = v_profile.id
   limit 1;
  if v_existing is not null then
    raise exception using errcode = '23505',
      message = format('You already have a booking on %s (%s). Cancel it before booking another journey on this shuttle.', v_shuttle.code, v_existing),
      hint = 'duplicate';
  end if;

  if v_active >= v_shuttle.capacity then
    raise exception using errcode = '53400',
      message = format('%s is full: all %s seats are booked. Try another shuttle.', v_shuttle.code, v_shuttle.capacity),
      hint = 'full';
  end if;

  -- A booking ID such as SCS-7K4P2Q that is not already in use.
  loop
    select 'SCS-' || string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1), '')
      into v_code
      from generate_series(1, 6);
    exit when not exists (select 1 from public.bookings where code = v_code);
  end loop;

  insert into public.bookings (
    code, user_id, passenger_name, shuttle_id, pickup_stop_id, destination_stop_id, status, generation,
    pickup_arrival_elapsed, pickup_departure_elapsed, dropoff_elapsed
  ) values (
    v_code, v_profile.id, v_profile.full_name, v_shuttle.id, p_pickup_stop_id, p_destination_stop_id, 'confirmed',
    v_clock.generation, v_run_start + v_pickup.arrive_at, v_run_start + v_pickup.depart_at,
    v_run_start + v_destination.arrive_at
  )
  returning * into v_booking;

  update public.shuttles set seat_version = seat_version + 1, updated_at = now() where id = v_shuttle.id;
  return v_booking;
end;
$$;

-- Cancels a booking. Students may cancel their own bookings until the shuttle
-- leaves the pickup stop; administrators may cancel any booking that is still upcoming.
create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_clock public.shuttle_clocks;
  v_elapsed numeric;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sign in to manage bookings.', hint = 'not_signed_in';
  end if;

  -- Lock the booking, so two cancel requests cannot both succeed.
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'That booking could not be found.', hint = 'not_found';
  end if;
  if v_booking.user_id <> auth.uid() and public.current_user_role() is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'You can only cancel your own bookings.', hint = 'forbidden';
  end if;
  if v_booking.status = 'cancelled' then
    raise exception using errcode = '22023', message = format('Booking %s is already cancelled.', v_booking.code),
      hint = 'already_cancelled';
  end if;

  select * into v_clock from public.shuttle_clocks where shuttle_id = v_booking.shuttle_id;
  v_elapsed := public.sim_elapsed(v_clock);
  if v_booking.generation <> v_clock.generation then
    v_reason := 'the run has ended';
  elsif v_elapsed >= v_booking.dropoff_elapsed then
    v_reason := 'the journey is complete';
  elsif v_elapsed >= v_booking.pickup_departure_elapsed then
    v_reason := 'the shuttle has already left the pickup stop';
  end if;
  if v_reason is not null then
    raise exception using errcode = '22023',
      message = format('Booking %s cannot be cancelled because %s.', v_booking.code, v_reason),
      hint = 'not_cancellable';
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now()
   where id = v_booking.id
  returning * into v_booking;

  update public.shuttles set seat_version = seat_version + 1, updated_at = now() where id = v_booking.shuttle_id;
  return v_booking;
end;
$$;

-- Seat use on every shuttle, with no personal details, so anyone can see
-- how many seats are free without seeing who booked them.
create or replace function public.get_seat_holds()
returns table (
  booking_id uuid,
  shuttle_id text,
  generation integer,
  pickup_departure_elapsed numeric,
  dropoff_elapsed numeric,
  pickup_stop_id text,
  destination_stop_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.shuttle_id, b.generation, b.pickup_departure_elapsed, b.dropoff_elapsed, b.pickup_stop_id,
         b.destination_stop_id
    from public.bookings b
    join public.shuttle_clocks c on c.shuttle_id = b.shuttle_id
   where b.status = 'confirmed'
     and b.generation = c.generation
     and b.dropoff_elapsed > public.sim_elapsed(c)
$$;
