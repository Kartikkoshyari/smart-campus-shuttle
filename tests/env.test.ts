import { describe, expect, it } from 'vitest'
import { checkEnv, looksLikeSecretKey } from '../src/lib/env.ts'

// Builds a fake (unsigned) JWT with the given role, like legacy Supabase keys.
function fakeJwt(role: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role })}.signature`
}

describe('checkEnv', () => {
  it('uses local demo mode when nothing is configured', () => {
    expect(checkEnv(undefined, undefined).mode).toBe('local-demo')
    expect(checkEnv('', '').mode).toBe('local-demo')
  })

  it('uses local demo mode when placeholders are still present', () => {
    const result = checkEnv('https://your-project.supabase.co', 'your-publishable-key')
    expect(result.mode).toBe('local-demo')
  })

  it('rejects a URL that is not https', () => {
    expect(checkEnv('http://abc.supabase.co', 'sb_publishable_123456789').mode).toBe('local-demo')
  })

  it('uses Supabase mode when real-looking values are present', () => {
    const result = checkEnv('https://abcdefgh.supabase.co', 'sb_publishable_1234567890abcdef')
    expect(result.mode).toBe('supabase')
    expect(result.secretKeyDetected).toBe(false)
  })

  it('refuses secret keys and flags them', () => {
    const result = checkEnv('https://abcdefgh.supabase.co', 'sb_secret_1234567890abcdef')
    expect(result.mode).toBe('local-demo')
    expect(result.secretKeyDetected).toBe(true)
  })
})

describe('looksLikeSecretKey', () => {
  it('detects legacy service_role JWTs', () => {
    expect(looksLikeSecretKey(fakeJwt('service_role'))).toBe(true)
  })

  it('accepts legacy anon JWTs and publishable keys', () => {
    expect(looksLikeSecretKey(fakeJwt('anon'))).toBe(false)
    expect(looksLikeSecretKey('sb_publishable_abc')).toBe(false)
  })
})
