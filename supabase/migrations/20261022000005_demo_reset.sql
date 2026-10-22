-- Smart Campus Shuttle: "Start a fresh demo" (Phase 8)
--
-- Lets an administrator put the demo back to a clean start before presenting:
-- every booking is removed and every shuttle restarts its run at 1x speed.
-- Accounts, roles, shuttle names and seat numbers are kept.
-- (To restore the original shuttle names and seats as well, run seed.sql again.)

create or replace function public.admin_reset_demo()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sign in as an administrator.', hint = 'not_signed_in';
  end if;
  if public.current_user_role() is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'Only administrators can do this.', hint = 'forbidden';
  end if;

  -- Lock every shuttle first, in a fixed order, so no booking can slip in halfway.
  perform 1 from public.shuttles order by id for update;

  delete from public.bookings;
  get diagnostics v_removed = row_count;

  update public.shuttle_clocks
     set run_state = 'running', speed = 1, base_elapsed = 0, base_time = now(),
         generation = generation + 1, updated_by = auth.uid(), updated_at = now();

  -- Tells every open screen to reload seats and bookings.
  update public.shuttles set seat_version = seat_version + 1, updated_at = now();

  return v_removed;
end;
$$;

revoke execute on function public.admin_reset_demo() from public;
grant execute on function public.admin_reset_demo() to authenticated;
