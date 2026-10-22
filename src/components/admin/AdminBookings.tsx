import { ArrowRight, ClipboardList, Search } from 'lucide-react'
import { useCallback, useState } from 'react'
import { canCancel } from '../../booking/bookingState.ts'
import { getStop } from '../../data/campus.ts'
import { useBookings } from '../../hooks/useBookings.ts'
import { useFleet } from '../../hooks/useFleet.ts'
import { useToast } from '../../hooks/useToast.ts'
import { bookingErrorMessage } from '../../services/bookingService.ts'
import type { Booking, BookingPhase } from '../../types/index.ts'
import { formatBookedAt } from '../../utils/format.ts'
import BookingStatusPill from '../BookingStatusPill.tsx'
import ConfirmDialog from '../ConfirmDialog.tsx'
import StateMessage from '../StateMessage.tsx'
import { Cell, DataTable } from './DataTable.tsx'

type StatusFilter = 'all' | 'active' | BookingPhase

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active (confirmed or on board)' },
  { value: 'upcoming', label: 'Confirmed' },
  { value: 'on_board', label: 'On board' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Run ended' },
]

/** Every booking, with search, filters and cancellation. */
export default function AdminBookings() {
  const { allBookings, getPhase, cancel, status } = useBookings()
  const { shuttles, getShuttle } = useFleet()
  const { notify } = useToast()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [shuttleFilter, setShuttleFilter] = useState('all')
  const [toCancel, setToCancel] = useState<Booking | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const query = search.trim().toLowerCase()
  const rows = allBookings
    .map((booking) => ({ booking, phase: getPhase(booking) }))
    .filter(({ booking, phase }) => {
      if (shuttleFilter !== 'all' && booking.shuttleId !== shuttleFilter) return false
      if (statusFilter === 'active' && phase !== 'upcoming' && phase !== 'on_board') return false
      if (statusFilter !== 'all' && statusFilter !== 'active' && phase !== statusFilter) return false
      if (
        query &&
        !booking.code.toLowerCase().includes(query) &&
        !booking.passengerName.toLowerCase().includes(query)
      ) {
        return false
      }
      return true
    })

  const closeDialog = useCallback(() => setToCancel(null), [])

  async function confirmCancel() {
    if (!toCancel) return
    setCancelling(true)
    try {
      const cancelled = await cancel(toCancel.id)
      notify({ tone: 'success', title: `Booking ${cancelled.code} cancelled`, message: 'The seat has been released.' })
    } catch (caught) {
      notify({ tone: 'error', title: 'Booking not cancelled', message: bookingErrorMessage(caught) })
    } finally {
      setCancelling(false)
      setToCancel(null)
    }
  }

  const filters = (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label className="relative block">
        <span className="sr-only">Search bookings</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          className="field-input mt-0 pl-9"
          placeholder="Booking ID or passenger"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">Status</span>
        <select
          className="field-input mt-0"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Shuttle</span>
        <select
          className="field-input mt-0"
          value={shuttleFilter}
          onChange={(event) => setShuttleFilter(event.target.value)}
        >
          <option value="all">All shuttles</option>
          {shuttles.map((shuttle) => (
            <option key={shuttle.id} value={shuttle.id}>
              {shuttle.code}
            </option>
          ))}
        </select>
      </label>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {filters}

      {rows.length === 0 ? (
        <div className="panel">
          {status === 'loading' ? (
            <StateMessage tone="loading" title="Loading bookings" />
          ) : allBookings.length === 0 ? (
            <StateMessage tone="empty" icon={ClipboardList} title="No bookings yet">
              Bookings from every student appear here as soon as they are made.
            </StateMessage>
          ) : (
            <StateMessage
              tone="empty"
              icon={Search}
              title="No bookings match"
              action={
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearch('')
                    setStatusFilter('all')
                    setShuttleFilter('all')
                  }}
                >
                  Clear filters
                </button>
              }
            >
              Try a different booking ID, name or status.
            </StateMessage>
          )}
        </div>
      ) : (
        <DataTable
          title={`Bookings (${rows.length} of ${allBookings.length})`}
          headings={['Booking ID', 'Passenger', 'Shuttle', 'Journey', 'Status', 'Booked', '']}
        >
          {rows.map(({ booking, phase }) => (
            <tr key={booking.id}>
              <Cell strong>{booking.code}</Cell>
              <Cell>{booking.passengerName}</Cell>
              <Cell>{getShuttle(booking.shuttleId).code}</Cell>
              <Cell>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  {getStop(booking.pickupStopId).name}
                  <ArrowRight aria-label="to" className="size-3.5 text-muted" />
                  {getStop(booking.destinationStopId).name}
                </span>
              </Cell>
              <Cell>
                <BookingStatusPill phase={phase} />
              </Cell>
              <Cell>
                <span className="whitespace-nowrap">{formatBookedAt(booking.createdAt)}</span>
              </Cell>
              <Cell>
                {canCancel(phase) ? (
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1 text-alert"
                    onClick={() => setToCancel(booking)}
                    aria-label={`Cancel booking ${booking.code}`}
                  >
                    Cancel
                  </button>
                ) : null}
              </Cell>
            </tr>
          ))}
        </DataTable>
      )}

      <ConfirmDialog
        open={toCancel !== null}
        title={toCancel ? `Cancel booking ${toCancel.code}?` : 'Cancel booking?'}
        description={
          toCancel
            ? `${toCancel.passengerName}'s seat from ${getStop(toCancel.pickupStopId).name} to ${getStop(toCancel.destinationStopId).name} will be released. They will see the booking as cancelled.`
            : ''
        }
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        tone="danger"
        busy={cancelling}
        onConfirm={confirmCancel}
        onCancel={closeDialog}
      />
    </div>
  )
}
