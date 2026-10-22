import AxeBuilder from '@axe-core/playwright'
import { expect, type BrowserContext, type Page } from '@playwright/test'

// A plain grey 1×1 image, used instead of real map tiles so tests work offline.
const GREY_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+e7dfwAJcAO2CCBl0QAAAABJRU5ErkJggg==',
  'base64',
)

/** Serves map tiles from the test instead of the internet. */
export async function fakeMapTiles(context: BrowserContext) {
  await context.route('**/tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: GREY_TILE }),
  )
}

/** Makes every map tile fail, like a laptop with no internet. */
export async function blockMapTiles(context: BrowserContext) {
  await context.route('**/tile.openstreetmap.org/**', (route) => route.abort())
}

/** Signs in with one of the demo account buttons. */
export async function signInAs(page: Page, role: 'Student' | 'Operator' | 'Admin') {
  await page.goto('/login')
  await page.getByRole('button', { name: role, exact: true }).click()
  await expect(page).toHaveURL(/\/app\//)
}

/** Fails the test if the page has serious or critical accessibility problems (WCAG 2 A and AA). */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.map((n) => n.target.join(' ')).join(', ')})`,
    )
  expect(serious, serious.join('\n')).toEqual([])
}

/** Collects browser errors, so a test can check none happened. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('tile.openstreetmap.org')) errors.push(message.text())
  })
  return errors
}

/**
 * Records Content Security Policy violations in every page of the context.
 * Read them with cspViolations(page).
 */
export async function recordCspViolations(context: BrowserContext) {
  await context.addInitScript(() => {
    const store: string[] = []
    ;(window as unknown as { __csp: string[] }).__csp = store
    document.addEventListener('securitypolicyviolation', (event) =>
      store.push(`${event.violatedDirective} blocked ${event.blockedURI}`),
    )
  })
}

export function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
}
