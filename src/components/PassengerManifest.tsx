import { ArrowRight, Users } from 'lucide-react'
import { getStop } from '../data/campus.ts'
import type { Booking, BookingPhase, StopEta } from '../types/index.ts'
import StateMessage from './StateMessage.tsx'

interface PassengerManifestProps {
  shuttleCode: string
  /** Bookings on this shuttle (any status). */
  bookings: Booking[]
  getPhase(booking: Booking): BookingPhase
  /** The shuttle's next stops, in order, with arrival times. */
  upcoming: StopEta[]
  paused: boolean
}

function roughEta(seconds: number): string {
  if (seconds <= 0) return 'now'
  if (seconds < 60) return 'in under a minute'
  return `in ${Math.round(seconds / 60)} min`
}

/** Who boards and leaves at each stop on the current run, for the operator. */
export default function PassengerManifest({
  shuttleCode,
  bookings,
  getPhase,
  upcoming,
  paused,
}: PassengerManifestProps) {
  const current = bookings
    .map((booking) => ({ booking, phase: getPhase(booking) }))
    .filter(({ phase }) => phase === 'upcoming' || phase === 'on_board')
  const onBoard = current.filter(({ phase }) => phase === 'on_board').length
  const waiting = current.length - onBoard

  const stops = upcoming
    .map((eta) => ({
      ...eta,
      boarding: current.filter(({ booking, phase }) => phase === 'upcoming' && booking.pickupStopId === eta.stopId)
        .length,
      leaving: current.filter(({ booking }) => booking.destinationStopId === eta.stopId).length,
    }))
    .filter((stop) => stop.boarding > 0 || stop.leaving > 0)

  return (
    <section aria-labelledby="manifest-title" className="panel">
      <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id="manifest-title" className="font-bold">
          Passengers on {shuttleCode}
        </h2>
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{onBoard}</span> on board,{' '}
          <span className="font-semibold text-ink">{waiting}</span> waiting
        </p>
      </div>

      {current.length === 0 ? (
        <StateMessage tone="empty" icon={Users} title="No passengers booked on this run">
          Bookings appear here as soon as students make them.
        </StateMessage>
      ) : (
        <div className="grid gap-6 p-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div>
            <h3 className="text-sm font-bold">Stop by stop</h3>
            <ol className="mt-3 flex flex-col gap-2.5">
              {stops.map((stop) => (
                <li key={stop.stopId} className="rounded-lg border border-line p-3 text-sm">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{getStop(stop.stopId).name}</span>
                    <span className="text-xs text-muted">{paused ? 'on hold' : roughEta(stop.etaSeconds)}</span>
                  </p>
                  <p className="mt-1 text-muted">
                    {stop.boarding > 0 ? `${stop.boarding} boarding` : null}
                    {stop.boarding > 0 && stop.leaving > 0 ? ', ' : null}
                    {stop.leaving > 0 ? `${stop.leaving} getting off` : null}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Booking ID
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Passenger
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Journey
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {current.map(({ booking, phase }) => (
                  <tr key={booking.id}>
                    <td className="tabular py-2.5 pr-4 font-semibold">{booking.code}</td>
                    <td className="py-2.5 pr-4">{booking.passengerName}</td>
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center gap-1.5">
                        {getStop(booking.pickupStopId).name}
                        <ArrowRight aria-label="to" className="size-3.5 text-muted" />
                        {getStop(booking.destinationStopId).name}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {phase === 'on_board' ? (
                        <span className="font-semibold text-signal-ink">On board</span>
                      ) : (
                        <span className="text-muted">Waiting at {getStop(booking.pickupStopId).name}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
