import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue } from '../hooks/useAuth.ts'
import { authService } from '../services/index.ts'
import type { AuthService, SignUpInput } from '../services/authService.ts'
import type { AppUser } from '../types/index.ts'

interface AuthProviderProps {
  children: ReactNode
  /** Tests pass their own service. The app uses the default. */
  service?: AuthService
}

export default function AuthProvider({ children, service = authService }: AuthProviderProps) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')

  // Restore the saved session once when the app starts.
  useEffect(() => {
    let active = true
    service
      .getCurrentUser()
      .then((current) => {
        if (active) setUser(current)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setStatus('ready')
      })
    return () => {
      active = false
    }
  }, [service])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const signedIn = await service.signIn(email, password)
      setUser(signedIn)
      return signedIn
    },
    [service],
  )

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const created = await service.signUp(input)
      setUser(created)
      return created
    },
    [service],
  )

  const signOut = useCallback(async () => {
    await service.signOut()
    setUser(null)
  }, [service])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, mode: service.mode, signIn, signUp, signOut }),
    [user, status, service.mode, signIn, signUp, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
