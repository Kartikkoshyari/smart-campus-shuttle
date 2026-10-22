import type { AppUser, SimClock, SimSpeed } from '../types/index.ts'
import { pauseClock, resetClock, resumeClock, setClockSpeed, startClock } from './clock.ts'

export type SimAction =
  { type: 'start' } | { type: 'pause' } | { type: 'resume' } | { type: 'reset' } | { type: 'speed'; speed: SimSpeed }

export type ControlResult = { ok: true } | { ok: false; message: string }

/**
 * Operators may control only their assigned shuttle. Administrators may
 * control any shuttle. Students and visitors may not control shuttles.
 * (Phase 5 repeats this check in the database.)
 */
export function canControlShuttle(user: AppUser | null, shuttleId: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return user.role === 'operator' && user.assignedShuttleId === shuttleId
}

/** Applies one control action to a clock. */
export function applySimAction(clock: SimClock, action: SimAction, nowMs: number): SimClock {
  switch (action.type) {
    case 'start':
      return startClock(clock, nowMs)
    case 'pause':
      return pauseClock(clock, nowMs)
    case 'resume':
      return resumeClock(clock, nowMs)
    case 'reset':
      return resetClock(clock, nowMs)
    case 'speed':
      return setClockSpeed(clock, action.speed, nowMs)
  }
}
