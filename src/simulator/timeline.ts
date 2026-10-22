import type { ShuttleSnapshot, SimulationProfile, StopEta } from '../types/index.ts'
import { interpolate } from '../utils/geo.ts'
import type { RoutePath } from './routePath.ts'

/**
 * One leg of the journey: wait at a stop, then drive to the next one.
 * All times are seconds from the start of the loop.
 */
interface Leg {
  segmentIndex: number
  /** The shuttle arrives at the "from" stop and starts waiting. */
  startsAt: number
  /** The shuttle leaves the "from" stop. */
  departsAt: number
  /** The shuttle reaches the "to" stop. */
  arrivesAt: number
}

/** A precomputed schedule for one trip round the route. */
export interface Timeline {
  path: RoutePath
  profile: SimulationProfile
  legs: Leg[]
  /** Seconds for one full trip, including every stop. */
  cycleSeconds: number
}

export function buildTimeline(path: RoutePath, profile: SimulationProfile): Timeline {
  if (profile.speedMps <= 0) throw new Error('Simulation speed must be above zero')
  if (profile.dwellSeconds < 0) throw new Error('Waiting time at stops cannot be negative')

  const legs: Leg[] = []
  let clock = 0
  path.segments.forEach((segment, segmentIndex) => {
    const startsAt = clock
    const departsAt = startsAt + profile.dwellSeconds
    const arrivesAt = departsAt + segment.lengthMetres / profile.speedMps
    legs.push({ segmentIndex, startsAt, departsAt, arrivesAt })
    clock = arrivesAt
  })

  return { path, profile, legs, cycleSeconds: clock }
}

/** Position within one loop, always between 0 and cycleSeconds. */
export function loopTime(timeline: Timeline, elapsedSeconds: number): number {
  const raw = (elapsedSeconds + timeline.profile.startOffsetSeconds) % timeline.cycleSeconds
  return raw < 0 ? raw + timeline.cycleSeconds : raw
}

function findLegIndex(timeline: Timeline, t: number): number {
  const index = timeline.legs.findIndex((leg) => t >= leg.startsAt && t < leg.arrivesAt)
  return index === -1 ? 0 : index
}

export interface SnapshotOptions {
  shuttleId: string
  seatsAvailable: number
  /** True when the operator has paused the shuttle or it has not started yet. */
  halted: boolean
}

/** Where the shuttle is, and what it is doing, after a given number of simulated seconds. */
export function snapshotAt(timeline: Timeline, elapsedSeconds: number, options: SnapshotOptions): ShuttleSnapshot {
  const t = loopTime(timeline, elapsedSeconds)
  const leg = timeline.legs[findLegIndex(timeline, t)]
  const segment = timeline.path.segments[leg.segmentIndex]
  const atStop = t < leg.departsAt

  const travelSeconds = leg.arrivesAt - leg.departsAt
  const progress = atStop || travelSeconds === 0 ? 0 : (t - leg.departsAt) / travelSeconds

  return {
    shuttleId: options.shuttleId,
    status: options.halted ? 'paused' : atStop ? 'at_stop' : 'moving',
    position: atStop ? segment.from : interpolate(segment.from, segment.to, progress),
    lastStopId: segment.fromStopId,
    nextStopId: segment.toStopId,
    atStopId: atStop ? segment.fromStopId : null,
    etaSeconds: leg.arrivesAt - t,
    seatsAvailable: options.seatsAvailable,
  }
}

/**
 * Arrival times for every stop on the loop, starting with the stop the shuttle
 * is at (0 seconds) or heading to. Each stop appears once.
 */
export function upcomingStopEtas(timeline: Timeline, elapsedSeconds: number): StopEta[] {
  const t = loopTime(timeline, elapsedSeconds)
  const legCount = timeline.legs.length
  const startIndex = findLegIndex(timeline, t)
  const current = timeline.legs[startIndex]
  const result: StopEta[] = []
  const seen = new Set<string>()

  if (t < current.departsAt) {
    const here = timeline.path.segments[current.segmentIndex].fromStopId
    result.push({ stopId: here, etaSeconds: 0 })
    seen.add(here)
  }

  for (let step = 0; step < legCount; step += 1) {
    const index = (startIndex + step) % legCount
    const leg = timeline.legs[index]
    const wraps = index < startIndex ? timeline.cycleSeconds : 0
    const stopId = timeline.path.segments[leg.segmentIndex].toStopId
    if (seen.has(stopId)) continue
    seen.add(stopId)
    result.push({ stopId, etaSeconds: leg.arrivesAt + wraps - t })
  }

  return result
}

/** One visit to a stop during a run: when the shuttle arrives and when it leaves. */
export interface StopVisit {
  /** Position in the run, starting at 0. */
  index: number
  stopId: string
  /** Seconds from the start of the run. */
  arriveAt: number
  departAt: number
}

/**
 * Every stop visit in one run, in order. A run starts at the first stop and
 * ends when the shuttle is back there, so the first stop appears at both ends.
 */
export function stopVisits(timeline: Timeline): StopVisit[] {
  const visits: StopVisit[] = timeline.legs.map((leg, index) => ({
    index,
    stopId: timeline.path.segments[leg.segmentIndex].fromStopId,
    arriveAt: leg.startsAt,
    departAt: leg.departsAt,
  }))
  const lastLeg = timeline.legs[timeline.legs.length - 1]
  visits.push({
    index: visits.length,
    stopId: timeline.path.segments[lastLeg.segmentIndex].toStopId,
    arriveAt: timeline.cycleSeconds,
    departAt: timeline.cycleSeconds,
  })
  return visits
}
