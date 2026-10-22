import { appEnv } from '../lib/env.ts'
import { getSupabase } from '../lib/supabase.ts'
import type { AdminService } from './adminService.ts'
import type { AuthService } from './authService.ts'
import type { BookingService } from './bookingService.ts'
import type { FleetService } from './fleetService.ts'
import { createLocalAdminService } from './localAdminService.ts'
import { createLocalAuthService } from './localAuthService.ts'
import { createLocalBookingService } from './localBookingService.ts'
import { createLocalFleetService, localCapacityOf } from './localFleetService.ts'
import { createLocalSimulationService } from './localSimulationService.ts'
import type { SimulationService } from './simulationService.ts'
import { createSupabaseAdminService } from './supabaseAdminService.ts'
import { createSupabaseAuthService } from './supabaseAuthService.ts'
import { createSupabaseBookingService } from './supabaseBookingService.ts'
import { createSupabaseFleetService } from './supabaseFleetService.ts'
import { createSupabaseSimulationService } from './supabaseSimulationService.ts'

export interface Services {
  auth: AuthService
  simulation: SimulationService
  bookings: BookingService
  fleet: FleetService
  admin: AdminService
}

/** Local demo services: everything is saved in this browser. Tests use this too. */
export function createLocalServices(options: { getNow?: () => number; authDelayMs?: number } = {}): Services {
  const auth = createLocalAuthService({ delayMs: options.authDelayMs })
  const simulation = createLocalSimulationService({ getNow: options.getNow })
  return {
    auth,
    simulation,
    bookings: createLocalBookingService({ auth, simulation, getCapacity: localCapacityOf }),
    fleet: createLocalFleetService(),
    admin: createLocalAdminService({ auth, simulation }),
  }
}

/**
 * Chooses where data lives:
 * - Supabase credentials in .env.local → accounts, clocks and bookings in the database.
 * - No credentials → local demo mode, saved in this browser only.
 */
function createServices(): Services {
  if (appEnv.mode === 'supabase') {
    const client = getSupabase()
    return {
      auth: createSupabaseAuthService(client),
      simulation: createSupabaseSimulationService(client),
      bookings: createSupabaseBookingService(client),
      fleet: createSupabaseFleetService(client),
      admin: createSupabaseAdminService(client),
    }
  }
  return createLocalServices()
}

const services = createServices()

export const authService: AuthService = services.auth
export const simulationService: SimulationService = services.simulation
export const bookingService: BookingService = services.bookings
export const fleetService: FleetService = services.fleet
export const adminService: AdminService = services.admin
