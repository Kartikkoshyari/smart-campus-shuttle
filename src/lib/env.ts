/**
 * Reads the Supabase settings from environment variables and decides which
 * data mode the app runs in.
 *
 * - "supabase":   credentials are present, so accounts and bookings persist.
 * - "local-demo": no credentials yet, so data lives in this browser only.
 *
 * The functions are pure (they take values as arguments) so they are easy to test.
 */

export type DataMode = 'supabase' | 'local-demo'

export interface EnvCheck {
  mode: DataMode
  /** Human-readable explanation shown on screen. */
  reason: string
  /** True when someone pasted a secret / service-role key into frontend config. */
  secretKeyDetected: boolean
}

const PLACEHOLDER_MARKERS = ['your-project', 'your-publishable-key', 'replace-me']

/** Returns true if the key looks like a Supabase secret or service_role key. */
export function looksLikeSecretKey(key: string): boolean {
  const trimmed = key.trim()
  if (trimmed.startsWith('sb_secret_')) return true

  // Legacy keys are JWTs: header.payload.signature. The payload names the role.
  const parts = trimmed.split('.')
  if (parts.length !== 3) return false
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { role?: unknown }
    return payload.role === 'service_role'
  } catch {
    return false
  }
}

export function checkEnv(url: string | undefined, key: string | undefined): EnvCheck {
  const cleanUrl = (url ?? '').trim()
  const cleanKey = (key ?? '').trim()

  if (cleanKey && looksLikeSecretKey(cleanKey)) {
    return {
      mode: 'local-demo',
      reason:
        'A secret/service-role key was found in frontend settings. It has been ignored. Use the publishable key instead.',
      secretKeyDetected: true,
    }
  }

  if (!cleanUrl || !cleanKey) {
    return {
      mode: 'local-demo',
      reason: 'Supabase is not configured yet, so the app uses local demo data stored in this browser.',
      secretKeyDetected: false,
    }
  }

  const combined = `${cleanUrl} ${cleanKey}`.toLowerCase()
  if (PLACEHOLDER_MARKERS.some((marker) => combined.includes(marker))) {
    return {
      mode: 'local-demo',
      reason: 'The .env.local file still contains placeholder values, so the app uses local demo data.',
      secretKeyDetected: false,
    }
  }

  if (!/^https:\/\/.+/.test(cleanUrl)) {
    return {
      mode: 'local-demo',
      reason: 'VITE_SUPABASE_URL must start with https://. Using local demo data until it is fixed.',
      secretKeyDetected: false,
    }
  }

  return {
    mode: 'supabase',
    reason: 'Supabase credentials found. Accounts and bookings will be saved to the database.',
    secretKeyDetected: false,
  }
}

/** The result for the values this build was started with. */
export const appEnv: EnvCheck = checkEnv(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
