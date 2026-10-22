import type { ReactNode } from 'react'

interface DataTableProps {
  title: string
  /** Optional text or controls on the right of the title. */
  aside?: ReactNode
  headings: string[]
  children: ReactNode
}

/** A titled table that scrolls sideways on small screens instead of squashing. */
export function DataTable({ title, aside, headings, children }: DataTableProps) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-bold">{title}</h2>
        {aside}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-paper text-muted">
            <tr>
              {headings.map((heading) => (
                <th key={heading} scope="col" className="px-5 py-2.5 font-semibold whitespace-nowrap">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{children}</tbody>
        </table>
      </div>
    </section>
  )
}

export function Cell({ children, strong, numeric }: { children: ReactNode; strong?: boolean; numeric?: boolean }) {
  return (
    <td className={`px-5 py-3 whitespace-nowrap ${strong ? 'font-semibold' : ''} ${numeric ? 'tabular' : ''}`}>
      {children}
    </td>
  )
}
