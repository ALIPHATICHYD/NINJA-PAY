import { describe, expect, it } from 'vitest'
import { MAX_BLOCK_AGE_MS, assessChain, pauseReason } from '@/lib/injective/health'

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

describe('pauseReason', () => {
  const stale = (height?: number) => {
    const result = assessChain({ chainId: 'injective-888', blockTime: secondsAgo(600), height }, 'injective-888', now)
    if (result.ok) throw new Error('expected a paused chain')
    return result
  }
  const upgrade = { name: 'v1.21.0', height: 1000 }

  it('records the height where the chain stopped', () => {
    expect(stale(999)).toMatchObject({ haltedAt: 999 })
    expect(stale()).not.toHaveProperty('haltedAt')
  })

  it('names the upgrade when the chain stopped at its height', () => {
    expect(pauseReason(stale(999), upgrade)).toMatch(/is upgrading \(v1\.21\.0\), so sending is paused\. Your funds stay in your wallet/)
    expect(pauseReason(stale(1000), upgrade)).toMatch(/is upgrading/)
  })

  it('keeps the general message for a halt before the upgrade, with no upgrade, or with no height', () => {
    expect(pauseReason(stale(950), upgrade)).toMatch(/upgrade or an outage/)
    expect(pauseReason(stale(999), null)).toMatch(/upgrade or an outage/)
    expect(pauseReason(stale(), upgrade)).toMatch(/upgrade or an outage/)
  })

  it('keeps the wrong-chain message even when an upgrade is due', () => {
    const wrong = assessChain({ chainId: 'injective-1', blockTime: secondsAgo(1), height: 999 }, 'injective-888', now)
    if (wrong.ok) throw new Error('expected a paused chain')
    expect(pauseReason(wrong, upgrade)).toMatch(/reports chain injective-1/)
  })
})
