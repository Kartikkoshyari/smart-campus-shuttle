import { findShuttle } from '../data/campus.ts'
import { normalizeClock } from '../simulator/clock.ts'
import type { ControlResult } from '../simulator/controls.ts'
import type { AppUser, Booking, ClockMap, Role, SeatHold, SimClock } from '../types/index.ts'
import { AdminError, type AdminErrorCode } from './adminService.ts'
import { AuthError } from './authService.ts'
import { BookingError, type BookingErrorCode } from './bookingService.ts'

/**
 * Converts between database rows (snake_case) and the app's types, and turns
 * database errors into friendly messages. Kept separate so it can be tested
 * without a Supabase project.
 */

// PostgreSQL "numeric" values can arrive as text; this always gives a number.
const toNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value))

export interface ProfileRow {
  id: string
  full_name: string
  email: string
  role: Role
  assigned_shuttle_id: string | null
}

export function rowToUser(row: ProfileRow): AppUser {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    assignedShuttleId: row.assigned_shuttle_id,
  }
}

export interface BookingRow {
  id: string
  code: string
  user_id: string
  passenger_name: string
  shuttle_id: string
  pickup_stop_id: string
  destination_stop_id: string
  status: 'confirmed' | 'cancelled'
  generation: number
  pickup_arrival_elapsed: number | string
  pickup_departure_elapsed: number | string
  dropoff_elapsed: number | string
  created_at: string
  cancelled_at: string | null
}

export function rowToBooking(row: BookingRow): Booking {
  const shuttle = findShuttle(row.shuttle_id)
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id,
    passengerName: row.passenger_name,
    shuttleId: row.shuttle_id,
    routeId: shuttle?.routeId ?? '',
    direction: shuttle?.direction ?? 'clockwise',
    pickupStopId: row.pickup_stop_id,
    destinationStopId: row.destination_stop_id,
    status: row.status,
    generation: toNumber(row.generation),
    pickupArrivalElapsed: toNumber(row.pickup_arrival_elapsed),
    pickupDepartureElapsed: toNumber(row.pickup_departure_elapsed),
    dropoffElapsed: toNumber(row.dropoff_elapsed),
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
  }
}

export interface SeatHoldRow {
  booking_id: string
  shuttle_id: string
  generation: number
  pickup_departure_elapsed: number | string
  dropoff_elapsed: number | string
  pickup_stop_id: string
  destination_stop_id: string
}

export function rowToSeatHold(row: SeatHoldRow): SeatHold {
  return {
    bookingId: row.booking_id,
    shuttleId: row.shuttle_id,
    generation: toNumber(row.generation),
    pickupDepartureElapsed: toNumber(row.pickup_departure_elapsed),
    dropoffElapsed: toNumber(row.dropoff_elapsed),
    pickupStopId: row.pickup_stop_id,
    destinationStopId: row.destination_stop_id,
  }
}

export interface ClockRow {
  shuttle_id: string
  run_state: string
  speed: number
  base_elapsed: number | string
  base_time: string
  generation: number
}

export function rowToClock(row: ClockRow): SimClock | null {
  return normalizeClock({
    runState: row.run_state,
    speed: toNumber(row.speed),
    baseElapsed: toNumber(row.base_elapsed),
    baseTimeMs: Date.parse(row.base_time),
    generation: toNumber(row.generation),
  })
}

/** Reads the result of get_sim_state(). */
export function parseSimState(value: unknown): { serverTimeMs: number; clocks: ClockMap } {
  const state = (value ?? {}) as { server_time_ms?: unknown; clocks?: Record<string, Record<string, unknown>> }
  const clocks: ClockMap = {}
  for (const [shuttleId, raw] of Object.entries(state.clocks ?? {})) {
    const clock = normalizeClock({
      runState: raw.runState,
      speed: toNumber(raw.speed),
      baseElapsed: toNumber(raw.baseElapsed),
      baseTimeMs: toNumber(raw.baseTimeMs),
      generation: toNumber(raw.generation),
    })
    if (clock) clocks[shuttleId] = clock
  }
  return { serverTimeMs: toNumber(state.server_time_ms), clocks }
}

/** The shape of an error from a Supabase database call. */
export interface DatabaseError {
  message: string
  hint?: string | null
  code?: string | null
}

const BOOKING_CODES: readonly BookingErrorCode[] = [
  'missing_stop',
  'same_stop',
  'unknown_stop',
  'not_served',
  'pickup_passed',
  'wrong_order',
  'not_signed_in',
  'students_only',
  'unknown_shuttle',
  'full',
  'duplicate',
  'not_found',
  'forbidden',
  'already_cancelled',
  'not_cancellable',
]

/** Database functions put a short code in HINT; anything else is a connection problem. */
export function toBookingError(error: DatabaseError): BookingError {
  const code = BOOKING_CODES.find((known) => known === error.hint)
  if (code) return new BookingError(code, error.message)
  return new BookingError(
    'unavailable',
    'The booking service could not be reached. Check your connection and try again.',
  )
}

export function toControlResult(error: DatabaseError | null): ControlResult {
  if (!error) return { ok: true }
  if (error.hint) return { ok: false, message: error.message }
  return { ok: false, message: 'The shuttle could not be updated. Check your connection and try again.' }
}

/** The shape of an error from Supabase Auth. */
export interface SupabaseAuthError {
  message: string
  code?: string
  status?: number
}

export function toAuthError(error: SupabaseAuthError): AuthError {
  const code = error.code ?? ''
  const message = error.message.toLowerCase()
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return new AuthError('Email or password is incorrect.', 'invalid_credentials')
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return new AuthError('Confirm your email address using the link we sent, then sign in.', 'email_not_confirmed')
  }
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) {
    return new AuthError('An account with this email already exists. Sign in instead.', 'email_taken')
  }
  if (code === 'weak_password') {
    return new AuthError('Choose a stronger password with at least 8 characters.', 'invalid_input')
  }
  if (code === 'over_email_send_rate_limit' || error.status === 429) {
    return new AuthError('Too many attempts. Wait a minute and try again.', 'unavailable')
  }
  return new AuthError('Sign-in is unavailable right now. Check your connection and try again.', 'unavailable')
}

const ADMIN_CODES: readonly AdminErrorCode[] = [
  'not_signed_in',
  'forbidden',
  'not_found',
  'invalid_input',
  'cannot_demote_self',
  'capacity_below_use',
]

export function toAdminError(error: DatabaseError): AdminError {
  const code = ADMIN_CODES.find((known) => known === error.hint)
  if (code) return new AdminError(code, error.message)
  return new AdminError('unavailable', 'The change could not be saved. Check your connection and try again.')
}
