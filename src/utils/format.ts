import type { Direction, Role, ShuttleStatus } from '../types/index.ts'

/** Turns seconds into text such as "1 min 35 s". */
export function formatEta(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds === 0) return 'Arriving now'
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

export const directionLabel: Record<Direction, string> = {
  clockwise: 'Clockwise',
  anticlockwise: 'Anticlockwise',
}

export const statusLabel: Record<ShuttleStatus, string> = {
  moving: 'Moving',
  at_stop: 'At stop',
  paused: 'Paused',
}

export const roleLabel: Record<Role, string> = {
  student: 'Student',
  operator: 'Operator',
  admin: 'Administrator',
}

/** A short date and time such as "21 Oct, 10:15 pm", in the viewer's own format. */
export function formatBookedAt(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** "1 seat is" or "3 seats are". */
export function seatsAre(count: number): string {
  return count === 1 ? '1 seat is' : `${count} seats are`
}

/** "Asha Rao" becomes "AR". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}
