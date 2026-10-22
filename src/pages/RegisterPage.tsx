import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth.ts'
import { useToast } from '../hooks/useToast.ts'
import AuthLayout from '../layouts/AuthLayout.tsx'
import {
  AuthError,
  MIN_PASSWORD_LENGTH,
  validateSignUp,
  type SignUpErrors,
  type SignUpField,
} from '../services/authService.ts'

interface FieldConfig {
  name: SignUpField
  label: string
  type: string
  autoComplete: string
  hint?: string
}

const fields: FieldConfig[] = [
  { name: 'name', label: 'Full name', type: 'text', autoComplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    autoComplete: 'new-password',
    hint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
  },
  { name: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' },
]

export default function RegisterPage() {
  const { user, status, signUp } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<SignUpField, string>>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<SignUpErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  // Supabase can ask new users to confirm their email before signing in.
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'ready' && user && !submitting) {
    return <Navigate to="/app" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const found = validateSignUp(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    try {
      const created = await signUp({ name: values.name, email: values.email, password: values.password })
      notify({ tone: 'success', title: 'Account created', message: `Welcome, ${created.name}.` })
      navigate('/app/dashboard', { replace: true })
    } catch (caught) {
      if (caught instanceof AuthError && caught.code === 'confirmation_required') {
        setConfirmMessage(caught.message)
        return
      }
      setFormError(caught instanceof AuthError ? caught.message : 'Could not create the account. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (confirmMessage) {
    return (
      <AuthLayout title="Check your email" description="One more step before you can sign in.">
        <p role="status" className="rounded-lg bg-route-tint px-3 py-2.5 text-sm font-medium text-route-dark">
          {confirmMessage}
        </p>
        <Link to="/login" className="btn btn-primary mt-6 w-full py-3">
          Go to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create a student account" description="Book seats and keep track of your bookings.">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError ? (
          <p role="alert" className="rounded-lg bg-alert-tint px-3 py-2.5 text-sm font-medium text-alert">
            {formError}
          </p>
        ) : null}

        {fields.map((field) => {
          const id = `register-${field.name}`
          const error = errors[field.name]
          const describedBy = error ? `${id}-error` : field.hint ? `${id}-hint` : undefined
          return (
            <div key={field.name}>
              <label htmlFor={id} className="field-label">
                {field.label}
              </label>
              <input
                id={id}
                type={field.type}
                autoComplete={field.autoComplete}
                className="field-input"
                value={values[field.name]}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
              />
              {error ? (
                <p id={`${id}-error`} className="field-error">
                  {error}
                </p>
              ) : field.hint ? (
                <p id={`${id}-hint`} className="field-hint">
                  {field.hint}
                </p>
              ) : null}
            </div>
          )
        })}

        <button type="submit" className="btn btn-primary mt-2 w-full py-3" disabled={submitting}>
          {submitting ? <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : null}
          {submitting ? 'Creating account' : 'Create account'}
        </button>

        <p className="text-center text-sm text-muted">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-route hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
