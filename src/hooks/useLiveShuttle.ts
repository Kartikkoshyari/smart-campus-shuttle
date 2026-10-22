import { getRoute } from '../data/campus.ts'
import type { Route, Shuttle, ShuttleSnapshot } from '../types/index.ts'
import { useBookings } from './useBookings.ts'
import { useFleet } from './useFleet.ts'
import { useSimulation } from './useSimulation.ts'

export interface LiveShuttle {
  shuttle: Shuttle
  route: Route
  /** Position and status from the simulation, with seats from the bookings. */
  snapshot: ShuttleSnapshot
}

/** Everything a screen needs to show one shuttle right now. */
export function useLiveShuttle(shuttleId: string): LiveShuttle {
  const { getSnapshot } = useSimulation()
  const { getSeatsAvailable } = useBookings()
  const { getShuttle } = useFleet()
  const shuttle = getShuttle(shuttleId)
  return {
    shuttle,
    route: getRoute(shuttle.routeId),
    snapshot: { ...getSnapshot(shuttleId), seatsAvailable: getSeatsAvailable(shuttleId) },
  }
}
