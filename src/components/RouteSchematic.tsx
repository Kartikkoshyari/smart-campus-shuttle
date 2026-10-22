import { Bus } from 'lucide-react'
import { useId } from 'react'
import { getStop } from '../data/campus.ts'
import type { LatLng, MapMarker, Route } from '../types/index.ts'

interface RouteSchematicProps {
  route: Route
  /** Shuttles to draw. The selected one is larger and yellow. */
  markers?: MapMarker[]
  /** Stops to highlight, such as the next stop. */
  highlightStopIds?: string[]
  label?: string
}

const WIDTH = 640
const HEIGHT = 400
// Room for stop names beside the outermost stops.
const PAD_X = 150
const PAD_Y = 44

/**
 * A simple drawing of the route from the stop coordinates. It needs no
 * internet connection, so it is also the fallback when map tiles
 * cannot load.
 */
export default function RouteSchematic({
  route,
  markers = [],
  highlightStopIds = [],
  label = `${route.name} route diagram`,
}: RouteSchematicProps) {
  const gridId = useId()
  const routeStops = route.stopIds.map(getStop)

  // Longitude degrees are shorter than latitude degrees away from the equator.
  const meanLat = routeStops.reduce((sum, stop) => sum + stop.position.lat, 0) / routeStops.length
  const lngScale = Math.cos((meanLat * Math.PI) / 180)
  const xs = routeStops.map((stop) => stop.position.lng * lngScale)
  const ys = routeStops.map((stop) => stop.position.lat)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX || 1
  const spanY = Math.max(...ys) - minY || 1
  const scale = Math.min((WIDTH - PAD_X * 2) / spanX, (HEIGHT - PAD_Y * 2) / spanY)
  const offsetX = (WIDTH - spanX * scale) / 2
  const offsetY = (HEIGHT - spanY * scale) / 2

  const project = (point: LatLng) => ({
    x: offsetX + (point.lng * lngScale - minX) * scale,
    y: HEIGHT - (offsetY + (point.lat - minY) * scale),
  })

  const points = routeStops.map((stop) => project(stop.position))
  const centreX = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const centreY = points.reduce((sum, p) => sum + p.y, 0) / points.length
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label} className="block h-auto w-full">
      <title>{label}</title>
      <defs>
        <pattern id={gridId} width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0V28" fill="none" stroke="var(--color-line)" strokeWidth="1" opacity="0.6" />
        </pattern>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill="var(--color-paper)" />
      <rect width={WIDTH} height={HEIGHT} fill={`url(#${gridId})`} />

      {/* White casing under the coloured line, like a road on a map. */}
      <path
        d={`${path}${route.isLoop ? ' Z' : ''}`}
        fill="none"
        stroke="white"
        strokeWidth="14"
        strokeLinejoin="round"
      />
      <path
        d={`${path}${route.isLoop ? ' Z' : ''}`}
        fill="none"
        stroke="var(--color-route)"
        strokeWidth="7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {routeStops.map((stop, index) => {
        const p = points[index]
        const dx = p.x - centreX
        const dy = p.y - centreY
        const anchor = dx > 12 ? 'start' : dx < -12 ? 'end' : 'middle'
        const labelX = anchor === 'start' ? p.x + 15 : anchor === 'end' ? p.x - 15 : p.x
        const labelY = anchor === 'middle' ? (dy > 0 ? p.y + 26 : p.y - 16) : p.y + 5
        const highlighted = highlightStopIds.includes(stop.id)

        return (
          <g key={stop.id}>
            <circle
              cx={p.x}
              cy={p.y}
              r="8"
              fill={highlighted ? 'var(--color-signal)' : 'white'}
              stroke="var(--color-ink)"
              strokeWidth="3"
            />
            <text
              x={labelX}
              y={labelY}
              textAnchor={anchor}
              fontSize="16"
              fontWeight={highlighted ? 700 : 600}
              fill="var(--color-ink)"
              stroke="var(--color-paper)"
              strokeWidth="4"
              paintOrder="stroke"
            >
              {stop.name}
            </text>
          </g>
        )
      })}

      {/* Unselected shuttles first, so the selected one is drawn on top. */}
      {[...markers]
        .sort((a, b) => Number(a.selected) - Number(b.selected))
        .map((marker) => {
          const p = project(marker.position)
          const radius = marker.selected ? 17 : 13
          const icon = marker.selected ? 20 : 15
          return (
            <g key={marker.id} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
              <title>{`Shuttle ${marker.code} (simulated position)`}</title>
              <circle
                r={radius}
                fill={marker.selected ? 'var(--color-signal)' : 'white'}
                stroke="var(--color-ink)"
                strokeWidth="3"
              />
              <Bus
                x={-icon / 2}
                y={-icon / 2}
                width={icon}
                height={icon}
                color="var(--color-ink)"
                strokeWidth={2.25}
                aria-hidden="true"
              />
            </g>
          )
        })}
    </svg>
  )
}
