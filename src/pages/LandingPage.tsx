import { Gauge, ShieldCheck, Ticket } from 'lucide-react'
import { Link } from 'react-router'
import ConnectionNotice from '../components/ConnectionNotice.tsx'
import DataModeNotice from '../components/DataModeNotice.tsx'
import DemoBadge from '../components/DemoBadge.tsx'
import DepartureBoard from '../components/DepartureBoard.tsx'
import Logo from '../components/Logo.tsx'
import RouteSchematic from '../components/RouteSchematic.tsx'
import { DEMO_COORDINATES_NOTE } from '../data/campus.ts'
import { useAuth } from '../hooks/useAuth.ts'
import { useShuttleMarkers } from '../hooks/useShuttleMarkers.ts'
import { useLiveShuttle } from '../hooks/useLiveShuttle.ts'

const steps = [
  { title: 'Check the board', body: 'See where the shuttle is, its next stop and how many seats are free.' },
  {
    title: 'Pick your stops',
    body: 'Choose where you get on and off. Journeys the shuttle cannot make are explained.',
  },
  { title: 'Keep your booking ID', body: 'Show it when you board. Cancel any time before pickup to free the seat.' },
]

const roles = [
  { icon: Ticket, title: 'Students', body: 'Follow the shuttle, book seats and manage bookings.' },
  { icon: Gauge, title: 'Operators', body: 'Run the shuttle simulation and change its speed.' },
  { icon: ShieldCheck, title: 'Administrators', body: 'Review shuttles, routes, stops and every booking.' },
]

export default function LandingPage() {
  const { user } = useAuth()
  const { shuttle, route, snapshot } = useLiveShuttle('sh-01')
  const markers = useShuttleMarkers(route.id, shuttle.id)

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo />
          <nav aria-label="Account" className="flex items-center gap-2">
            {user ? (
              <Link to="/app" className="btn btn-primary">
                Open the app
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost">
                  Sign in
                </Link>
                <Link to="/register" className="btn btn-primary hidden sm:inline-flex">
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <div className="mx-auto max-w-6xl px-4 pt-6 empty:hidden sm:px-6">
          <ConnectionNotice />
        </div>
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_24rem] lg:items-center xl:grid-cols-[1fr_26rem] lg:gap-16 lg:py-20">
          <div>
            <DemoBadge />
            <h1 className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Know when the shuttle reaches your stop.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Follow the campus shuttle around its route, check seats and arrival times, and book a seat from any stop.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={user ? '/app' : '/login'} className="btn btn-primary px-5 py-3 text-base">
                Open the live board
              </Link>
              {user ? null : (
                <Link to="/register" className="btn btn-secondary px-5 py-3 text-base">
                  Create a student account
                </Link>
              )}
            </div>
            <p className="mt-6 max-w-xl text-sm text-muted">
              This build runs a simulated shuttle on demo routes. It does not use GPS, a driver&apos;s phone or your
              location.
            </p>
          </div>

          <div className="w-full max-w-md">
            <DepartureBoard shuttle={shuttle} route={route} snapshot={snapshot} />
          </div>
        </section>

        <section aria-labelledby="loop-title" className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <div>
              <h2 id="loop-title" className="text-2xl font-bold tracking-tight">
                The {route.name}
              </h2>
              <p className="mt-2 text-muted">
                {route.stopIds.length} stops from the Main Gate to the hostels and back. One shuttle runs clockwise and
                one runs anticlockwise, so every stop is served in both directions.
              </p>
            </div>
            <figure className="panel overflow-hidden">
              <RouteSchematic route={route} markers={markers} highlightStopIds={[snapshot.nextStopId]} />
              <figcaption className="border-t border-line px-4 py-2.5 text-xs text-muted">
                {DEMO_COORDINATES_NOTE}
              </figcaption>
            </figure>
          </div>
        </section>

        <section aria-labelledby="how-title" className="border-y border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <h2 id="how-title" className="text-2xl font-bold tracking-tight">
              How booking works
            </h2>
            <ol className="mt-8 grid gap-8 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-route text-sm font-bold text-white"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-bold">{step.title}</h3>
                    <p className="mt-1 text-sm text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="roles-title" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="roles-title" className="text-2xl font-bold tracking-tight">
            One app for everyone on the route
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-3">
            {roles.map(({ icon: Icon, title, body }) => (
              <li key={title} className="border-l-4 border-route pl-4">
                <Icon aria-hidden="true" className="size-5 text-route" />
                <h3 className="mt-2 font-bold">{title}</h3>
                <p className="mt-1 text-sm text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <DataModeNotice />
        </div>
      </footer>
    </div>
  )
}
