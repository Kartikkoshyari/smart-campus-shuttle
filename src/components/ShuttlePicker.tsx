import type { Shuttle } from '../types/index.ts'
import { directionLabel } from '../utils/format.ts'

interface ShuttlePickerProps {
  shuttles: Shuttle[]
  selectedId: string
  onSelect(id: string): void
}

/** A row of buttons for switching between shuttles. */
export default function ShuttlePicker({ shuttles, selectedId, onSelect }: ShuttlePickerProps) {
  return (
    <div
      role="group"
      aria-label="Choose a shuttle"
      className="inline-flex w-fit rounded-lg border border-line bg-white p-1"
    >
      {shuttles.map((shuttle) => {
        const selected = shuttle.id === selectedId
        return (
          <button
            key={shuttle.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(shuttle.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              selected ? 'bg-ink font-bold text-white' : 'font-medium text-muted hover:text-ink'
            }`}
          >
            {shuttle.code}
            <span className={`ml-1.5 hidden sm:inline ${selected ? 'text-white/70' : ''}`}>
              {directionLabel[shuttle.direction]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
