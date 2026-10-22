import { createContext, useContext } from 'react'
import type { AdminService } from '../services/adminService.ts'

/** Gives administrator screens the admin service (tests can provide their own). */
export const AdminContext = createContext<AdminService | null>(null)

export function useAdmin(): AdminService {
  const value = useContext(AdminContext)
  if (!value) throw new Error('useAdmin must be used inside <AdminContext>')
  return value
}
