import { Radio } from 'lucide-react'

/**
 * The label that must appear wherever shuttle movement is shown, so nobody
 * mistakes the simulation for real GPS tracking.
 */
export default function DemoBadge() {
  return (
    <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-signal bg-signal-tint px-3 py-1 text-xs font-bold tracking-wide text-signal-ink">
      <Radio aria-hidden="true" className="size-3.5" />
      DEMO SIMULATION — NOT LIVE GPS
    </span>
  )
}
