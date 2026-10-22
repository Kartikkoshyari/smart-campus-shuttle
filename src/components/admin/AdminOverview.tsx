import { Gauge } from 'lucide-react'
import { Link } from 'react-router'
import { holdsSeat } from '../../booking/bookingState.ts'
import { getStop } from '../../data/campus.ts'
import { useBookings } from '../../hooks/useBookings.ts'
import { useFleet } from '../../hooks/useFleet.ts'
import { useSimulation } from '../../hooks/useSimulation.ts'
import { formatEta, statusLabel } from '../../utils/format.ts'
import FreshDemoPanel from './FreshDemoPanel.tsx'

function isToday(iso: string | null, now: Date): boolean {
  if (!iso) return false
  const date = new Date(iso)
  return (
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  )
}

/** Headline numbers and the live state of every shuttle. */
export default function AdminOverview() {
  const { shuttles } = useFleet()
  const { allBookings, getPhase, getSeatsAvailable } = useBookings()
  const { getSnapshot, getClock, nowMs } = useSimulation()
  const now = new Date(nowMs)

  const active = allBookings.filter((booking) => holdsSeat(getPhase(booking))).length
  const totalSeats = shuttles.reduce((sum, shuttle) => sum + shuttle.capacity, 0)
  const seatsTaken = shuttles.reduce((sum, shuttle) => sum + shuttle.capacity - getSeatsAvailable(shuttle.id), 0)
  const bookedToday = allBookings.filter((booking) => isToday(booking.createdAt, now)).length
  const cancelledToday = allBookings.filter((booking) => isToday(booking.cancelledAt, now)).length

  const kpis = [
    { label: 'Active bookings', value: String(active) },
    {
      label: 'Seats in use',
      value: `${seatsTaken} of ${totalSeats}`,
      detail: totalSeats > 0 ? `${Math.round((seatsTaken / totalSeats) * 100)}% of the fleet` : '',
    },
    { label: 'Booked today', value: String(bookedToday) },
    { label: 'Cancelled today', value: String(cancelledToday) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <dl className="panel grid grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="px-5 py-4">
            <dt className="text-sm text-muted">{kpi.label}</dt>
            <dd className="tabular mt-1 text-2xl font-bold">{kpi.value}</dd>
            {kpi.detail ? <dd className="text-xs text-muted">{kpi.detail}</dd> : null}
          </div>
        ))}
      </dl>

      <section aria-labelledby="fleet-title">
        <h2 id="fleet-title" className="text-lg font-bold">
          Fleet right now
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {shuttles.map((shuttle) => {
            const snapshot = getSnapshot(shuttle.id)
            const clock = getClock(shuttle.id)
            const free = getSeatsAvailable(shuttle.id)
            const used = shuttle.capacity - free
            return (
              <article
                key={shuttle.id}
                aria-label={`${shuttle.code} overview`}
                className="panel flex flex-col gap-4 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2">
                      <span className="rounded-md bg-signal px-2 py-0.5 text-sm font-bold text-ink">
                        {shuttle.code}
                      </span>
                      <span className="font-semibold">{shuttle.name}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {statusLabel[snapshot.status]} at {clock.speed}x. Next stop {getStop(snapshot.nextStopId).name}
                      {snapshot.status === 'paused' ? '.' : ` in ${formatEta(snapshot.etaSeconds)}.`}
                    </p>
                  </div>
                  <Link
                    to={`/app/operator?shuttle=${shuttle.id}`}
                    className="btn btn-secondary shrink-0 px-3 py-1.5"
                    aria-label={`Control ${shuttle.code}`}
                  >
                    <Gauge aria-hidden="true" className="size-4" />
                    Control
                  </Link>
                </div>
                <div>
                  <p className="flex justify-between text-sm">
                    <span className="text-muted">Seats in use</span>
                    <span className="tabular font-semibold">
                      {used} of {shuttle.capacity}
                    </span>
                  </p>
                  <span
                    role="meter"
                    aria-label={`${shuttle.code} seats in use`}
                    aria-valuemin={0}
                    aria-valuemax={shuttle.capacity}
                    aria-valuenow={used}
                    className="mt-2 block h-2 overflow-hidden rounded-full bg-paper"
                  >
                    <span
                      className={`block h-full rounded-full ${free <= Math.ceil(shuttle.capacity * 0.2) ? 'bg-signal' : 'bg-route'}`}
                      style={{ width: `${shuttle.capacity > 0 ? Math.round((used / shuttle.capacity) * 100) : 0}%` }}
                    />
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <FreshDemoPanel />
    </div>
  )
}
