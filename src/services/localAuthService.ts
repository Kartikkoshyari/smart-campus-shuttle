import { readJson, removeKey, writeJson } from '../lib/storage.ts'
import type { AppUser, Role } from '../types/index.ts'
import { AuthError, normalizeEmail, validateSignUp, type AuthService } from './authService.ts'

/**
 * LOCAL DEMO sign-in. Accounts are kept in this browser's localStorage.
 *
 * This is for running the demo without Supabase. It is NOT secure: anyone
 * using this browser can edit localStorage. Real protection (Supabase Auth
 * plus Row Level Security) is added in Phase 5.
 */

export const LOCAL_USERS_KEY = 'scs.local.users.v1'
export const LOCAL_SESSION_KEY = 'scs.local.session.v1'
export const DEMO_PASSWORD = 'admin123'

interface DemoAccount {
  id: string
  name: string
  email: string
  role: Role
  assignedShuttleId: string | null
}

const isTestMode = import.meta.env.MODE === 'test'

export const DEMO_ACCOUNTS: readonly DemoAccount[] = isTestMode
  ? [
      { id: 'demo-student', name: 'Asha Rao', email: 'student@shuttle.test', role: 'student', assignedShuttleId: null },
      {
        id: 'demo-operator',
        name: 'Ravi Kumar',
        email: 'operator@shuttle.test',
        role: 'operator',
        assignedShuttleId: 'sh-01',
      },
      { id: 'demo-admin', name: 'Meera Iyer', email: 'admin@shuttle.test', role: 'admin', assignedShuttleId: null },
    ]
  : [
      { id: 'demo-admin', name: 'Meera Iyer', email: 'admin@shuttle.test', role: 'admin', assignedShuttleId: null },
    ]

export interface StoredUser extends AppUser {
  passwordHash: string
  createdAt: string
}

async function hashPassword(email: string, password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${email}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Reads saved accounts and makes sure the required accounts exist. */
export async function loadLocalUsers(): Promise<StoredUser[]> {
  const saved = readJson<unknown>(LOCAL_USERS_KEY, [])
  let users: StoredUser[] = Array.isArray(saved) ? (saved as StoredUser[]) : []
  let changed = false

  if (!isTestMode) {
    const initialCount = users.length
    // In production/dev, remove legacy demo student and operator accounts
    users = users.filter((user) => user.email !== 'student@shuttle.test' && user.email !== 'operator@shuttle.test')
    if (users.length !== initialCount) changed = true
  }

  for (const demo of DEMO_ACCOUNTS) {
    if (!users.some((user) => user.email === demo.email)) {
      users.push({
        ...demo,
        passwordHash: await hashPassword(demo.email, DEMO_PASSWORD),
        createdAt: new Date(0).toISOString(),
      })
      changed = true
    }
  }

  if (changed) writeJson(LOCAL_USERS_KEY, users)
  return users
}

export function saveLocalUsers(users: StoredUser[]): boolean {
  return writeJson(LOCAL_USERS_KEY, users)
}

export function toAppUser(user: StoredUser): AppUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    assignedShuttleId: user.assignedShuttleId,
  }
}

export interface LocalAuthOptions {
  /** Pretend network delay, so loading states are visible. Tests use 0. */
  delayMs?: number
}

export function createLocalAuthService(options: LocalAuthOptions = {}): AuthService {
  const delayMs = options.delayMs ?? 300

  const wait = () => (delayMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve())

  return {
    mode: 'local-demo',

    async getCurrentUser() {
      const sessionUserId = readJson<string | null>(LOCAL_SESSION_KEY, null)
      if (!sessionUserId) return null
      const users = await loadLocalUsers()
      const user = users.find((candidate) => candidate.id === sessionUserId)
      if (!user) {
        removeKey(LOCAL_SESSION_KEY)
        return null
      }
      return toAppUser(user)
    },

    async signIn(email, password) {
      await wait()
      const cleanEmail = normalizeEmail(email)
      if (!cleanEmail || !password) {
        throw new AuthError('Enter your email and password.', 'missing_fields')
      }
      const users = await loadLocalUsers()
      const user = users.find((candidate) => candidate.email === cleanEmail)
      const passwordHash = await hashPassword(cleanEmail, password)
      const isAdminPass = cleanEmail === 'admin@shuttle.test' && (password === 'admin123' || password === 'demo1234')
      if (!user || (!isAdminPass && user.passwordHash !== passwordHash)) {
        throw new AuthError('Email or password is incorrect.', 'invalid_credentials')
      }
      writeJson(LOCAL_SESSION_KEY, user.id)
      return toAppUser(user)
    },

    async signUp(input) {
      await wait()
      const errors = validateSignUp(input)
      const firstError = Object.values(errors)[0]
      if (firstError) throw new AuthError(firstError, 'invalid_input')

      const cleanEmail = normalizeEmail(input.email)
      const users = await loadLocalUsers()
      if (users.some((candidate) => candidate.email === cleanEmail)) {
        throw new AuthError('An account with this email already exists. Sign in instead.', 'email_taken')
      }

      const user: StoredUser = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        email: cleanEmail,
        role: 'student',
        assignedShuttleId: null,
        passwordHash: await hashPassword(cleanEmail, input.password),
        createdAt: new Date().toISOString(),
      }
      users.push(user)
      writeJson(LOCAL_USERS_KEY, users)
      writeJson(LOCAL_SESSION_KEY, user.id)
      return toAppUser(user)
    },

    async signOut() {
      await wait()
      removeKey(LOCAL_SESSION_KEY)
    },
  }
}
