import { describe, expect, it } from 'vitest'
import { getRoute, simulationProfiles } from '../src/data/campus.ts'
import {
  createClock,
  elapsedAt,
  isValidClock,
  pauseClock,
  resetClock,
  resumeClock,
  setClockSpeed,
  startClock,
} from '../src/simulator/clock.ts'
import { applySimAction, canControlShuttle } from '../src/simulator/controls.ts'
import { buildRoutePath } from '../src/simulator/routePath.ts'
import { buildTimeline, snapshotAt, upcomingStopEtas, type Timeline } from '../src/simulator/timeline.ts'
import type { AppUser, Direction } from '../src/types/index.ts'
import { distanceMetres } from '../src/utils/geo.ts'

const route = getRoute('campus-loop')
const profile = { speedMps: 6, dwellSeconds: 15, startOffsetSeconds: 0 }

function timelineFor(direction: Direction, overrides: Partial<typeof profile> = {}): Timeline {
  return buildTimeline(buildRoutePath(route, direction), { ...profile, ...overrides })
}

function snapshot(timeline: Timeline, elapsed: number, halted = false) {
  return snapshotAt(timeline, elapsed, { shuttleId: 'test', seatsAvailable: 10, halted })
}

describe('distanceMetres', () => {
  it('measures real distances', () => {
    // One degree of latitude is about 111 km.
    expect(distanceMetres({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeGreaterThan(110_000)
    expect(distanceMetres({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeLessThan(112_000)
    expect(distanceMetres({ lat: 17.44, lng: 78.35 }, { lat: 17.44, lng: 78.35 })).toBe(0)
  })
})

describe('buildRoutePath', () => {
  it('closes the loop back to the first stop', () => {
    const path = buildRoutePath(route, 'clockwise')
    expect(path.segments).toHaveLength(route.stopIds.length)
    expect(path.segments[0].fromStopId).toBe('main-gate')
    expect(path.segments.at(-1)?.toStopId).toBe('main-gate')
    expect(path.totalMetres).toBeGreaterThan(2000)
  })

  it('runs the loop the other way for anticlockwise shuttles', () => {
    const path = buildRoutePath(route, 'anticlockwise')
    expect(path.segments[0]).toMatchObject({ fromStopId: 'main-gate', toStopId: 'innovation-hub' })
    expect(path.segments.at(-1)).toMatchObject({ fromStopId: 'academic-block', toStopId: 'main-gate' })
  })

  it('is the same length in both directions', () => {
    const clockwise = buildRoutePath(route, 'clockwise').totalMetres
    const anticlockwise = buildRoutePath(route, 'anticlockwise').totalMetres
    expect(anticlockwise).toBeCloseTo(clockwise, 6)
  })

  it('drives a one-way route out and back', () => {
    const oneWay = { ...route, isLoop: false, stopIds: ['main-gate', 'academic-block', 'central-library'] }
    const path = buildRoutePath(oneWay, 'clockwise')
    expect(path.segments.map((s) => s.toStopId)).toEqual([
      'academic-block',
      'central-library',
      'academic-block',
      'main-gate',
    ])
  })
})

describe('shuttle movement', () => {
  const timeline = timelineFor('clockwise')
  const firstLeg = timeline.path.segments[0]
  const firstTravel = firstLeg.lengthMetres / profile.speedMps

  it('starts at the first stop, waiting', () => {
    const s = snapshot(timeline, 0)
    expect(s.status).toBe('at_stop')
    expect(s.atStopId).toBe('main-gate')
    expect(s.nextStopId).toBe('academic-block')
    expect(s.position).toEqual(firstLeg.from)
  })

  it('leaves the stop after the waiting time and moves along the road', () => {
    const s = snapshot(timeline, profile.dwellSeconds + firstTravel / 2)
    expect(s.status).toBe('moving')
    expect(s.atStopId).toBeNull()
    expect(s.lastStopId).toBe('main-gate')
    expect(s.nextStopId).toBe('academic-block')
    expect(s.position.lat).toBeCloseTo((firstLeg.from.lat + firstLeg.to.lat) / 2, 6)
    expect(s.position.lng).toBeCloseTo((firstLeg.from.lng + firstLeg.to.lng) / 2, 6)
  })

  it('arrives at the next stop and waits there', () => {
    const s = snapshot(timeline, profile.dwellSeconds + firstTravel + 1)
    expect(s.status).toBe('at_stop')
    expect(s.atStopId).toBe('academic-block')
    expect(s.nextStopId).toBe('central-library')
  })

  it('moves smoothly: small time steps give small position changes', () => {
    const base = profile.dwellSeconds + 5
    const a = snapshot(timeline, base).position
    const b = snapshot(timeline, base + 0.1).position
    // 0.1 s at 6 m/s is 0.6 m.
    expect(distanceMetres(a, b)).toBeCloseTo(0.6, 1)
  })

  it('returns to the start after one full loop', () => {
    const s = snapshot(timeline, timeline.cycleSeconds)
    expect(s.atStopId).toBe('main-gate')
    expect(snapshot(timeline, timeline.cycleSeconds * 3 + 1)).toEqual(snapshot(timeline, 1))
  })

  it('anticlockwise shuttles head to Innovation Hub first', () => {
    expect(snapshot(timelineFor('anticlockwise'), 0).nextStopId).toBe('innovation-hub')
  })

  it('uses the start offset so shuttles can begin part-way round', () => {
    const offset = timelineFor('clockwise', { startOffsetSeconds: 100 })
    expect(snapshot(offset, 0)).toEqual(snapshot(timeline, 100))
  })

  it('shows Paused when halted, without moving the shuttle', () => {
    const moving = snapshot(timeline, 40)
    const halted = snapshot(timeline, 40, true)
    expect(halted.status).toBe('paused')
    expect(halted.position).toEqual(moving.position)
  })

  it('has a simulation profile for every demo shuttle', () => {
    expect(Object.keys(simulationProfiles).sort()).toEqual(['sh-01', 'sh-02'])
  })
})

describe('ETA calculations', () => {
  const timeline = timelineFor('clockwise')
  const firstTravel = timeline.path.segments[0].lengthMetres / profile.speedMps

  it('counts the waiting time plus the drive while at a stop', () => {
    expect(snapshot(timeline, 0).etaSeconds).toBeCloseTo(profile.dwellSeconds + firstTravel, 6)
    expect(snapshot(timeline, 5).etaSeconds).toBeCloseTo(profile.dwellSeconds - 5 + firstTravel, 6)
  })

  it('counts down while moving', () => {
    const early = snapshot(timeline, profile.dwellSeconds + 10).etaSeconds
    const later = snapshot(timeline, profile.dwellSeconds + 20).etaSeconds
    expect(early - later).toBeCloseTo(10, 6)
    expect(later).toBeCloseTo(firstTravel - 20, 6)
  })

  it('lists every stop once, in travel order, with rising arrival times', () => {
    const upcoming = upcomingStopEtas(timeline, profile.dwellSeconds + 10)
    expect(upcoming.map((eta) => eta.stopId)).toEqual([
      'academic-block',
      'central-library',
      'student-centre',
      'boys-hostel',
      'girls-hostel',
      'sports-complex',
      'innovation-hub',
      'main-gate',
    ])
    for (let i = 1; i < upcoming.length; i += 1) {
      expect(upcoming[i].etaSeconds).toBeGreaterThan(upcoming[i - 1].etaSeconds)
    }
    expect(upcoming[0].etaSeconds).toBeCloseTo(snapshot(timeline, profile.dwellSeconds + 10).etaSeconds, 6)
  })

  it('puts the current stop first, at 0 seconds, while waiting there', () => {
    const upcoming = upcomingStopEtas(timeline, 0)
    expect(upcoming[0]).toEqual({ stopId: 'main-gate', etaSeconds: 0 })
    expect(upcoming).toHaveLength(route.stopIds.length)
  })

  it('wraps round the loop near the end of a lap', () => {
    const nearEnd = timeline.cycleSeconds - 10
    const upcoming = upcomingStopEtas(timeline, nearEnd)
    expect(upcoming[0]).toMatchObject({ stopId: 'main-gate' })
    expect(upcoming[0].etaSeconds).toBeCloseTo(10, 6)
    expect(upcoming.at(-1)?.stopId).toBe('innovation-hub')
  })

  it('rejects impossible settings', () => {
    expect(() => timelineFor('clockwise', { speedMps: 0 })).toThrow()
    expect(() => timelineFor('clockwise', { dwellSeconds: -1 })).toThrow()
  })
})

describe('simulation clock', () => {
  const t0 = 1_000_000

  it('counts simulated seconds while running', () => {
    const clock = createClock(t0)
    expect(elapsedAt(clock, t0)).toBe(0)
    expect(elapsedAt(clock, t0 + 10_000)).toBe(10)
  })

  it('pause freezes time, and resume continues without a jump', () => {
    const paused = pauseClock(createClock(t0), t0 + 30_000)
    expect(paused.runState).toBe('paused')
    expect(elapsedAt(paused, t0 + 90_000)).toBe(30)

    const resumed = resumeClock(paused, t0 + 90_000)
    expect(resumed.runState).toBe('running')
    expect(elapsedAt(resumed, t0 + 90_000)).toBe(30)
    expect(elapsedAt(resumed, t0 + 95_000)).toBe(35)
  })

  it('reset goes back to the start and waits', () => {
    const reset = resetClock(createClock(t0), t0 + 50_000)
    expect(reset.runState).toBe('idle')
    expect(elapsedAt(reset, t0 + 99_000)).toBe(0)

    const started = startClock(reset, t0 + 100_000)
    expect(started.runState).toBe('running')
    expect(elapsedAt(started, t0 + 104_000)).toBe(4)
  })

  it('speeds up 2x and 5x without making the shuttle jump', () => {
    const fast = setClockSpeed(createClock(t0), 5, t0 + 10_000)
    expect(elapsedAt(fast, t0 + 10_000)).toBe(10)
    expect(elapsedAt(fast, t0 + 12_000)).toBe(20)

    const medium = setClockSpeed(fast, 2, t0 + 12_000)
    expect(elapsedAt(medium, t0 + 13_000)).toBe(22)
  })

  it('keeps the speed after a reset', () => {
    const reset = resetClock(setClockSpeed(createClock(t0), 5, t0), t0)
    expect(reset.speed).toBe(5)
  })

  it('ignores actions that do not apply, so double clicks are harmless', () => {
    const running = createClock(t0)
    expect(resumeClock(running, t0 + 1000)).toBe(running)
    expect(startClock(running, t0 + 1000)).toBe(running)

    const paused = pauseClock(running, t0 + 1000)
    expect(pauseClock(paused, t0 + 5000)).toBe(paused)
  })

  it('never goes backwards if the computer clock does', () => {
    expect(elapsedAt(createClock(t0), t0 - 5000)).toBe(0)
  })

  it('rejects damaged saved data', () => {
    expect(isValidClock(createClock(t0))).toBe(true)
    expect(isValidClock({ runState: 'flying', speed: 1, baseElapsed: 0, baseTimeMs: t0 })).toBe(false)
    expect(isValidClock({ runState: 'running', speed: 3, baseElapsed: 0, baseTimeMs: t0 })).toBe(false)
    expect(isValidClock({ runState: 'running', speed: 1, baseElapsed: -4, baseTimeMs: t0 })).toBe(false)
    expect(isValidClock(null)).toBe(false)
  })
})

describe('simulation controls', () => {
  const student: AppUser = { id: 's', name: 'S', email: 's@x.test', role: 'student', assignedShuttleId: null }
  const operator: AppUser = { id: 'o', name: 'O', email: 'o@x.test', role: 'operator', assignedShuttleId: 'sh-01' }
  const admin: AppUser = { id: 'a', name: 'A', email: 'a@x.test', role: 'admin', assignedShuttleId: null }

  it('lets operators control only their assigned shuttle', () => {
    expect(canControlShuttle(operator, 'sh-01')).toBe(true)
    expect(canControlShuttle(operator, 'sh-02')).toBe(false)
  })

  it('lets admins control any shuttle, and nobody else', () => {
    expect(canControlShuttle(admin, 'sh-02')).toBe(true)
    expect(canControlShuttle(student, 'sh-01')).toBe(false)
    expect(canControlShuttle(null, 'sh-01')).toBe(false)
  })

  it('maps each action to the clock', () => {
    const t0 = 0
    const clock = createClock(t0)
    expect(applySimAction(clock, { type: 'pause' }, 1000).runState).toBe('paused')
    expect(applySimAction(clock, { type: 'reset' }, 1000).runState).toBe('idle')
    expect(applySimAction(clock, { type: 'speed', speed: 2 }, 1000).speed).toBe(2)
  })
})
