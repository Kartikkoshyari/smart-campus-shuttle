import { Bus } from 'lucide-react'
import { getStop } from '../data/campus.ts'
import type { ShuttleSnapshot, StopEta } from '../types/index.ts'
import { formatEta } from '../utils/format.ts'

interface RouteStopLineProps {
  snapshot: ShuttleSnapshot
  /** Every stop in the order the shuttle reaches it, with arrival times. */
  upcoming: StopEta[]
}

/** Rounds an ETA for a list, e.g. "4 min". Exact seconds are shown on the board. */
function roughEta(seconds: number): string {
  if (seconds <= 0) return 'Now'
  if (seconds < 60) return '< 1 min'
  return `${Math.round(seconds / 60)} min`
}

/**
 * A metro-style line listing the stops in the order the shuttle will reach them,
 * starting from where it is now, with an arrival time for each.
 */
export default function RouteStopLine({ snapshot, upcoming }: RouteStopLineProps) {
  const paused = snapshot.status === 'paused'

  return (
    <section aria-labelledby="stop-line-title" className="panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="stop-line-title" className="text-base font-bold">
          Stops ahead
        </h2>
        <span className="text-xs text-muted">{paused ? 'Times on hold while paused' : 'Arrives in'}</span>
      </div>

      {snapshot.atStopId ? null : (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Bus aria-hidden="true" className="size-4 text-signal-ink" />
          On the way from {getStop(snapshot.lastStopId).name}
        </p>
      )}

      <ol className="mt-3">
        {upcoming.map(({ stopId, etaSeconds }, index) => {
          const stop = getStop(stopId)
          const isHere = stopId === snapshot.atStopId
          const isNext = !snapshot.atStopId && stopId === snapshot.nextStopId
          const isLast = index === upcoming.length - 1
          const justLeft = !snapshot.atStopId && stopId === snapshot.lastStopId

          return (
            <li key={stopId} className="relative flex gap-3 pb-3 last:pb-0">
              {isLast ? null : (
                <span aria-hidden="true" className="absolute top-4 bottom-0 left-[7px] w-1 rounded-full bg-route" />
              )}
              <span
                aria-hidden="true"
                className={`relative z-10 mt-0.5 size-[18px] shrink-0 rounded-full border-[3px] ${
                  isHere || isNext
                    ? 'border-ink bg-signal'
                    : justLeft
                      ? 'border-line bg-paper'
                      : 'border-route bg-white'
                }`}
              />
              <span
                className={`flex flex-1 items-baseline justify-between gap-2 text-sm ${justLeft ? 'text-muted' : ''}`}
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className={isHere || isNext ? 'font-bold' : 'font-medium'}>{stop.name}</span>
                  {isHere ? (
                    <span className="rounded bg-signal-tint px-1.5 py-0.5 text-xs font-semibold text-signal-ink">
                      Shuttle here
                    </span>
                  ) : isNext ? (
                    <span className="rounded bg-route-tint px-1.5 py-0.5 text-xs font-semibold text-route-dark">
                      Next
                    </span>
                  ) : justLeft ? (
                    <span className="text-xs">Just left</span>
                  ) : null}
                </span>
                <span
                  className="tabular shrink-0 text-xs font-semibold text-muted"
                  title={paused ? undefined : formatEta(etaSeconds)}
                >
                  {isHere ? 'Here' : roughEta(etaSeconds)}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
