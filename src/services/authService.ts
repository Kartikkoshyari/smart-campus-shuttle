import type { DataMode } from '../lib/env.ts'
import type { AppUser } from '../types/index.ts'

/**
 * The contract every sign-in implementation follows. Pages only talk to this
 * interface, so Phase 5 can add a Supabase version without changing the UI.
 */
export interface AuthService {
  mode: DataMode
  getCurrentUser(): Promise<AppUser | null>
  signIn(email: string, password: string): Promise<AppUser>
  /** New accounts are always students. Roles are never chosen in the browser. */
  signUp(input: SignUpInput): Promise<AppUser>
  signOut(): Promise<void>
}

export interface SignUpInput {
  name: string
  email: string
  password: string
}

export type AuthErrorCode =
  | 'missing_fields'
  | 'invalid_credentials'
  | 'email_taken'
  | 'invalid_input'
  /** Supabase: the account was created but the email address must be confirmed first. */
  | 'confirmation_required'
  | 'email_not_confirmed'
  | 'unavailable'

export class AuthError extends Error {
  code: AuthErrorCode

  constructor(message: string, code: AuthErrorCode) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

export const MIN_PASSWORD_LENGTH = 8

export type SignUpField = 'name' | 'email' | 'password' | 'confirmPassword'
export type SignUpErrors = Partial<Record<SignUpField, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Checks registration fields. Returns an empty object when everything is valid. */
export function validateSignUp(input: SignUpInput & { confirmPassword?: string }): SignUpErrors {
  const errors: SignUpErrors = {}
  if (input.name.trim().length < 2) errors.name = 'Enter your full name.'
  if (!EMAIL_PATTERN.test(input.email.trim())) errors.email = 'Enter a valid email address.'
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (input.confirmPassword !== undefined && input.confirmPassword !== input.password) {
    errors.confirmPassword = 'The passwords do not match.'
  }
  return errors
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
