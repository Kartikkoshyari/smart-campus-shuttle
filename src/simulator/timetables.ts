import { getRoute, shuttles, simulationProfiles } from '../data/campus.ts'
import { buildRoutePath } from './routePath.ts'
import { buildTimeline, type Timeline } from './timeline.ts'

/**
 * The timetable for each demo shuttle, built once from the data in
 * src/data/campus.ts and shared by the simulator and the booking rules.
 */
let cache: Map<string, Timeline> | null = null

function buildAll(): Map<string, Timeline> {
  const timelines = new Map<string, Timeline>()
  for (const shuttle of shuttles) {
    const profile = simulationProfiles[shuttle.id]
    if (!profile) throw new Error(`No simulation profile for ${shuttle.id}`)
    timelines.set(shuttle.id, buildTimeline(buildRoutePath(getRoute(shuttle.routeId), shuttle.direction), profile))
  }
  return timelines
}

export function getTimeline(shuttleId: string): Timeline {
  cache ??= buildAll()
  const timeline = cache.get(shuttleId)
  if (!timeline) throw new Error(`Unknown shuttle: ${shuttleId}`)
  return timeline
}

export function hasTimeline(shuttleId: string): boolean {
  cache ??= buildAll()
  return cache.has(shuttleId)
}
