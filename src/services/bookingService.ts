import type { JourneyErrorCode } from '../booking/journey.ts'
import type { DataMode } from '../lib/env.ts'
import type { Booking, BookingRequest, SeatHold } from '../types/index.ts'

/**
 * The contract every booking implementation follows: local demo mode
 * (this phase) and Supabase (Phase 5). Pages only talk to this interface.
 * The signed-in user is always taken from the session, never from the page.
 */
export interface BookingService {
  mode: DataMode
  /** The signed-in student's own bookings, newest first. */
  listMyBookings(): Promise<Booking[]>
  /** Every booking. Administrators only. */
  listAllBookings(): Promise<Booking[]>
  /** Bookings on one shuttle. Its assigned operator and administrators only. */
  listShuttleBookings(shuttleId: string): Promise<Booking[]>
  /** Seat use on every shuttle, without any personal details. */
  listSeatHolds(): Promise<SeatHold[]>
  createBooking(request: BookingRequest): Promise<Booking>
  cancelBooking(bookingId: string): Promise<Booking>
  /** Calls the listener when bookings change, including in other tabs. */
  subscribe(listener: () => void): () => void
}

export type BookingErrorCode =
  | JourneyErrorCode
  | 'not_signed_in'
  | 'students_only'
  | 'unknown_shuttle'
  | 'full'
  | 'duplicate'
  | 'not_found'
  | 'forbidden'
  | 'already_cancelled'
  | 'not_cancellable'
  | 'unavailable'

export class BookingError extends Error {
  code: BookingErrorCode

  constructor(code: BookingErrorCode, message: string) {
    super(message)
    this.name = 'BookingError'
    this.code = code
  }
}

/** A message that is safe to show, whatever went wrong. */
export function bookingErrorMessage(error: unknown): string {
  if (error instanceof BookingError) return error.message
  return 'Something went wrong while saving. Check your connection and try again.'
}
