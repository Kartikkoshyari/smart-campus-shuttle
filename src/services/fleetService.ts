import type { DataMode } from '../lib/env.ts'

/** The parts of a shuttle an administrator can change. */
export interface ShuttleSettings {
  name: string
  capacity: number
}

/**
 * Current shuttle names and seat capacities. The route, stops and timetable
 * come from src/data/campus.ts; administrators can rename shuttles and change
 * how many seats each has.
 */
export interface FleetService {
  mode: DataMode
  /** Settings for every shuttle that has been changed (or all of them, in Supabase mode). */
  loadSettings(): Promise<Record<string, ShuttleSettings>>
  /** Settings available straight away, or null if they must be loaded first. */
  peekSettings(): Record<string, ShuttleSettings> | null
  subscribe(listener: () => void): () => void
}
