import { findStop, getStop } from '../data/campus.ts'
import { loopTime, stopVisits, type StopVisit, type Timeline } from '../simulator/timeline.ts'
import type { Route, Shuttle } from '../types/index.ts'

/**
 * Route-aware journey rules.
 *
 * A RUN is one trip round the route: it starts at the route's first stop and
 * ends when the shuttle is back there. A booking is always for the shuttle's
 * CURRENT run, so:
 * - the shuttle must not have left the pickup yet on this run;
 * - the destination must come after the pickup on this run
 *   (in the shuttle's own direction, ending at the first stop).
 */

export type JourneyErrorCode =
  'missing_stop' | 'same_stop' | 'unknown_stop' | 'not_served' | 'pickup_passed' | 'wrong_order'

export interface JourneyPlan {
  shuttleId: string
  pickupStopId: string
  destinationStopId: string
  /** Simulated seconds (since the last reset) for each moment of the journey. */
  pickupArrivalElapsed: number
  pickupDepartureElapsed: number
  dropoffElapsed: number
  /** Stops passed between pickup and destination. */
  viaStopIds: string[]
}

export type JourneyResult =
  { ok: true; plan: JourneyPlan } | { ok: false; code: JourneyErrorCode; message: string; reachableStopIds: string[] }

export interface JourneyInput {
  shuttle: Shuttle
  route: Route
  timeline: Timeline
  /** Simulated seconds on the shuttle's clock right now. */
  elapsedSeconds: number
  pickupStopId: string
  destinationStopId: string
}

function fail(code: JourneyErrorCode, message: string, reachableStopIds: string[] = []): JourneyResult {
  return { ok: false, code, message, reachableStopIds }
}

/** Unique stop IDs from a list of visits, in order. */
function uniqueStops(visits: StopVisit[]): string[] {
  return [...new Set(visits.map((visit) => visit.stopId))]
}

/** Pickup stops the shuttle has not left yet on its current run. */
export function boardableStopIds(timeline: Timeline, elapsedSeconds: number): string[] {
  const t = loopTime(timeline, elapsedSeconds)
  const visits = stopVisits(timeline)
  return uniqueStops(visits.slice(0, -1).filter((visit) => visit.departAt > t))
}

/** Checks a journey and, if it is possible, works out when it happens. */
export function planJourney(input: JourneyInput): JourneyResult {
  const { shuttle, route, timeline, elapsedSeconds, pickupStopId, destinationStopId } = input

  if (!pickupStopId || !destinationStopId) {
    return fail('missing_stop', 'Choose a pickup stop and a destination.')
  }
  if (pickupStopId === destinationStopId) {
    return fail('same_stop', 'Pickup and destination must be different stops.')
  }
  for (const stopId of [pickupStopId, destinationStopId]) {
    if (!findStop(stopId)) return fail('unknown_stop', 'That stop is not in the campus network.')
    if (!route.stopIds.includes(stopId)) {
      return fail('not_served', `${shuttle.code} does not stop at ${getStop(stopId).name}.`)
    }
  }

  const t = loopTime(timeline, elapsedSeconds)
  const runStart = elapsedSeconds - t
  const visits = stopVisits(timeline)
  const lastVisit = visits[visits.length - 1]
  const pickupName = getStop(pickupStopId).name

  // The final visit is the end of the run, so nobody can board there.
  const pickupVisit = visits.find(
    (visit) => visit.index < lastVisit.index && visit.stopId === pickupStopId && visit.departAt > t,
  )
  if (!pickupVisit) {
    return fail(
      'pickup_passed',
      `${shuttle.code} has already left ${pickupName} on this run. Choose a stop it has not reached yet, or try another shuttle.`,
      boardableStopIds(timeline, elapsedSeconds),
    )
  }

  const later = visits.filter((visit) => visit.index > pickupVisit.index)
  const destinationVisit = later.find((visit) => visit.stopId === destinationStopId)
  if (!destinationVisit) {
    return fail(
      'wrong_order',
      `On this run, ${shuttle.code} does not reach ${getStop(destinationStopId).name} after ${pickupName}. ` +
        `The run ends at ${getStop(lastVisit.stopId).name}.`,
      uniqueStops(later),
    )
  }

  const via = visits
    .filter((visit) => visit.index > pickupVisit.index && visit.index < destinationVisit.index)
    .map((visit) => visit.stopId)

  return {
    ok: true,
    plan: {
      shuttleId: shuttle.id,
      pickupStopId,
      destinationStopId,
      pickupArrivalElapsed: runStart + pickupVisit.arriveAt,
      pickupDepartureElapsed: runStart + pickupVisit.departAt,
      dropoffElapsed: runStart + destinationVisit.arriveAt,
      viaStopIds: via,
    },
  }
}
