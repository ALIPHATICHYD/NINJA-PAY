import { describe, expect, it } from 'vitest'
import { siteUrl } from './site'

describe('siteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL and drops a trailing slash', () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: 'https://ninjapay.xyz/', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' }))
      .toBe('https://ninjapay.xyz')
  })

  it("falls back to Vercel's production address", () => {
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'ninja-pay-ten.vercel.app' })).toBe('https://ninja-pay-ten.vercel.app')
  })

  it('falls back to localhost when nothing is set', () => {
    expect(siteUrl({})).toBe('http://localhost:3000')
  })
})
