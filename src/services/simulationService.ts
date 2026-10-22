import type { DataMode } from '../lib/env.ts'
import type { ControlResult, SimAction } from '../simulator/controls.ts'
import type { AppUser, ClockMap } from '../types/index.ts'

/**
 * Where the simulation clocks live. Local demo mode keeps them in this
 * browser; Supabase mode (Phase 5) keeps them in the database so every
 * device sees the same shuttle position.
 */
export interface SimulationService {
  mode: DataMode
  /** The current time in milliseconds. In Supabase mode it is matched to the server clock. */
  now(): number
  /** Clocks that are available straight away, or null if they must be loaded first. */
  peekClocks(): ClockMap | null
  loadClocks(): Promise<ClockMap>
  /** Runs an operator action. The service checks that the user may control the shuttle. */
  control(actor: AppUser | null, shuttleId: string, action: SimAction): Promise<ControlResult>
  /** Calls the listener whenever any clock changes, including in other tabs. */
  subscribe(listener: (clocks: ClockMap) => void): () => void
}
