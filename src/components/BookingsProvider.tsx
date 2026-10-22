import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { bookingPhase, seatsInUse } from '../booking/bookingState.ts'
import { useAuth } from '../hooks/useAuth.ts'
import { BookingsContext, type BookingsContextValue } from '../hooks/useBookings.ts'
import { useFleet } from '../hooks/useFleet.ts'
import { useSimulation } from '../hooks/useSimulation.ts'
import { bookingErrorMessage, type BookingService } from '../services/bookingService.ts'
import { bookingService } from '../services/index.ts'
import type { Booking, BookingRequest, SeatHold } from '../types/index.ts'

interface BookingsProviderProps {
  children: ReactNode
  /** Tests pass their own service. The app uses the default. */
  service?: BookingService
}

/** Loads bookings and seat use, and keeps them up to date. */
export default function BookingsProvider({ children, service = bookingService }: BookingsProviderProps) {
  const { user } = useAuth()
  const { getShuttle } = useFleet()
  const { getClock, getElapsedSeconds } = useSimulation()
  const [myBookings, setMyBookings] = useState<Booking[]>([])
  const [allBookings, setAllBookings] = useState<Booking[]>([])
  const [shuttleBookings, setShuttleBookings] = useState<Booking[]>([])
  const [seatHolds, setSeatHolds] = useState<SeatHold[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  // Ignores answers from an older request if a newer one has started.
  const requestId = useRef(0)

  const isStudent = user?.role === 'student'
  const isAdmin = user?.role === 'admin'
  const operatorShuttleId = user?.role === 'operator' ? user.assignedShuttleId : null

  const refresh = useCallback(async () => {
    requestId.current += 1
    const id = requestId.current
    try {
      const [holds, mine, all, crew] = await Promise.all([
        service.listSeatHolds(),
        isStudent ? service.listMyBookings() : Promise.resolve([]),
        isAdmin ? service.listAllBookings() : Promise.resolve([]),
        operatorShuttleId ? service.listShuttleBookings(operatorShuttleId) : Promise.resolve([]),
      ])
      if (id !== requestId.current) return
      setSeatHolds(holds)
      setMyBookings(mine)
      setAllBookings(all)
      setShuttleBookings(crew)
      setStatus('ready')
      setError(null)
    } catch (caught) {
      if (id !== requestId.current) return
      setStatus('error')
      setError(bookingErrorMessage(caught))
    }
  }, [service, isStudent, isAdmin, operatorShuttleId])

  // Reload when the signed-in user changes, and whenever bookings change.
  useEffect(() => {
    // refresh() only sets state after the service answers, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
    return service.subscribe(() => void refresh())
  }, [refresh, service, user?.id])

  const create = useCallback(
    async (request: BookingRequest) => {
      const booking = await service.createBooking(request)
      await refresh()
      return booking
    },
    [service, refresh],
  )

  const cancel = useCallback(
    async (bookingId: string) => {
      const booking = await service.cancelBooking(bookingId)
      await refresh()
      return booking
    },
    [service, refresh],
  )

  const getSeatsAvailable = useCallback(
    (shuttleId: string) =>
      Math.max(
        0,
        getShuttle(shuttleId).capacity -
          seatsInUse(seatHolds, shuttleId, getClock(shuttleId), getElapsedSeconds(shuttleId)),
      ),
    [getShuttle, seatHolds, getClock, getElapsedSeconds],
  )

  const getPhase = useCallback(
    (booking: Booking) => bookingPhase(booking, getClock(booking.shuttleId), getElapsedSeconds(booking.shuttleId)),
    [getClock, getElapsedSeconds],
  )

  const value = useMemo<BookingsContextValue>(
    () => ({
      myBookings,
      allBookings,
      shuttleBookings,
      seatHolds,
      status,
      error,
      refresh,
      create,
      cancel,
      getSeatsAvailable,
      getPhase,
    }),
    [
      myBookings,
      allBookings,
      shuttleBookings,
      seatHolds,
      status,
      error,
      refresh,
      create,
      cancel,
      getSeatsAvailable,
      getPhase,
    ],
  )

  return <BookingsContext value={value}>{children}</BookingsContext>
}
