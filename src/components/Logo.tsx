import { Bus } from 'lucide-react'

interface LogoProps {
  /** Hides the name and shows only the icon. */
  iconOnly?: boolean
  /** Light text for dark backgrounds. */
  inverted?: boolean
}

export default function Logo({ iconOnly = false, inverted = false }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-signal text-ink">
        <Bus aria-hidden="true" className="size-5" strokeWidth={2.25} />
      </span>
      {iconOnly ? (
        <span className="sr-only">Smart Campus Shuttle</span>
      ) : (
        <span className={`text-base leading-tight font-bold ${inverted ? 'text-white' : 'text-ink'}`}>
          Smart Campus Shuttle
        </span>
      )}
    </span>
  )
}
