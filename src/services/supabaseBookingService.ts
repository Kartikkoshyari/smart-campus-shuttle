import type { SupabaseClient } from '@supabase/supabase-js'
import { BookingError, type BookingService } from './bookingService.ts'
import {
  rowToBooking,
  rowToSeatHold,
  toBookingError,
  type BookingRow,
  type DatabaseError,
  type SeatHoldRow,
} from './supabaseMappers.ts'

/** A function that returns one row may come back as an object or a one-item list. */
function oneRow(data: unknown): BookingRow {
  return (Array.isArray(data) ? data[0] : data) as BookingRow
}

/** How often seat counts are refreshed even if no change notification arrives. */
const REFRESH_EVERY_MS = 30_000

/**
 * Bookings stored in Supabase. Booking and cancelling call database
 * functions (book_seat, cancel_booking) that check every rule and lock the
 * shuttle row, so the last seat can never be given to two students.
 * Reading goes through Row Level Security: students see only their own bookings.
 */
export function createSupabaseBookingService(client: SupabaseClient): BookingService {
  async function currentUserId(): Promise<string> {
    const { data } = await client.auth.getSession()
    const id = data.session?.user.id
    if (!id) throw new BookingError('not_signed_in', 'Sign in to manage bookings.')
    return id
  }

  function failIf(error: DatabaseError | null) {
    if (error) throw toBookingError(error)
  }

  return {
    mode: 'supabase',

    async listMyBookings() {
      const userId = await currentUserId()
      const { data, error } = await client
        .from('bookings')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      failIf(error)
      return ((data ?? []) as BookingRow[]).map(rowToBooking)
    },

    async listAllBookings() {
      await currentUserId()
      // Row Level Security returns every booking only to administrators.
      const { data, error } = await client.from('bookings').select('*').order('created_at', { ascending: false })
      failIf(error)
      return ((data ?? []) as BookingRow[]).map(rowToBooking)
    },

    async listShuttleBookings(shuttleId) {
      await currentUserId()
      // Row Level Security returns these only to the shuttle's operator and administrators.
      const { data, error } = await client
        .from('bookings')
        .select('*')
        .eq('shuttle_id', shuttleId)
        .order('pickup_arrival_elapsed', { ascending: true })
      failIf(error)
      return ((data ?? []) as BookingRow[]).map(rowToBooking)
    },

    async listSeatHolds() {
      const { data, error } = await client.rpc('get_seat_holds')
      failIf(error)
      return ((data ?? []) as SeatHoldRow[]).map(rowToSeatHold)
    },

    async createBooking(request) {
      const { data, error } = await client.rpc('book_seat', {
        p_shuttle_id: request.shuttleId,
        p_pickup_stop_id: request.pickupStopId,
        p_destination_stop_id: request.destinationStopId,
      })
      failIf(error)
      return rowToBooking(oneRow(data))
    },

    async cancelBooking(bookingId) {
      const { data, error } = await client.rpc('cancel_booking', { p_booking_id: bookingId })
      failIf(error)
      return rowToBooking(oneRow(data))
    },

    subscribe(listener) {
      // Seat counts change when anyone books or cancels (shuttles.seat_version),
      // and your own bookings change when you or an administrator act on them.
      const channel = client
        .channel(`bookings-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shuttles' }, () => listener())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => listener())
        .subscribe()
      const timer = window.setInterval(listener, REFRESH_EVERY_MS)
      return () => {
        window.clearInterval(timer)
        void client.removeChannel(channel)
      }
    },
  }
}
