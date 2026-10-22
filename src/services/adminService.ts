import type { DataMode } from '../lib/env.ts'
import type { AppUser, Role } from '../types/index.ts'
import type { ShuttleSettings } from './fleetService.ts'

/** Administrator-only actions. Each implementation checks the caller is an administrator. */
export interface AdminService {
  mode: DataMode
  listUsers(): Promise<AppUser[]>
  /** Changes a user's role. Operators must be given a shuttle; other roles never have one. */
  updateUser(userId: string, changes: { role: Role; assignedShuttleId: string | null }): Promise<AppUser>
  /** Renames a shuttle or changes its seats. Seats cannot go below the number already booked. */
  updateShuttle(shuttleId: string, changes: ShuttleSettings): Promise<ShuttleSettings>
  /**
   * Starts a fresh demo: removes every booking and restarts every shuttle at 1x.
   * Accounts, roles, shuttle names and seats are kept. Returns how many bookings were removed.
   */
  resetDemo(): Promise<{ removedBookings: number }>
}

export type AdminErrorCode =
  | 'not_signed_in'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'cannot_demote_self'
  | 'capacity_below_use'
  | 'unavailable'

export class AdminError extends Error {
  code: AdminErrorCode

  constructor(code: AdminErrorCode, message: string) {
    super(message)
    this.name = 'AdminError'
    this.code = code
  }
}

export function adminErrorMessage(error: unknown): string {
  if (error instanceof AdminError) return error.message
  return 'The change could not be saved. Check your connection and try again.'
}

/** Checks the values before they are saved. Returns an error message, or null when they are fine. */
export function validateShuttleSettings(changes: ShuttleSettings): string | null {
  const name = changes.name.trim()
  if (name.length < 1 || name.length > 80) return 'Enter a shuttle name of up to 80 characters.'
  if (!Number.isInteger(changes.capacity) || changes.capacity < 1 || changes.capacity > 100) {
    return 'Seats must be a whole number from 1 to 100.'
  }
  return null
}
