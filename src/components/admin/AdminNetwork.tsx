import { useCallback, useState, type FormEvent } from 'react'
import { DEMO_COORDINATES_NOTE, getRoute, getStop, routes } from '../../data/campus.ts'
import { useAdmin } from '../../hooks/useAdmin.ts'
import { useBookings } from '../../hooks/useBookings.ts'
import { useFleet } from '../../hooks/useFleet.ts'
import { useToast } from '../../hooks/useToast.ts'
import { adminErrorMessage, validateShuttleSettings } from '../../services/adminService.ts'
import type { Shuttle } from '../../types/index.ts'
import { directionLabel, seatsAre } from '../../utils/format.ts'
import Modal from '../Modal.tsx'
import { Cell, DataTable } from './DataTable.tsx'

/** Shuttle settings (editable) plus the route and stops (read-only). */
export default function AdminNetwork() {
  const admin = useAdmin()
  const { shuttles, refresh } = useFleet()
  const { getSeatsAvailable, refresh: refreshBookings } = useBookings()
  const { notify } = useToast()
  const [editing, setEditing] = useState<Shuttle | null>(null)
  const loop = routes[0]

  const close = useCallback(() => setEditing(null), [])

  async function save(changes: { name: string; capacity: number }) {
    if (!editing) return
    const saved = await admin.updateShuttle(editing.id, changes)
    await Promise.all([refresh(), refreshBookings()])
    notify({ tone: 'success', title: `${editing.code} updated`, message: `${saved.name}, ${saved.capacity} seats.` })
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <DataTable title="Shuttles" headings={['Code', 'Name', 'Route', 'Direction', 'Seats', 'Booked now', '']}>
        {shuttles.map((shuttle) => (
          <tr key={shuttle.id}>
            <Cell strong>{shuttle.code}</Cell>
            <Cell>{shuttle.name}</Cell>
            <Cell>{getRoute(shuttle.routeId).name}</Cell>
            <Cell>{directionLabel[shuttle.direction]}</Cell>
            <Cell numeric>{shuttle.capacity}</Cell>
            <Cell numeric>{shuttle.capacity - getSeatsAvailable(shuttle.id)}</Cell>
            <Cell>
              <button
                type="button"
                className="btn btn-ghost px-2 py-1"
                onClick={() => setEditing(shuttle)}
                aria-label={`Edit ${shuttle.code}`}
              >
                Edit
              </button>
            </Cell>
          </tr>
        ))}
      </DataTable>

      <DataTable
        title={`Stops on the ${loop.name}`}
        aside={<p className="text-xs text-muted">{DEMO_COORDINATES_NOTE}</p>}
        headings={['Order', 'Stop', 'Code', 'Latitude', 'Longitude']}
      >
        {loop.stopIds.map((id, index) => {
          const stop = getStop(id)
          return (
            <tr key={id}>
              <Cell numeric>{index + 1}</Cell>
              <Cell strong>{stop.name}</Cell>
              <Cell>{stop.code}</Cell>
              <Cell numeric>{stop.position.lat.toFixed(4)}</Cell>
              <Cell numeric>{stop.position.lng.toFixed(4)}</Cell>
            </tr>
          )
        })}
      </DataTable>

      <DataTable title="Routes" headings={['Route', 'Stops', 'Shape', 'Directions']}>
        {routes.map((route) => (
          <tr key={route.id}>
            <Cell strong>{route.name}</Cell>
            <Cell numeric>{route.stopIds.length}</Cell>
            <Cell>{route.isLoop ? 'Loop, returns to first stop' : 'Out and back'}</Cell>
            <Cell>{route.allowsReverse ? 'Clockwise and anticlockwise' : 'Clockwise only'}</Cell>
          </tr>
        ))}
      </DataTable>

      <p className="text-sm text-muted">
        Stops, routes and timings are set in <code className="font-semibold">src/data/campus.ts</code>, because every
        timetable is calculated from them. After changing that file, run{' '}
        <code className="font-semibold">npm run db:seed</code> and load{' '}
        <code className="font-semibold">supabase/seed.sql</code> again.
      </p>

      <Modal
        open={editing !== null}
        title={editing ? `Edit ${editing.code}` : 'Edit shuttle'}
        description="Change the name passengers see, or how many seats can be booked."
        onClose={close}
      >
        {editing ? (
          <ShuttleForm
            key={editing.id}
            shuttle={editing}
            seatsBooked={editing.capacity - getSeatsAvailable(editing.id)}
            onSave={save}
            onCancel={close}
          />
        ) : null}
      </Modal>
    </div>
  )
}

function ShuttleForm({
  shuttle,
  seatsBooked,
  onSave,
  onCancel,
}: {
  shuttle: Shuttle
  seatsBooked: number
  onSave(changes: { name: string; capacity: number }): Promise<void>
  onCancel(): void
}) {
  const [name, setName] = useState(shuttle.name)
  const [capacity, setCapacity] = useState(String(shuttle.capacity))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const changes = { name, capacity: Number(capacity) }
    const problem =
      validateShuttleSettings(changes) ??
      (changes.capacity < seatsBooked
        ? `${seatsAre(seatsBooked)} already booked, so keep at least ${seatsBooked}.`
        : null)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(changes)
    } catch (caught) {
      setError(adminErrorMessage(caught))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <p role="alert" className="rounded-lg bg-alert-tint px-3 py-2.5 text-sm font-medium text-alert">
          {error}
        </p>
      ) : null}
      <div>
        <label htmlFor="shuttle-name" className="field-label">
          Name
        </label>
        <input
          id="shuttle-name"
          className="field-input"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="shuttle-capacity" className="field-label">
          Seats
        </label>
        <input
          id="shuttle-capacity"
          type="number"
          inputMode="numeric"
          min={Math.max(1, seatsBooked)}
          max={100}
          className="field-input"
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          aria-describedby="shuttle-capacity-hint"
        />
        <p id="shuttle-capacity-hint" className="field-hint">
          {seatsBooked > 0
            ? `${seatsAre(seatsBooked)} booked right now, so this cannot go lower than ${seatsBooked}.`
            : 'From 1 to 100 seats.'}
        </p>
      </div>
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving' : 'Save shuttle'}
        </button>
      </div>
    </form>
  )
}
