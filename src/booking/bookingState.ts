import type { Booking, BookingPhase, SeatHold, SimClock } from '../types/index.ts'

type BookingTimes = Pick<Booking, 'status' | 'generation' | 'pickupDepartureElapsed' | 'dropoffElapsed'>

/** What a booking means right now, given the shuttle's simulation clock. */
export function bookingPhase(booking: BookingTimes, clock: SimClock, elapsedSeconds: number): BookingPhase {
  if (booking.status === 'cancelled') return 'cancelled'
  if (booking.generation !== clock.generation) return 'expired'
  if (elapsedSeconds >= booking.dropoffElapsed) return 'completed'
  if (elapsedSeconds >= booking.pickupDepartureElapsed) return 'on_board'
  return 'upcoming'
}

/** A seat is held from the moment of booking until the shuttle reaches the destination. */
export function holdsSeat(phase: BookingPhase): boolean {
  return phase === 'upcoming' || phase === 'on_board'
}

/** Bookings can be cancelled until the shuttle leaves the pickup stop. */
export function canCancel(phase: BookingPhase): boolean {
  return phase === 'upcoming'
}

export function toSeatHold(booking: Booking): SeatHold {
  return {
    bookingId: booking.id,
    shuttleId: booking.shuttleId,
    generation: booking.generation,
    pickupDepartureElapsed: booking.pickupDepartureElapsed,
    dropoffElapsed: booking.dropoffElapsed,
    pickupStopId: booking.pickupStopId,
    destinationStopId: booking.destinationStopId,
  }
}

/**
 * How many seats are taken on a shuttle right now.
 *
 * Capacity is counted for the WHOLE shuttle: a booking holds one seat from the
 * moment it is made until the drop-off, even on stretches of road before the
 * pickup. This is simpler than per-segment capacity and never overbooks.
 */
export function seatsInUse(holds: SeatHold[], shuttleId: string, clock: SimClock, elapsedSeconds: number): number {
  return holds.filter(
    (hold) =>
      hold.shuttleId === shuttleId && holdsSeat(bookingPhase({ ...hold, status: 'confirmed' }, clock, elapsedSeconds)),
  ).length
}

export const bookingPhaseLabel: Record<BookingPhase, string> = {
  upcoming: 'Confirmed',
  on_board: 'On board',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Run ended',
}
