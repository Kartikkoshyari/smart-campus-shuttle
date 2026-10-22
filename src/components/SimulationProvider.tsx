import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getShuttle, shuttles } from '../data/campus.ts'
import { useAuth } from '../hooks/useAuth.ts'
import { SimulationContext, type SimulationContextValue } from '../hooks/useSimulation.ts'
import { simulationService } from '../services/index.ts'
import type { SimulationService } from '../services/simulationService.ts'
import { createClock, elapsedAt } from '../simulator/clock.ts'
import type { SimAction } from '../simulator/controls.ts'
import { snapshotAt, upcomingStopEtas } from '../simulator/timeline.ts'
import { getTimeline } from '../simulator/timetables.ts'
import type { ClockMap } from '../types/index.ts'

/** Redraw at most this often while a shuttle moves (about 30 frames a second). */
const FRAME_INTERVAL_MS = 33

/** Shown for a moment in Supabase mode, before the real clocks have loaded. */
function placeholderClocks(nowMs: number): ClockMap {
  return Object.fromEntries(shuttles.map((shuttle) => [shuttle.id, createClock(nowMs, 'paused')]))
}

interface SimulationProviderProps {
  children: ReactNode
  /** Tests pass their own service. The app uses the default. */
  service?: SimulationService
  /** Tests switch the animation loop off. */
  animate?: boolean
}

/**
 * Runs the DEMO shuttle simulation for the whole app.
 *
 * Positions are calculated from the clocks and the current time, so:
 * - only ONE animation loop runs, and it is stopped when nothing moves;
 * - every screen shows the same position;
 * - pausing on the operator console pauses the shuttle on the student board too.
 */
export default function SimulationProvider({
  children,
  service = simulationService,
  animate = true,
}: SimulationProviderProps) {
  const { user } = useAuth()
  const [initial] = useState(() => service.peekClocks())
  const [clocks, setClocks] = useState<ClockMap>(() => initial ?? placeholderClocks(service.now()))
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(initial ? 'ready' : 'loading')
  const [nowMs, setNowMs] = useState(() => service.now())

  // Load the clocks (Supabase mode) and follow every later change.
  useEffect(() => {
    let active = true
    const unsubscribe = service.subscribe((next) => {
      if (!active) return
      setClocks(next)
      setNowMs(service.now())
    })
    service
      .loadClocks()
      .then((loaded) => {
        if (!active) return
        setClocks(loaded)
        setStatus('ready')
        setNowMs(service.now())
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [service])

  const anyRunning = Object.values(clocks).some((clock) => clock.runState === 'running')

  // The single animation loop. The cleanup cancels it, so loops never pile up.
  useEffect(() => {
    if (!animate || !anyRunning) return
    let frameId = 0
    let lastDrawn = 0

    const draw = (timestamp: number) => {
      if (timestamp - lastDrawn >= FRAME_INTERVAL_MS) {
        lastDrawn = timestamp
        setNowMs(service.now())
      }
      frameId = window.requestAnimationFrame(draw)
    }

    frameId = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(frameId)
  }, [animate, anyRunning, service])

  const getClock = useCallback((shuttleId: string) => clocks[shuttleId] ?? createClock(nowMs, 'idle'), [clocks, nowMs])

  const getElapsedSeconds = useCallback((shuttleId: string) => elapsedAt(getClock(shuttleId), nowMs), [getClock, nowMs])

  const getSnapshot = useCallback(
    (shuttleId: string) => {
      const clock = getClock(shuttleId)
      const snapshot = snapshotAt(getTimeline(shuttleId), elapsedAt(clock, nowMs), {
        shuttleId,
        // Seats are filled in from bookings by useLiveShuttle.
        seatsAvailable: getShuttle(shuttleId).capacity,
        halted: clock.runState !== 'running',
      })
      // The timetable counts simulated seconds; at 5x speed they pass five times faster.
      return { ...snapshot, etaSeconds: snapshot.etaSeconds / clock.speed }
    },
    [getClock, nowMs],
  )

  const getUpcomingStops = useCallback(
    (shuttleId: string) => {
      const clock = getClock(shuttleId)
      return upcomingStopEtas(getTimeline(shuttleId), elapsedAt(clock, nowMs)).map((eta) => ({
        ...eta,
        etaSeconds: eta.etaSeconds / clock.speed,
      }))
    },
    [getClock, nowMs],
  )

  const getLoopSeconds = useCallback((shuttleId: string) => getTimeline(shuttleId).cycleSeconds, [])

  const control = useCallback(
    async (shuttleId: string, action: SimAction) => {
      const result = await service.control(user, shuttleId, action)
      setNowMs(service.now())
      return result
    },
    [service, user],
  )

  const value = useMemo<SimulationContextValue>(
    () => ({ status, nowMs, getClock, getSnapshot, getUpcomingStops, getElapsedSeconds, getLoopSeconds, control }),
    [status, nowMs, getClock, getSnapshot, getUpcomingStops, getElapsedSeconds, getLoopSeconds, control],
  )

  return <SimulationContext value={value}>{children}</SimulationContext>
}
