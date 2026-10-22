-- Smart Campus Shuttle: operator and administrator dashboards (Phase 6)
--
-- * Operators may read the bookings on the shuttle assigned to them, so the
--   operator console can show today's passengers.
-- * Administrators may change roles and shuttle settings, only through the
--   functions below, which check the caller and keep the data consistent.

create or replace function public.current_user_assigned_shuttle()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select assigned_shuttle_id from public.profiles where id = auth.uid() and role = 'operator'
$$;

create policy "Operators can read bookings on their shuttle" on public.bookings
  for select to authenticated using (shuttle_id = public.current_user_assigned_shuttle());

-- Change a user's role. Operators must be given a shuttle; other roles never have one.
-- Administrators cannot remove their own administrator role, so nobody locks themselves out.
create or replace function public.admin_update_user(p_user_id uuid, p_role text, p_assigned_shuttle_id text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_shuttle text := case when p_role = 'operator' then p_assigned_shuttle_id else null end;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sign in as an administrator.', hint = 'not_signed_in';
  end if;
  if public.current_user_role() is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'Only administrators can do this.', hint = 'forbidden';
  end if;
  if p_role is null or p_role not in ('student', 'operator', 'admin') then
    raise exception using errcode = '22023', message = 'Choose student, operator or administrator.', hint = 'invalid_input';
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception using errcode = '22023', message = 'You cannot remove your own administrator role.',
      hint = 'cannot_demote_self';
  end if;
  if p_role = 'operator' and not exists (select 1 from public.shuttles where id = v_shuttle) then
    raise exception using errcode = '22023', message = 'Choose the shuttle this operator will run.', hint = 'invalid_input';
  end if;

  update public.profiles
     set role = p_role, assigned_shuttle_id = v_shuttle, updated_at = now()
   where id = p_user_id
  returning * into v_profile;
  if not found then
    raise exception using errcode = 'P0002', message = 'That account could not be found.', hint = 'not_found';
  end if;
  return v_profile;
end;
$$;

-- Rename a shuttle or change its seats. Seats cannot go below the number already booked.
create or replace function public.admin_update_shuttle(p_shuttle_id text, p_name text, p_capacity integer)
returns public.shuttles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shuttle public.shuttles;
  v_clock public.shuttle_clocks;
  v_in_use integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sign in as an administrator.', hint = 'not_signed_in';
  end if;
  if public.current_user_role() is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'Only administrators can do this.', hint = 'forbidden';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'Enter a shuttle name of up to 80 characters.', hint = 'invalid_input';
  end if;
  if p_capacity is null or p_capacity not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Seats must be a whole number from 1 to 100.', hint = 'invalid_input';
  end if;

  -- Same lock as book_seat, so no booking can slip in while the capacity changes.
  select * into v_shuttle from public.shuttles where id = p_shuttle_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'That shuttle does not exist.', hint = 'not_found';
  end if;

  select * into v_clock from public.shuttle_clocks where shuttle_id = p_shuttle_id;
  select count(*) into v_in_use
    from public.bookings
   where shuttle_id = p_shuttle_id and status = 'confirmed' and generation = v_clock.generation
     and dropoff_elapsed > public.sim_elapsed(v_clock);
  if p_capacity < v_in_use then
    raise exception using errcode = '22023',
      message = format('%s already booked on this shuttle, so it needs at least %s.',
        case when v_in_use = 1 then '1 seat is' else v_in_use || ' seats are' end, v_in_use),
      hint = 'capacity_below_use';
  end if;

  update public.shuttles
     set name = trim(p_name), capacity = p_capacity, seat_version = seat_version + 1, updated_at = now()
   where id = p_shuttle_id
  returning * into v_shuttle;
  return v_shuttle;
end;
$$;

revoke execute on function public.current_user_assigned_shuttle() from public;
revoke execute on function public.admin_update_user(uuid, text, text) from public;
revoke execute on function public.admin_update_shuttle(text, text, integer) from public;
grant execute on function public.current_user_assigned_shuttle() to authenticated;
grant execute on function public.admin_update_user(uuid, text, text) to authenticated;
grant execute on function public.admin_update_shuttle(text, text, integer) to authenticated;
