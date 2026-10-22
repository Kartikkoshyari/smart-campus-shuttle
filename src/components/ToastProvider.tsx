import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastInput, type ToastTone } from '../hooks/useToast.ts'

interface Toast extends ToastInput {
  id: number
}

const MAX_VISIBLE = 4
const DURATION_MS: Record<ToastTone, number> = { success: 4500, info: 4500, error: 7000 }

const toneStyles: Record<ToastTone, { bar: string; icon: string }> = {
  success: { bar: 'bg-route', icon: 'text-route' },
  info: { bar: 'bg-signal', icon: 'text-signal-ink' },
  error: { bar: 'bg-alert', icon: 'text-alert' },
}

const toneIcons = { success: CheckCircle2, info: Info, error: XCircle }

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback(
    (input: ToastInput) => {
      nextId.current += 1
      const id = nextId.current
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { ...input, id }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS[input.tone]),
      )
    },
    [dismiss],
  )

  // Clear every pending timer if the provider is removed.
  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => clearTimeout(timer))
      pending.clear()
    }
  }, [])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col gap-2 sm:right-6 sm:bottom-6 sm:left-auto sm:w-96"
      >
        {toasts.map((toast) => {
          const Icon = toneIcons[toast.tone]
          const style = toneStyles[toast.tone]
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex overflow-hidden rounded-lg border border-line bg-white shadow-lg motion-safe:animate-toast-in"
            >
              <span aria-hidden="true" className={`w-1.5 shrink-0 ${style.bar}`} />
              <div className="flex flex-1 items-start gap-3 p-3.5">
                <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${style.icon}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.message ? <p className="mt-0.5 text-sm text-muted">{toast.message}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="-m-1 rounded p-1 text-muted hover:bg-paper hover:text-ink"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext>
  )
}
