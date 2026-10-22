import { createContext, useContext } from 'react'
import type { Shuttle } from '../types/index.ts'

export interface FleetContextValue {
  /** Every shuttle, with the name and seats an administrator may have changed. */
  shuttles: Shuttle[]
  getShuttle(shuttleId: string): Shuttle
  refresh(): Promise<void>
}

export const FleetContext = createContext<FleetContextValue | null>(null)

export function useFleet(): FleetContextValue {
  const value = useContext(FleetContext)
  if (!value) throw new Error('useFleet must be used inside <FleetProvider>')
  return value
}
