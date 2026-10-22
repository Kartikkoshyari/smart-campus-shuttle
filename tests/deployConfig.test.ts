// @vitest-environment node
import { describe, expect, it } from 'vitest'
import netlify from '../netlify.toml?raw'
import vercelJson from '../vercel.json?raw'

const vercel = JSON.parse(vercelJson) as {
  buildCommand: string
  outputDirectory: string
  rewrites: { source: string; destination: string }[]
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

/** Reads the [[headers]] blocks of netlify.toml (just enough TOML for this file). */
function netlifyHeaders(): Record<string, Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {}
  for (const block of netlify.split('[[headers]]').slice(1)) {
    const path = /for = "([^"]+)"/.exec(block)?.[1] ?? ''
    blocks[path] = {}
    for (const match of block.matchAll(/^\s+([A-Za-z-]+) = "(.*)"$/gm)) {
      if (match[1] !== 'for') blocks[path][match[1]] = match[2]
    }
  }
  return blocks
}

function vercelHeaders(source: string): Record<string, string> {
  const rule = vercel.headers.find((candidate) => candidate.source === source)
  return Object.fromEntries((rule?.headers ?? []).map(({ key, value }) => [key, value]))
}

describe('deployment settings', () => {
  it('builds the same way on Vercel and Netlify', () => {
    expect(vercel.buildCommand).toBe('npm run build')
    expect(vercel.outputDirectory).toBe('dist')
    expect(netlify).toContain('command = "npm run build"')
    expect(netlify).toContain('publish = "dist"')
  })

  it('opens the app for every address, so reloading /app/book works', () => {
    expect(vercel.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }])
    expect(netlify).toMatch(/from = "\/\*"\s+to = "\/index.html"\s+status = 200/)
  })

  it('sends identical security headers on both hosts', () => {
    const netlifyBlocks = netlifyHeaders()
    expect(netlifyBlocks['/*']).toEqual(vercelHeaders('/(.*)'))
    expect(netlifyBlocks['/assets/*']).toEqual(vercelHeaders('/assets/(.*)'))
  })

  it('allows only what the app needs: its own files, OpenStreetMap tiles and Supabase', () => {
    const csp = vercelHeaders('/(.*)')['Content-Security-Policy']
    const directives = Object.fromEntries(
      csp.split(';').map((part) => {
        const [name, ...values] = part.trim().split(/\s+/)
        return [name, values]
      }),
    )
    expect(directives['default-src']).toEqual(["'self'"])
    expect(directives['script-src']).toEqual(["'self'"])
    expect(directives['img-src']).toEqual(["'self'", 'data:', 'https://tile.openstreetmap.org'])
    expect(directives['connect-src']).toEqual(["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'])
    expect(directives['frame-ancestors']).toEqual(["'none'"])
    expect(directives['object-src']).toEqual(["'none'"])
  })

  it('switches off location access, because the demo never uses GPS', () => {
    expect(vercelHeaders('/(.*)')['Permissions-Policy']).toContain('geolocation=()')
  })
})
