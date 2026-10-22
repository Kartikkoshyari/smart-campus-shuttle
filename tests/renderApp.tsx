import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../src/App.tsx'
import AuthProvider from '../src/components/AuthProvider.tsx'
import BookingsProvider from '../src/components/BookingsProvider.tsx'
import FleetProvider from '../src/components/FleetProvider.tsx'
import SimulationProvider from '../src/components/SimulationProvider.tsx'
import ToastProvider from '../src/components/ToastProvider.tsx'
import { AdminContext } from '../src/hooks/useAdmin.ts'
import { createLocalServices } from '../src/services/index.ts'

export interface RenderAppOptions {
  /** A fixed "current time" for the simulation. Defaults to a constant. */
  getNow?: () => number
}

/**
 * Renders the whole app at a given address, with instant (no-delay) sign-in
 * and the simulation animation switched off, so results are predictable.
 */
export function renderApp(path = '/', options: RenderAppOptions = {}) {
  const services = createLocalServices({ getNow: options.getNow ?? (() => 1_000_000), authDelayMs: 0 })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider service={services.auth}>
          <SimulationProvider service={services.simulation} animate={false}>
            <FleetProvider service={services.fleet}>
              <BookingsProvider service={services.bookings}>
                <AdminContext value={services.admin}>
                  <App />
                </AdminContext>
              </BookingsProvider>
            </FleetProvider>
          </SimulationProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}
