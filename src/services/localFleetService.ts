import { findShuttle } from '../data/campus.ts'
import { readJson, writeJson } from '../lib/storage.ts'
import type { FleetService, ShuttleSettings } from './fleetService.ts'

export const LOCAL_FLEET_KEY = 'scs.local.fleet.v1'

const listeners = new Set<() => void>()

function isSettings(value: unknown): value is ShuttleSettings {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.name === 'string' &&
    v.name.trim().length > 0 &&
    typeof v.capacity === 'number' &&
    Number.isInteger(v.capacity) &&
    v.capacity >= 1 &&
    v.capacity <= 100
  )
}

/** Changes an administrator has made in this browser, keyed by shuttle ID. */
export function readLocalFleet(): Record<string, ShuttleSettings> {
  const saved = readJson<unknown>(LOCAL_FLEET_KEY, {})
  const result: Record<string, ShuttleSettings> = {}
  if (saved && typeof saved === 'object') {
    for (const [id, value] of Object.entries(saved as Record<string, unknown>)) {
      if (findShuttle(id) && isSettings(value)) result[id] = value
    }
  }
  return result
}

export function writeLocalFleet(settings: Record<string, ShuttleSettings>): boolean {
  const ok = writeJson(LOCAL_FLEET_KEY, settings)
  if (ok) listeners.forEach((listener) => listener())
  return ok
}

/** Seats on a shuttle, including any change an administrator made. */
export function localCapacityOf(shuttleId: string): number {
  return readLocalFleet()[shuttleId]?.capacity ?? findShuttle(shuttleId)?.capacity ?? 0
}

function onStorage(event: StorageEvent) {
  if (event.key === LOCAL_FLEET_KEY) listeners.forEach((listener) => listener())
}

/** LOCAL DEMO shuttle settings, saved in this browser. */
export function createLocalFleetService(): FleetService {
  return {
    mode: 'local-demo',
    peekSettings: () => readLocalFleet(),
    loadSettings: async () => readLocalFleet(),
    subscribe(listener) {
      if (listeners.size === 0) window.addEventListener('storage', onStorage)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) window.removeEventListener('storage', onStorage)
      }
    },
  }
}
