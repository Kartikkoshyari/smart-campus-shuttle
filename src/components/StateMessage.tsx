import { AlertCircle, CheckCircle2, Inbox, Loader2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type Tone = 'empty' | 'error' | 'loading' | 'success'

interface StateMessageProps {
  tone: Tone
  title: string
  children?: ReactNode
  /** A button or link that tells people what to do next. */
  action?: ReactNode
  icon?: LucideIcon
}

const defaults: Record<Tone, { icon: LucideIcon; color: string }> = {
  empty: { icon: Inbox, color: 'text-muted' },
  error: { icon: AlertCircle, color: 'text-alert' },
  loading: { icon: Loader2, color: 'text-route' },
  success: { icon: CheckCircle2, color: 'text-route' },
}

/** One consistent look for empty, error, loading and success states. */
export default function StateMessage({ tone, title, children, action, icon }: StateMessageProps) {
  const Icon = icon ?? defaults[tone].icon
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className="flex flex-col items-center px-6 py-12 text-center">
      <Icon
        aria-hidden="true"
        className={`size-9 ${defaults[tone].color} ${tone === 'loading' ? 'motion-safe:animate-spin' : ''}`}
      />
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      {children ? <div className="mt-1.5 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
