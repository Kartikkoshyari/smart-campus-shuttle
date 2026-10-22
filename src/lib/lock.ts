/**
 * Runs one task at a time for a given name.
 *
 * Booking the last seat is a "read, check, write" job. If two bookings ran at
 * the same moment they could both see one free seat. This lock makes them
 * take turns. Browsers that support Web Locks also share the lock across
 * tabs; elsewhere (and in tests) it works within the page.
 */

const queues = new Map<string, Promise<unknown>>()

function inPageLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(name) ?? Promise.resolve()
  const run = previous.then(task, task)
  // Keep the queue going even if this task fails.
  queues.set(
    name,
    run.catch(() => undefined),
  )
  return run
}

export function withLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks && typeof locks.request === 'function') {
    return locks.request(name, task) as Promise<T>
  }
  return inPageLock(name, task)
}
