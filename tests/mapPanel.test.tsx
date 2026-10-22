import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MapPanel from '../src/components/MapPanel.tsx'
import { getRoute } from '../src/data/campus.ts'

// A stand-in for the Leaflet map that reports failed tiles straight away,
// like a laptop with no internet connection.
vi.mock('../src/components/CampusMap.tsx', () => ({
  default: function FailingMap({ onTilesFailed }: { onTilesFailed(): void }) {
    useEffect(() => {
      onTilesFailed()
    }, [onTilesFailed])
    return <div data-testid="campus-map" />
  },
}))

const route = getRoute('campus-loop')
const markers = [{ id: 'sh-01', code: 'SH-01', position: { lat: 17.44, lng: 78.346 }, selected: true }]

describe('MapPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to the route diagram when map tiles fail', () => {
    render(<MapPanel route={route} markers={markers} />)

    expect(screen.queryByTestId('campus-map')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Campus Loop route diagram' })).toBeInTheDocument()
    expect(screen.getByText(/Map tiles could not load/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Route diagram' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('draws the shuttle on the diagram', () => {
    render(<MapPanel route={route} markers={markers} />)
    expect(screen.getByText('Shuttle SH-01 (simulated position)')).toBeInTheDocument()
  })

  it('starts with the diagram when the device is offline', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    const user = userEvent.setup()
    render(<MapPanel route={route} markers={markers} />)

    expect(screen.getByRole('img', { name: 'Campus Loop route diagram' })).toBeInTheDocument()

    // Choosing Map tries again; this stand-in fails again and returns to the diagram.
    await user.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.getByRole('button', { name: 'Route diagram' })).toHaveAttribute('aria-pressed', 'true')
  })
})
