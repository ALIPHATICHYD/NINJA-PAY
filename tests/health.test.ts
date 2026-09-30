import { describe, expect, it } from 'vitest'
import { MAX_BLOCK_AGE_MS, assessChain } from '@/lib/injective/health'

const now = new Date('2026-09-30T12:00:00Z')
const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000)

describe('assessChain', () => {
  it('passes a fresh block on the expected chain', () => {
    expect(assessChain({ chainId: 'injective-888', blockTime: secondsAgo(2) }, 'injective-888', now)).toEqual({ ok: true })
    expect(assessChain({ chainId: 1439, blockTime: secondsAgo(2) }, 1439, now)).toEqual({ ok: true })
  })

  it('pauses sends when the endpoint is on another chain', () => {
    const result = assessChain({ chainId: 2424, blockTime: secondsAgo(1) }, 1439, now)
    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.reason).toMatch(/chain 2424, not 1439/)
  })

  it('pauses sends when the chain has stopped producing blocks', () => {
    const result = assessChain({ chainId: 'injective-888', blockTime: secondsAgo(MAX_BLOCK_AGE_MS / 1000 + 300) }, 'injective-888', now)
    expect(!result.ok && result.reason).toMatch(/last block was 6 minutes ago, so sending is paused.*upgrade or an outage/)
  })
})
