import type { SimClock, SimSpeed } from '../types/index.ts'

/**
 * The simulation clock. Each function returns a NEW clock and never changes
 * the one passed in. Actions that make no sense (pausing a paused shuttle)
 * return the clock unchanged, so double clicks are harmless.
 */

export const SIM_SPEEDS: readonly SimSpeed[] = [1, 2, 5]

export function isSimSpeed(value: unknown): value is SimSpeed {
  return value === 1 || value === 2 || value === 5
}

export function createClock(nowMs: number, runState: SimClock['runState'] = 'running'): SimClock {
  return { runState, speed: 1, baseElapsed: 0, baseTimeMs: nowMs, generation: 0 }
}

/** Simulated seconds travelled at the given moment. */
export function elapsedAt(clock: SimClock, nowMs: number): number {
  if (clock.runState !== 'running') return clock.baseElapsed
  return clock.baseElapsed + (Math.max(0, nowMs - clock.baseTimeMs) / 1000) * clock.speed
}

export function startClock(clock: SimClock, nowMs: number): SimClock {
  if (clock.runState !== 'idle') return clock
  return { ...clock, runState: 'running', baseTimeMs: nowMs }
}

export function pauseClock(clock: SimClock, nowMs: number): SimClock {
  if (clock.runState !== 'running') return clock
  return { ...clock, runState: 'paused', baseElapsed: elapsedAt(clock, nowMs), baseTimeMs: nowMs }
}

export function resumeClock(clock: SimClock, nowMs: number): SimClock {
  if (clock.runState !== 'paused') return clock
  return { ...clock, runState: 'running', baseTimeMs: nowMs }
}

/**
 * Back to the start of the route, waiting for Start. The chosen speed is kept.
 * The generation goes up, which ends any bookings made before the reset.
 */
export function resetClock(clock: SimClock, nowMs: number): SimClock {
  return { runState: 'idle', speed: clock.speed, baseElapsed: 0, baseTimeMs: nowMs, generation: clock.generation + 1 }
}

/** Changes speed without making the shuttle jump. */
export function setClockSpeed(clock: SimClock, speed: SimSpeed, nowMs: number): SimClock {
  if (clock.speed === speed) return clock
  return { ...clock, speed, baseElapsed: elapsedAt(clock, nowMs), baseTimeMs: nowMs }
}

/** Checks a clock read back from storage, so damaged data cannot break the app. */
export function isValidClock(value: unknown): value is SimClock {
  return normalizeClock(value) !== null
}

/**
 * Turns saved data into a clock, or returns null if it is damaged.
 * Clocks saved before generations existed (Phase 3) start at generation 0.
 */
export function normalizeClock(value: unknown): SimClock | null {
  if (!value || typeof value !== 'object') return null
  const clock = value as Record<string, unknown>
  const generation = clock.generation ?? 0
  const valid =
    (clock.runState === 'idle' || clock.runState === 'running' || clock.runState === 'paused') &&
    isSimSpeed(clock.speed) &&
    typeof clock.baseElapsed === 'number' &&
    Number.isFinite(clock.baseElapsed) &&
    clock.baseElapsed >= 0 &&
    typeof clock.baseTimeMs === 'number' &&
    Number.isFinite(clock.baseTimeMs) &&
    typeof generation === 'number' &&
    Number.isInteger(generation) &&
    generation >= 0
  if (!valid) return null
  return {
    runState: clock.runState as SimClock['runState'],
    speed: clock.speed as SimClock['speed'],
    baseElapsed: clock.baseElapsed as number,
    baseTimeMs: clock.baseTimeMs as number,
    generation: generation as number,
  }
}
