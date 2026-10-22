import { generateBookingCode } from '../booking/bookingCode.ts'
import { bookingPhase, canCancel, holdsSeat, toSeatHold } from '../booking/bookingState.ts'
import { planJourney } from '../booking/journey.ts'
import { findShuttle, getRoute } from '../data/campus.ts'
import { withLock } from '../lib/lock.ts'
import { readJson, writeJson } from '../lib/storage.ts'
import { elapsedAt } from '../simulator/clock.ts'
import { getTimeline } from '../simulator/timetables.ts'
import type { AppUser, Booking } from '../types/index.ts'
import type { AuthService } from './authService.ts'
import { BookingError, type BookingService } from './bookingService.ts'
import type { SimulationService } from './simulationService.ts'

/**
 * LOCAL DEMO bookings, saved in this browser's localStorage.
 *
 * All the booking rules run here: journey checks, seat capacity, duplicate
 * bookings and cancellation. It is NOT secure, because anyone using this
 * browser can edit localStorage. Phase 5 runs the same rules inside a
 * PostgreSQL function, which the browser cannot bypass.
 */

export const LOCAL_BOOKINGS_KEY = 'scs.local.bookings.v1'
/** Shared by everything that changes local bookings, in every tab. */
export const LOCAL_BOOKINGS_LOCK = 'scs-bookings'

export interface LocalBookingOptions {
  auth: AuthService
  simulation: SimulationService
  /** Seats on each shuttle. Defaults to the demo data. */
  getCapacity?: (shuttleId: string) => number
}

function isBooking(value: unknown): value is Booking {
  if (!value || typeof value !== 'object') return false
  const b = value as Record<string, unknown>
  return (
    typeof b.id === 'string' &&
    typeof b.code === 'string' &&
    typeof b.userId === 'string' &&
    typeof b.shuttleId === 'string' &&
    (b.status === 'confirmed' || b.status === 'cancelled') &&
    typeof b.generation === 'number' &&
    typeof b.pickupDepartureElapsed === 'number' &&
    typeof b.dropoffElapsed === 'number'
  )
}

/** Every booking saved in this browser, ignoring damaged entries. */
export function readLocalBookings(): Booking[] {
  const saved = readJson<unknown>(LOCAL_BOOKINGS_KEY, [])
  return Array.isArray(saved) ? saved.filter(isBooking) : []
}

export function createLocalBookingService(options: LocalBookingOptions): BookingService {
  const { auth, simulation } = options
  const getCapacity = options.getCapacity ?? ((shuttleId: string) => findShuttle(shuttleId)?.capacity ?? 0)
  const listeners = new Set<() => void>()

  const readBookings = readLocalBookings

  function saveBookings(bookings: Booking[]) {
    if (!writeJson(LOCAL_BOOKINGS_KEY, bookings)) {
      throw new BookingError('unavailable', 'This browser is blocking storage, so the booking could not be saved.')
    }
    listeners.forEach((listener) => listener())
  }

  async function requireUser(): Promise<AppUser> {
    const user = await auth.getCurrentUser()
    if (!user) throw new BookingError('not_signed_in', 'Sign in to manage bookings.')
    return user
  }

  async function clockState(shuttleId: string) {
    const clocks = simulation.peekClocks() ?? (await simulation.loadClocks())
    const clock = clocks[shuttleId]
    return { clock, elapsed: elapsedAt(clock, simulation.now()) }
  }

  function onStorage(event: StorageEvent) {
    if (event.key === LOCAL_BOOKINGS_KEY) listeners.forEach((listener) => listener())
  }

  return {
    mode: 'local-demo',

    async listMyBookings() {
      const user = await requireUser()
      return readBookings()
        .filter((booking) => booking.userId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    async listAllBookings() {
      const user = await requireUser()
      if (user.role !== 'admin') throw new BookingError('forbidden', 'Only administrators can see every booking.')
      return readBookings().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    async listShuttleBookings(shuttleId) {
      const user = await requireUser()
      const allowed = user.role === 'admin' || (user.role === 'operator' && user.assignedShuttleId === shuttleId)
      if (!allowed) {
        throw new BookingError(
          'forbidden',
          'Only the operator of this shuttle and administrators can see its passengers.',
        )
      }
      return readBookings()
        .filter((booking) => booking.shuttleId === shuttleId)
        .sort((a, b) => a.pickupArrivalElapsed - b.pickupArrivalElapsed)
    },

    async listSeatHolds() {
      return readBookings()
        .filter((booking) => booking.status === 'confirmed')
        .map(toSeatHold)
    },

    createBooking(request) {
      // One booking at a time, so two people can never take the same last seat.
      return withLock(LOCAL_BOOKINGS_LOCK, async () => {
        const user = await requireUser()
        if (user.role !== 'student') {
          throw new BookingError('students_only', 'Only student accounts can book seats.')
        }

        const shuttle = findShuttle(request.shuttleId)
        if (!shuttle) throw new BookingError('unknown_shuttle', 'That shuttle does not exist.')
        const route = getRoute(shuttle.routeId)
        const { clock, elapsed } = await clockState(shuttle.id)

        const check = planJourney({
          shuttle,
          route,
          timeline: getTimeline(shuttle.id),
          elapsedSeconds: elapsed,
          pickupStopId: request.pickupStopId,
          destinationStopId: request.destinationStopId,
        })
        if (!check.ok) throw new BookingError(check.code, check.message)

        const bookings = readBookings()
        const active = bookings.filter(
          (booking) => booking.shuttleId === shuttle.id && holdsSeat(bookingPhase(booking, clock, elapsed)),
        )

        const mine = active.find((booking) => booking.userId === user.id)
        if (mine) {
          throw new BookingError(
            'duplicate',
            `You already have a booking on ${shuttle.code} (${mine.code}). Cancel it before booking another journey on this shuttle.`,
          )
        }

        const capacity = getCapacity(shuttle.id)
        if (active.length >= capacity) {
          throw new BookingError(
            'full',
            `${shuttle.code} is full: all ${capacity} seats are booked. Try another shuttle.`,
          )
        }

        const usedCodes = new Set(bookings.map((booking) => booking.code))
        let code = generateBookingCode()
        while (usedCodes.has(code)) code = generateBookingCode()

        const booking: Booking = {
          id: crypto.randomUUID(),
          code,
          userId: user.id,
          passengerName: user.name,
          shuttleId: shuttle.id,
          routeId: route.id,
          direction: shuttle.direction,
          pickupStopId: check.plan.pickupStopId,
          destinationStopId: check.plan.destinationStopId,
          status: 'confirmed',
          generation: clock.generation,
          pickupArrivalElapsed: check.plan.pickupArrivalElapsed,
          pickupDepartureElapsed: check.plan.pickupDepartureElapsed,
          dropoffElapsed: check.plan.dropoffElapsed,
          createdAt: new Date(simulation.now()).toISOString(),
          cancelledAt: null,
        }
        saveBookings([...bookings, booking])
        return booking
      })
    },

    cancelBooking(bookingId) {
      return withLock(LOCAL_BOOKINGS_LOCK, async () => {
        const user = await requireUser()
        const bookings = readBookings()
        const booking = bookings.find((candidate) => candidate.id === bookingId)
        if (!booking) throw new BookingError('not_found', 'That booking could not be found.')
        if (booking.userId !== user.id && user.role !== 'admin') {
          throw new BookingError('forbidden', 'You can only cancel your own bookings.')
        }
        if (booking.status === 'cancelled') {
          throw new BookingError('already_cancelled', `Booking ${booking.code} is already cancelled.`)
        }

        const { clock, elapsed } = await clockState(booking.shuttleId)
        const phase = bookingPhase(booking, clock, elapsed)
        if (!canCancel(phase)) {
          const reason =
            phase === 'on_board'
              ? 'the shuttle has already left the pickup stop'
              : phase === 'completed'
                ? 'the journey is complete'
                : 'the run has ended'
          throw new BookingError('not_cancellable', `Booking ${booking.code} cannot be cancelled because ${reason}.`)
        }

        const cancelled: Booking = {
          ...booking,
          status: 'cancelled',
          cancelledAt: new Date(simulation.now()).toISOString(),
        }
        saveBookings(bookings.map((candidate) => (candidate.id === booking.id ? cancelled : candidate)))
        return cancelled
      })
    },

    subscribe(listener) {
      if (listeners.size === 0) window.addEventListener('storage', onStorage)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) window.removeEventListener('storage', onStorage)
      }
    },
  }
}
