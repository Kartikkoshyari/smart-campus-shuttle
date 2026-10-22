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

async function chooseJourney(user: ReturnType<typeof userEvent.setup>, pickup: string, destination: string) {
  await user.selectOptions(screen.getByLabelText('Pickup stop'), pickup)
  await user.selectOptions(screen.getByLabelText('Destination stop'), destination)
}

describe('Booking a seat', () => {
  it('books a journey and shows the booking ID', async () => {
    const user = userEvent.setup()
    signInAs('demo-student')
    renderApp('/app/book')
    await screen.findByRole('heading', { name: 'Book a seat' })

    const bookButton = screen.getByRole('button', { name: 'Book seat' })
    expect(bookButton).toBeDisabled()

    await chooseJourney(user, 'Main Gate', 'Central Library')
    expect(screen.getByText('This journey works on SH-01.')).toBeInTheDocument()
    expect(screen.getByText('Passes Academic Block.')).toBeInTheDocument()

    await user.click(bookButton)
    const code = await screen.findByTestId('booking-code')
    expect(code.textContent).toMatch(/^SCS-[A-Z2-9]{6}$/)
    expect(screen.getByText('Seat booked', { selector: 'p' })).toBeInTheDocument()
  })

  it('explains an impossible journey and keeps the button disabled', async () => {
    const user = userEvent.setup()
    signInAs('demo-student')
    renderApp('/app/book')
    await screen.findByRole('heading', { name: 'Book a seat' })

    await chooseJourney(user, 'Central Library', 'Academic Block')
    expect(
      screen.getByText(/On this run, SH-01 does not reach Academic Block after Central Library/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Stops you can travel to: Student Centre/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book seat' })).toBeDisabled()
  })

  it('updates the seats shown on the live board', async () => {
    const user = userEvent.setup()
    signInAs('demo-student')
    const view = renderApp('/app/book')
    await screen.findByRole('heading', { name: 'Book a seat' })
    await chooseJourney(user, 'Main Gate', "Boys' Hostel")
    await user.click(screen.getByRole('button', { name: 'Book seat' }))
    await screen.findByTestId('booking-code')
    view.unmount()

    renderApp('/app/dashboard')
    const board = await screen.findByRole('region', { name: 'SH-01 status' })
    expect(within(board).getByText('19 of 20')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /Your next journey: Main Gate to Boys' Hostel/ }),
    ).toBeInTheDocument()
  })
})

describe('My bookings', () => {
  it('lists a booking and cancels it after confirmation', async () => {
    const user = userEvent.setup()
    signInAs('demo-student')
    const view = renderApp('/app/book')
    await screen.findByRole('heading', { name: 'Book a seat' })
    await chooseJourney(user, 'Main Gate', 'Student Centre')
    await user.click(screen.getByRole('button', { name: 'Book seat' }))
    const code = (await screen.findByTestId('booking-code')).textContent ?? ''
    view.unmount()

    renderApp('/app/bookings')
    const card = await screen.findByRole('article', { name: `Booking ${code}` })
    expect(within(card).getByText('Confirmed')).toBeInTheDocument()
    expect(within(card).getByText(/SH-01 is at Main Gate now/)).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Cancel booking' }))
    const dialog = screen.getByRole('alertdialog', { name: `Cancel booking ${code}?` })
    await user.click(within(dialog).getByRole('button', { name: 'Keep booking' }))
    expect(screen.getByRole('article', { name: `Booking ${code}` })).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Cancel booking' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel booking' }))

    expect(await screen.findByText(`Booking ${code} cancelled`)).toBeInTheDocument()
    expect(screen.getByText('No current bookings')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /History/ }))
    const cancelledCard = screen.getByRole('article', { name: `Booking ${code}` })
    expect(within(cancelledCard).getByText('Cancelled')).toBeInTheDocument()
    expect(within(cancelledCard).queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('opens and closes the digital boarding pass modal with QR code', async () => {
    const user = userEvent.setup()
    signInAs('demo-student')
    const view = renderApp('/app/book')
    await screen.findByRole('heading', { name: 'Book a seat' })
    await chooseJourney(user, 'Main Gate', 'Central Library')
    await user.click(screen.getByRole('button', { name: 'Book seat' }))
    const code = (await screen.findByTestId('booking-code')).textContent ?? ''
    view.unmount()

    renderApp('/app/bookings')
    const card = await screen.findByRole('article', { name: `Booking ${code}` })
    await user.click(within(card).getByRole('button', { name: 'Boarding pass' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Digital Boarding Pass' })).toBeInTheDocument()
    expect(within(dialog).getAllByText(code).length).toBeGreaterThanOrEqual(1)

    await user.click(within(dialog).getByRole('button', { name: 'Close pass' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows an empty state before any booking', async () => {
    signInAs('demo-student')
    renderApp('/app/bookings')
    expect(await screen.findByText('No current bookings')).toBeInTheDocument()
  })
})

describe('Admin bookings list', () => {
  it('shows bookings from students to the administrator', async () => {
    const user = userEvent.setup()
    signInAs('demo-student')
    const view = renderApp('/app/book')
    await screen.findByRole('heading', { name: 'Book a seat' })
    await chooseJourney(user, 'Main Gate', 'Central Library')
    await user.click(screen.getByRole('button', { name: 'Book seat' }))
    const code = (await screen.findByTestId('booking-code')).textContent ?? ''
    view.unmount()

    signInAs('demo-admin')
    const admin = renderApp('/app/admin')
    const fleetCard = await screen.findByRole('article', { name: 'SH-01 overview' })
    expect(await within(fleetCard).findByText('1 of 20')).toBeInTheDocument()
    admin.unmount()

    renderApp('/app/admin?tab=bookings')
    expect(await screen.findByText(code)).toBeInTheDocument()
    expect(screen.getByText('Asha Rao')).toBeInTheDocument()
  })
})

describe('Duplicate bookings in the form', () => {
  it('warns about an existing booking on the same shuttle and disables booking', async () => {
    const user = userEvent.setup()
    signInAs('demo-student')
    renderApp('/app/book')
    await screen.findByRole('heading', { name: 'Book a seat' })
    await chooseJourney(user, 'Main Gate', 'Central Library')
    await user.click(screen.getByRole('button', { name: 'Book seat' }))
    await screen.findByTestId('booking-code')

    await user.click(screen.getByRole('button', { name: 'Book another journey' }))
    await chooseJourney(user, 'Main Gate', 'Student Centre')
    expect(screen.getByText(/You already have booking/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book seat' })).toBeDisabled()

    // The other shuttle is still bookable.
    await user.selectOptions(screen.getByLabelText('Shuttle'), 'sh-02')
    expect(screen.queryByText(/You already have booking/)).not.toBeInTheDocument()
  })
})
