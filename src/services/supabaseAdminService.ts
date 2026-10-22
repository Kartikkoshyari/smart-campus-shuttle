import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdminService } from './adminService.ts'
import { rowToUser, toAdminError, type ProfileRow } from './supabaseMappers.ts'

/**
 * Administrator actions for Supabase. Reading profiles relies on Row Level
 * Security; changes go through admin_update_user, admin_update_shuttle and admin_reset_demo,
 * which check that the caller is an administrator.
 */
export function createSupabaseAdminService(client: SupabaseClient): AdminService {
  return {
    mode: 'supabase',

    async listUsers() {
      const { data, error } = await client
        .from('profiles')
        .select('id, full_name, email, role, assigned_shuttle_id')
        .order('full_name')
      if (error) throw toAdminError(error)
      return ((data ?? []) as ProfileRow[]).map(rowToUser)
    },

    async updateUser(userId, changes) {
      const { data, error } = await client.rpc('admin_update_user', {
        p_user_id: userId,
        p_role: changes.role,
        p_assigned_shuttle_id: changes.role === 'operator' ? changes.assignedShuttleId : null,
      })
      if (error) throw toAdminError(error)
      return rowToUser((Array.isArray(data) ? data[0] : data) as ProfileRow)
    },

    async updateShuttle(shuttleId, changes) {
      const { data, error } = await client.rpc('admin_update_shuttle', {
        p_shuttle_id: shuttleId,
        p_name: changes.name.trim(),
        p_capacity: changes.capacity,
      })
      if (error) throw toAdminError(error)
      const row = (Array.isArray(data) ? data[0] : data) as { name: string; capacity: number }
      return { name: row.name, capacity: Number(row.capacity) }
    },

    async resetDemo() {
      const { data, error } = await client.rpc('admin_reset_demo')
      if (error) throw toAdminError(error)
      return { removedBookings: Number(data ?? 0) }
    },
  }
}
