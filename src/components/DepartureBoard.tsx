import { getStop } from '../data/campus.ts'
import type { Route, Shuttle, ShuttleSnapshot, ShuttleStatus } from '../types/index.ts'
import { directionLabel, formatEta, statusLabel } from '../utils/format.ts'

interface DepartureBoardProps {
  shuttle: Shuttle
  route: Route
  snapshot: ShuttleSnapshot
}

const statusDot: Record<ShuttleStatus, string> = {
  moving: 'bg-emerald-400 motion-safe:animate-pulse',
  at_stop: 'bg-signal',
  paused: 'bg-white/40',
}

/**
 * The dark "departure board" panel: next stop, ETA, direction and seats.
 * Styled after the boards at bus and metro stations.
 */
export default function DepartureBoard({ shuttle, route, snapshot }: DepartureBoardProps) {
  const nextStop = getStop(snapshot.nextStopId)
  const lastStop = getStop(snapshot.lastStopId)
  const seatShare = shuttle.capacity > 0 ? snapshot.seatsAvailable / shuttle.capacity : 0
  const seatsLow = snapshot.seatsAvailable <= Math.ceil(shuttle.capacity * 0.2)

  return (
    <section aria-label={`${shuttle.code} status`} className="rounded-xl bg-ink p-5 text-white sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-signal px-2 py-0.5 text-sm font-bold whitespace-nowrap text-ink">
            {shuttle.code}
          </span>
          <span className="text-sm text-white/70">{shuttle.name}</span>
        </div>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className={`size-2.5 rounded-full ${statusDot[snapshot.status]}`} />
          {statusLabel[snapshot.status]}
        </span>
      </div>

      <div className="mt-6">
        <p className="text-sm text-white/60">Next stop</p>
        <p className="mt-0.5 text-2xl leading-tight font-bold sm:text-3xl">{nextStop.name}</p>
      </div>

      <div className="mt-4">
        <p className="text-sm text-white/60">Arrives in</p>
        <p className="tabular mt-0.5 text-4xl leading-none font-bold text-signal">
          {snapshot.status === 'paused' ? 'On hold' : formatEta(snapshot.etaSeconds)}
        </p>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/15 pt-5 text-sm">
        <div>
          <dt className="text-white/60">{snapshot.atStopId ? 'Standing at' : 'Last stop'}</dt>
          <dd className="mt-0.5 font-semibold">{lastStop.name}</dd>
        </div>
        <div>
          <dt className="text-white/60">Direction</dt>
          <dd className="mt-0.5 font-semibold">
            {directionLabel[shuttle.direction]}, {route.name}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="flex items-baseline justify-between text-white/60">
            <span>Seats available</span>
            <span className={`tabular font-semibold ${seatsLow ? 'text-signal' : 'text-white'}`}>
              {snapshot.seatsAvailable} of {shuttle.capacity}
            </span>
          </dt>
          <dd className="mt-2">
            <span
              role="meter"
              aria-label="Seats available"
              aria-valuemin={0}
              aria-valuemax={shuttle.capacity}
              aria-valuenow={snapshot.seatsAvailable}
              className="block h-2 overflow-hidden rounded-full bg-white/15"
            >
              <span
                className={`block h-full rounded-full transition-[width] duration-500 ${seatsLow ? 'bg-signal' : 'bg-emerald-400'}`}
                style={{ width: `${Math.round(seatShare * 100)}%` }}
              />
            </span>
          </dd>
        </div>
      </dl>
    </section>
  )
}
