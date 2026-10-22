// @vitest-environment node
//
// Runs the REAL migration files and seed data in an embedded PostgreSQL
// (PGlite), then checks Row Level Security and the booking functions as
// different users. No Supabase account or internet connection is needed.
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildSeedSql } from '../scripts/seedSql.ts'
import { planJourney } from '../src/booking/journey.ts'
import { getRoute, getShuttle } from '../src/data/campus.ts'
import { stopVisits } from '../src/simulator/timeline.ts'
import { getTimeline } from '../src/simulator/timetables.ts'
import stub from './db/supabaseStub.sql?raw'
import seedFile from '../supabase/seed.sql?raw'

const migrations = Object.entries(
  import.meta.glob<string>('../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, sql]) => sql)

const ids = {
  asha: '00000000-0000-4000-8000-000000000001',
  kiran: '00000000-0000-4000-8000-000000000002',
  ravi: '00000000-0000-4000-8000-000000000003',
  meera: '00000000-0000-4000-8000-000000000004',
  priya: '00000000-0000-4000-8000-000000000005',
}

let db: PGlite

/** Acts as a signed-in user (or a visitor when id is null) for the next queries. */
async function as(id: string | null) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub', '${id ?? ''}', false); set role ${id ? 'authenticated' : 'anon'};`,
  )
}

/** Back to the database owner, like the Supabase SQL editor. */
async function asOwner() {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
}

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

/** Runs SQL that should fail and returns the error's code hint and message. */
async function failure(sql: string, params: unknown[] = []): Promise<{ hint?: string; message: string }> {
  try {
    await db.query(sql, params)
  } catch (error) {
    const e = error as { hint?: string; message: string }
    return { hint: e.hint, message: e.message }
  }
  throw new Error(`Expected this SQL to fail: ${sql}`)
}

function book(pickup: string, destination: string, shuttle = 'sh-01') {
  return rows<{ code: string; id: string; dropoff_elapsed: string }>('select * from public.book_seat($1, $2, $3)', [
    shuttle,
    pickup,
    destination,
  ])
}

/** Puts a shuttle at an exact point of its run, paused, so tests are predictable. */
async function placeShuttle(shuttle: string, elapsedSeconds: number, runState = 'paused') {
  await asOwner()
  await db.query(
    `update public.shuttle_clocks set run_state = $2, base_elapsed = $3, base_time = now(), speed = 1 where shuttle_id = $1`,
    [shuttle, runState, elapsedSeconds],
  )
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(stub)
  for (const sql of migrations) await db.exec(sql)
  await db.exec(seedFile)

  // Accounts are created the way Supabase Auth creates them.
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ids.asha}', 'asha@x.test', '{"full_name": "Asha Rao"}'),
      ('${ids.kiran}', 'kiran@x.test', '{"full_name": "Kiran Das", "role": "admin"}'),
      ('${ids.ravi}', 'ravi@x.test', '{"full_name": "Ravi Kumar"}'),
      ('${ids.meera}', 'meera@x.test', '{"full_name": "Meera Iyer"}'),
      ('${ids.priya}', 'priya@x.test', '{"full_name": "Priya Nair"}');
    update public.profiles set role = 'operator', assigned_shuttle_id = 'sh-01' where id = '${ids.ravi}';
    update public.profiles set role = 'admin' where id = '${ids.meera}';
  `)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await asOwner()
  await db.exec(`
    delete from public.bookings;
    update public.shuttle_clocks set run_state = 'running', speed = 1, base_elapsed = 0, base_time = now(), generation = 0;
    update public.shuttles set capacity = case id when 'sh-01' then 20 else 14 end,
      name = case id when 'sh-01' then 'Loop Shuttle A' else 'Loop Shuttle B' end;
  `)
  // SH-01 waits at Main Gate at the start of its run.
  await placeShuttle('sh-01', 0)
})

describe('migrations and seed data', () => {
  it('seeds the stops, route and shuttles from the app data', async () => {
    expect(await rows('select id from public.stops')).toHaveLength(8)
    expect(await rows('select id from public.shuttles order by id')).toEqual([{ id: 'sh-01' }, { id: 'sh-02' }])
  })

  it('keeps supabase/seed.sql in step with the app (run `npm run db:seed` if this fails)', () => {
    expect(seedFile).toBe(buildSeedSql())
  })

  it('stores the same timetable as the app simulator', async () => {
    const visits = await rows<{ stop_id: string; arrive_at: string; depart_at: string }>(
      `select stop_id, arrive_at, depart_at from public.shuttle_visits where shuttle_id = 'sh-01' order by visit_index`,
    )
    const expected = stopVisits(getTimeline('sh-01'))
    expect(visits.map((v) => v.stop_id)).toEqual(expected.map((v) => v.stopId))
    visits.forEach((visit, i) => {
      expect(Number(visit.arrive_at)).toBeCloseTo(expected[i].arriveAt, 2)
      expect(Number(visit.depart_at)).toBeCloseTo(expected[i].departAt, 2)
    })
  })

  it('can run the seed again without errors', async () => {
    await asOwner()
    await db.exec(seedFile)
    expect(await rows('select id from public.stops')).toHaveLength(8)
  })
})

describe('sign-up and profiles', () => {
  it('creates a student profile for every new account, ignoring any role sent by the browser', async () => {
    await asOwner()
    const [kiran] = await rows<{ role: string; full_name: string }>(
      `select role, full_name from public.profiles where id = '${ids.kiran}'`,
    )
    expect(kiran).toEqual({ role: 'student', full_name: 'Kiran Das' })
  })

  it('lets people read only their own profile', async () => {
    await as(ids.asha)
    const visible = await rows<{ id: string }>('select id from public.profiles')
    expect(visible.map((p) => p.id)).toEqual([ids.asha])
  })

  it('lets administrators read every profile', async () => {
    await as(ids.meera)
    expect(await rows('select id from public.profiles')).toHaveLength(5)
  })

  it('stops students from making themselves administrators', async () => {
    await as(ids.asha)
    const error = await failure(`update public.profiles set role = 'admin' where id = '${ids.asha}'`)
    expect(error.message).toMatch(/permission denied/)
    await asOwner()
    expect((await rows(`select role from public.profiles where id = '${ids.asha}'`))[0]).toEqual({ role: 'student' })
  })

  it('hides profiles and bookings from visitors who are not signed in', async () => {
    await as(null)
    expect((await failure('select * from public.profiles')).message).toMatch(/permission denied/)
    expect((await failure('select * from public.bookings')).message).toMatch(/permission denied/)
  })

  it('lets visitors read the public network and seat use', async () => {
    await as(null)
    expect(await rows('select id from public.stops')).toHaveLength(8)
    expect(await rows('select * from public.shuttle_clocks')).toHaveLength(2)
    expect(await rows('select * from public.get_seat_holds()')).toEqual([])
    const [state] = await rows<{ get_sim_state: { clocks: Record<string, unknown> } }>('select public.get_sim_state()')
    expect(Object.keys(state.get_sim_state.clocks).sort()).toEqual(['sh-01', 'sh-02'])
  })

  it('does not let visitors book seats', async () => {
    await as(null)
    expect((await failure(`select public.book_seat('sh-01', 'main-gate', 'central-library')`)).message).toMatch(
      /permission denied/,
    )
  })
})

describe('booking seats', () => {
  it('books a seat with a unique booking ID', async () => {
    await as(ids.asha)
    const [booking] = await book('main-gate', 'central-library')
    expect(booking.code).toMatch(/^SCS-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
    const mine = await rows<{ passenger_name: string; status: string }>(
      'select passenger_name, status from public.bookings',
    )
    expect(mine).toEqual([{ passenger_name: 'Asha Rao', status: 'confirmed' }])
  })

  it('works out the same journey times as the app', async () => {
    const elapsed = 70 // SH-01 waiting at Academic Block
    await placeShuttle('sh-01', elapsed)
    await as(ids.asha)
    const [booking] = await rows<Record<string, string>>(
      `select * from public.book_seat('sh-01', 'academic-block', 'boys-hostel')`,
    )
    const expected = planJourney({
      shuttle: getShuttle('sh-01'),
      route: getRoute('campus-loop'),
      timeline: getTimeline('sh-01'),
      elapsedSeconds: elapsed,
      pickupStopId: 'academic-block',
      destinationStopId: 'boys-hostel',
    })
    expect(expected.ok).toBe(true)
    if (!expected.ok) return
    expect(Number(booking.pickup_arrival_elapsed)).toBeCloseTo(expected.plan.pickupArrivalElapsed, 2)
    expect(Number(booking.pickup_departure_elapsed)).toBeCloseTo(expected.plan.pickupDepartureElapsed, 2)
    expect(Number(booking.dropoff_elapsed)).toBeCloseTo(expected.plan.dropoffElapsed, 2)
  })

  it('refuses impossible journeys with the same reasons as the app', async () => {
    await as(ids.asha)
    expect((await failure(`select public.book_seat('sh-01', 'main-gate', 'main-gate')`)).hint).toBe('same_stop')
    expect((await failure(`select public.book_seat('sh-01', 'moon', 'main-gate')`)).hint).toBe('unknown_stop')
    expect((await failure(`select public.book_seat('sh-01', '', 'main-gate')`)).hint).toBe('missing_stop')
    expect((await failure(`select public.book_seat('sh-99', 'main-gate', 'boys-hostel')`)).hint).toBe('unknown_shuttle')

    const wrongWay = await failure(`select public.book_seat('sh-01', 'central-library', 'academic-block')`)
    expect(wrongWay.hint).toBe('wrong_order')
    expect(wrongWay.message).toBe(
      'On this run, SH-01 does not reach Academic Block after Central Library. The run ends at Main Gate.',
    )

    await placeShuttle('sh-01', 100) // SH-01 has left Academic Block
    await as(ids.asha)
    const passed = await failure(`select public.book_seat('sh-01', 'academic-block', 'boys-hostel')`)
    expect(passed.hint).toBe('pickup_passed')
    expect(passed.message).toContain('SH-01 has already left Academic Block')
  })

  it('follows the anticlockwise order for SH-02', async () => {
    await placeShuttle('sh-02', 0)
    await as(ids.asha)
    expect((await failure(`select public.book_seat('sh-02', 'girls-hostel', 'sports-complex')`)).hint).toBe(
      'wrong_order',
    )
    expect(await book('sports-complex', 'girls-hostel', 'sh-02')).toHaveLength(1)
  })

  it('only lets students book', async () => {
    await as(ids.ravi)
    expect((await failure(`select public.book_seat('sh-01', 'main-gate', 'boys-hostel')`)).hint).toBe('students_only')
    await as(ids.meera)
    expect((await failure(`select public.book_seat('sh-01', 'main-gate', 'boys-hostel')`)).hint).toBe('students_only')
  })

  it('refuses a second active booking on the same shuttle', async () => {
    await as(ids.asha)
    const [first] = await book('main-gate', 'central-library')
    const duplicate = await failure(`select public.book_seat('sh-01', 'main-gate', 'boys-hostel')`)
    expect(duplicate.hint).toBe('duplicate')
    expect(duplicate.message).toContain(first.code)
  })

  it('refuses a booking when the shuttle is full', async () => {
    await asOwner()
    await db.exec(`update public.shuttles set capacity = 2 where id = 'sh-01'`)
    await as(ids.asha)
    await book('main-gate', 'central-library')
    await as(ids.kiran)
    await book('main-gate', 'boys-hostel')
    await as(ids.priya)
    const full = await failure(`select public.book_seat('sh-01', 'main-gate', 'student-centre')`)
    expect(full.hint).toBe('full')
    expect(full.message).toBe('SH-01 is full: all 2 seats are booked. Try another shuttle.')
  })

  it('does not let anyone insert or change bookings directly', async () => {
    await as(ids.asha)
    const [booking] = await book('main-gate', 'central-library')
    expect(
      (await failure(`update public.bookings set status = 'cancelled' where id = '${booking.id}'`)).message,
    ).toMatch(/permission denied/)
    expect(
      (
        await failure(
          `insert into public.bookings (code, user_id, passenger_name, shuttle_id, pickup_stop_id, destination_stop_id, generation, pickup_arrival_elapsed, pickup_departure_elapsed, dropoff_elapsed)
           values ('SCS-AAAAAA', '${ids.asha}', 'x', 'sh-01', 'main-gate', 'central-library', 0, 0, 1, 2)`,
        )
      ).message,
    ).toMatch(/permission denied/)
    expect((await failure(`delete from public.bookings`)).message).toMatch(/permission denied/)
  })

  it('locks the shuttle while booking, so concurrent bookings take turns', async () => {
    // A real parallel test needs two database connections (see README). Here we
    // check the function takes the row lock that makes the seat count safe.
    await asOwner()
    const [source] = await rows<{ prosrc: string }>(`select prosrc from pg_proc where proname = 'book_seat'`)
    expect(source.prosrc).toMatch(/from public\.shuttles where id = p_shuttle_id for update/)
  })
})

describe('reading bookings', () => {
  it('shows students only their own bookings, and admins every booking', async () => {
    await as(ids.asha)
    await book('main-gate', 'central-library')
    await as(ids.kiran)
    await book('main-gate', 'boys-hostel')

    await as(ids.asha)
    expect(await rows('select passenger_name from public.bookings')).toEqual([{ passenger_name: 'Asha Rao' }])
    await as(ids.meera)
    expect(await rows('select id from public.bookings')).toHaveLength(2)
  })

  it('shares seat use without names or user IDs', async () => {
    await as(ids.asha)
    await book('main-gate', 'central-library')
    await as(ids.kiran)
    const holds = await rows('select * from public.get_seat_holds()')
    expect(holds).toHaveLength(1)
    expect(Object.keys(holds[0])).not.toContain('user_id')
    expect(JSON.stringify(holds)).not.toContain('Asha')
  })
})

describe('cancelling bookings', () => {
  it('cancels a booking and frees the seat', async () => {
    await as(ids.asha)
    const [booking] = await book('main-gate', 'central-library')
    const [cancelled] = await rows<{ status: string; cancelled_at: string | null }>(
      'select status, cancelled_at from public.cancel_booking($1)',
      [booking.id],
    )
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancelled_at).not.toBeNull()
    expect(await rows('select * from public.get_seat_holds()')).toEqual([])
  })

  it('refuses to cancel twice, so a seat is never released twice', async () => {
    await asOwner()
    await db.exec(`update public.shuttles set capacity = 1 where id = 'sh-01'`)
    await as(ids.asha)
    const [booking] = await book('main-gate', 'central-library')
    await rows('select public.cancel_booking($1)', [booking.id])
    await as(ids.kiran)
    await book('main-gate', 'boys-hostel') // takes the freed seat

    await as(ids.asha)
    expect((await failure('select public.cancel_booking($1)', [booking.id])).hint).toBe('already_cancelled')
    expect(await rows('select * from public.get_seat_holds()')).toHaveLength(1)
    await as(ids.priya)
    expect((await failure(`select public.book_seat('sh-01', 'main-gate', 'student-centre')`)).hint).toBe('full')
  })

  it("does not let a student cancel someone else's booking, but lets an admin", async () => {
    await as(ids.asha)
    const [booking] = await book('main-gate', 'central-library')
    await as(ids.kiran)
    expect((await failure('select public.cancel_booking($1)', [booking.id])).hint).toBe('forbidden')
    await as(ids.meera)
    expect(await rows('select public.cancel_booking($1)', [booking.id])).toHaveLength(1)
  })

  it('refuses to cancel once the shuttle has left the pickup', async () => {
    await as(ids.asha)
    const [booking] = await book('main-gate', 'central-library')
    await placeShuttle('sh-01', 20) // past the 15-second wait at Main Gate
    await as(ids.asha)
    const late = await failure('select public.cancel_booking($1)', [booking.id])
    expect(late.hint).toBe('not_cancellable')
    expect(late.message).toContain('the shuttle has already left the pickup stop')
  })

  it('frees the seat automatically after drop-off', async () => {
    await as(ids.asha)
    const [booking] = await book('main-gate', 'central-library')
    await placeShuttle('sh-01', Number(booking.dropoff_elapsed) + 1)
    await as(ids.asha)
    expect(await rows('select * from public.get_seat_holds()')).toEqual([])
  })
})

describe('simulation controls', () => {
  it('lets the assigned operator pause and resume their shuttle', async () => {
    await placeShuttle('sh-01', 30, 'running')
    await as(ids.ravi)
    const [paused] = await rows<{ run_state: string }>(`select run_state from public.control_shuttle('sh-01', 'pause')`)
    expect(paused.run_state).toBe('paused')
    const [resumed] = await rows<{ run_state: string }>(
      `select run_state from public.control_shuttle('sh-01', 'resume')`,
    )
    expect(resumed.run_state).toBe('running')
  })

  it("refuses an operator control of another operator's shuttle", async () => {
    await as(ids.ravi)
    expect((await failure(`select public.control_shuttle('sh-02', 'pause')`)).hint).toBe('forbidden')
  })

  it('refuses students and visitors', async () => {
    await as(ids.asha)
    expect((await failure(`select public.control_shuttle('sh-01', 'pause')`)).hint).toBe('forbidden')
    await as(null)
    expect((await failure(`select public.control_shuttle('sh-01', 'pause')`)).message).toMatch(/permission denied/)
  })

  it('lets admins control any shuttle and change speed', async () => {
    await as(ids.meera)
    const [fast] = await rows<{ speed: number }>(`select speed from public.control_shuttle('sh-02', 'speed', 5)`)
    expect(fast.speed).toBe(5)
    expect((await failure(`select public.control_shuttle('sh-02', 'speed', 3)`)).hint).toBe('invalid_action')
    expect((await failure(`select public.control_shuttle('sh-02', 'fly')`)).hint).toBe('invalid_action')
  })

  it('reset starts a new run generation and ends open bookings', async () => {
    await as(ids.asha)
    await book('main-gate', 'central-library')
    await as(ids.meera)
    const [reset] = await rows<{ run_state: string; generation: number; base_elapsed: string }>(
      `select run_state, generation, base_elapsed from public.control_shuttle('sh-01', 'reset')`,
    )
    expect(reset).toEqual({ run_state: 'idle', generation: 1, base_elapsed: '0' })
    expect(await rows('select * from public.get_seat_holds()')).toEqual([])
  })

  it('works out elapsed time the same way as the app', async () => {
    await asOwner()
    const [result] = await rows<{ running: string; paused: string }>(`
      select
        public.sim_elapsed(row('sh-01', 'running', 5, 10, now() - interval '4 seconds', 0, null, now())::public.shuttle_clocks) as running,
        public.sim_elapsed(row('sh-01', 'paused', 5, 10, now() - interval '4 seconds', 0, null, now())::public.shuttle_clocks) as paused
    `)
    expect(Number(result.running)).toBeCloseTo(30, 1)
    expect(Number(result.paused)).toBe(10)
  })
})

describe('operator and administrator access (Phase 6)', () => {
  it('lets an operator read bookings on their own shuttle only', async () => {
    await as(ids.asha)
    await book('main-gate', 'central-library')
    await placeShuttle('sh-02', 0)
    await as(ids.kiran)
    await book('sports-complex', 'girls-hostel', 'sh-02')

    await as(ids.ravi)
    const visible = await rows<{ shuttle_id: string; passenger_name: string }>(
      'select shuttle_id, passenger_name from public.bookings',
    )
    expect(visible).toEqual([{ shuttle_id: 'sh-01', passenger_name: 'Asha Rao' }])
  })

  it('lets an administrator make someone an operator of a shuttle', async () => {
    await as(ids.meera)
    const [profile] = await rows<{ role: string; assigned_shuttle_id: string }>(
      `select role, assigned_shuttle_id from public.admin_update_user($1, 'operator', 'sh-02')`,
      [ids.priya],
    )
    expect(profile).toEqual({ role: 'operator', assigned_shuttle_id: 'sh-02' })

    // The new operator can now control SH-02.
    await as(ids.priya)
    expect(await rows(`select public.control_shuttle('sh-02', 'pause')`)).toHaveLength(1)

    // Back to student: the shuttle assignment is cleared.
    await as(ids.meera)
    const [student] = await rows<{ role: string; assigned_shuttle_id: string | null }>(
      `select role, assigned_shuttle_id from public.admin_update_user($1, 'student', 'sh-02')`,
      [ids.priya],
    )
    expect(student).toEqual({ role: 'student', assigned_shuttle_id: null })
  })

  it('checks role changes', async () => {
    await as(ids.meera)
    expect((await failure(`select public.admin_update_user($1, 'operator', null)`, [ids.priya])).hint).toBe(
      'invalid_input',
    )
    expect((await failure(`select public.admin_update_user($1, 'pilot', null)`, [ids.priya])).hint).toBe(
      'invalid_input',
    )
    expect((await failure(`select public.admin_update_user($1, 'student', null)`, [ids.meera])).hint).toBe(
      'cannot_demote_self',
    )
    await as(ids.asha)
    expect((await failure(`select public.admin_update_user($1, 'admin', null)`, [ids.asha])).hint).toBe('forbidden')
  })

  it('lets an administrator change seats, but never below the seats already booked', async () => {
    await as(ids.asha)
    await book('main-gate', 'central-library')
    await as(ids.kiran)
    await book('main-gate', 'boys-hostel')

    await as(ids.meera)
    const tooFew = await failure(`select public.admin_update_shuttle('sh-01', 'Loop Shuttle A', 1)`)
    expect(tooFew.hint).toBe('capacity_below_use')
    expect(tooFew.message).toContain('2 seats are already booked')

    const [shuttle] = await rows<{ name: string; capacity: number }>(
      `select name, capacity from public.admin_update_shuttle('sh-01', '  Library Express  ', 2)`,
    )
    expect(shuttle).toEqual({ name: 'Library Express', capacity: 2 })

    // The new capacity is enforced straight away.
    await as(ids.priya)
    expect((await failure(`select public.book_seat('sh-01', 'main-gate', 'student-centre')`)).hint).toBe('full')
  })

  it('checks shuttle changes', async () => {
    await as(ids.meera)
    expect((await failure(`select public.admin_update_shuttle('sh-01', '', 10)`)).hint).toBe('invalid_input')
    expect((await failure(`select public.admin_update_shuttle('sh-01', 'A', 0)`)).hint).toBe('invalid_input')
    expect((await failure(`select public.admin_update_shuttle('sh-99', 'A', 10)`)).hint).toBe('not_found')
    await as(ids.ravi)
    expect((await failure(`select public.admin_update_shuttle('sh-01', 'Mine now', 10)`)).hint).toBe('forbidden')
  })
})

describe('starting a fresh demo (Phase 8)', () => {
  it('lets an administrator remove every booking and restart every shuttle', async () => {
    await as(ids.asha)
    await book('main-gate', 'central-library')
    await as(ids.kiran)
    await book('main-gate', 'boys-hostel')
    await placeShuttle('sh-02', 200)
    await asOwner()
    await db.exec(`update public.shuttle_clocks set speed = 5 where shuttle_id = 'sh-02'`)
    const before = await rows<{ shuttle_id: string; generation: number }>(
      'select shuttle_id, generation from public.shuttle_clocks order by shuttle_id',
    )
    const [versions] = await rows<{ total: string }>('select sum(seat_version) as total from public.shuttles')

    await as(ids.meera)
    const [{ removed }] = await rows<{ removed: number }>('select public.admin_reset_demo() as removed')
    expect(removed).toBe(2)

    await asOwner()
    expect(await rows('select id from public.bookings')).toEqual([])
    const after = await rows<{
      shuttle_id: string
      run_state: string
      speed: number
      base_elapsed: string
      generation: number
    }>('select shuttle_id, run_state, speed, base_elapsed, generation from public.shuttle_clocks order by shuttle_id')
    after.forEach((clock, index) => {
      expect(clock).toMatchObject({ run_state: 'running', speed: 1, generation: before[index].generation + 1 })
      expect(Number(clock.base_elapsed)).toBe(0)
    })
    const [changed] = await rows<{ total: string }>('select sum(seat_version) as total from public.shuttles')
    expect(Number(changed.total)).toBe(Number(versions.total) + 2)
    // Accounts are kept.
    expect(await rows('select id from public.profiles')).toHaveLength(5)
  })

  it('refuses everyone except administrators', async () => {
    await as(ids.asha)
    await book('main-gate', 'central-library')
    expect((await failure('select public.admin_reset_demo()')).hint).toBe('forbidden')
    await as(ids.ravi)
    expect((await failure('select public.admin_reset_demo()')).hint).toBe('forbidden')
    await as(null)
    expect((await failure('select public.admin_reset_demo()')).message).toMatch(/permission denied/)
    await asOwner()
    expect(await rows('select id from public.bookings')).toHaveLength(1)
  })
})
