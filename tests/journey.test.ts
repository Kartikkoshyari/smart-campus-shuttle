import { describe, expect, it } from 'vitest'
import { generateBookingCode, BOOKING_CODE_PATTERN } from '../src/booking/bookingCode.ts'
import { bookingPhase, canCancel, holdsSeat, seatsInUse } from '../src/booking/bookingState.ts'
import { planJourney, type JourneyResult } from '../src/booking/journey.ts'
import { getRoute, getShuttle } from '../src/data/campus.ts'
import { createClock, resetClock } from '../src/simulator/clock.ts'
import { buildRoutePath } from '../src/simulator/routePath.ts'
import { buildTimeline, stopVisits } from '../src/simulator/timeline.ts'
import { getTimeline } from '../src/simulator/timetables.ts'
import type { SeatHold } from '../src/types/index.ts'

const route = getRoute('campus-loop')
const sh01 = getShuttle('sh-01')
const sh02 = getShuttle('sh-02')

function plan(shuttleId: 'sh-01' | 'sh-02', elapsedSeconds: number, pickup: string, destination: string) {
  return planJourney({
    shuttle: getShuttle(shuttleId),
    route,
    timeline: getTimeline(shuttleId),
    elapsedSeconds,
    pickupStopId: pickup,
    destinationStopId: destination,
  })
}

function expectError(result: JourneyResult, code: string) {
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.code).toBe(code)
}

// SH-01 timetable facts used below (from the demo data):
// it waits at Main Gate for 15 s, then reaches Academic Block, Central Library...
const visits = stopVisits(getTimeline('sh-01'))
const visitAt = (stopId: string) => visits.find((visit) => visit.stopId === stopId)!
const academic = visitAt('academic-block')
const library = visitAt('central-library')
const cycle = getTimeline('sh-01').cycleSeconds

describe('stopVisits', () => {
  it('starts and ends each run at the first stop', () => {
    expect(visits[0]).toMatchObject({ stopId: 'main-gate', arriveAt: 0, departAt: 15 })
    expect(visits.at(-1)).toMatchObject({ stopId: 'main-gate', arriveAt: cycle })
    expect(visits).toHaveLength(route.stopIds.length + 1)
  })
})

describe('planJourney: valid journeys', () => {
  it('plans a journey from the start of the run', () => {
    const result = plan('sh-01', 0, 'main-gate', 'central-library')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.pickupArrivalElapsed).toBe(0)
    expect(result.plan.pickupDepartureElapsed).toBe(15)
    expect(result.plan.dropoffElapsed).toBeCloseTo(library.arriveAt, 6)
    expect(result.plan.viaStopIds).toEqual(['academic-block'])
  })

  it('lets a student board while the shuttle is waiting at the pickup', () => {
    const waiting = academic.arriveAt + 2
    const result = plan('sh-01', waiting, 'academic-block', 'student-centre')
    expect(result.ok).toBe(true)
  })

  it('allows the end of the run (Main Gate) as a destination', () => {
    const result = plan('sh-01', 0, 'innovation-hub', 'main-gate')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.plan.dropoffElapsed).toBeCloseTo(cycle, 6)
  })

  it('plans on the current lap after several loops', () => {
    const result = plan('sh-01', cycle * 2 + 100, 'central-library', 'boys-hostel')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.plan.pickupArrivalElapsed).toBeCloseTo(cycle * 2 + library.arriveAt, 6)
  })

  it('follows the anticlockwise order for SH-02', () => {
    // SH-02 starts part-way round, between Innovation Hub and Sports Complex.
    expect(plan('sh-02', 0, 'sports-complex', 'girls-hostel').ok).toBe(true)
    expect(plan('sh-02', 0, 'sports-complex', 'main-gate').ok).toBe(true)
  })
})

describe('planJourney: impossible journeys', () => {
  it('asks for both stops', () => {
    expectError(plan('sh-01', 0, '', 'central-library'), 'missing_stop')
    expectError(plan('sh-01', 0, 'main-gate', ''), 'missing_stop')
  })

  it('rejects the same pickup and destination', () => {
    expectError(plan('sh-01', 0, 'central-library', 'central-library'), 'same_stop')
  })

  it('rejects stops that do not exist', () => {
    expectError(plan('sh-01', 0, 'moon-base', 'central-library'), 'unknown_stop')
  })

  it('rejects stops the shuttle does not serve', () => {
    const shortRoute = { ...route, stopIds: ['main-gate', 'academic-block', 'central-library'] }
    const timeline = buildTimeline(buildRoutePath(shortRoute, 'clockwise'), {
      speedMps: 6,
      dwellSeconds: 15,
      startOffsetSeconds: 0,
    })
    const result = planJourney({
      shuttle: sh01,
      route: shortRoute,
      timeline,
      elapsedSeconds: 0,
      pickupStopId: 'main-gate',
      destinationStopId: 'sports-complex',
    })
    expectError(result, 'not_served')
  })

  it('rejects a pickup the shuttle has already left on this run', () => {
    const afterAcademic = academic.departAt + 5
    const result = plan('sh-01', afterAcademic, 'academic-block', 'student-centre')
    expectError(result, 'pickup_passed')
    if (!result.ok) {
      expect(result.message).toContain('SH-01 has already left Academic Block')
      expect(result.reachableStopIds).toContain('central-library')
      expect(result.reachableStopIds).not.toContain('academic-block')
    }
  })

  it('rejects boarding at the first stop once the run has left it', () => {
    expectError(plan('sh-01', 100, 'main-gate', 'boys-hostel'), 'pickup_passed')
  })

  it('rejects a destination that comes before the pickup', () => {
    const result = plan('sh-01', 0, 'central-library', 'academic-block')
    expectError(result, 'wrong_order')
    if (!result.ok) {
      expect(result.message).toContain('The run ends at Main Gate')
      expect(result.reachableStopIds).toEqual([
        'student-centre',
        'boys-hostel',
        'girls-hostel',
        'sports-complex',
        'innovation-hub',
        'main-gate',
      ])
    }
  })

  it('applies the reverse order to the anticlockwise shuttle', () => {
    // Clockwise this is fine; anticlockwise Girls' Hostel comes after Sports Complex.
    expect(plan('sh-01', 0, 'girls-hostel', 'sports-complex').ok).toBe(true)
    expectError(plan('sh-02', 0, 'girls-hostel', 'sports-complex'), 'wrong_order')
    expect(sh02.direction).toBe('anticlockwise')
  })

  it('works on an out-and-back route', () => {
    const line = { ...route, isLoop: false, stopIds: ['main-gate', 'academic-block', 'central-library'] }
    const timeline = buildTimeline(buildRoutePath(line, 'clockwise'), {
      speedMps: 6,
      dwellSeconds: 15,
      startOffsetSeconds: 0,
    })
    const check = (pickup: string, destination: string) =>
      planJourney({
        shuttle: sh01,
        route: line,
        timeline,
        elapsedSeconds: 0,
        pickupStopId: pickup,
        destinationStopId: destination,
      })
    // Out to Central Library, then back to Main Gate on the same run.
    expect(check('central-library', 'main-gate').ok).toBe(true)
    expect(check('academic-block', 'central-library').ok).toBe(true)
  })
})

describe('booking state', () => {
  const clock = createClock(0)
  const booking = { status: 'confirmed' as const, generation: 0, pickupDepartureElapsed: 100, dropoffElapsed: 200 }

  it('moves from upcoming to on board to completed as the shuttle travels', () => {
    expect(bookingPhase(booking, clock, 50)).toBe('upcoming')
    expect(bookingPhase(booking, clock, 150)).toBe('on_board')
    expect(bookingPhase(booking, clock, 200)).toBe('completed')
  })

  it('ends bookings from before a reset', () => {
    expect(bookingPhase(booking, resetClock(clock, 0), 10)).toBe('expired')
  })

  it('shows cancelled bookings as cancelled', () => {
    expect(bookingPhase({ ...booking, status: 'cancelled' }, clock, 50)).toBe('cancelled')
  })

  it('holds a seat until drop-off, and allows cancelling only before pickup', () => {
    expect(holdsSeat('upcoming')).toBe(true)
    expect(holdsSeat('on_board')).toBe(true)
    expect(holdsSeat('completed')).toBe(false)
    expect(holdsSeat('cancelled')).toBe(false)
    expect(canCancel('upcoming')).toBe(true)
    expect(canCancel('on_board')).toBe(false)
  })

  it('counts seats in use per shuttle', () => {
    const hold = (id: string, shuttleId: string, dropoff: number): SeatHold => ({
      bookingId: id,
      shuttleId,
      generation: 0,
      pickupDepartureElapsed: 10,
      dropoffElapsed: dropoff,
      pickupStopId: 'main-gate',
      destinationStopId: 'central-library',
    })
    const holds = [hold('a', 'sh-01', 100), hold('b', 'sh-01', 300), hold('c', 'sh-02', 300)]
    expect(seatsInUse(holds, 'sh-01', clock, 50)).toBe(2)
    expect(seatsInUse(holds, 'sh-01', clock, 150)).toBe(1)
    expect(seatsInUse(holds, 'sh-01', resetClock(clock, 0), 0)).toBe(0)
  })
})

describe('booking IDs', () => {
  it('look like SCS-XXXXXX with easy-to-read characters', () => {
    for (let i = 0; i < 50; i += 1) expect(generateBookingCode()).toMatch(BOOKING_CODE_PATTERN)
  })

  it('are different each time', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateBookingCode()))
    expect(codes.size).toBe(200)
  })

  it('skip random bytes that would make some characters more likely', () => {
    const bytes = [255, 254, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect(generateBookingCode((count) => new Uint8Array(bytes.slice(0, count)))).toBe('SCS-ABCDEF')
  })
})
