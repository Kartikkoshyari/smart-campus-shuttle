import { shuttles } from '../data/campus.ts'
import type { MapMarker } from '../types/index.ts'
import { useSimulation } from './useSimulation.ts'

/** Map markers for every shuttle on a route, with one shuttle highlighted. */
export function useShuttleMarkers(routeId: string, selectedShuttleId: string): MapMarker[] {
  const { getSnapshot } = useSimulation()
  return shuttles
    .filter((shuttle) => shuttle.routeId === routeId)
    .map((shuttle) => ({
      id: shuttle.id,
      code: shuttle.code,
      position: getSnapshot(shuttle.id).position,
      selected: shuttle.id === selectedShuttleId,
    }))
}
