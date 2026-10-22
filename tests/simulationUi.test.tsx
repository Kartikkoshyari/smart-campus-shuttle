import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../src/components/AuthProvider.tsx'
import SimulationProvider from '../src/components/SimulationProvider.tsx'
import { useSimulation } from '../src/hooks/useSimulation.ts'
import { createLocalAuthService } from '../src/services/localAuthService.ts'
import { createLocalSimulationService, SIM_STORAGE_KEY } from '../src/services/localSimulationService.ts'
import { renderApp } from './renderApp.tsx'

// Leaflet needs a real browser, so tests use a stand-in map.
vi.mock('../src/components/CampusMap.tsx', () => ({
  default: () => <div data-testid="campus-map" />,
}))

function signInAs(id: 'demo-student' | 'demo-operator' | 'demo-admin') {
  window.localStorage.setItem('scs.local.session.v1', JSON.stringify(id))
}

function board(code: string) {
  return screen.getByRole('region', { name: `${code} status` })
}

describe('Operator console', () => {
  it('pauses and resumes the assigned shuttle', async () => {
    const user = userEvent.setup()
    signInAs('demo-operator')
    renderApp('/app/operator')
    await screen.findByRole('heading', { name: 'Operator console' })

    expect(screen.getByTestId('run-state')).toHaveTextContent('Running')
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByTestId('run-state')).toHaveTextContent('Paused')
    expect(within(board('SH-01')).getByText('Paused')).toBeInTheDocument()
    expect(within(board('SH-01')).getByText('On hold')).toBeInTheDocument()
    expect(screen.getByText('SH-01 paused')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(screen.getByTestId('run-state')).toHaveTextContent('Running')
    expect(within(board('SH-01')).queryByText('Paused')).not.toBeInTheDocument()
  })

  it('resets to the first stop and waits for Start', async () => {
    const user = userEvent.setup()
    signInAs('demo-operator')
    renderApp('/app/operator')
    await screen.findByRole('heading', { name: 'Operator console' })

    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByTestId('run-state')).toHaveTextContent('Ready at the start of the route')
    expect(screen.getByText('Route time 00:00')).toBeInTheDocument()
    expect(within(board('SH-01')).getByText('Main Gate')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByTestId('run-state')).toHaveTextContent('Running')
  })

  it('changes the simulation speed', async () => {
    const user = userEvent.setup()
    signInAs('demo-operator')
    renderApp('/app/operator')
    await screen.findByRole('heading', { name: 'Operator console' })

    const speeds = screen.getByRole('group', { name: 'Simulation speed' })
    expect(within(speeds).getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(speeds).getByRole('button', { name: '5x' }))
    expect(within(speeds).getByRole('button', { name: '5x' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(speeds).getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows operators only their own shuttle', async () => {
    signInAs('demo-operator')
    renderApp('/app/operator')
    await screen.findByRole('heading', { name: 'Operator console' })
    expect(screen.queryByRole('group', { name: 'Choose a shuttle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'SH-02 status' })).not.toBeInTheDocument()
  })

  it('lets the admin switch to and control SH-02', async () => {
    const user = userEvent.setup()
    signInAs('demo-admin')
    renderApp('/app/operator')
    await screen.findByRole('heading', { name: 'Operator console' })

    await user.click(screen.getByRole('button', { name: /SH-02/ }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(within(board('SH-02')).getByText('Paused')).toBeInTheDocument()
  })
})

describe('Shared simulation state', () => {
  it('shows a pause made on the operator console on the student live board', async () => {
    const user = userEvent.setup()
    signInAs('demo-operator')
    const operatorView = renderApp('/app/operator')
    await screen.findByRole('heading', { name: 'Operator console' })
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    operatorView.unmount()

    // A fresh app (like a page reload or another tab) reads the saved state.
    signInAs('demo-student')
    renderApp('/app/dashboard')
    await screen.findByRole('heading', { name: 'Live board' })
    expect(within(board('SH-01')).getByText('Paused')).toBeInTheDocument()
  })

  it('ignores damaged saved data and starts fresh', async () => {
    window.localStorage.setItem(SIM_STORAGE_KEY, '{"sh-01": {"runState": "broken"}}')
    signInAs('demo-student')
    renderApp('/app/dashboard')
    await screen.findByRole('heading', { name: 'Live board' })
    expect(within(board('SH-01')).queryByText('Paused')).not.toBeInTheDocument()
  })

  it('moves the shuttle as time passes', async () => {
    let now = 1_000_000
    signInAs('demo-operator')
    const user = userEvent.setup()
    renderApp('/app/operator', { getNow: () => now })
    await screen.findByRole('heading', { name: 'Operator console' })

    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(within(board('SH-01')).getByText('Main Gate')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start' }))
    now += 120_000 // two simulated minutes later
    // Any control action redraws the screen at the new time.
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByText('Route time 02:00')).toBeInTheDocument()
    expect(within(board('SH-01')).getByText('Academic Block')).toBeInTheDocument()
  })
})

describe('Animation loop', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs one loop, and cancels it when the app closes', () => {
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 7)
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    const view = render(
      <AuthProvider service={createLocalAuthService({ delayMs: 0 })}>
        <SimulationProvider service={createLocalSimulationService({ getNow: () => 1_000_000 })}>
          <p>child</p>
        </SimulationProvider>
      </AuthProvider>,
    )
    expect(request).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(cancel).toHaveBeenCalledWith(7)
  })

  it('does not run a loop when every shuttle is paused', () => {
    const paused = { runState: 'paused', speed: 1, baseElapsed: 10, baseTimeMs: 0 }
    window.localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify({ 'sh-01': paused, 'sh-02': paused }))
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)

    render(
      <AuthProvider service={createLocalAuthService({ delayMs: 0 })}>
        <SimulationProvider service={createLocalSimulationService({ getNow: () => 1_000_000 })}>
          <p>child</p>
        </SimulationProvider>
      </AuthProvider>,
    )
    expect(request).not.toHaveBeenCalled()
  })

  it('redraws on each animation frame', () => {
    let frame: FrameRequestCallback = () => undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    let now = 1_000_000
    signInAs('demo-operator')

    render(
      <AuthProvider service={createLocalAuthService({ delayMs: 0 })}>
        <SimulationProvider service={createLocalSimulationService({ getNow: () => now })}>
          <Elapsed />
        </SimulationProvider>
      </AuthProvider>,
    )
    expect(screen.getByTestId('elapsed')).toHaveTextContent('0')

    now += 5000
    act(() => frame(1000))
    expect(screen.getByTestId('elapsed')).toHaveTextContent('5')
  })
})

function Elapsed() {
  const { getElapsedSeconds } = useSimulation()
  return <span data-testid="elapsed">{Math.round(getElapsedSeconds('sh-01'))}</span>
}
