import { useSearchParams } from 'react-router'
import AdminBookings from '../components/admin/AdminBookings.tsx'
import AdminNetwork from '../components/admin/AdminNetwork.tsx'
import AdminOverview from '../components/admin/AdminOverview.tsx'
import AdminUsers from '../components/admin/AdminUsers.tsx'
import DemoBadge from '../components/DemoBadge.tsx'
import PageHeader from '../components/PageHeader.tsx'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'users', label: 'Users' },
  { id: 'network', label: 'Shuttles and stops' },
] as const

type TabId = (typeof tabs)[number]['id']

function isTab(value: string | null): value is TabId {
  return tabs.some((tab) => tab.id === value)
}

/** The administrator dashboard. The open tab is kept in the address, e.g. /app/admin?tab=bookings. */
export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab: TabId = isTab(requested) ? requested : 'overview'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admin overview"
        description="Shuttles, bookings and accounts across the campus network."
        actions={<DemoBadge />}
      />

      <div
        role="tablist"
        aria-label="Admin sections"
        className="flex w-full gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`admin-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="admin-panel"
            onClick={() => setSearchParams(item.id === 'overview' ? {} : { tab: item.id })}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
              tab === item.id
                ? 'border-route font-bold text-route-dark'
                : 'border-transparent font-medium text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id="admin-panel" role="tabpanel" aria-labelledby={`admin-tab-${tab}`}>
        {tab === 'overview' ? <AdminOverview /> : null}
        {tab === 'bookings' ? <AdminBookings /> : null}
        {tab === 'users' ? <AdminUsers /> : null}
        {tab === 'network' ? <AdminNetwork /> : null}
      </div>
    </div>
  )
}
