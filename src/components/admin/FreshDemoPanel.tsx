import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useAdmin } from '../../hooks/useAdmin.ts'
import { useBookings } from '../../hooks/useBookings.ts'
import { useToast } from '../../hooks/useToast.ts'
import { adminErrorMessage } from '../../services/adminService.ts'
import ConfirmDialog from '../ConfirmDialog.tsx'

/** Puts the demo back to a clean start, for example just before presenting. */
export default function FreshDemoPanel() {
  const admin = useAdmin()
  const { refresh } = useBookings()
  const { notify } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function reset() {
    setBusy(true)
    try {
      const { removedBookings } = await admin.resetDemo()
      await refresh()
      notify({
        tone: 'success',
        title: 'Fresh demo started',
        message: `${removedBookings === 1 ? '1 booking' : `${removedBookings} bookings`} removed. Every shuttle restarted at 1x.`,
      })
      setConfirming(false)
    } catch (error) {
      notify({ tone: 'error', title: 'The demo was not reset', message: adminErrorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="fresh-demo-title" className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
      <div className="flex-1">
        <h2 id="fresh-demo-title" className="font-bold">
          Start a fresh demo
        </h2>
        <p className="mt-1 text-sm text-muted">
          Removes every booking and restarts both shuttles from the start of their runs at 1x. Accounts, roles, shuttle
          names and seats stay as they are.
        </p>
      </div>
      <button type="button" className="btn btn-secondary shrink-0" onClick={() => setConfirming(true)}>
        <RotateCcw aria-hidden="true" className="size-4" />
        Start a fresh demo
      </button>
      <ConfirmDialog
        open={confirming}
        title="Start a fresh demo?"
        description="Every booking, for every student, is removed and cannot be brought back. Both shuttles restart from the beginning of their runs."
        confirmLabel="Remove bookings and restart"
        cancelLabel="Keep everything"
        tone="danger"
        busy={busy}
        onConfirm={() => void reset()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  )
}
