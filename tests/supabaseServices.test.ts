import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { AuthError } from '../src/services/authService.ts'
import { BookingError } from '../src/services/bookingService.ts'
import { AdminError } from '../src/services/adminService.ts'
import { createSupabaseAdminService } from '../src/services/supabaseAdminService.ts'
import { createSupabaseAuthService } from '../src/services/supabaseAuthService.ts'
import { createSupabaseBookingService } from '../src/services/supabaseBookingService.ts'
import { createSupabaseFleetService } from '../src/services/supabaseFleetService.ts'
import {
  parseSimState,
  rowToBooking,
  rowToClock,
  toAuthError,
  toBookingError,
  toControlResult,
  type BookingRow,
} from '../src/services/supabaseMappers.ts'
import { createSupabaseSimulationService } from '../src/services/supabaseSimulationService.ts'

const bookingRow: BookingRow = {
  id: 'b1',
  code: 'SCS-ABCDEF',
  user_id: 'u1',
  passenger_name: 'Asha Rao',
  shuttle_id: 'sh-01',
  pickup_stop_id: 'main-gate',
  destination_stop_id: 'central-library',
  status: 'confirmed',
  generation: 0,
  pickup_arrival_elapsed: '0',
  pickup_departure_elapsed: '15.000',
  dropoff_elapsed: 134.2,
  created_at: '2026-10-21T10:00:00Z',
  cancelled_at: null,
}

/** A very small stand-in for the Supabase client, recording what the app asks for. */
function fakeClient(options: {
  session?: { user: { id: string } } | null
  rpc?: (name: string, args: unknown) => { data: unknown; error: unknown }
  table?: { data: unknown; error: unknown }
  signUp?: { data: { session: unknown; user: unknown }; error: unknown }
  signIn?: { data: { user: unknown }; error: unknown }
}) {
  const rpc = vi.fn(async (name: string, args?: unknown) =>
    options.rpc ? options.rpc(name, args) : { data: null, error: null },
  )
  const query = {
    select: () => query,
    eq: vi.fn(() => query),
    order: () => Promise.resolve(options.table ?? { data: [], error: null }),
    single: () => Promise.resolve(options.table ?? { data: null, error: null }),
    // Lets a query be awaited without .order() or .single(), like the real client.
    then: (resolve: (value: unknown) => void) => resolve(options.table ?? { data: [], error: null }),
  }
  const channel = { on: () => channel, subscribe: () => channel }
  const client = {
    auth: {
      getSession: async () => ({ data: { session: options.session ?? null } }),
      signInWithPassword: vi.fn(async () => options.signIn ?? { data: { user: null }, error: { message: 'x' } }),
      signUp: vi.fn(async () => options.signUp ?? { data: { session: null, user: null }, error: null }),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => query),
    rpc,
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
  }
  return { client: client as unknown as SupabaseClient, raw: client, query }
}

describe('row mappers', () => {
  it('turns a booking row into a booking, including numbers sent as text', () => {
    const booking = rowToBooking(bookingRow)
    expect(booking).toMatchObject({
      code: 'SCS-ABCDEF',
      userId: 'u1',
      routeId: 'campus-loop',
      direction: 'clockwise',
      pickupDepartureElapsed: 15,
      dropoffElapsed: 134.2,
    })
  })

  it('reads simulation clocks and the server time', () => {
    const state = parseSimState({
      server_time_ms: 5000,
      clocks: {
        'sh-01': { runState: 'paused', speed: 2, baseElapsed: '12.5', baseTimeMs: 4000, generation: 3 },
        'sh-02': { runState: 'broken', speed: 2, baseElapsed: 0, baseTimeMs: 0, generation: 0 },
      },
    })
    expect(state.serverTimeMs).toBe(5000)
    expect(state.clocks['sh-01']).toEqual({
      runState: 'paused',
      speed: 2,
      baseElapsed: 12.5,
      baseTimeMs: 4000,
      generation: 3,
    })
    // Damaged rows are skipped.
    expect(state.clocks['sh-02']).toBeUndefined()
  })

  it('reads a clock row from the database', () => {
    const clock = rowToClock({
      shuttle_id: 'sh-01',
      run_state: 'running',
      speed: 5,
      base_elapsed: '3',
      base_time: '1970-01-01T00:00:10Z',
      generation: 1,
    })
    expect(clock).toEqual({ runState: 'running', speed: 5, baseElapsed: 3, baseTimeMs: 10_000, generation: 1 })
  })
})

describe('error messages', () => {
  it('keeps the database message for known booking errors', () => {
    const error = toBookingError({
      message: 'SH-01 is full: all 20 seats are booked. Try another shuttle.',
      hint: 'full',
    })
    expect(error).toBeInstanceOf(BookingError)
    expect(error.code).toBe('full')
    expect(error.message).toContain('SH-01 is full')
  })

  it('hides technical errors behind a friendly message', () => {
    const error = toBookingError({ message: 'TypeError: Failed to fetch' })
    expect(error.code).toBe('unavailable')
    expect(error.message).not.toContain('TypeError')
  })

  it('reports control errors', () => {
    expect(toControlResult(null)).toEqual({ ok: true })
    expect(
      toControlResult({ message: 'You can only control the shuttle assigned to you.', hint: 'forbidden' }),
    ).toEqual({
      ok: false,
      message: 'You can only control the shuttle assigned to you.',
    })
  })

  it('maps Supabase sign-in errors', () => {
    expect(toAuthError({ message: 'Invalid login credentials', code: 'invalid_credentials' }).code).toBe(
      'invalid_credentials',
    )
    expect(toAuthError({ message: 'Email not confirmed' }).code).toBe('email_not_confirmed')
    expect(toAuthError({ message: 'User already registered' }).code).toBe('email_taken')
    expect(toAuthError({ message: 'Network down' }).code).toBe('unavailable')
  })
})

describe('Supabase auth service', () => {
  it('takes the role from the profiles table', async () => {
    const { client } = fakeClient({
      session: { user: { id: 'u1' } },
      table: {
        data: { id: 'u1', full_name: 'Ravi Kumar', email: 'r@x.test', role: 'operator', assigned_shuttle_id: 'sh-01' },
        error: null,
      },
    })
    const user = await createSupabaseAuthService(client).getCurrentUser()
    expect(user).toEqual({
      id: 'u1',
      name: 'Ravi Kumar',
      email: 'r@x.test',
      role: 'operator',
      assignedShuttleId: 'sh-01',
    })
  })

  it('sends only the name at sign-up, never a role', async () => {
    const { client, raw } = fakeClient({})
    const service = createSupabaseAuthService(client)
    await expect(
      service.signUp({ name: 'Kiran Das', email: 'Kiran@X.test', password: 'shuttle123' }),
    ).rejects.toMatchObject({
      code: 'confirmation_required',
    })
    expect(raw.auth.signUp).toHaveBeenCalledWith({
      email: 'kiran@x.test',
      password: 'shuttle123',
      options: { data: { full_name: 'Kiran Das' }, emailRedirectTo: `${window.location.origin}/login` },
    })
  })

  it('reports a wrong password clearly', async () => {
    const { client } = fakeClient({ signIn: { data: { user: null }, error: { message: 'Invalid login credentials' } } })
    await expect(createSupabaseAuthService(client).signIn('a@x.test', 'wrong-pass')).rejects.toBeInstanceOf(AuthError)
  })
})

describe('Supabase booking service', () => {
  it('books through the secure book_seat function', async () => {
    const { client, raw } = fakeClient({ rpc: () => ({ data: bookingRow, error: null }) })
    const booking = await createSupabaseBookingService(client).createBooking({
      shuttleId: 'sh-01',
      pickupStopId: 'main-gate',
      destinationStopId: 'central-library',
    })
    expect(raw.rpc).toHaveBeenCalledWith('book_seat', {
      p_shuttle_id: 'sh-01',
      p_pickup_stop_id: 'main-gate',
      p_destination_stop_id: 'central-library',
    })
    expect(booking.code).toBe('SCS-ABCDEF')
  })

  it('passes on the reason a booking was refused', async () => {
    const { client } = fakeClient({
      rpc: () => ({
        data: null,
        error: { message: 'SH-01 has already left Academic Block on this run.', hint: 'pickup_passed' },
      }),
    })
    await expect(
      createSupabaseBookingService(client).createBooking({
        shuttleId: 'sh-01',
        pickupStopId: 'academic-block',
        destinationStopId: 'boys-hostel',
      }),
    ).rejects.toMatchObject({ code: 'pickup_passed', message: 'SH-01 has already left Academic Block on this run.' })
  })

  it('cancels through cancel_booking', async () => {
    const { client, raw } = fakeClient({ rpc: () => ({ data: [{ ...bookingRow, status: 'cancelled' }], error: null }) })
    const booking = await createSupabaseBookingService(client).cancelBooking('b1')
    expect(raw.rpc).toHaveBeenCalledWith('cancel_booking', { p_booking_id: 'b1' })
    expect(booking.status).toBe('cancelled')
  })

  it("reads only the signed-in student's bookings", async () => {
    const { client, query } = fakeClient({
      session: { user: { id: 'u1' } },
      table: { data: [bookingRow], error: null },
    })
    const mine = await createSupabaseBookingService(client).listMyBookings()
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(mine).toHaveLength(1)
  })

  it('needs a signed-in user to read bookings', async () => {
    const { client } = fakeClient({ session: null })
    await expect(createSupabaseBookingService(client).listMyBookings()).rejects.toMatchObject({ code: 'not_signed_in' })
  })
})

describe('Supabase simulation service', () => {
  it('lines up with the server clock', async () => {
    const serverAhead = 60_000
    const { client } = fakeClient({
      rpc: () => ({ data: { server_time_ms: Date.now() + serverAhead, clocks: {} }, error: null }),
    })
    const service = createSupabaseSimulationService(client)
    expect(service.peekClocks()).toBeNull()
    await service.loadClocks()
    expect(service.now() - Date.now()).toBeGreaterThan(serverAhead - 1000)
  })

  it('sends control actions to control_shuttle, letting the server check permissions', async () => {
    const { client, raw } = fakeClient({
      rpc: (name) =>
        name === 'control_shuttle'
          ? { data: null, error: { message: 'You can only control the shuttle assigned to you.', hint: 'forbidden' } }
          : { data: { server_time_ms: Date.now(), clocks: {} }, error: null },
    })
    const result = await createSupabaseSimulationService(client).control(null, 'sh-02', { type: 'speed', speed: 5 })
    expect(raw.rpc).toHaveBeenCalledWith('control_shuttle', { p_shuttle_id: 'sh-02', p_action: 'speed', p_speed: 5 })
    expect(result).toEqual({ ok: false, message: 'You can only control the shuttle assigned to you.' })
  })
})

describe('Supabase realtime channels', () => {
  it('uses a new channel name for every subscription, so a quick remount does not reuse a subscribed channel', () => {
    const { client, raw } = fakeClient({})
    const simulation = createSupabaseSimulationService(client)
    const bookings = createSupabaseBookingService(client)

    simulation.subscribe(() => undefined)()
    simulation.subscribe(() => undefined)()
    bookings.subscribe(() => undefined)()
    bookings.subscribe(() => undefined)()

    const names = raw.channel.mock.calls.map((call) => (call as unknown[])[0])
    expect(new Set(names).size).toBe(names.length)
    expect(raw.removeChannel).toHaveBeenCalledTimes(4)
  })
})

describe('Supabase admin service', () => {
  const profile = {
    id: 'u1',
    full_name: 'Asha Rao',
    email: 'asha@x.test',
    role: 'operator',
    assigned_shuttle_id: 'sh-02',
  }

  it('reads accounts from profiles, where row level security limits who sees them', async () => {
    const { client, raw } = fakeClient({ table: { data: [profile], error: null } })
    const users = await createSupabaseAdminService(client).listUsers()
    expect(raw.from).toHaveBeenCalledWith('profiles')
    expect(users).toEqual([
      { id: 'u1', name: 'Asha Rao', email: 'asha@x.test', role: 'operator', assignedShuttleId: 'sh-02' },
    ])
  })

  it('changes roles through admin_update_user, sending a shuttle only for operators', async () => {
    const { client, raw } = fakeClient({ rpc: () => ({ data: [profile], error: null }) })
    const admin = createSupabaseAdminService(client)
    expect(await admin.updateUser('u1', { role: 'operator', assignedShuttleId: 'sh-02' })).toMatchObject({
      role: 'operator',
      assignedShuttleId: 'sh-02',
    })
    await admin.updateUser('u1', { role: 'student', assignedShuttleId: 'sh-02' })
    expect(raw.rpc).toHaveBeenLastCalledWith('admin_update_user', {
      p_user_id: 'u1',
      p_role: 'student',
      p_assigned_shuttle_id: null,
    })
  })

  it('changes shuttles through admin_update_shuttle and passes on refusals', async () => {
    const { client, raw } = fakeClient({
      rpc: () => ({ data: { name: 'Library Express', capacity: '12' }, error: null }),
    })
    expect(
      await createSupabaseAdminService(client).updateShuttle('sh-01', { name: ' Library Express ', capacity: 12 }),
    ).toEqual({
      name: 'Library Express',
      capacity: 12,
    })
    expect(raw.rpc).toHaveBeenCalledWith('admin_update_shuttle', {
      p_shuttle_id: 'sh-01',
      p_name: 'Library Express',
      p_capacity: 12,
    })

    const refusing = fakeClient({
      rpc: () => ({ data: null, error: { message: '2 seats are already booked…', hint: 'capacity_below_use' } }),
    })
    await expect(
      createSupabaseAdminService(refusing.client).updateShuttle('sh-01', { name: 'A', capacity: 1 }),
    ).rejects.toMatchObject({ code: 'capacity_below_use', message: '2 seats are already booked…' })
  })

  it('starts a fresh demo through admin_reset_demo', async () => {
    const { client, raw } = fakeClient({ rpc: () => ({ data: 3, error: null }) })
    expect(await createSupabaseAdminService(client).resetDemo()).toEqual({ removedBookings: 3 })
    expect(raw.rpc).toHaveBeenCalledWith('admin_reset_demo')

    const refusing = fakeClient({
      rpc: () => ({ data: null, error: { message: 'Only administrators can do this.', hint: 'forbidden' } }),
    })
    const failure = await createSupabaseAdminService(refusing.client)
      .resetDemo()
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AdminError)
    expect(failure).toMatchObject({ code: 'forbidden' })
  })
})

describe('Supabase fleet service', () => {
  it('reads shuttle names and seats, including seats sent as text', async () => {
    const { client } = fakeClient({
      table: { data: [{ id: 'sh-01', name: 'Loop Shuttle A', capacity: '20' }], error: null },
    })
    const fleet = createSupabaseFleetService(client)
    expect(fleet.peekSettings()).toBeNull()
    expect(await fleet.loadSettings()).toEqual({ 'sh-01': { name: 'Loop Shuttle A', capacity: 20 } })
    expect(fleet.peekSettings()).toEqual({ 'sh-01': { name: 'Loop Shuttle A', capacity: 20 } })
  })

  it('reports a failed read and cleans up its subscription', async () => {
    const { client, raw } = fakeClient({ table: { data: null, error: { message: 'offline' } } })
    const fleet = createSupabaseFleetService(client)
    await expect(fleet.loadSettings()).rejects.toThrow('offline')
    fleet.subscribe(() => undefined)()
    expect(raw.removeChannel).toHaveBeenCalledTimes(1)
  })
})
