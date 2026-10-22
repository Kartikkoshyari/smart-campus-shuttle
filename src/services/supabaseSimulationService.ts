import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClockMap } from '../types/index.ts'
import type { SimulationService } from './simulationService.ts'
import { parseSimState, rowToClock, toControlResult, type ClockRow } from './supabaseMappers.ts'

/**
 * Simulation clocks stored in the database, so every phone and laptop sees
 * the same shuttle position. Changes arrive instantly through Supabase Realtime.
 * The server checks who may control each shuttle (control_shuttle function).
 */
export function createSupabaseSimulationService(client: SupabaseClient): SimulationService {
  let clocks: ClockMap | null = null
  // Difference between the server clock and this device's clock, in milliseconds.
  let offsetMs = 0
  const listeners = new Set<(clocks: ClockMap) => void>()
  let channel: ReturnType<SupabaseClient['channel']> | null = null

  async function load(): Promise<ClockMap> {
    const sentAt = Date.now()
    const { data, error } = await client.rpc('get_sim_state')
    if (error) throw new Error(error.message)
    const receivedAt = Date.now()
    const state = parseSimState(data)
    // Assume the server answered halfway through the round trip.
    offsetMs = state.serverTimeMs - (sentAt + receivedAt) / 2
    clocks = state.clocks
    return clocks
  }

  function emit() {
    if (clocks) listeners.forEach((listener) => listener(clocks as ClockMap))
  }

  return {
    mode: 'supabase',
    now: () => Date.now() + offsetMs,
    peekClocks: () => clocks,
    loadClocks: () => load(),

    async control(_actor, shuttleId, action) {
      const { data, error } = await client.rpc('control_shuttle', {
        p_shuttle_id: shuttleId,
        p_action: action.type,
        p_speed: action.type === 'speed' ? action.speed : null,
      })
      const result = toControlResult(error)
      if (result.ok && data) {
        const clock = rowToClock((Array.isArray(data) ? data[0] : data) as ClockRow)
        if (clock && clocks) {
          clocks = { ...clocks, [shuttleId]: clock }
          emit()
        }
      }
      return result
    },

    subscribe(listener) {
      listeners.add(listener)
      if (!channel) {
        channel = client
          // A unique name: supabase-js reuses a channel with the same name, and adding
          // listeners to an already subscribed channel fails after a quick remount.
          .channel(`shuttle-clocks-${Math.random().toString(36).slice(2)}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'shuttle_clocks' }, () => {
            load()
              .then(emit)
              .catch(() => undefined)
          })
          .subscribe()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && channel) {
          void client.removeChannel(channel)
          channel = null
        }
      }
    },
  }
}
