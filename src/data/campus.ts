import type { Direction, Route, Shuttle, SimulationProfile, Stop } from '../types/index.ts'

/**
 * Demo campus data.
 *
 * The coordinates are invented for the demo. They do not show any real
 * university. Replace the values in this file to model your own campus.
 */

export const DEMO_COORDINATES_NOTE = 'Demo coordinates for presentation only. They do not show a real campus.'

export const stops: Stop[] = [
  { id: 'main-gate', name: 'Main Gate', code: 'MG', position: { lat: 17.44, lng: 78.346 } },
  { id: 'academic-block', name: 'Academic Block', code: 'AB', position: { lat: 17.4425, lng: 78.3445 } },
  { id: 'central-library', name: 'Central Library', code: 'CL', position: { lat: 17.4452, lng: 78.345 } },
  { id: 'student-centre', name: 'Student Centre', code: 'SC', position: { lat: 17.447, lng: 78.3475 } },
  { id: 'boys-hostel', name: "Boys' Hostel", code: 'BH', position: { lat: 17.449, lng: 78.3505 } },
  { id: 'girls-hostel', name: "Girls' Hostel", code: 'GH', position: { lat: 17.4478, lng: 78.354 } },
  { id: 'sports-complex', name: 'Sports Complex', code: 'SP', position: { lat: 17.4448, lng: 78.355 } },
  { id: 'innovation-hub', name: 'Innovation Hub', code: 'IH', position: { lat: 17.4418, lng: 78.352 } },
]

export const routes: Route[] = [
  {
    id: 'campus-loop',
    name: 'Campus Loop',
    stopIds: [
      'main-gate',
      'academic-block',
      'central-library',
      'student-centre',
      'boys-hostel',
      'girls-hostel',
      'sports-complex',
      'innovation-hub',
    ],
    isLoop: true,
    allowsReverse: true,
  },
]

export const shuttles: Shuttle[] = [
  {
    id: 'sh-01',
    code: 'SH-01',
    name: 'Loop Shuttle A',
    routeId: 'campus-loop',
    direction: 'clockwise',
    capacity: 20,
  },
  {
    id: 'sh-02',
    code: 'SH-02',
    name: 'Loop Shuttle B',
    routeId: 'campus-loop',
    direction: 'anticlockwise',
    capacity: 14,
  },
]

/**
 * How each simulated shuttle moves. 6 m/s is about 22 km/h, a realistic
 * campus speed. One loop takes roughly 10 minutes at 1x and 2 minutes at 5x.
 * SH-02 starts part-way round so the two shuttles are not on top of each other.
 */
export const simulationProfiles: Record<string, SimulationProfile> = {
  'sh-01': { speedMps: 6, dwellSeconds: 15, startOffsetSeconds: 0 },
  'sh-02': { speedMps: 6, dwellSeconds: 15, startOffsetSeconds: 150 },
}

const stopsById = new Map(stops.map((stop) => [stop.id, stop]))
const routesById = new Map(routes.map((route) => [route.id, route]))
const shuttlesById = new Map(shuttles.map((shuttle) => [shuttle.id, shuttle]))

export function getStop(id: string): Stop {
  const stop = stopsById.get(id)
  if (!stop) throw new Error(`Unknown stop: ${id}`)
  return stop
}

export function getRoute(id: string): Route {
  const route = routesById.get(id)
  if (!route) throw new Error(`Unknown route: ${id}`)
  return route
}

export function getShuttle(id: string): Shuttle {
  const shuttle = shuttlesById.get(id)
  if (!shuttle) throw new Error(`Unknown shuttle: ${id}`)
  return shuttle
}

export function findStop(id: string | null | undefined): Stop | undefined {
  return id ? stopsById.get(id) : undefined
}

export function findShuttle(id: string | null | undefined): Shuttle | undefined {
  return id ? shuttlesById.get(id) : undefined
}

/**
 * The order a shuttle visits the stops in.
 * Clockwise follows route.stopIds. Anticlockwise starts at the same first
 * stop and visits the others in reverse.
 */
export function stopsInTravelOrder(route: Route, direction: Direction): string[] {
  if (direction === 'clockwise' || route.stopIds.length < 2) return [...route.stopIds]
  const [first, ...rest] = route.stopIds
  return [first, ...rest.reverse()]
}
