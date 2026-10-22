import { Bus, QrCode, Ticket } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import type { Booking, BookingPhase } from '../types/index.ts'
import Modal from './Modal.tsx'

interface BoardingPassModalProps {
  open: boolean
  booking: Booking
  phase: BookingPhase
  pickup: string
  destination: string
  shuttleCode: string
  shuttleName: string
  onClose(): void
}

export default function BoardingPassModal({
  open,
  booking,
  phase,
  pickup,
  destination,
  shuttleCode,
  shuttleName,
  onClose,
}: BoardingPassModalProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const passData = JSON.stringify({
      code: booking.code,
      shuttle: shuttleCode,
      passenger: booking.passengerName,
      pickup,
      destination,
      status: phase,
    })

    QRCode.toDataURL(passData, {
      margin: 1,
      width: 220,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setQrUrl)
      .catch((err) => console.error('Failed to generate QR code', err))
  }, [open, booking.code, booking.passengerName, shuttleCode, pickup, destination, phase])

  return (
    <Modal open={open} title="Digital Boarding Pass" onClose={onClose}>
      <div className="flex flex-col items-center gap-5 text-center">
        {/* Pass card layout */}
        <div className="w-full rounded-2xl border-2 border-dashed border-line bg-surface-alt p-5 shadow-inner">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-2 text-left">
              <span className="grid size-8 place-items-center rounded-lg bg-signal text-ink">
                <Bus aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-muted">SHUTTLE</p>
                <p className="text-sm font-bold text-ink">{shuttleCode} · {shuttleName}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-signal-tint px-2.5 py-0.5 text-xs font-bold text-signal-ink">
              <Ticket aria-hidden="true" className="size-3" />
              {booking.code}
            </span>
          </div>

          {/* Journey Path */}
          <div className="my-4 flex items-center justify-around gap-2 text-left">
            <div>
              <p className="text-xs text-muted">BOARDING</p>
              <p className="text-sm font-bold text-ink">{pickup}</p>
            </div>
            <div className="text-muted">➔</div>
            <div>
              <p className="text-xs text-muted">DESTINATION</p>
              <p className="text-sm font-bold text-ink">{destination}</p>
            </div>
          </div>

          {/* QR Code Container */}
          <div className="my-2 flex flex-col items-center justify-center rounded-xl bg-white p-4 shadow-sm">
            {qrUrl ? (
              <img
                src={qrUrl}
                alt={`Boarding pass QR code for booking ${booking.code}`}
                className="size-48 rounded-lg"
              />
            ) : (
              <div className="flex size-48 items-center justify-center text-muted">
                <QrCode className="size-10 animate-pulse text-muted" />
              </div>
            )}
            <p className="tabular mt-2 text-base font-extrabold tracking-wider text-ink">
              {booking.code}
            </p>
            <p className="text-xs text-muted">PASSENGER: {booking.passengerName}</p>
          </div>

          <p className="mt-2 text-xs text-muted">
            Present this QR code to the shuttle operator upon boarding.
          </p>
        </div>

        <button type="button" className="btn btn-secondary w-full py-2.5" onClick={onClose}>
          Close pass
        </button>
      </div>
    </Modal>
  )
}
