import { describe, expect, it } from 'vitest'
import { DENOMS, INJ, USDC, sameDenom } from '@/lib/injective/tokens'
import { balanceOf } from '@/lib/injective/bank'

describe('native USDC config (testnet)', () => {
  it('uses Circle native USDC from the Injective docs and token list', () => {
    expect(USDC.evmAddress).toBe('0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d')
    expect(USDC.denom).toBe('erc20:0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d')
    expect(USDC.decimals).toBe(6)
    expect(DENOMS.USDC).toBe(USDC.denom)
  })

  it('keeps INJ at 18 decimals', () => {
    expect(INJ.denom).toBe('inj')
    expect(INJ.decimals).toBe(18)
  })
})

describe('sameDenom', () => {
  it('matches checksummed and lowercase erc20 denoms', () => {
    expect(sameDenom(USDC.denom, USDC.denom.toLowerCase())).toBe(true)
    expect(sameDenom('inj', 'peggy0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174')).toBe(false)
  })
})

describe('balanceOf', () => {
  it('finds USDC whichever casing the chain returns', () => {
    const balances = [
      { denom: 'inj', amount: '5' },
      { denom: USDC.denom.toLowerCase(), amount: '2500000' },
    ]
    expect(balanceOf(balances, DENOMS.USDC)).toBe('2500000')
    expect(balanceOf(balances, DENOMS.INJ)).toBe('5')
  })

  it('does not count legacy Peggy USDC as native USDC', () => {
    const balances = [{ denom: 'peggy0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', amount: '9' }]
    expect(balanceOf(balances, DENOMS.USDC)).toBe('0')
  })
})
