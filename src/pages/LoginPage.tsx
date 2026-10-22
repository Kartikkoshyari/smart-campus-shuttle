import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth.ts'
import { useToast } from '../hooks/useToast.ts'
import AuthLayout from '../layouts/AuthLayout.tsx'
import { AuthError } from '../services/authService.ts'

/** Reads the page the visitor tried to open before being sent to sign in. */
function getRedirectTarget(state: unknown): string {
  if (state && typeof state === 'object' && 'from' in state) {
    const from = (state as { from: unknown }).from
    if (typeof from === 'string' && from.startsWith('/app')) return from
  }
  return '/app'
}

export default function LoginPage() {
  const { user, status, signIn } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = getRedirectTarget(location.state)

  if (status === 'ready' && user && !submitting) {
    return <Navigate to={redirectTo} replace />
  }

  async function attemptSignIn(emailValue: string, passwordValue: string) {
    setSubmitting(true)
    setError(null)
    try {
      const signedIn = await signIn(emailValue, passwordValue)
      notify({ tone: 'success', title: `Signed in as ${signedIn.name}` })
      navigate(redirectTo, { replace: true })
    } catch (caught) {
      setError(caught instanceof AuthError ? caught.message : 'Sign-in failed. Try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void attemptSignIn(email, password)
  }

  return (
    <AuthLayout title="Sign in" description="Use your campus shuttle account.">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-alert-tint px-3 py-2.5 text-sm font-medium text-alert">
            {error}
          </p>
        ) : null}

        <div>
          <label htmlFor="login-email" className="field-label">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            className="field-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error ? true : undefined}
            required
          />
        </div>

        <div>
          <label htmlFor="login-password" className="field-label">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            className="field-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
            required
          />
        </div>

        <button type="submit" className="btn btn-primary mt-2 w-full py-3" disabled={submitting}>
          {submitting ? <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : null}
          {submitting ? 'Signing in' : 'Sign in'}
        </button>

        <p className="text-center text-sm text-muted">
          New here?{' '}
          <Link to="/register" className="font-semibold text-route hover:underline">
            Create a student account
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
