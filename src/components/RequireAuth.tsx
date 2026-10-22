import { ShieldX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth.ts'
import type { Role } from '../types/index.ts'
import { roleLabel } from '../utils/format.ts'
import StateMessage from './StateMessage.tsx'

interface RequireAuthProps {
  /** Roles allowed to see the page. Omit to allow any signed-in user. */
  roles?: Role[]
  children?: ReactNode
}

/**
 * Hides a page from people who are not signed in, or who have the wrong role.
 * This guards the screens only. Phase 5 adds database rules that protect
 * the data itself.
 */
export default function RequireAuth({ roles, children }: RequireAuthProps) {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <StateMessage tone="loading" title="Checking your session" />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && !roles.includes(user.role)) {
    const allowed = roles.map((role) => roleLabel[role].toLowerCase() + 's').join(' and ')
    return (
      <StateMessage
        tone="error"
        icon={ShieldX}
        title="You don't have access to this page"
        action={
          <Link to="/app" className="btn btn-primary">
            Go to your home page
          </Link>
        }
      >
        This page is for {allowed}. You are signed in as a {roleLabel[user.role].toLowerCase()}.
      </StateMessage>
    )
  }

  return children ?? <Outlet />
}
