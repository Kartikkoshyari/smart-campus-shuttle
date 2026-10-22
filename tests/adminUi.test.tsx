import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from './renderApp.tsx'

// Leaflet needs a real browser, so tests use a stand-in map.
vi.mock('../src/components/CampusMap.tsx', () => ({
  default: () => <div data-testid="campus-map" />,
}))

function signInAs(id: 'demo-student' | 'demo-operator' | 'demo-admin') {
  window.localStorage.setItem('scs.local.session.v1', JSON.stringify(id))
}

/** Books Main Gate → the given stop as the demo student, and returns the booking ID. */
async function bookAsStudent(destination = 'Central Library'): Promise<string> {
  const user = userEvent.setup()
  signInAs('demo-student')
  const view = renderApp('/app/book')
  await screen.findByRole('heading', { name: 'Book a seat' })
  await user.selectOptions(screen.getByLabelText('Pickup stop'), 'Main Gate')
  await user.selectOptions(screen.getByLabelText('Destination stop'), destination)
  await user.click(screen.getByRole('button', { name: 'Book seat' }))
  const code = (await screen.findByTestId('booking-code')).textContent ?? ''
  view.unmount()
  return code
}

describe('Admin overview', () => {
  it('shows headline numbers and every shuttle', async () => {
    await bookAsStudent()
    signInAs('demo-admin')
    renderApp('/app/admin')

    const card = await screen.findByRole('article', { name: 'SH-01 overview' })
    expect(await within(card).findByText('1 of 20')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'SH-02 overview' })).toBeInTheDocument()
    expect(screen.getByText('Active bookings').nextElementSibling).toHaveTextContent('1')
    expect(screen.getByText('Booked today').nextElementSibling).toHaveTextContent('1')
  })

  it('opens the operator console for a chosen shuttle', async () => {
    const user = userEvent.setup()
    signInAs('demo-admin')
    renderApp('/app/admin')
    await user.click(await screen.findByRole('link', { name: 'Control SH-02' }))
    expect(await screen.findByRole('heading', { name: 'Operator console' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'SH-02 status' })).toBeInTheDocument()
  })
})

describe('Starting a fresh demo', () => {
  it('asks first, then removes the bookings', async () => {
    await bookAsStudent()
    const user = userEvent.setup()
    signInAs('demo-admin')
    renderApp('/app/admin')
    const card = await screen.findByRole('article', { name: 'SH-01 overview' })
    expect(await within(card).findByText('1 of 20')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start a fresh demo' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Start a fresh demo?' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep everything' }))
    expect(within(card).getByText('1 of 20')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start a fresh demo' }))
    await user.click(screen.getByRole('button', { name: 'Remove bookings and restart' }))
    expect(await screen.findByText('Fresh demo started')).toBeInTheDocument()
    expect(screen.getByText('1 booking removed. Every shuttle restarted at 1x.')).toBeInTheDocument()
    expect(await within(card).findByText('0 of 20')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('Admin bookings', () => {
  it('searches bookings and cancels one after confirmation', async () => {
    const code = await bookAsStudent()
    const user = userEvent.setup()
    signInAs('demo-admin')
    renderApp('/app/admin?tab=bookings')
    expect(await screen.findByText(code)).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search bookings' }), 'NO-SUCH-CODE')
    expect(screen.getByText('No bookings match')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search bookings' }), 'asha')
    expect(screen.getByText(code)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `Cancel booking ${code}` }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel booking' }))
    expect(await screen.findByText(`Booking ${code} cancelled`)).toBeInTheDocument()
    expect(screen.getByRole('row', { name: new RegExp(code) })).toHaveTextContent('Cancelled')
    expect(screen.queryByRole('button', { name: `Cancel booking ${code}` })).not.toBeInTheDocument()
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    const code = await bookAsStudent()
    signInAs('demo-admin')
    renderApp('/app/admin?tab=bookings')
    await screen.findByText(code)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'cancelled')
    expect(screen.queryByText(code)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'active')
    expect(screen.getByText(code)).toBeInTheDocument()
  })
})

describe('Admin users', () => {
  it('makes a student an operator of a shuttle', async () => {
    const user = userEvent.setup()
    signInAs('demo-admin')
    renderApp('/app/admin?tab=users')

    await user.click(await screen.findByRole('button', { name: 'Change role for Asha Rao' }))
    const dialog = screen.getByRole('dialog', { name: 'Change role for Asha Rao' })
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'operator')
    await user.selectOptions(within(dialog).getByLabelText('Shuttle they run'), 'sh-02')
    await user.click(within(dialog).getByRole('button', { name: 'Save role' }))

    expect(await screen.findByText('Asha Rao is now an operator on SH-02')).toBeInTheDocument()
    const row = screen.getByRole('row', { name: /Asha Rao/ })
    expect(row).toHaveTextContent('Operator')
    expect(row).toHaveTextContent('SH-02')
  })

  it('explains that an administrator cannot demote themselves', async () => {
    const user = userEvent.setup()
    signInAs('demo-admin')
    renderApp('/app/admin?tab=users')

    await user.click(await screen.findByRole('button', { name: 'Change role for Meera Iyer' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'student')
    await user.click(within(dialog).getByRole('button', { name: 'Save role' }))
    expect(
      await within(dialog).findByText('You cannot remove your own administrator role.', { selector: '[role=alert]' }),
    ).toBeInTheDocument()
  })
})

describe('Admin shuttles', () => {
  it('renames a shuttle and changes its seats everywhere', async () => {
    const user = userEvent.setup()
    signInAs('demo-admin')
    const view = renderApp('/app/admin?tab=network')

    await user.click(await screen.findByRole('button', { name: 'Edit SH-01' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit SH-01' })
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Library Express')
    await user.clear(within(dialog).getByLabelText('Seats'))
    await user.type(within(dialog).getByLabelText('Seats'), '12')
    await user.click(within(dialog).getByRole('button', { name: 'Save shuttle' }))

    expect(await screen.findByText('SH-01 updated')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Library Express/ })).toHaveTextContent('12')
    view.unmount()

    signInAs('demo-student')
    renderApp('/app/dashboard')
    const board = await screen.findByRole('region', { name: 'SH-01 status' })
    expect(within(board).getByText('Library Express')).toBeInTheDocument()
    expect(await within(board).findByText('12 of 12')).toBeInTheDocument()
  })

  it('refuses fewer seats than are already booked', async () => {
    await bookAsStudent()
    const user = userEvent.setup()
    signInAs('demo-admin')
    renderApp('/app/admin?tab=network')

    await user.click(await screen.findByRole('button', { name: 'Edit SH-01' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/1 seat is booked right now/)).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('Seats'))
    await user.type(within(dialog).getByLabelText('Seats'), '0')
    await user.click(within(dialog).getByRole('button', { name: 'Save shuttle' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Seats must be a whole number from 1 to 100.')
  })
})

describe('Operator passenger list', () => {
  it('shows the operator who is boarding where', async () => {
    const code = await bookAsStudent("Boys' Hostel")
    signInAs('demo-operator')
    renderApp('/app/operator')

    const manifest = await screen.findByRole('region', { name: 'Passengers on SH-01' })
    expect(await within(manifest).findByText(code)).toBeInTheDocument()
    expect(within(manifest).getByText('Asha Rao')).toBeInTheDocument()
    expect(within(manifest).getByText('1 boarding')).toBeInTheDocument()
    expect(within(manifest).getByText('1 getting off')).toBeInTheDocument()
    expect(within(manifest).getByText('Waiting at Main Gate')).toBeInTheDocument()
  })

  it('shows an empty state before any booking', async () => {
    signInAs('demo-operator')
    renderApp('/app/operator')
    expect(await screen.findByText('No passengers booked on this run')).toBeInTheDocument()
  })
})
