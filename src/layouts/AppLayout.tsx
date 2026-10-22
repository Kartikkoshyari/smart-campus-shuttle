import { Gauge, ListChecks, LogOut, MapPinned, Menu, ShieldCheck, Ticket, X, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import ConnectionNotice from '../components/ConnectionNotice.tsx'
import DataModeNotice from '../components/DataModeNotice.tsx'
import Logo from '../components/Logo.tsx'
import { useAuth } from '../hooks/useAuth.ts'
import { useToast } from '../hooks/useToast.ts'
import type { AppUser, Role } from '../types/index.ts'
import { initials, roleLabel } from '../utils/format.ts'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
}

const navItems: NavItem[] = [
  { to: '/app/dashboard', label: 'Live board', icon: MapPinned, roles: ['student', 'operator', 'admin'] },
  { to: '/app/book', label: 'Book a seat', icon: Ticket, roles: ['student'] },
  { to: '/app/bookings', label: 'My bookings', icon: ListChecks, roles: ['student'] },
  { to: '/app/operator', label: 'Operator console', icon: Gauge, roles: ['operator', 'admin'] },
  { to: '/app/admin', label: 'Admin overview', icon: ShieldCheck, roles: ['admin'] },
]

/** The signed-in app shell: sidebar on laptops, a slide-out menu on phones. */
export default function AppLayout() {
  const { user, signOut } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  // Close the phone menu with the Escape key.
  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const cancelSignOut = useCallback(() => setConfirmingSignOut(false), [])

  async function confirmSignOut() {
    setSigningOut(true)
    // Leave the app pages first. Otherwise the page guard would notice the
    // signed-out state and send the visitor to the sign-in page instead.
    navigate('/', { replace: true })
    try {
      await signOut()
      notify({ tone: 'success', title: 'Signed out' })
    } catch {
      notify({ tone: 'error', title: 'Could not sign out', message: 'Try again in a moment.' })
    }
  }

  if (!user) return null

  const sidebar = (
    <SidebarContent
      user={user}
      onNavigate={() => setMenuOpen(false)}
      onSignOut={() => {
        setMenuOpen(false)
        setConfirmingSignOut(true)
      }}
    />
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Laptop sidebar */}
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-white lg:block">{sidebar}</aside>

      {/* Phone and tablet top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
        <Logo />
        <button
          type="button"
          className="btn btn-ghost -mr-2 px-2.5"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            id="mobile-menu"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl motion-safe:animate-drawer-in"
          >
            <button
              type="button"
              className="btn btn-ghost absolute top-3 right-3 px-2.5"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <ConnectionNotice />
          <Outlet />
        </div>
      </main>

      <ConfirmDialog
        open={confirmingSignOut}
        title="Sign out?"
        description="You will need to sign in again to book or manage seats."
        confirmLabel="Sign out"
        busy={signingOut}
        onConfirm={confirmSignOut}
        onCancel={cancelSignOut}
      />
    </div>
  )
}

function SidebarContent({ user, onNavigate, onSignOut }: { user: AppUser; onNavigate(): void; onSignOut(): void }) {
  const items = navItems.filter((item) => item.roles.includes(user.role))

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <Logo />
      </div>

      <nav aria-label="Main">
        <ul className="flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-route-tint font-bold text-route-dark'
                      : 'font-medium text-muted hover:bg-paper hover:text-ink'
                  }`
                }
              >
                <Icon aria-hidden="true" className="size-[18px]" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-4">
        <div className="px-2">
          <DataModeNotice compact />
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-line p-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-route text-sm font-bold text-white"
          >
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="text-xs text-muted">{roleLabel[user.role]}</p>
          </div>
          <button type="button" className="btn btn-ghost px-2" onClick={onSignOut} aria-label="Sign out">
            <LogOut aria-hidden="true" className="size-[18px]" />
          </button>
        </div>
      </div>
    </div>
  )
}
