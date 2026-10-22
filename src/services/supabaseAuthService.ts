import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppUser } from '../types/index.ts'
import { AuthError, normalizeEmail, validateSignUp, type AuthService } from './authService.ts'
import { rowToUser, toAuthError, type ProfileRow } from './supabaseMappers.ts'

/**
 * Sign-in with Supabase Auth. The user's role always comes from the
 * "profiles" table, which only administrators can change, never from the browser.
 */
export function createSupabaseAuthService(client: SupabaseClient): AuthService {
  async function loadProfile(userId: string): Promise<AppUser> {
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, email, role, assigned_shuttle_id')
      .eq('id', userId)
      .single()
    if (error || !data) {
      throw new AuthError(
        'Your profile could not be loaded. Check that the database migrations have run.',
        'unavailable',
      )
    }
    return rowToUser(data as ProfileRow)
  }

  return {
    mode: 'supabase',

    async getCurrentUser() {
      const { data } = await client.auth.getSession()
      const session = data.session
      if (!session) return null
      try {
        return await loadProfile(session.user.id)
      } catch {
        return null
      }
    },

    async signIn(email, password) {
      if (!email.trim() || !password) throw new AuthError('Enter your email and password.', 'missing_fields')
      const { data, error } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password })
      if (error || !data.user) throw toAuthError(error ?? { message: 'No user returned' })
      return loadProfile(data.user.id)
    },

    async signUp(input) {
      const errors = validateSignUp(input)
      const firstError = Object.values(errors)[0]
      if (firstError) throw new AuthError(firstError, 'invalid_input')

      // Only the name is sent. The database gives every new account the student role.
      const { data, error } = await client.auth.signUp({
        email: normalizeEmail(input.email),
        password: input.password,
        options: {
          data: { full_name: input.name.trim() },
          // The confirmation email links back to this site (it must be listed under
          // Authentication → URL Configuration → Redirect URLs in Supabase).
          emailRedirectTo: typeof window === 'undefined' ? undefined : `${window.location.origin}/login`,
        },
      })
      if (error) throw toAuthError(error)
      if (!data.session || !data.user) {
        throw new AuthError(
          'Account created. Open the confirmation link we emailed you, then sign in.',
          'confirmation_required',
        )
      }
      return loadProfile(data.user.id)
    },

    async signOut() {
      await client.auth.signOut()
    },
  }
}
