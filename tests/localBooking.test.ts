import { beforeEach, describe, expect, it } from 'vitest'
import { bookingPhase, seatsInUse } from '../src/booking/bookingState.ts'
import type { AuthService } from '../src/services/authService.ts'
import { BookingError } from '../src/services/bookingService.ts'
import { createLocalBookingService, LOCAL_BOOKINGS_KEY } from '../src/services/localBookingService.ts'
import { createLocalSimulationService } from '../src/services/localSimulationService.ts'
import { elapsedAt } from '../src/simulator/clock.ts'
import { stopVisits } from '../src/simulator/timeline.ts'
import { getTimeline } from '../src/simulator/timetables.ts'
import type { AppUser, BookingRequest } from '../src/types/index.ts'

function user(id: string, role: AppUser['role'] = 'student'): AppUser {
  return {
    id,
    name: `User ${id}`,
    email: `${id}@x.test`,
    role,
    assignedShuttleId: role === 'operator' ? 'sh-01' : null,
  }
}

/** A sign-in service that always returns the given user, so tests can act as several people. */
function signedInAs(person: AppUser | null): AuthService {
  return {
    mode: 'local-demo',
    getCurrentUser: async () => person,
    signIn: async () => {
      throw new Error('not used')
    },
    signUp: async () => {
      throw new Error('not used')
    },
    signOut: async () => undefined,
  }
}

const journey: BookingRequest = { shuttleId: 'sh-01', pickupStopId: 'main-gate', destinationStopId: 'central-library' }
const libraryVisit = stopVisits(getTimeline('sh-01')).find((visit) => visit.stopId === 'central-library')!

let now: number
let simulation: ReturnType<typeof createLocalSimulationService>

function serviceFor(person: AppUser | null, capacity = 20) {
  return createLocalBookingService({ auth: signedInAs(person), simulation, getCapacity: () => capacity })
}

/** Seats taken on SH-01 at the current moment. */
async function seatsTaken(): Promise<number> {
  const clock = simulation.peekClocks()!['sh-01']
  const holds = await serviceFor(null).listSeatHolds()
  return seatsInUse(holds, 'sh-01', clock, elapsedAt(clock, now))
}

beforeEach(() => {
  now = 1_000_000
  simulation = createLocalSimulationService({ getNow: () => now })
  // SH-01 starts waiting at Main Gate.
  simulation.peekClocks()
})

describe('creating bookings', () => {
  it('creates a confirmed booking with a unique booking ID', async () => {
    const booking = await serviceFor(user('a')).createBooking(journey)
    expect(booking.code).toMatch(/^SCS-[A-Z2-9]{6}$/)
    expect(booking).toMatchObject({
      status: 'confirmed',
      userId: 'a',
      passengerName: 'User a',
      pickupStopId: 'main-gate',
      destinationStopId: 'central-library',
      generation: 0,
    })
    expect(booking.dropoffElapsed).toBeCloseTo(libraryVisit.arriveAt, 6)
    expect(await seatsTaken()).toBe(1)
  })

  it('refuses impossible journeys with a clear reason', async () => {
    const backwards = { ...journey, pickupStopId: 'central-library', destinationStopId: 'academic-block' }
    await expect(serviceFor(user('a')).createBooking(backwards)).rejects.toMatchObject({ code: 'wrong_order' })

    now += 100_000 // SH-01 has now left Main Gate
    await expect(serviceFor(user('a')).createBooking(journey)).rejects.toMatchObject({ code: 'pickup_passed' })
    expect(await seatsTaken()).toBe(0)
  })

  it('only lets signed-in students book', async () => {
    await expect(serviceFor(null).createBooking(journey)).rejects.toMatchObject({ code: 'not_signed_in' })
    await expect(serviceFor(user('o', 'operator')).createBooking(journey)).rejects.toMatchObject({
      code: 'students_only',
    })
  })

  it('refuses an unknown shuttle', async () => {
    await expect(serviceFor(user('a')).createBooking({ ...journey, shuttleId: 'sh-99' })).rejects.toMatchObject({
      code: 'unknown_shuttle',
    })
  })
})

describe('seat capacity', () => {
  it('refuses a booking when the shuttle is full', async () => {
    await serviceFor(user('a'), 2).createBooking(journey)
    await serviceFor(user('b'), 2).createBooking(journey)
    await expect(serviceFor(user('c'), 2).createBooking(journey)).rejects.toMatchObject({ code: 'full' })
    expect(await seatsTaken()).toBe(2)
  })

  it('gives the last seat to exactly one of two students booking at the same moment', async () => {
    await serviceFor(user('a'), 2).createBooking(journey)

    const results = await Promise.allSettled([
      serviceFor(user('b'), 2).createBooking(journey),
      serviceFor(user('c'), 2).createBooking(journey),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: 'full' })
    expect(await seatsTaken()).toBe(2)
  })

  it('never overbooks under many simultaneous requests', async () => {
    const people = Array.from({ length: 12 }, (_, i) => user(`p${i}`))
    const results = await Promise.allSettled(people.map((person) => serviceFor(person, 5).createBooking(journey)))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5)
    expect(await seatsTaken()).toBe(5)
  })

  it('prevents duplicate bookings by the same student on the same shuttle', async () => {
    const service = serviceFor(user('a'))
    const first = await service.createBooking(journey)
    await expect(service.createBooking(journey)).rejects.toMatchObject({ code: 'duplicate' })
    // A double click sends two requests at once: only one is saved.
    const twice = await Promise.allSettled([
      service.createBooking({ ...journey, destinationStopId: 'boys-hostel' }),
      service.createBooking({ ...journey, destinationStopId: 'boys-hostel' }),
    ])
    expect(twice.every((result) => result.status === 'rejected')).toBe(true)
    expect(await seatsTaken()).toBe(1)

    await service.cancelBooking(first.id)
    await expect(service.createBooking(journey)).resolves.toMatchObject({ status: 'confirmed' })
  })

  it('frees the seat automatically once the shuttle reaches the destination', async () => {
    await serviceFor(user('a')).createBooking(journey)
    expect(await seatsTaken()).toBe(1)
    now += (libraryVisit.arriveAt + 1) * 1000
    expect(await seatsTaken()).toBe(0)
  })

  it('ends bookings when an operator resets the simulation', async () => {
    const booking = await serviceFor(user('a')).createBooking(journey)
    await simulation.control(user('admin', 'admin'), 'sh-01', { type: 'reset' })
    const clock = simulation.peekClocks()!['sh-01']
    expect(bookingPhase(booking, clock, elapsedAt(clock, now))).toBe('expired')
    expect(await seatsTaken()).toBe(0)
  })
})

describe('cancelling bookings', () => {
  it('cancels a booking and releases its seat', async () => {
    const service = serviceFor(user('a'))
    const booking = await service.createBooking(journey)
    const cancelled = await service.cancelBooking(booking.id)
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancelledAt).not.toBeNull()
    expect(await seatsTaken()).toBe(0)
  })

  it('cannot cancel twice, so a seat is never released twice', async () => {
    const service = serviceFor(user('a'), 1)
    const booking = await service.createBooking(journey)
    await service.cancelBooking(booking.id)
    // Someone else takes the freed seat.
    await serviceFor(user('b'), 1).createBooking(journey)

    await expect(service.cancelBooking(booking.id)).rejects.toMatchObject({ code: 'already_cancelled' })
    const both = await Promise.allSettled([service.cancelBooking(booking.id), service.cancelBooking(booking.id)])
    expect(both.every((result) => result.status === 'rejected')).toBe(true)
    // Still exactly one seat in use: the second student's.
    expect(await seatsTaken()).toBe(1)
    await expect(serviceFor(user('c'), 1).createBooking(journey)).rejects.toMatchObject({ code: 'full' })
  })

  it('cannot cancel once the shuttle has left the pickup', async () => {
    const service = serviceFor(user('a'))
    const booking = await service.createBooking(journey)
    now += 20_000 // past the 15-second wait at Main Gate
    await expect(service.cancelBooking(booking.id)).rejects.toMatchObject({ code: 'not_cancellable' })
  })

  it("does not let a student cancel someone else's booking, but lets an admin", async () => {
    const booking = await serviceFor(user('a')).createBooking(journey)
    await expect(serviceFor(user('b')).cancelBooking(booking.id)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(serviceFor(user('admin', 'admin')).cancelBooking(booking.id)).resolves.toMatchObject({
      status: 'cancelled',
    })
  })

  it('reports an unknown booking', async () => {
    await expect(serviceFor(user('a')).cancelBooking('nope')).rejects.toBeInstanceOf(BookingError)
  })
})

describe('reading bookings', () => {
  it('shows students only their own bookings', async () => {
    await serviceFor(user('a')).createBooking(journey)
    await serviceFor(user('b')).createBooking(journey)
    const mine = await serviceFor(user('a')).listMyBookings()
    expect(mine).toHaveLength(1)
    expect(mine[0].userId).toBe('a')
  })

  it('lets only administrators list every booking', async () => {
    await serviceFor(user('a')).createBooking(journey)
    await expect(serviceFor(user('a')).listAllBookings()).rejects.toMatchObject({ code: 'forbidden' })
    expect(await serviceFor(user('admin', 'admin')).listAllBookings()).toHaveLength(1)
  })

  it('shares seat use without any personal details', async () => {
    await serviceFor(user('a')).createBooking(journey)
    const [hold] = await serviceFor(null).listSeatHolds()
    expect(Object.keys(hold)).not.toContain('userId')
    expect(Object.keys(hold)).not.toContain('passengerName')
    expect(JSON.stringify(hold)).not.toContain('User a')
  })

  it('ignores damaged saved data', async () => {
    window.localStorage.setItem(LOCAL_BOOKINGS_KEY, '[{"id": 5}, "junk"]')
    expect(await serviceFor(user('a')).listMyBookings()).toEqual([])
  })

  it('tells subscribers when bookings change', async () => {
    const service = serviceFor(user('a'))
    let calls = 0
    const unsubscribe = service.subscribe(() => {
      calls += 1
    })
    await service.createBooking(journey)
    unsubscribe()
    await serviceFor(user('b')).createBooking(journey)
    expect(calls).toBe(1)
  })
})
