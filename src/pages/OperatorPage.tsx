import { Pause, Play, RotateCcw, StepForward, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import DemoBadge from '../components/DemoBadge.tsx'
import DepartureBoard from '../components/DepartureBoard.tsx'
import MapPanel from '../components/MapPanel.tsx'
import PageHeader from '../components/PageHeader.tsx'
import PassengerManifest from '../components/PassengerManifest.tsx'
import ShuttlePicker from '../components/ShuttlePicker.tsx'
import { findShuttle, getRoute, getStop } from '../data/campus.ts'
import { useAuth } from '../hooks/useAuth.ts'
import { useShuttleMarkers } from '../hooks/useShuttleMarkers.ts'
import { useBookings } from '../hooks/useBookings.ts'
import { useFleet } from '../hooks/useFleet.ts'
import { useSimulation } from '../hooks/useSimulation.ts'
import { useToast } from '../hooks/useToast.ts'
import { SIM_SPEEDS } from '../simulator/clock.ts'
import type { SimAction } from '../simulator/controls.ts'
import type { SimRunState } from '../types/index.ts'

const runStateLabel: Record<SimRunState, string> = {
  idle: 'Ready at the start of the route',
  running: 'Running',
  paused: 'Paused',
}

/** "247.6" seconds becomes "04:07". */
function formatClock(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds)
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export default function OperatorPage() {
  const { user } = useAuth()
  const { notify } = useToast()
  const { getClock, getSnapshot, getElapsedSeconds, getLoopSeconds, getUpcomingStops, control } = useSimulation()
  const { shuttles, getShuttle } = useFleet()
  const [searchParams] = useSearchParams()
  const assigned = findShuttle(user?.assignedShuttleId) ? getShuttle(user?.assignedShuttleId ?? '') : undefined
  const isAdmin = user?.role === 'admin'
  // Administrators can open a shuttle directly, e.g. /app/operator?shuttle=sh-02
  const requested = findShuttle(searchParams.get('shuttle')) ? searchParams.get('shuttle') : null
  const [selectedId, setSelectedId] = useState(requested ?? assigned?.id ?? shuttles[0].id)

  // Operators control only their assigned shuttle. Admins can pick any.
  const shuttle = isAdmin ? getShuttle(selectedId) : assigned
  const markers = useShuttleMarkers(shuttle?.routeId ?? '', shuttle?.id ?? '')
  const { getSeatsAvailable, shuttleBookings, allBookings, getPhase } = useBookings()
  const snapshot = shuttle ? { ...getSnapshot(shuttle.id), seatsAvailable: getSeatsAvailable(shuttle.id) } : null

  if (!shuttle || !snapshot) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Operator console" />
        <p className="panel p-5 text-sm text-muted">
          No shuttle is assigned to your account yet. Ask an administrator to assign one.
        </p>
      </div>
    )
  }

  const route = getRoute(shuttle.routeId)
  const clock = getClock(shuttle.id)
  const loopMinutes = Math.round(getLoopSeconds(shuttle.id) / 60 / clock.speed)

  async function run(action: SimAction, successTitle: string) {
    if (!shuttle) return
    const result = await control(shuttle.id, action)
    if (result.ok) {
      notify({ tone: 'success', title: successTitle })
    } else {
      notify({ tone: 'error', title: 'Action not allowed', message: result.message })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Operator console"
        description={isAdmin ? 'Administrators can control any shuttle.' : `Your assigned shuttle is ${shuttle.code}.`}
        actions={<DemoBadge />}
      />

      {isAdmin ? <ShuttlePicker shuttles={shuttles} selectedId={shuttle.id} onSelect={setSelectedId} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="controls-title" className="panel flex flex-col gap-6 p-5 sm:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="controls-title" className="text-lg font-bold">
                Simulation controls
              </h2>
              <p className="mt-1 text-sm text-muted">
                Move {shuttle.code} along the {route.name}. No driver or GPS is needed.
              </p>
            </div>
            <p className="text-sm sm:text-right">
              <span className="block font-semibold" data-testid="run-state">
                {runStateLabel[clock.runState]}
              </span>
              <span className="tabular text-muted">Route time {formatClock(getElapsedSeconds(shuttle.id))}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ControlButton
              icon={Play}
              label="Start"
              primary
              disabled={clock.runState !== 'idle'}
              onClick={() => run({ type: 'start' }, `${shuttle.code} started`)}
            />
            <ControlButton
              icon={Pause}
              label="Pause"
              disabled={clock.runState !== 'running'}
              onClick={() => run({ type: 'pause' }, `${shuttle.code} paused`)}
            />
            <ControlButton
              icon={StepForward}
              label="Resume"
              primary
              disabled={clock.runState !== 'paused'}
              onClick={() => run({ type: 'resume' }, `${shuttle.code} resumed`)}
            />
            <ControlButton
              icon={RotateCcw}
              label="Reset"
              disabled={clock.runState === 'idle'}
              onClick={() => run({ type: 'reset' }, `${shuttle.code} reset to ${getStop(route.stopIds[0]).name}`)}
            />
          </div>

          <fieldset>
            <legend className="field-label">Simulation speed</legend>
            <div className="mt-2 inline-flex rounded-lg border border-line p-1">
              {SIM_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  aria-pressed={clock.speed === speed}
                  onClick={() => run({ type: 'speed', speed }, `${shuttle.code} speed set to ${speed}x`)}
                  className={`tabular rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                    clock.speed === speed ? 'bg-ink text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
            <p className="field-hint">One full loop takes about {loopMinutes} min at this speed.</p>
          </fieldset>

          <p className="border-t border-line pt-5 text-sm text-muted">
            Changes apply straight away on every open screen in this browser, including the student live board.
          </p>
        </section>

        <DepartureBoard shuttle={shuttle} route={route} snapshot={snapshot} />
      </div>

      <PassengerManifest
        shuttleCode={shuttle.code}
        bookings={(isAdmin ? allBookings : shuttleBookings).filter((booking) => booking.shuttleId === shuttle.id)}
        getPhase={getPhase}
        upcoming={getUpcomingStops(shuttle.id)}
        paused={clock.runState !== 'running'}
      />

      <MapPanel route={route} markers={markers} highlightStopIds={[snapshot.nextStopId]} />
    </div>
  )
}

function ControlButton({
  icon: Icon,
  label,
  primary = false,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  label: string
  primary?: boolean
  disabled: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      className={`btn ${primary ? 'btn-primary' : 'btn-secondary'}`}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  )
}
