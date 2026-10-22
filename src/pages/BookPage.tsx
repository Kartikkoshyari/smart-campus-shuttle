import { AlertCircle, ArrowDown, CheckCircle2, Loader2, Ticket } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { holdsSeat } from '../booking/bookingState.ts'
import { planJourney } from '../booking/journey.ts'
import DemoBadge from '../components/DemoBadge.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { getStop, stopsInTravelOrder } from '../data/campus.ts'
import { useBookings } from '../hooks/useBookings.ts'
import { useFleet } from '../hooks/useFleet.ts'
import { useLiveShuttle } from '../hooks/useLiveShuttle.ts'
import { useSimulation } from '../hooks/useSimulation.ts'
import { useToast } from '../hooks/useToast.ts'
import { bookingErrorMessage } from '../services/bookingService.ts'
import { getTimeline } from '../simulator/timetables.ts'
import type { Booking } from '../types/index.ts'
import { directionLabel, formatEta, statusLabel } from '../utils/format.ts'

export default function BookPage() {
  const { notify } = useToast()
  const { create, myBookings, getPhase } = useBookings()
  const { getClock, getElapsedSeconds } = useSimulation()
  const { shuttles, getShuttle } = useFleet()
  const [shuttleId, setShuttleId] = useState(shuttles[0].id)
  const [pickupId, setPickupId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<Booking | null>(null)

  const { shuttle, route, snapshot } = useLiveShuttle(shuttleId)
  const clock = getClock(shuttleId)
  const elapsed = getElapsedSeconds(shuttleId)
  const paused = clock.runState !== 'running'
  const stopOrder = stopsInTravelOrder(route, shuttle.direction)

  // The journey is checked live, so the answer changes as the shuttle moves.
  const check =
    pickupId !== '' && destinationId !== ''
      ? planJourney({
          shuttle,
          route,
          timeline: getTimeline(shuttleId),
          elapsedSeconds: elapsed,
          pickupStopId: pickupId,
          destinationStopId: destinationId,
        })
      : null
  const full = snapshot.seatsAvailable <= 0
  // One active booking per shuttle. The service checks this too.
  const existing = myBookings.find((booking) => booking.shuttleId === shuttleId && holdsSeat(getPhase(booking)))
  const canBook = check?.ok === true && !full && !existing && !submitting

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canBook) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const booking = await create({ shuttleId, pickupStopId: pickupId, destinationStopId: destinationId })
      setConfirmed(booking)
      notify({ tone: 'success', title: 'Seat booked', message: `Your booking ID is ${booking.code}.` })
    } catch (caught) {
      const message = bookingErrorMessage(caught)
      setSubmitError(message)
      notify({ tone: 'error', title: 'Booking not made', message })
    } finally {
      setSubmitting(false)
    }
  }

  function bookAnother() {
    setConfirmed(null)
    setPickupId('')
    setDestinationId('')
  }

  if (confirmed) {
    const bookedShuttle = getShuttle(confirmed.shuttleId)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Seat booked" description="Show this booking ID when you board." />
        <section aria-labelledby="confirmation-title" className="panel max-w-xl p-6 sm:p-8">
          <CheckCircle2 aria-hidden="true" className="size-9 text-route" />
          <h2 id="confirmation-title" className="mt-4 text-sm text-muted">
            Booking ID
          </h2>
          <p data-testid="booking-code" className="tabular text-3xl font-extrabold tracking-wider sm:text-4xl">
            {confirmed.code}
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted">From</dt>
              <dd className="font-semibold">{getStop(confirmed.pickupStopId).name}</dd>
            </div>
            <div>
              <dt className="text-muted">To</dt>
              <dd className="font-semibold">{getStop(confirmed.destinationStopId).name}</dd>
            </div>
            <div>
              <dt className="text-muted">Shuttle</dt>
              <dd className="font-semibold">
                {bookedShuttle.code}, {directionLabel[confirmed.direction].toLowerCase()}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Passenger</dt>
              <dd className="font-semibold">{confirmed.passengerName}</dd>
            </div>
          </dl>
          <p className="mt-6 text-sm text-muted">
            You can cancel this booking from My bookings until the shuttle leaves your pickup stop.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link to="/app/bookings" className="btn btn-primary">
              View my bookings
            </Link>
            <button type="button" className="btn btn-secondary" onClick={bookAnother}>
              Book another journey
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Book a seat"
        description="Choose a shuttle and the stops where you get on and off."
        actions={<DemoBadge />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form className="panel flex flex-col gap-5 p-5 sm:p-6" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="book-shuttle" className="field-label">
              Shuttle
            </label>
            <select
              id="book-shuttle"
              className="field-input"
              value={shuttleId}
              onChange={(event) => {
                setShuttleId(event.target.value)
                setSubmitError(null)
              }}
            >
              {shuttles.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.code}, {option.name} ({directionLabel[option.direction].toLowerCase()})
                </option>
              ))}
            </select>
            <p className="field-hint">
              {snapshot.seatsAvailable} of {shuttle.capacity} seats free. Stops are listed in the order this shuttle
              visits them.
            </p>
          </div>

          <div className="grid gap-2">
            <div>
              <label htmlFor="book-pickup" className="field-label">
                Pickup stop
              </label>
              <select
                id="book-pickup"
                className="field-input"
                value={pickupId}
                onChange={(event) => {
                  setPickupId(event.target.value)
                  setSubmitError(null)
                }}
              >
                <option value="">Choose a stop</option>
                {stopOrder.map((id) => (
                  <option key={id} value={id}>
                    {getStop(id).name}
                  </option>
                ))}
              </select>
            </div>
            <ArrowDown aria-hidden="true" className="mx-3 size-4 text-muted" />
            <div>
              <label htmlFor="book-destination" className="field-label">
                Destination stop
              </label>
              <select
                id="book-destination"
                className="field-input"
                value={destinationId}
                onChange={(event) => {
                  setDestinationId(event.target.value)
                  setSubmitError(null)
                }}
                aria-invalid={check && !check.ok ? true : undefined}
                aria-describedby="journey-check"
              >
                <option value="">Choose a stop</option>
                {[...stopOrder.slice(1), stopOrder[0]].map((id) => (
                  <option key={id} value={id}>
                    {getStop(id).name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div id="journey-check">
            {!check ? (
              <p className="text-sm text-muted">
                Choose both stops to check the journey. Each run starts and ends at {getStop(stopOrder[0]).name}.
              </p>
            ) : !check.ok ? (
              <div role="alert" className="rounded-lg bg-alert-tint p-4 text-sm text-alert">
                <p className="flex items-start gap-2 font-semibold">
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {check.message}
                </p>
                {check.reachableStopIds.length > 0 ? (
                  <p className="mt-2 pl-6 text-ink">
                    {check.code === 'pickup_passed' ? 'Stops you can still board at: ' : 'Stops you can travel to: '}
                    {check.reachableStopIds.map((id) => getStop(id).name).join(', ')}.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg bg-route-tint p-4 text-sm">
                <p className="flex items-start gap-2 font-semibold text-route-dark">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  This journey works on {shuttle.code}.
                </p>
                <ul className="mt-2 flex flex-col gap-1 pl-6 text-ink">
                  <li>
                    {paused
                      ? `${shuttle.code} is paused, so arrival times are on hold.`
                      : check.plan.pickupArrivalElapsed <= elapsed
                        ? `${shuttle.code} is at ${getStop(pickupId).name} now.`
                        : `Pickup at ${getStop(pickupId).name} in ${formatEta((check.plan.pickupArrivalElapsed - elapsed) / clock.speed)}.`}
                  </li>
                  {paused ? null : (
                    <li>
                      Arrive at {getStop(destinationId).name} in about{' '}
                      {formatEta((check.plan.dropoffElapsed - elapsed) / clock.speed)}.
                    </li>
                  )}
                  <li>
                    {check.plan.viaStopIds.length === 0
                      ? 'No stops in between.'
                      : `Passes ${check.plan.viaStopIds.map((id) => getStop(id).name).join(', ')}.`}
                  </li>
                </ul>
              </div>
            )}
          </div>

          {existing ? (
            <p role="status" className="rounded-lg bg-signal-tint p-4 text-sm text-signal-ink">
              You already have booking <span className="font-bold">{existing.code}</span> on {shuttle.code}. Cancel it
              in My bookings to book a different journey, or choose another shuttle.
            </p>
          ) : null}

          {full ? (
            <p role="alert" className="rounded-lg bg-alert-tint p-4 text-sm font-semibold text-alert">
              {shuttle.code} is full. Try another shuttle.
            </p>
          ) : null}

          {submitError ? (
            <p role="alert" className="rounded-lg bg-alert-tint p-4 text-sm font-semibold text-alert">
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
            <button type="submit" className="btn btn-primary py-3" disabled={!canBook}>
              {submitting ? (
                <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              ) : (
                <Ticket aria-hidden="true" className="size-4" />
              )}
              {submitting ? 'Booking seat' : 'Book seat'}
            </button>
            <p className="text-sm text-muted">
              One seat per booking. You can cancel until the shuttle leaves your pickup.
            </p>
          </div>
        </form>

        <aside className="panel h-fit p-5">
          <h2 className="font-bold">Right now on {shuttle.code}</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Next stop</dt>
              <dd className="text-right font-semibold">{getStop(snapshot.nextStopId).name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Arrives in</dt>
              <dd className="tabular font-semibold">
                {snapshot.status === 'paused' ? 'On hold' : formatEta(snapshot.etaSeconds)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Status</dt>
              <dd className="font-semibold">{statusLabel[snapshot.status]}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Direction</dt>
              <dd className="font-semibold">{directionLabel[shuttle.direction]}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Seats free</dt>
              <dd className="tabular font-semibold">
                {snapshot.seatsAvailable} of {shuttle.capacity}
              </dd>
            </div>
          </dl>
          <h3 className="mt-5 text-sm font-bold">Booking rules</h3>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-sm text-muted">
            <li>A booking is for the shuttle&apos;s current run, which ends at {getStop(stopOrder[0]).name}.</li>
            <li>You can only board at a stop the shuttle has not left yet.</li>
            <li>One active booking per shuttle.</li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
