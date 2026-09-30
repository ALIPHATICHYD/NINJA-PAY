import { describe, expect, it } from 'vitest'
import { planEscrow, splitEqually } from '@/lib/injective/claim-escrow'
import { USDC } from '@/lib/injective/tokens'

describe('planEscrow', () => {
  it('funds USDC pools with 6-decimal native USDC plus an INJ fee reserve', () => {
    const plan = planEscrow('USDC', '10', 4)
    expect(plan.totalBase).toBe(BigInt(10_000_000))
    expect(plan.shares).toEqual(Array(4).fill(BigInt(2_500_000)))
    expect(plan.fundingCoins.map(c => c.denom)).toEqual([USDC.denom, 'inj'])
    expect(plan.fundingCoins[0].amount).toBe('10000000')
  })

  it('uses the denom spelling the creator actually holds', () => {
    const lower = USDC.denom.toLowerCase()
    const plan = planEscrow('USDC', '1', 1, lower)
    expect(plan.fundingCoins[0].denom).toBe(lower)
  })
})

describe('splitEqually', () => {
  it('always sums to the total', () => {
    const shares = splitEqually(BigInt(10), 3)
    expect(shares).toEqual([BigInt(4), BigInt(3), BigInt(3)])
  })
})
