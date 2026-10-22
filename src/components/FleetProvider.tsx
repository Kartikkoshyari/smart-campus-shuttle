import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getShuttle as getBaseShuttle, shuttles as baseShuttles } from '../data/campus.ts'
import { FleetContext, type FleetContextValue } from '../hooks/useFleet.ts'
import type { FleetService, ShuttleSettings } from '../services/fleetService.ts'
import { fleetService } from '../services/index.ts'
import type { Shuttle } from '../types/index.ts'

interface FleetProviderProps {
  children: ReactNode
  /** Tests pass their own service. The app uses the default. */
  service?: FleetService
}

/** Keeps shuttle names and seat capacities up to date for every screen. */
export default function FleetProvider({ children, service = fleetService }: FleetProviderProps) {
  const [settings, setSettings] = useState<Record<string, ShuttleSettings>>(() => service.peekSettings() ?? {})

  const refresh = useCallback(async () => {
    try {
      setSettings(await service.loadSettings())
    } catch {
      // Keep the last known settings; the connection notice explains any outage.
    }
  }, [service])

  useEffect(() => {
    // refresh() only sets state after the service answers, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
    return service.subscribe(() => void refresh())
  }, [refresh, service])

  const shuttles = useMemo<Shuttle[]>(
    () => baseShuttles.map((shuttle) => ({ ...shuttle, ...settings[shuttle.id] })),
    [settings],
  )

  const getShuttle = useCallback(
    (shuttleId: string) => shuttles.find((shuttle) => shuttle.id === shuttleId) ?? getBaseShuttle(shuttleId),
    [shuttles],
  )

  const value = useMemo<FleetContextValue>(() => ({ shuttles, getShuttle, refresh }), [shuttles, getShuttle, refresh])

  return <FleetContext value={value}>{children}</FleetContext>
}
