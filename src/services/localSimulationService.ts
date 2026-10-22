import { shuttles } from '../data/campus.ts'
import { readJson, writeJson } from '../lib/storage.ts'
import { createClock, normalizeClock } from '../simulator/clock.ts'
import { applySimAction, canControlShuttle } from '../simulator/controls.ts'
import { hasTimeline } from '../simulator/timetables.ts'
import type { ClockMap } from '../types/index.ts'
import type { SimulationService } from './simulationService.ts'

export const SIM_STORAGE_KEY = 'scs.sim.clocks.v1'

export interface LocalSimulationOptions {
  /** Tests pass a fixed clock. The app uses the real time. */
  getNow?: () => number
}

/**
 * LOCAL DEMO simulation clocks, saved in this browser's localStorage.
 * Every tab in the same browser shares them. The permission check here only
 * protects the screens; Phase 5 enforces it in the database.
 */
export function createLocalSimulationService(options: LocalSimulationOptions = {}): SimulationService {
  const getNow = options.getNow ?? Date.now
  const listeners = new Set<(clocks: ClockMap) => void>()
  // Used if this browser blocks storage, so shuttles do not jump back to the start.
  let cache: ClockMap = {}

  function read(): ClockMap {
    const saved = readJson<unknown>(SIM_STORAGE_KEY, {})
    const savedMap = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {}
    const clocks: ClockMap = {}
    let changed = false
    for (const shuttle of shuttles) {
      const stored = normalizeClock(savedMap[shuttle.id])
      if (stored) {
        clocks[shuttle.id] = stored
      } else {
        clocks[shuttle.id] = cache[shuttle.id] ?? createClock(getNow())
        changed = true
      }
    }
    cache = clocks
    if (changed) writeJson(SIM_STORAGE_KEY, clocks)
    return clocks
  }

  function emit(clocks: ClockMap) {
    listeners.forEach((listener) => listener(clocks))
  }

  function onStorage(event: StorageEvent) {
    if (event.key === SIM_STORAGE_KEY) emit(read())
  }

  return {
    mode: 'local-demo',
    now: () => getNow(),
    peekClocks: () => read(),
    loadClocks: async () => read(),

    async control(actor, shuttleId, action) {
      if (!hasTimeline(shuttleId)) return { ok: false, message: 'That shuttle does not exist.' }
      if (!canControlShuttle(actor, shuttleId)) {
        return { ok: false, message: 'You can only control the shuttle assigned to you.' }
      }
      const clocks = read()
      const current = clocks[shuttleId]
      const next = applySimAction(current, action, getNow())
      if (next !== current) {
        const updated = { ...clocks, [shuttleId]: next }
        cache = updated
        writeJson(SIM_STORAGE_KEY, updated)
        emit(updated)
      }
      return { ok: true }
    },

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
