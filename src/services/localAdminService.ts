import { bookingPhase, holdsSeat } from '../booking/bookingState.ts'
import { findShuttle, shuttles } from '../data/campus.ts'
import { withLock } from '../lib/lock.ts'
import { writeJson } from '../lib/storage.ts'
import { elapsedAt } from '../simulator/clock.ts'
import type { AppUser } from '../types/index.ts'
import { seatsAre } from '../utils/format.ts'
import { AdminError, validateShuttleSettings, type AdminService } from './adminService.ts'
import type { AuthService } from './authService.ts'
import { loadLocalUsers, saveLocalUsers, toAppUser } from './localAuthService.ts'
import { LOCAL_BOOKINGS_KEY, LOCAL_BOOKINGS_LOCK, readLocalBookings } from './localBookingService.ts'
import { readLocalFleet, writeLocalFleet } from './localFleetService.ts'
import type { SimulationService } from './simulationService.ts'

/**
 * LOCAL DEMO administrator actions on the accounts and shuttles saved in this
 * browser. Phase 6 runs the same checks in database functions for Supabase.
 */
export function createLocalAdminService(options: { auth: AuthService; simulation: SimulationService }): AdminService {
  const { auth, simulation } = options

  async function requireAdmin(): Promise<AppUser> {
    const user = await auth.getCurrentUser()
    if (!user) throw new AdminError('not_signed_in', 'Sign in as an administrator.')
    if (user.role !== 'admin') throw new AdminError('forbidden', 'Only administrators can do this.')
    return user
  }

  return {
    mode: 'local-demo',

    async listUsers() {
      await requireAdmin()
      const users = await loadLocalUsers()
      return users.map(toAppUser).sort((a, b) => a.name.localeCompare(b.name))
    },

    async updateUser(userId, changes) {
      const admin = await requireAdmin()
      if (!['student', 'operator', 'admin'].includes(changes.role)) {
        throw new AdminError('invalid_input', 'Choose student, operator or administrator.')
      }
      if (userId === admin.id && changes.role !== 'admin') {
        throw new AdminError('cannot_demote_self', 'You cannot remove your own administrator role.')
      }
      const shuttleId = changes.role === 'operator' ? changes.assignedShuttleId : null
      if (changes.role === 'operator' && !findShuttle(shuttleId)) {
        throw new AdminError('invalid_input', 'Choose the shuttle this operator will run.')
      }

      const users = await loadLocalUsers()
      const target = users.find((user) => user.id === userId)
      if (!target) throw new AdminError('not_found', 'That account could not be found.')
      const updated = { ...target, role: changes.role, assignedShuttleId: shuttleId }
      if (!saveLocalUsers(users.map((user) => (user.id === userId ? updated : user)))) {
        throw new AdminError('unavailable', 'This browser is blocking storage, so the change was not saved.')
      }
      return toAppUser(updated)
    },

    async updateShuttle(shuttleId, changes) {
      await requireAdmin()
      if (!findShuttle(shuttleId)) throw new AdminError('not_found', 'That shuttle does not exist.')
      const problem = validateShuttleSettings(changes)
      if (problem) throw new AdminError('invalid_input', problem)

      const clocks = simulation.peekClocks() ?? (await simulation.loadClocks())
      const clock = clocks[shuttleId]
      const elapsed = elapsedAt(clock, simulation.now())
      const inUse = readLocalBookings().filter(
        (booking) => booking.shuttleId === shuttleId && holdsSeat(bookingPhase(booking, clock, elapsed)),
      ).length
      if (changes.capacity < inUse) {
        throw new AdminError(
          'capacity_below_use',
          `${seatsAre(inUse)} already booked on this shuttle, so it needs at least ${inUse}.`,
        )
      }

      const settings = { name: changes.name.trim(), capacity: changes.capacity }
      if (!writeLocalFleet({ ...readLocalFleet(), [shuttleId]: settings })) {
        throw new AdminError('unavailable', 'This browser is blocking storage, so the change was not saved.')
      }
      return settings
    },

    async resetDemo() {
      const admin = await requireAdmin()
      // The same lock as booking, so a booking in another tab cannot land halfway through.
      return withLock(LOCAL_BOOKINGS_LOCK, async () => {
        const removedBookings = readLocalBookings().length
        if (!writeJson(LOCAL_BOOKINGS_KEY, [])) {
          throw new AdminError('unavailable', 'This browser is blocking storage, so the demo could not be reset.')
        }
        for (const shuttle of shuttles) {
          // Reset starts a new run (older bookings can never match it), then run at 1x.
          for (const action of [{ type: 'reset' }, { type: 'speed', speed: 1 }, { type: 'start' }] as const) {
            const result = await simulation.control(admin, shuttle.id, action)
            if (!result.ok) throw new AdminError('unavailable', result.message)
          }
        }
        return { removedBookings }
      })
    },
  }
}
