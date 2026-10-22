import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastInput {
  tone: ToastTone
  title: string
  message?: string
}

export interface ToastContextValue {
  notify(toast: ToastInput): void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

/** Shows short notifications, e.g. notify({ tone: 'success', title: 'Signed in' }). */
export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside <ToastProvider>')
  return value
}
