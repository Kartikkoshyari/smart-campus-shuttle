// Runs before every test file.
// Adds matchers such as toBeInTheDocument(), and gives every test a clean start.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

beforeEach(() => {
  // Database tests run without a browser, so there is no window there.
  if (typeof window !== 'undefined') window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})
