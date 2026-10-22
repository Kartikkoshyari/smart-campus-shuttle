import { createContext, useContext } from 'react'
import type { DataMode } from '../lib/env.ts'
import type { SignUpInput } from '../services/authService.ts'
import type { AppUser } from '../types/index.ts'

export interface AuthContextValue {
  user: AppUser | null
  /** "loading" while the saved session is being checked on startup. */
  status: 'loading' | 'ready'
  mode: DataMode
  signIn(email: string, password: string): Promise<AppUser>
  signUp(input: SignUpInput): Promise<AppUser>
  signOut(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

/** Gives any component the signed-in user and the sign-in actions. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
