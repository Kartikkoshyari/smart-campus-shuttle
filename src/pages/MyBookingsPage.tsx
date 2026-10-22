import { History, Ticket } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import BookingCard from '../components/BookingCard.tsx'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import PageHeader from '../components/PageHeader.tsx'
import StateMessage from '../components/StateMessage.tsx'
import { getShuttle, getStop } from '../data/campus.ts'
import { useBookings } from '../hooks/useBookings.ts'
import { useToast } from '../hooks/useToast.ts'
import { bookingErrorMessage } from '../services/bookingService.ts'
import type { Booking } from '../types/index.ts'

type Tab = 'current' | 'history'

export default function MyBookingsPage() {
  const { myBookings, status, error, refresh, cancel, getPhase } = useBookings()
  const { notify } = useToast()
  const [tab, setTab] = useState<Tab>('current')
  const [toCancel, setToCancel] = useState<Booking | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const withPhase = myBookings.map((booking) => ({ booking, phase: getPhase(booking) }))
  const current = withPhase.filter(({ phase }) => phase === 'upcoming' || phase === 'on_board')
  const history = withPhase.filter(({ phase }) => phase !== 'upcoming' && phase !== 'on_board')
  const shown = tab === 'current' ? current : history

  const closeDialog = useCallback(() => setToCancel(null), [])

  async function confirmCancel() {
    if (!toCancel) return
    setCancelling(true)
    try {
      const cancelled = await cancel(toCancel.id)
      notify({ tone: 'success', title: `Booking ${cancelled.code} cancelled`, message: 'Your seat has been released.' })
    } catch (caught) {
      notify({ tone: 'error', title: 'Booking not cancelled', message: bookingErrorMessage(caught) })
    } finally {
      setCancelling(false)
      setToCancel(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My bookings"
        description="Your current journeys and booking history."
        actions={
          <Link to="/app/book" className="btn btn-primary">
            <Ticket aria-hidden="true" className="size-4" />
            Book a seat
          </Link>
        }
      />

      <div
        role="tablist"
        aria-label="Bookings"
        className="inline-flex w-fit rounded-lg border border-line bg-white p-1"
      >
        {(
          [
            ['current', `Current (${current.length})`],
            ['history', `History (${history.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === id ? 'bg-ink font-bold text-white' : 'font-medium text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {status === 'loading' && myBookings.length === 0 ? (
        <div className="panel">
          <StateMessage tone="loading" title="Loading your bookings" />
        </div>
      ) : status === 'error' ? (
        <div className="panel">
          <StateMessage
            tone="error"
            title="Bookings could not be loaded"
            action={
              <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
                Try again
              </button>
            }
          >
            {error}
          </StateMessage>
        </div>
      ) : shown.length === 0 ? (
        <div className="panel">
          {tab === 'current' ? (
            <StateMessage
              tone="empty"
              icon={Ticket}
              title="No current bookings"
              action={
                <Link to="/app/book" className="btn btn-primary">
                  Book a seat
                </Link>
              }
            >
              When you book a seat, it appears here with its booking ID. You can cancel it from this page.
            </StateMessage>
          ) : (
            <StateMessage tone="empty" icon={History} title="No past bookings yet">
              Completed and cancelled bookings appear here.
            </StateMessage>
          )}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {shown.map(({ booking, phase }) => (
            <BookingCard key={booking.id} booking={booking} phase={phase} onCancel={setToCancel} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={toCancel !== null}
        title={toCancel ? `Cancel booking ${toCancel.code}?` : 'Cancel booking?'}
        description={
          toCancel
            ? `Your seat on ${getShuttle(toCancel.shuttleId).code} from ${getStop(toCancel.pickupStopId).name} to ${getStop(toCancel.destinationStopId).name} will be released. This cannot be undone.`
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
