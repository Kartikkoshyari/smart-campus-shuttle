import { beforeEach, describe, expect, it } from 'vitest'
import type { AuthService } from '../src/services/authService.ts'
import { createLocalAdminService } from '../src/services/localAdminService.ts'
import { loadLocalUsers } from '../src/services/localAuthService.ts'
import { createLocalBookingService } from '../src/services/localBookingService.ts'
import { readLocalBookings } from '../src/services/localBookingService.ts'
import { localCapacityOf, readLocalFleet } from '../src/services/localFleetService.ts'
import { createLocalSimulationService } from '../src/services/localSimulationService.ts'
import type { AppUser, BookingRequest } from '../src/types/index.ts'

const admin: AppUser = {
  id: 'demo-admin',
  name: 'Meera Iyer',
  email: 'admin@shuttle.test',
  role: 'admin',
  assignedShuttleId: null,
}
const operator: AppUser = {
  id: 'demo-operator',
  name: 'Ravi Kumar',
  email: 'operator@shuttle.test',
  role: 'operator',
  assignedShuttleId: 'sh-01',
}
const student = (id: string): AppUser => ({
  id,
  name: `Student ${id}`,
  email: `${id}@x.test`,
  role: 'student',
  assignedShuttleId: null,
})

function signedInAs(person: AppUser | null): AuthService {
  return {
    mode: 'local-demo',
    getCurrentUser: async () => person,
    signIn: async () => {
      throw new Error('not used')
    },
    signUp: async () => {
      throw new Error('not used')
    },
    signOut: async () => undefined,
  }
}

const journey: BookingRequest = { shuttleId: 'sh-01', pickupStopId: 'main-gate', destinationStopId: 'central-library' }
let simulation: ReturnType<typeof createLocalSimulationService>

const adminAs = (person: AppUser | null) => createLocalAdminService({ auth: signedInAs(person), simulation })
const bookingsAs = (person: AppUser | null) =>
  createLocalBookingService({ auth: signedInAs(person), simulation, getCapacity: localCapacityOf })

beforeEach(() => {
  simulation = createLocalSimulationService({ getNow: () => 1_000_000 })
  simulation.peekClocks()
})

describe('managing accounts', () => {
  it('lists accounts for administrators only', async () => {
    const users = await adminAs(admin).listUsers()
    expect(users.map((user) => user.email)).toEqual(
      expect.arrayContaining(['student@shuttle.test', 'operator@shuttle.test', 'admin@shuttle.test']),
    )
    await expect(adminAs(student('s1')).listUsers()).rejects.toMatchObject({ code: 'forbidden' })
    await expect(adminAs(null).listUsers()).rejects.toMatchObject({ code: 'not_signed_in' })
  })

  it('makes a student an operator of a shuttle, who can then control it', async () => {
    const updated = await adminAs(admin).updateUser('demo-student', { role: 'operator', assignedShuttleId: 'sh-02' })
    expect(updated).toMatchObject({ role: 'operator', assignedShuttleId: 'sh-02' })

    const stored = (await loadLocalUsers()).find((user) => user.id === 'demo-student')
    expect(stored?.role).toBe('operator')
    expect(await simulation.control(updated, 'sh-02', { type: 'pause' })).toEqual({ ok: true })
  })

  it('clears the shuttle when someone stops being an operator', async () => {
    const updated = await adminAs(admin).updateUser('demo-operator', { role: 'student', assignedShuttleId: 'sh-01' })
    expect(updated.assignedShuttleId).toBeNull()
  })

  it('refuses bad role changes', async () => {
    await expect(
      adminAs(admin).updateUser('demo-student', { role: 'operator', assignedShuttleId: null }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      adminAs(admin).updateUser('demo-admin', { role: 'student', assignedShuttleId: null }),
    ).rejects.toMatchObject({ code: 'cannot_demote_self' })
    await expect(
      adminAs(admin).updateUser('nobody', { role: 'student', assignedShuttleId: null }),
    ).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(
      adminAs(student('s1')).updateUser('s1', { role: 'admin', assignedShuttleId: null }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('managing shuttles', () => {
  it('renames a shuttle and changes its seats', async () => {
    const saved = await adminAs(admin).updateShuttle('sh-01', { name: '  Library Express ', capacity: 12 })
    expect(saved).toEqual({ name: 'Library Express', capacity: 12 })
    expect(readLocalFleet()['sh-01']).toEqual(saved)
    expect(localCapacityOf('sh-01')).toBe(12)
  })

  it('enforces the new capacity when booking', async () => {
    await adminAs(admin).updateShuttle('sh-01', { name: 'Loop Shuttle A', capacity: 1 })
    await bookingsAs(student('s1')).createBooking(journey)
    await expect(bookingsAs(student('s2')).createBooking(journey)).rejects.toMatchObject({ code: 'full' })
  })

  it('never lowers seats below the number already booked', async () => {
    await bookingsAs(student('s1')).createBooking(journey)
    await bookingsAs(student('s2')).createBooking(journey)
    await expect(adminAs(admin).updateShuttle('sh-01', { name: 'Loop Shuttle A', capacity: 1 })).rejects.toMatchObject({
      code: 'capacity_below_use',
      message: '2 seats are already booked on this shuttle, so it needs at least 2.',
    })
    await expect(adminAs(admin).updateShuttle('sh-01', { name: 'Loop Shuttle A', capacity: 2 })).resolves.toBeTruthy()
  })

  it('checks the values', async () => {
    await expect(adminAs(admin).updateShuttle('sh-01', { name: '', capacity: 10 })).rejects.toMatchObject({
      code: 'invalid_input',
    })
    await expect(adminAs(admin).updateShuttle('sh-01', { name: 'A', capacity: 101 })).rejects.toMatchObject({
      code: 'invalid_input',
    })
    await expect(adminAs(admin).updateShuttle('sh-01', { name: 'A', capacity: 2.5 })).rejects.toMatchObject({
      code: 'invalid_input',
    })
    await expect(adminAs(admin).updateShuttle('sh-99', { name: 'A', capacity: 10 })).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(adminAs(operator).updateShuttle('sh-01', { name: 'Mine', capacity: 10 })).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})

describe("operators' passenger lists", () => {
  it('shows an operator the bookings on their own shuttle only', async () => {
    await bookingsAs(student('s1')).createBooking(journey)
    const passengers = await bookingsAs(operator).listShuttleBookings('sh-01')
    expect(passengers.map((booking) => booking.passengerName)).toEqual(['Student s1'])

    await expect(bookingsAs(operator).listShuttleBookings('sh-02')).rejects.toMatchObject({ code: 'forbidden' })
    await expect(bookingsAs(student('s1')).listShuttleBookings('sh-01')).rejects.toMatchObject({ code: 'forbidden' })
    expect(await bookingsAs(admin).listShuttleBookings('sh-01')).toHaveLength(1)
  })
})

describe('starting a fresh demo', () => {
  it('removes every booking and restarts every shuttle at 1x, keeping accounts and shuttle settings', async () => {
    await adminAs(admin).updateShuttle('sh-01', { name: 'Library Express', capacity: 12 })
    await adminAs(admin).updateUser('demo-student', { role: 'operator', assignedShuttleId: 'sh-02' })
    await bookingsAs(student('s1')).createBooking(journey)
    await bookingsAs(student('s2')).createBooking(journey)
    await simulation.control(admin, 'sh-02', { type: 'speed', speed: 5 })
    await simulation.control(admin, 'sh-02', { type: 'pause' })
    const before = await simulation.loadClocks()

    expect(await adminAs(admin).resetDemo()).toEqual({ removedBookings: 2 })

    expect(readLocalBookings()).toEqual([])
    const after = await simulation.loadClocks()
    for (const id of ['sh-01', 'sh-02']) {
      expect(after[id]).toMatchObject({ runState: 'running', speed: 1, baseElapsed: 0 })
      expect(after[id].generation).toBe(before[id].generation + 1)
    }
    expect(readLocalFleet()['sh-01']).toEqual({ name: 'Library Express', capacity: 12 })
    expect((await loadLocalUsers()).find((user) => user.id === 'demo-student')?.role).toBe('operator')

    // Booking works straight away on the fresh run.
    await expect(bookingsAs(student('s3')).createBooking(journey)).resolves.toMatchObject({ status: 'confirmed' })
  })

  it('is for administrators only', async () => {
    await bookingsAs(student('s1')).createBooking(journey)
    await expect(adminAs(operator).resetDemo()).rejects.toMatchObject({ code: 'forbidden' })
    await expect(adminAs(student('s1')).resetDemo()).rejects.toMatchObject({ code: 'forbidden' })
    await expect(adminAs(null).resetDemo()).rejects.toMatchObject({ code: 'not_signed_in' })
    expect(readLocalBookings()).toHaveLength(1)
  })
})
