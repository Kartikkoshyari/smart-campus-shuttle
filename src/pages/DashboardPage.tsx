import { Ticket } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import DemoBadge from '../components/DemoBadge.tsx'
import DepartureBoard from '../components/DepartureBoard.tsx'
import MapPanel from '../components/MapPanel.tsx'
import PageHeader from '../components/PageHeader.tsx'
import RouteStopLine from '../components/RouteStopLine.tsx'
import ShuttlePicker from '../components/ShuttlePicker.tsx'
import { getStop } from '../data/campus.ts'
import { useAuth } from '../hooks/useAuth.ts'
import { useShuttleMarkers } from '../hooks/useShuttleMarkers.ts'
import { useBookings } from '../hooks/useBookings.ts'
import { useFleet } from '../hooks/useFleet.ts'
import { useLiveShuttle } from '../hooks/useLiveShuttle.ts'
import { useSimulation } from '../hooks/useSimulation.ts'
import { formatEta } from '../utils/format.ts'

export default function DashboardPage() {
  const { user } = useAuth()
  const { getUpcomingStops, getClock, getElapsedSeconds } = useSimulation()
  const { myBookings, getPhase } = useBookings()
  const { shuttles } = useFleet()
  const [shuttleId, setShuttleId] = useState(shuttles[0].id)
  const { shuttle, route, snapshot } = useLiveShuttle(shuttleId)
  // The student's soonest current journey, if any.
  const nextBooking = myBookings
    .filter((booking) => {
      const phase = getPhase(booking)
      return phase === 'upcoming' || phase === 'on_board'
    })
    .sort((a, b) => a.pickupArrivalElapsed - b.pickupArrivalElapsed)[0]
  const markers = useShuttleMarkers(route.id, shuttle.id)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Live board" description={`${shuttle.name} on the ${route.name}`} actions={<DemoBadge />} />

      <ShuttlePicker shuttles={shuttles} selectedId={shuttleId} onSelect={setShuttleId} />

      {/* Phones: map, board, then the booking prompt. Laptops: board on the right. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:items-start">
        <MapPanel route={route} markers={markers} highlightStopIds={[snapshot.nextStopId]} />

        <div className="flex flex-col gap-4 lg:row-span-2">
          <DepartureBoard shuttle={shuttle} route={route} snapshot={snapshot} />
          <RouteStopLine snapshot={snapshot} upcoming={getUpcomingStops(shuttle.id)} />
        </div>

        {user?.role === 'student' && nextBooking ? (
          <NextJourney
            code={nextBooking.code}
            shuttleCode={shuttles.find((s) => s.id === nextBooking.shuttleId)?.code ?? ''}
            pickup={getStop(nextBooking.pickupStopId).name}
            destination={getStop(nextBooking.destinationStopId).name}
            onBoard={getPhase(nextBooking) === 'on_board'}
            paused={getClock(nextBooking.shuttleId).runState !== 'running'}
            secondsToPickup={
              (nextBooking.pickupArrivalElapsed - getElapsedSeconds(nextBooking.shuttleId)) /
              getClock(nextBooking.shuttleId).speed
            }
          />
        ) : user?.role === 'student' ? (
          <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold">Need a seat?</h2>
              <p className="text-sm text-muted">
                {snapshot.seatsAvailable} of {shuttle.capacity} seats are free on {shuttle.code}.
              </p>
            </div>
            <Link to="/app/book" className="btn btn-primary">
              <Ticket aria-hidden="true" className="size-4" />
              Book a seat
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function NextJourney(props: {
  code: string
  shuttleCode: string
  pickup: string
  destination: string
  onBoard: boolean
  paused: boolean
  secondsToPickup: number
}) {
  const timing = props.onBoard
    ? `You are on board, heading to ${props.destination}.`
    : props.paused
      ? `${props.shuttleCode} is paused.`
      : props.secondsToPickup <= 0
        ? `${props.shuttleCode} is at ${props.pickup} now.`
        : `${props.shuttleCode} reaches ${props.pickup} in ${formatEta(props.secondsToPickup)}.`
  return (
    <section
      aria-labelledby="next-journey-title"
      className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 id="next-journey-title" className="font-bold">
          Your next journey: {props.pickup} to {props.destination}
        </h2>
        <p className="text-sm text-muted">
          Booking {props.code}. {timing}
        </p>
      </div>
      <Link to="/app/bookings" className="btn btn-secondary shrink-0">
        View booking
      </Link>
    </section>
  )
}
