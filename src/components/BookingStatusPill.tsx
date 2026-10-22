import { bookingPhaseLabel } from '../booking/bookingState.ts'
import type { BookingPhase } from '../types/index.ts'

const styles: Record<BookingPhase, string> = {
  upcoming: 'bg-route-tint text-route-dark',
  on_board: 'bg-signal-tint text-signal-ink',
  completed: 'bg-paper text-muted',
  cancelled: 'bg-alert-tint text-alert',
  expired: 'bg-paper text-muted',
}

export default function BookingStatusPill({ phase }: { phase: BookingPhase }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${styles[phase]}`}>
      {bookingPhaseLabel[phase]}
    </span>
  )
}
