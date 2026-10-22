import { ArrowRight, QrCode } from 'lucide-react'
import { useState } from 'react'
import { getStop } from '../data/campus.ts'
import { useFleet } from '../hooks/useFleet.ts'
import { useSimulation } from '../hooks/useSimulation.ts'
import type { Booking, BookingPhase } from '../types/index.ts'
import { formatBookedAt, formatEta } from '../utils/format.ts'
import BoardingPassModal from './BoardingPassModal.tsx'
import BookingStatusPill from './BookingStatusPill.tsx'

interface BookingCardProps {
  booking: Booking
  phase: BookingPhase
  /** Shows a Cancel button when the booking can still be cancelled. */
  onCancel?(booking: Booking): void
}

/** One booking, with its live journey status. */
export default function BookingCard({ booking, phase, onCancel }: BookingCardProps) {
  const [showPass, setShowPass] = useState(false)
  const { getClock, getElapsedSeconds } = useSimulation()
  const { getShuttle } = useFleet()
  const shuttle = getShuttle(booking.shuttleId)
  const clock = getClock(booking.shuttleId)
  const elapsed = getElapsedSeconds(booking.shuttleId)
  const paused = clock.runState !== 'running'
  const pickup = getStop(booking.pickupStopId).name
  const destination = getStop(booking.destinationStopId).name

  // Simulated seconds pass faster at 2x and 5x, so divide to get real seconds.
  const toPickup = (booking.pickupArrivalElapsed - elapsed) / clock.speed
  const toDropoff = (booking.dropoffElapsed - elapsed) / clock.speed

  let timing: string
  if (phase === 'upcoming') {
    timing = paused
      ? `${shuttle.code} is paused. Times will update when it moves again.`
      : toPickup <= 0
        ? `${shuttle.code} is at ${pickup} now. Board before it leaves.`
        : `${shuttle.code} reaches ${pickup} in ${formatEta(toPickup)}.`
  } else if (phase === 'on_board') {
    timing = paused ? `${shuttle.code} is paused.` : `Arriving at ${destination} in ${formatEta(toDropoff)}.`
  } else if (phase === 'completed') {
    timing = `Arrived at ${destination}.`
  } else if (phase === 'cancelled') {
    timing = 'This booking was cancelled and the seat was released.'
  } else {
    timing = 'The shuttle run ended when the simulation was reset.'
  }

  return (
    <article aria-label={`Booking ${booking.code}`} className="panel flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Booking ID</p>
          <p className="tabular text-xl font-bold tracking-wide">{booking.code}</p>
        </div>
        <BookingStatusPill phase={phase} />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
        <span>{pickup}</span>
        <ArrowRight aria-label="to" className="size-4 text-muted" />
        <span>{destination}</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Shuttle</dt>
          <dd className="font-semibold">
            {shuttle.code}, {shuttle.name}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Booked</dt>
          <dd className="font-semibold">{formatBookedAt(booking.createdAt)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-muted">Passenger</dt>
          <dd className="font-semibold">{booking.passengerName}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{timing}</p>
        <div className="flex flex-wrap items-center gap-2">
          {phase === 'upcoming' || phase === 'on_board' ? (
            <button
              type="button"
              className="btn btn-secondary shrink-0 inline-flex items-center gap-1.5"
              onClick={() => setShowPass(true)}
            >
              <QrCode aria-hidden="true" className="size-4" />
              Boarding pass
            </button>
          ) : null}
          {onCancel && phase === 'upcoming' ? (
            <button type="button" className="btn btn-secondary shrink-0" onClick={() => onCancel(booking)}>
              Cancel booking
            </button>
          ) : null}
        </div>
      </div>

      <BoardingPassModal
        open={showPass}
        booking={booking}
        phase={phase}
        pickup={pickup}
        destination={destination}
        shuttleCode={shuttle.code}
        shuttleName={shuttle.name}
        onClose={() => setShowPass(false)}
      />
    </article>
  )
}
