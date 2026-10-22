import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { appEnv } from './env.ts'

/**
 * The single Supabase client for the app. It is only created when Supabase
 * credentials are configured (see .env.example). It uses the PUBLISHABLE
 * key, which is safe in the browser because Row Level Security and the
 * database functions decide what each user may do.
 */
let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (appEnv.mode !== 'supabase') {
    throw new Error('Supabase is not configured. The app is running in local demo mode.')
  }
  client ??= createClient(
    import.meta.env.VITE_SUPABASE_URL ?? '',
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: true, autoRefreshToken: true } },
  )
  return client
}
