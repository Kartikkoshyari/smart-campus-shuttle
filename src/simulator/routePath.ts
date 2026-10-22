import { getStop, stopsInTravelOrder } from '../data/campus.ts'
import type { Direction, LatLng, Route } from '../types/index.ts'
import { distanceMetres } from '../utils/geo.ts'

/** One stretch of road between two neighbouring stops. */
export interface PathSegment {
  fromStopId: string
  toStopId: string
  from: LatLng
  to: LatLng
  lengthMetres: number
}

/** The full path a shuttle drives, in the order it drives it. */
export interface RoutePath {
  routeId: string
  direction: Direction
  /** Stops in travel order. */
  stopIds: string[]
  segments: PathSegment[]
  totalMetres: number
}

/**
 * Builds the path a shuttle follows. A loop route returns from the last stop
 * to the first. A one-way route drives out and back again, so the shuttle
 * still ends where it started.
 */
export function buildRoutePath(route: Route, direction: Direction): RoutePath {
  const order = stopsInTravelOrder(route, direction)
  if (order.length < 2) throw new Error(`Route ${route.id} needs at least two stops`)

  const visits = route.isLoop ? [...order, order[0]] : [...order, ...order.slice(0, -1).reverse()]

  const segments: PathSegment[] = []
  for (let i = 0; i < visits.length - 1; i += 1) {
    const from = getStop(visits[i]).position
    const to = getStop(visits[i + 1]).position
    segments.push({
      fromStopId: visits[i],
      toStopId: visits[i + 1],
      from,
      to,
      lengthMetres: distanceMetres(from, to),
    })
  }

  return {
    routeId: route.id,
    direction,
    stopIds: order,
    segments,
    totalMetres: segments.reduce((sum, segment) => sum + segment.lengthMetres, 0),
  }
}
