import type { SupabaseClient } from '@supabase/supabase-js'
import type { FleetService, ShuttleSettings } from './fleetService.ts'

/** Shuttle names and seat capacities from the "shuttles" table. */
export function createSupabaseFleetService(client: SupabaseClient): FleetService {
  let settings: Record<string, ShuttleSettings> | null = null

  return {
    mode: 'supabase',
    peekSettings: () => settings,

    async loadSettings() {
      const { data, error } = await client.from('shuttles').select('id, name, capacity')
      if (error) throw new Error(error.message)
      settings = Object.fromEntries(
        ((data ?? []) as { id: string; name: string; capacity: number }[]).map((row) => [
          row.id,
          { name: row.name, capacity: Number(row.capacity) },
        ]),
      )
      return settings
    },

    subscribe(listener) {
      const channel = client
        .channel(`fleet-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shuttles' }, () => listener())
        .subscribe()
      return () => {
        void client.removeChannel(channel)
      }
    },
  }
}
