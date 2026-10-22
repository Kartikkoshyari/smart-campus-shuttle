import { Map as MapIcon, Route as RouteIcon, WifiOff } from 'lucide-react'
import { useCallback, useState } from 'react'
import { DEMO_COORDINATES_NOTE } from '../data/campus.ts'
import type { MapMarker, Route } from '../types/index.ts'
import CampusMap from './CampusMap.tsx'
import RouteSchematic from './RouteSchematic.tsx'

type View = 'map' | 'diagram'

interface MapPanelProps {
  route: Route
  markers: MapMarker[]
  highlightStopIds?: string[]
}

function startsOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Shows the live map, or the route diagram when map tiles are unavailable.
 * People can switch between the two at any time.
 */
export default function MapPanel({ route, markers, highlightStopIds = [] }: MapPanelProps) {
  const [view, setView] = useState<View>(() => (startsOffline() ? 'diagram' : 'map'))
  const [tilesFailed, setTilesFailed] = useState(() => startsOffline())

  const handleTilesFailed = useCallback(() => {
    setTilesFailed(true)
    setView('diagram')
  }, [])

  return (
    <figure className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div role="group" aria-label="Map view" className="inline-flex rounded-lg border border-line p-0.5">
          <ViewButton active={view === 'map'} onClick={() => setView('map')} icon={MapIcon} label="Map" />
          <ViewButton
            active={view === 'diagram'}
            onClick={() => setView('diagram')}
            icon={RouteIcon}
            label="Route diagram"
          />
        </div>
        <span className="text-xs text-muted">Simulated positions</span>
      </div>

      {tilesFailed && view === 'diagram' ? (
        <p role="status" className="flex items-start gap-2 bg-signal-tint px-4 py-2.5 text-sm text-signal-ink">
          <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Map tiles could not load, so the route diagram is shown. The simulation keeps running. Choose Map to try again
          once you are online.
        </p>
      ) : null}

      {view === 'map' ? (
        <CampusMap
          route={route}
          markers={markers}
          highlightStopIds={highlightStopIds}
          onTilesFailed={handleTilesFailed}
        />
      ) : (
        <RouteSchematic route={route} markers={markers} highlightStopIds={highlightStopIds} />
      )}

      <figcaption className="border-t border-line px-4 py-2.5 text-xs text-muted">{DEMO_COORDINATES_NOTE}</figcaption>
    </figure>
  )
}

function ViewButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick(): void
  icon: typeof MapIcon
  label: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors ${
        active ? 'bg-ink font-semibold text-white' : 'font-medium text-muted hover:text-ink'
      }`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  )
}
