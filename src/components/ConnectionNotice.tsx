import { CloudOff } from 'lucide-react'
import { useBookings } from '../hooks/useBookings.ts'
import { useSimulation } from '../hooks/useSimulation.ts'

/** Explains, in one line, when shuttle positions or seats could not be loaded. */
export default function ConnectionNotice() {
  const simulation = useSimulation()
  const bookings = useBookings()
  if (simulation.status !== 'error' && bookings.status !== 'error') return null

  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-alert-tint p-4 text-sm text-alert">
      <CloudOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">
          {simulation.status === 'error'
            ? 'Shuttle positions could not be loaded.'
            : (bookings.error ?? 'Bookings could not be loaded.')}
        </p>
        <p className="mt-0.5 text-ink">
          Check your internet connection. If you set up Supabase, check the Supabase values (in .env.local, or in the
          hosting site&apos;s environment variables) and that every migration has run.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-secondary px-3 py-1.5"
        onClick={() => (simulation.status === 'error' ? window.location.reload() : void bookings.refresh())}
      >
        Try again
      </button>
    </div>
  )
}
