import { createContext, useContext } from 'react'
import type { Booking, BookingPhase, BookingRequest, SeatHold } from '../types/index.ts'

export interface BookingsContextValue {
  /** The signed-in student's bookings, newest first. Empty for other roles. */
  myBookings: Booking[]
  /** Every booking. Only loaded for administrators. */
  allBookings: Booking[]
  /** Bookings on an operator's assigned shuttle. Only loaded for operators. */
  shuttleBookings: Booking[]
  seatHolds: SeatHold[]
  status: 'loading' | 'ready' | 'error'
  /** A message to show when status is "error". */
  error: string | null
  refresh(): Promise<void>
  create(request: BookingRequest): Promise<Booking>
  cancel(bookingId: string): Promise<Booking>
  /** Free seats on a shuttle right now. */
  getSeatsAvailable(shuttleId: string): number
  /** What a booking means right now (upcoming, on board, completed...). */
  getPhase(booking: Booking): BookingPhase
}

export const BookingsContext = createContext<BookingsContextValue | null>(null)

export function useBookings(): BookingsContextValue {
  const value = useContext(BookingsContext)
  if (!value) throw new Error('useBookings must be used inside <BookingsProvider>')
  return value
}
