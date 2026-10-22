import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { getStop } from '../data/campus.ts'
import type { MapMarker, Route } from '../types/index.ts'

interface CampusMapProps {
  route: Route
  markers: MapMarker[]
  highlightStopIds?: string[]
  /** Called once if map tiles cannot be loaded (for example, no internet). */
  onTilesFailed(): void
}

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
/** If no tile has loaded after this long, switch to the diagram. */
const TILE_TIMEOUT_MS = 8000
/** Below this width, stop names are placed above the stops. */
const NARROW_MAP_PX = 520
const ROUTE_COLOUR = '#0e6b57'
const INK = '#17212b'
const SIGNAL = '#f2b705'

const BUS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>'

function shuttleIcon(marker: MapMarker): L.DivIcon {
  const size = marker.selected ? 40 : 30
  return L.divIcon({
    className: `shuttle-marker${marker.selected ? ' is-selected' : ''}`,
    html: `<span class="shuttle-marker__dot">${BUS_SVG}</span><span class="shuttle-marker__code">${marker.code}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * The interactive Leaflet map with OpenStreetMap tiles.
 * Leaflet is used directly (no wrapper library) so the shuttle marker can be
 * moved every frame without React redrawing the map.
 */
export default function CampusMap({ route, markers, highlightStopIds = [], onTilesFailed }: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const stopLayersRef = useRef(new Map<string, L.CircleMarker>())
  const markerLayersRef = useRef(new Map<string, { layer: L.Marker; selected: boolean }>())
  const failedRef = useRef(onTilesFailed)

  useEffect(() => {
    failedRef.current = onTilesFailed
  }, [onTilesFailed])

  // Create the map once for this route, and remove it when the component goes away.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = L.map(container, { scrollWheelZoom: false, zoomSnap: 0.25 })
    mapRef.current = map

    let tileLoaded = false
    let failureReported = false
    const reportFailure = () => {
      if (tileLoaded || failureReported) return
      failureReported = true
      failedRef.current()
    }

    let tileErrors = 0
    const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION })
    tiles.on('tileload', () => {
      tileLoaded = true
    })
    tiles.on('tileerror', () => {
      tileErrors += 1
      if (tileErrors >= 4) reportFailure()
    })
    tiles.addTo(map)
    const timeout = window.setTimeout(reportFailure, TILE_TIMEOUT_MS)

    const routeStops = route.stopIds.map(getStop)
    const points = routeStops.map((stop) => L.latLng(stop.position.lat, stop.position.lng))
    const linePoints = route.isLoop ? [...points, points[0]] : points
    L.polyline(linePoints, { color: 'white', weight: 11, opacity: 0.9, interactive: false }).addTo(map)
    const line = L.polyline(linePoints, { color: ROUTE_COLOUR, weight: 6, interactive: false }).addTo(map)

    const centreLng = points.reduce((sum, point) => sum + point.lng, 0) / points.length
    // On narrow screens, names go above the stops so they fit inside the map.
    const narrow = container.clientWidth < NARROW_MAP_PX
    const stopLayers = stopLayersRef.current
    routeStops.forEach((stop, index) => {
      const onRight = stop.position.lng >= centreLng
      const circle = L.circleMarker(points[index], {
        radius: 7,
        color: INK,
        weight: 3,
        fillColor: 'white',
        fillOpacity: 1,
      })
      circle.bindTooltip(stop.name, {
        permanent: true,
        direction: narrow ? 'top' : onRight ? 'right' : 'left',
        offset: narrow ? [0, -6] : onRight ? [8, 0] : [-8, 0],
        className: 'stop-label',
      })
      circle.addTo(map)
      stopLayers.set(stop.id, circle)
    })

    // Leave room at the sides for the stop names, which sit beside the outer stops.
    const fitRoute = () => {
      const sidePadding = narrow ? 60 : Math.min(120, Math.max(40, container.clientWidth * 0.22))
      map.fitBounds(line.getBounds(), { padding: [sidePadding, narrow ? 44 : 40] })
    }
    fitRoute()

    // Keep the map sized and framed correctly when the layout changes (e.g. the phone is rotated).
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize()
      fitRoute()
    })
    resizeObserver.observe(container)

    const markerLayers = markerLayersRef.current
    return () => {
      window.clearTimeout(timeout)
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      stopLayers.clear()
      markerLayers.clear()
    }
  }, [route])

  // Move the shuttle markers. setLatLng is cheap, so this runs every frame.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const layers = markerLayersRef.current
    const wanted = new Set(markers.map((marker) => marker.id))

    for (const [id, entry] of layers) {
      if (!wanted.has(id)) {
        entry.layer.remove()
        layers.delete(id)
      }
    }

    for (const marker of markers) {
      const position = L.latLng(marker.position.lat, marker.position.lng)
      const existing = layers.get(marker.id)
      if (!existing) {
        const layer = L.marker(position, {
          icon: shuttleIcon(marker),
          keyboard: false,
          zIndexOffset: marker.selected ? 1000 : 500,
          title: `Shuttle ${marker.code} (simulated position)`,
        }).addTo(map)
        layers.set(marker.id, { layer, selected: marker.selected })
      } else {
        existing.layer.setLatLng(position)
        if (existing.selected !== marker.selected) {
          existing.layer.setIcon(shuttleIcon(marker))
          existing.layer.setZIndexOffset(marker.selected ? 1000 : 500)
          existing.selected = marker.selected
        }
      }
    }
  }, [markers])

  // Highlight the next stop. The text key means this only runs when the stops change.
  const highlightKey = highlightStopIds.join('|')
  useEffect(() => {
    const highlighted = new Set(highlightKey.split('|'))
    for (const [stopId, circle] of stopLayersRef.current) {
      circle.setStyle({ fillColor: highlighted.has(stopId) ? SIGNAL : 'white' })
    }
  }, [highlightKey])

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={`Map of the ${route.name} with simulated shuttle positions`}
      className="campus-map h-[340px] w-full sm:h-[420px] lg:h-[500px]"
    />
  )
}
