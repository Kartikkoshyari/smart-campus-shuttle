import { describe, expect, it } from 'vitest'
import { AuthError, validateSignUp } from '../src/services/authService.ts'
import { createLocalAuthService, DEMO_PASSWORD } from '../src/services/localAuthService.ts'

const newService = () => createLocalAuthService({ delayMs: 0 })

describe('local demo sign-in', () => {
  it('signs in each demo account with the right role', async () => {
    const service = newService()
    expect((await service.signIn('student@shuttle.test', DEMO_PASSWORD)).role).toBe('student')
    expect((await service.signIn('operator@shuttle.test', DEMO_PASSWORD)).role).toBe('operator')
    expect((await service.signIn('admin@shuttle.test', DEMO_PASSWORD)).role).toBe('admin')
  })

  it('ignores letter case and spaces in the email', async () => {
    const user = await newService().signIn('  Student@Shuttle.TEST ', DEMO_PASSWORD)
    expect(user.email).toBe('student@shuttle.test')
  })

  it('rejects a wrong password', async () => {
    await expect(newService().signIn('student@shuttle.test', 'nope-nope')).rejects.toMatchObject({
      code: 'invalid_credentials',
    })
  })

  it('rejects an unknown email with the same message', async () => {
    await expect(newService().signIn('nobody@shuttle.test', DEMO_PASSWORD)).rejects.toThrow(
      'Email or password is incorrect.',
    )
  })

  it('remembers the session and forgets it on sign-out', async () => {
    const service = newService()
    await service.signIn('student@shuttle.test', DEMO_PASSWORD)
    expect((await service.getCurrentUser())?.email).toBe('student@shuttle.test')

    await service.signOut()
    expect(await service.getCurrentUser()).toBeNull()
  })

  it('never stores the password itself', async () => {
    await newService().signIn('student@shuttle.test', DEMO_PASSWORD)
    expect(window.localStorage.getItem('scs.local.users.v1')).not.toContain(DEMO_PASSWORD)
  })
})

describe('local demo registration', () => {
  it('creates every new account as a student', async () => {
    const user = await newService().signUp({ name: 'Kiran Das', email: 'kiran@example.com', password: 'shuttle123' })
    expect(user.role).toBe('student')
    expect(user.assignedShuttleId).toBeNull()
  })

  it('ignores a role smuggled into the request', async () => {
    const sneaky = { name: 'Kiran Das', email: 'kiran@example.com', password: 'shuttle123', role: 'admin' }
    const user = await newService().signUp(sneaky)
    expect(user.role).toBe('student')
  })

  it('refuses a duplicate email', async () => {
    const service = newService()
    await service.signUp({ name: 'Kiran Das', email: 'kiran@example.com', password: 'shuttle123' })
    await expect(
      service.signUp({ name: 'Kiran Again', email: 'KIRAN@example.com', password: 'shuttle123' }),
    ).rejects.toBeInstanceOf(AuthError)
  })

  it('lets the new account sign in later', async () => {
    const service = newService()
    await service.signUp({ name: 'Kiran Das', email: 'kiran@example.com', password: 'shuttle123' })
    await service.signOut()
    expect((await service.signIn('kiran@example.com', 'shuttle123')).name).toBe('Kiran Das')
  })
})

describe('validateSignUp', () => {
  it('accepts valid input', () => {
    expect(
      validateSignUp({
        name: 'Kiran Das',
        email: 'kiran@example.com',
        password: 'shuttle123',
        confirmPassword: 'shuttle123',
      }),
    ).toEqual({})
  })

  it('reports every problem', () => {
    expect(validateSignUp({ name: '', email: 'not-an-email', password: 'short', confirmPassword: 'other' })).toEqual({
      name: 'Enter your full name.',
      email: 'Enter a valid email address.',
      password: 'Use at least 8 characters.',
      confirmPassword: 'The passwords do not match.',
    })
  })
})
