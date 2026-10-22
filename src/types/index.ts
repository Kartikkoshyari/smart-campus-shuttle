/**
 * Shared TypeScript types. Every part of the app (UI, simulator, services)
 * uses these, so they describe the data in one place.
 */

export type Role = 'student' | 'operator' | 'admin'

export interface AppUser {
  id: string
  name: string
  email: string
  role: Role
  /** Only operators have an assigned shuttle. */
  assignedShuttleId: string | null
}

export interface LatLng {
  lat: number
  lng: number
}

export interface Stop {
  id: string
  name: string
  /** Two-letter code shown on small labels. */
  code: string
  position: LatLng
}

export type Direction = 'clockwise' | 'anticlockwise'

export interface Route {
  id: string
  name: string
  /** Stops in clockwise order. */
  stopIds: string[]
  /** True when the last stop connects back to the first. */
  isLoop: boolean
  /** True when shuttles may also run this route anticlockwise. */
  allowsReverse: boolean
}

export interface Shuttle {
  id: string
  code: string
  name: string
  routeId: string
  direction: Direction
  capacity: number
}

export type ShuttleStatus = 'moving' | 'at_stop' | 'paused'

/** Everything the screen needs to know about a shuttle at one moment. */
export interface ShuttleSnapshot {
  shuttleId: string
  status: ShuttleStatus
  position: LatLng
  /** The stop the shuttle most recently left or is standing at. */
  lastStopId: string
  /** The stop the shuttle will reach next. */
  nextStopId: string
  /** Set while the shuttle is standing at a stop, otherwise null. */
  atStopId: string | null
  /** Seconds until the shuttle reaches nextStopId. */
  etaSeconds: number
  seatsAvailable: number
}

/** How a simulated shuttle behaves on its route. */
export interface SimulationProfile {
  /** Travel speed between stops, in metres per second. */
  speedMps: number
  /** How long the shuttle waits at each stop, in seconds. */
  dwellSeconds: number
  /** Where on the loop the shuttle starts, in seconds of route time. */
  startOffsetSeconds: number
}

export type SimSpeed = 1 | 2 | 5

/** idle = reset and waiting to start, running = moving along the route, paused = stopped by an operator. */
export type SimRunState = 'idle' | 'running' | 'paused'

/**
 * The simulation clock for one shuttle. Position is worked out from these
 * numbers and the current time, so every open tab shows the same place.
 */
export interface SimClock {
  runState: SimRunState
  speed: SimSpeed
  /** Simulated seconds already travelled when baseTimeMs was recorded. */
  baseElapsed: number
  /** Real time (milliseconds since 1970) when the clock was last changed. */
  baseTimeMs: number
  /** Goes up by one on every reset. Bookings made before a reset end with it. */
  generation: number
}

export type ClockMap = Record<string, SimClock>

/** A shuttle drawn on the map or route diagram. */
export interface MapMarker {
  id: string
  code: string
  position: LatLng
  /** The selected shuttle is drawn larger and in yellow. */
  selected: boolean
}

/** When the shuttle will reach a stop. */
export interface StopEta {
  stopId: string
  etaSeconds: number
}

/** Stored booking status. Whether a confirmed booking is still upcoming is worked out from the simulation. */
export type BookingStatus = 'confirmed' | 'cancelled'

/**
 * What a booking means right now:
 * upcoming = seat held, shuttle not yet at the pickup (can be cancelled);
 * on_board = shuttle has left the pickup with the student;
 * completed = shuttle reached the destination;
 * cancelled = cancelled by the student or an administrator;
 * expired = the simulation was reset before the journey finished.
 */
export type BookingPhase = 'upcoming' | 'on_board' | 'completed' | 'cancelled' | 'expired'

export interface Booking {
  id: string
  /** The booking ID shown to people, e.g. SCS-7K4P2Q. */
  code: string
  userId: string
  passengerName: string
  shuttleId: string
  routeId: string
  direction: Direction
  pickupStopId: string
  destinationStopId: string
  status: BookingStatus
  /** The simulation generation (see SimClock) this booking belongs to. */
  generation: number
  /** Simulated seconds (since the last reset) when the shuttle reaches the pickup. */
  pickupArrivalElapsed: number
  /** Simulated seconds when the shuttle leaves the pickup. */
  pickupDepartureElapsed: number
  /** Simulated seconds when the shuttle reaches the destination. */
  dropoffElapsed: number
  createdAt: string
  cancelledAt: string | null
}

/** The part of a booking needed to count seats. It contains no personal details. */
export interface SeatHold {
  bookingId: string
  shuttleId: string
  generation: number
  pickupDepartureElapsed: number
  dropoffElapsed: number
  pickupStopId: string
  destinationStopId: string
}

export interface BookingRequest {
  shuttleId: string
  pickupStopId: string
  destinationStopId: string
}
