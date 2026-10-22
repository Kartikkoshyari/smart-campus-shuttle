import { AlertTriangle, Database, HardDrive } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.ts'
import { appEnv } from '../lib/env.ts'

/**
 * Tells people where their data is kept: in this browser (local demo)
 * or in the Supabase database.
 */
export default function DataModeNotice({ compact = false }: { compact?: boolean }) {
  const { mode } = useAuth()

  if (appEnv.secretKeyDetected) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-alert-tint p-3 text-sm text-alert">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>A secret Supabase key is in the frontend settings and was ignored. Use the publishable key.</span>
      </p>
    )
  }

  const isLocal = mode === 'local-demo'
  const Icon = isLocal ? HardDrive : Database
  const title = isLocal ? 'Local demo data' : 'Saved to Supabase'
  const detail = isLocal
    ? 'Accounts and bookings are kept in this browser only and are not shared with other devices.'
    : 'Accounts and bookings are saved in the database.'

  if (compact) {
    return (
      <p className="flex items-start gap-2 text-xs text-muted" title={detail}>
        <Icon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        <span>
          <span className="font-semibold text-ink">{title}.</span> {isLocal ? 'Stored in this browser only.' : ''}
        </span>
      </p>
    )
  }

  return (
    <p className="flex items-start gap-2.5 text-sm text-muted">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="font-semibold text-ink">{title}.</span> {detail}
      </span>
    </p>
  )
}
