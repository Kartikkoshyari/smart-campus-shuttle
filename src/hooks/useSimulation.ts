import { createContext, useContext } from 'react'
import type { ControlResult, SimAction } from '../simulator/controls.ts'
import type { ShuttleSnapshot, SimClock, StopEta } from '../types/index.ts'

export interface SimulationContextValue {
  /** "loading" until the clocks have been read (only noticeable in Supabase mode). */
  status: 'loading' | 'ready' | 'error'
  /** The time the screen was last drawn for, in milliseconds. */
  nowMs: number
  getClock(shuttleId: string): SimClock
  getSnapshot(shuttleId: string): ShuttleSnapshot
  getUpcomingStops(shuttleId: string): StopEta[]
  /** Simulated seconds the shuttle has travelled since its last reset. */
  getElapsedSeconds(shuttleId: string): number
  /** Seconds for one full loop at 1x speed. */
  getLoopSeconds(shuttleId: string): number
  /** Runs an operator action. The service checks that the signed-in user may control this shuttle. */
  control(shuttleId: string, action: SimAction): Promise<ControlResult>
}

export const SimulationContext = createContext<SimulationContextValue | null>(null)

/** Live shuttle positions and the simulation controls. */
export function useSimulation(): SimulationContextValue {
  const value = useContext(SimulationContext)
  if (!value) throw new Error('useSimulation must be used inside <SimulationProvider>')
  return value
}
