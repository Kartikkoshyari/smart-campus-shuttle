import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from './renderApp.tsx'

// Leaflet needs a real browser, so tests use a stand-in map.
vi.mock('../src/components/CampusMap.tsx', () => ({
  default: () => <div data-testid="campus-map" />,
}))

describe('Landing and navigation', () => {
  it('shows the headline and the demo simulation label', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Know when the shuttle reaches your stop.' })).toBeInTheDocument()
    expect(screen.getAllByText('DEMO SIMULATION — NOT LIVE GPS').length).toBeGreaterThan(0)
  })

  it('shows the 404 page for unknown addresses', () => {
    renderApp('/no-such-page')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('sends signed-out visitors to the sign-in page', async () => {
    renderApp('/app/dashboard')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('Signing in', () => {
  it('signs in with email and password and opens the live board', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText('Email'), 'student@shuttle.test')
    await user.type(screen.getByLabelText('Password'), 'admin123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Live board' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'SH-01 status' })).toBeInTheDocument()
    expect(screen.getByText('Signed in as Asha Rao')).toBeInTheDocument()
  })

  it('returns to the page the visitor first asked for', async () => {
    const user = userEvent.setup()
    renderApp('/app/bookings')
    await user.type(await screen.findByLabelText('Email'), 'student@shuttle.test')
    await user.type(screen.getByLabelText('Password'), 'admin123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument()
  })

  it('shows an error for a wrong password', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText('Email'), 'student@shuttle.test')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument()
  })

  it('sends each role to its own home page', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText('Email'), 'operator@shuttle.test')
    await user.type(screen.getByLabelText('Password'), 'admin123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Operator console' })).toBeInTheDocument()
  })
})

describe('Role protection', () => {
  it('blocks a student from the admin page', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText('Email'), 'student@shuttle.test')
    await user.type(screen.getByLabelText('Password'), 'admin123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('heading', { name: 'Live board' })

    // The admin link is not shown to students.
    expect(screen.queryByRole('link', { name: 'Admin overview' })).not.toBeInTheDocument()
  })

  it('shows a no-access message when a student opens an admin address directly', async () => {
    window.localStorage.setItem('scs.local.session.v1', JSON.stringify('demo-student'))
    renderApp('/app/admin')
    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
  })

  it('lets the admin open the admin overview', async () => {
    window.localStorage.setItem('scs.local.session.v1', JSON.stringify('demo-admin'))
    renderApp('/app/admin')
    expect(await screen.findByRole('heading', { name: 'Admin overview' })).toBeInTheDocument()
  })
})

describe('Registration', () => {
  it('validates the form before creating an account', async () => {
    const user = userEvent.setup()
    renderApp('/register')
    await user.click(await screen.findByRole('button', { name: 'Create account' }))

    expect(screen.getByText('Enter your full name.')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()
  })

  it('creates a student account and opens the live board', async () => {
    const user = userEvent.setup()
    renderApp('/register')
    await user.type(await screen.findByLabelText('Full name'), 'Kiran Das')
    await user.type(screen.getByLabelText('Email'), 'kiran@example.com')
    await user.type(screen.getByLabelText('Password'), 'shuttle123')
    await user.type(screen.getByLabelText('Confirm password'), 'shuttle123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Live board' })).toBeInTheDocument()
    expect(screen.getAllByText('Kiran Das').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Student').length).toBeGreaterThan(0)
  })
})

describe('Signing out', () => {
  it('asks for confirmation, then returns to the landing page', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('scs.local.session.v1', JSON.stringify('demo-student'))
    renderApp('/app/dashboard')
    await screen.findByRole('heading', { name: 'Live board' })

    await user.click(screen.getAllByRole('button', { name: 'Sign out' })[0])
    const dialog = screen.getByRole('alertdialog', { name: 'Sign out?' })

    // Cancelling keeps the person signed in.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Sign out' })[0])
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Know when the shuttle reaches your stop.' })).toBeInTheDocument()
    expect(screen.getByText('Signed out')).toBeInTheDocument()
  })
})

describe('Live board', () => {
  it('switches between shuttles', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('scs.local.session.v1', JSON.stringify('demo-student'))
    renderApp('/app/dashboard')
    await screen.findByRole('heading', { name: 'Live board' })

    expect(screen.getByTestId('campus-map')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /SH-02/ }))
    const board = screen.getByRole('region', { name: 'SH-02 status' })
    // SH-02 starts part-way round, driving from Innovation Hub to Sports Complex.
    expect(within(board).getByText('Moving')).toBeInTheDocument()
    expect(within(board).getByText('Sports Complex')).toBeInTheDocument()
    expect(within(board).getByText('Innovation Hub')).toBeInTheDocument()
  })

  it('lists arrival times for every stop', async () => {
    window.localStorage.setItem('scs.local.session.v1', JSON.stringify('demo-student'))
    renderApp('/app/dashboard')
    await screen.findByRole('heading', { name: 'Live board' })

    const stops = screen.getByRole('region', { name: 'Stops ahead' })
    // SH-01 starts waiting at Main Gate.
    expect(within(stops).getByText('Shuttle here')).toBeInTheDocument()
    expect(within(stops).getAllByRole('listitem')).toHaveLength(8)
  })
})
