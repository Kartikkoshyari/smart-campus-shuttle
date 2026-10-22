import { expect, test } from '@playwright/test'
import {
  blockMapTiles,
  cspViolations,
  expectAccessible,
  fakeMapTiles,
  recordCspViolations,
  signInAs,
  watchErrors,
} from './helpers.ts'

test.beforeEach(async ({ context }) => {
  await recordCspViolations(context)
  await fakeMapTiles(context)
})

// The preview server sends the production security headers (see vite.config.ts),
// so every test also proves the Content Security Policy does not block the app.
test.afterEach(async ({ context }) => {
  for (const page of context.pages()) {
    if (page.isClosed() || !page.url().startsWith('http')) continue
    expect(await cspViolations(page), page.url()).toEqual([])
  }
})

test('the deployed security headers are sent and reloading a deep link works', async ({ page }) => {
  const response = await page.goto('/app/book')
  const headers = response?.headers() ?? {}
  expect(headers['content-security-policy']).toContain("script-src 'self'")
  expect(headers['permissions-policy']).toContain('geolocation=()')
  expect(headers['x-frame-options']).toBe('DENY')
  // Signed out, a deep link leads to sign-in instead of a 404.
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('the landing page shows the demo label and a live board', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Know when the shuttle reaches your stop.' })).toBeVisible()
  await expect(page.getByText('DEMO SIMULATION — NOT LIVE GPS').first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'SH-01 status' })).toBeVisible()
  await expectAccessible(page)
  expect(errors).toEqual([])
})

test('the map draws the route and the shuttles move', async ({ page }) => {
  const errors = watchErrors(page)
  await signInAs(page, 'Student')
  const map = page.getByRole('region', { name: /Map of the Campus Loop/ })
  await expect(map).toBeVisible()
  await expect(map.locator('.stop-label')).toHaveCount(8)
  await expect(map.locator('.shuttle-marker')).toHaveCount(2)

  // SH-02 starts part-way round and is already moving.
  const marker = map.locator('.shuttle-marker:not(.is-selected)')
  const before = await marker.evaluate((element) => (element as HTMLElement).style.transform)
  await page.waitForTimeout(2500)
  const after = await marker.evaluate((element) => (element as HTMLElement).style.transform)
  expect(after).not.toBe(before)
  expect(errors).toEqual([])
})

test('a student books a seat and cancels it', async ({ page }) => {
  await signInAs(page, 'Student')
  await page.getByRole('link', { name: 'Book a seat' }).first().click()
  await page.getByLabel('Pickup stop').selectOption({ label: 'Main Gate' })
  await page.getByLabel('Destination stop').selectOption({ label: "Boys' Hostel" })
  await expect(page.getByText('This journey works on SH-01.')).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: 'Book seat' }).click()
  const code = (await page.getByTestId('booking-code').textContent()) ?? ''
  expect(code).toMatch(/^SCS-[A-Z2-9]{6}$/)

  await page.getByRole('link', { name: 'View my bookings' }).click()
  const card = page.getByRole('article', { name: `Booking ${code}` })
  await expect(card).toBeVisible()
  await expectAccessible(page)

  await card.getByRole('button', { name: 'Cancel booking' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByText(`Booking ${code} cancelled`)).toBeVisible()
  await expect(page.getByText('No current bookings')).toBeVisible()
})

test('an impossible journey is explained, not booked', async ({ page }) => {
  await signInAs(page, 'Student')
  await page.goto('/app/book')
  await page.getByLabel('Pickup stop').selectOption({ label: 'Central Library' })
  await page.getByLabel('Destination stop').selectOption({ label: 'Academic Block' })
  await expect(page.getByText(/does not reach Academic Block after Central Library/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Book seat' })).toBeDisabled()
})

test('pausing on the operator console pauses the student board in another tab', async ({ context }) => {
  const student = await context.newPage()
  await signInAs(student, 'Student')
  const board = student.getByRole('region', { name: 'SH-01 status' })
  await expect(board).toBeVisible()

  // Both tabs share this browser's storage, like two windows on the demo laptop.
  const operator = await context.newPage()
  await operator.goto('/app/dashboard')
  await operator.evaluate(() => localStorage.setItem('scs.local.session.v1', JSON.stringify('demo-operator')))
  await operator.goto('/app/operator')
  await operator.getByRole('button', { name: 'Pause' }).click()
  await expect(operator.getByTestId('run-state')).toHaveText('Paused')
  await expectAccessible(operator)

  await expect(board.getByText('Paused')).toBeVisible()
  await expect(board.getByText('On hold')).toBeVisible()

  await operator.getByRole('button', { name: 'Resume' }).click()
  await expect(board.getByText('Paused')).toHaveCount(0)
})

test('the administrator pages work and pass accessibility checks', async ({ page }) => {
  await signInAs(page, 'Admin')
  await expect(page.getByRole('heading', { name: 'Admin overview' })).toBeVisible()
  await expectAccessible(page)
  for (const tab of ['Bookings', 'Users', 'Shuttles and stops']) {
    await page.getByRole('tab', { name: tab }).click()
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
    await expectAccessible(page)
  }
})

test('an administrator starts a fresh demo', async ({ page }) => {
  await signInAs(page, 'Student')
  await page.goto('/app/book')
  await page.getByLabel('Pickup stop').selectOption({ label: 'Main Gate' })
  await page.getByLabel('Destination stop').selectOption({ label: 'Central Library' })
  await page.getByRole('button', { name: 'Book seat' }).click()
  await expect(page.getByTestId('booking-code')).toBeVisible()

  await page.evaluate(() => localStorage.setItem('scs.local.session.v1', JSON.stringify('demo-admin')))
  await page.goto('/app/admin')
  const card = page.getByRole('article', { name: 'SH-01 overview' })
  await expect(card.getByText('1 of 20')).toBeVisible()
  await page.getByRole('button', { name: 'Start a fresh demo' }).click()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Remove bookings and restart' }).click()
  await expect(page.getByText('Fresh demo started')).toBeVisible()
  await expect(card.getByText('0 of 20')).toBeVisible()
})

test.describe('without map tiles', () => {
  test.beforeEach(async ({ context }) => {
    await context.unrouteAll()
    await blockMapTiles(context)
  })

  test('the app switches to the route diagram and keeps working', async ({ page }) => {
    await signInAs(page, 'Student')
    await expect(page.getByText(/Map tiles could not load/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('img', { name: 'Campus Loop route diagram' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'SH-01 status' })).toBeVisible()
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('no page scrolls sideways', async ({ page }) => {
    await page.goto('/')
    const widths: Record<string, number> = {}
    widths['/'] = await page.evaluate(() => document.documentElement.scrollWidth)
    await signInAs(page, 'Admin')
    for (const path of [
      '/app/dashboard',
      '/app/operator',
      '/app/admin',
      '/app/admin?tab=bookings',
      '/app/admin?tab=network',
    ]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      widths[path] = await page.evaluate(() => document.documentElement.scrollWidth)
    }
    for (const [path, width] of Object.entries(widths)) expect(width, path).toBeLessThanOrEqual(390)
  })

  test('the menu opens and closes', async ({ page }) => {
    await signInAs(page, 'Student')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.locator('#mobile-menu').getByRole('link', { name: 'My bookings' }).click()
    await expect(page.getByRole('heading', { name: 'My bookings' })).toBeVisible()
    await expect(page.locator('#mobile-menu')).toHaveCount(0)
  })
})
