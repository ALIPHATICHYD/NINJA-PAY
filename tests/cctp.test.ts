import { describe, expect, it } from 'vitest'
import { decodeFunctionData, encodeFunctionData } from 'viem'
import { CCTP, INJECTIVE_CCTP_DOMAIN, STANDARD_FINALITY, TOKEN_MESSENGER_ABI, depositForBurnCall } from '@/lib/injective/cctp'
import { USDC } from '@/lib/injective/tokens'

const PARTNER = '0x1234567890AbcdEF1234567890aBcdef12345678'
const ETHEREUM = 0

describe('CCTP V2 burn toward a payout partner', () => {
  it('uses the testnet contracts and Injective domain 29 from the docs', () => {
    expect(INJECTIVE_CCTP_DOMAIN).toBe(29)
    expect(CCTP.tokenMessenger).toBe('0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA')
  })

  it('builds depositForBurn with a 32-byte recipient, any caller and standard finality', () => {
    const call = depositForBurnCall({ amountBase: BigInt(25_000_000), destinationDomain: ETHEREUM, recipient: PARTNER, maxFee: BigInt(0) })
    const decoded = decodeFunctionData({ abi: TOKEN_MESSENGER_ABI, data: encodeFunctionData(call) })
    expect(call.address).toBe(CCTP.tokenMessenger)
    expect(decoded.args).toEqual([
      BigInt(25_000_000),
      ETHEREUM,
      `0x000000000000000000000000${PARTNER.slice(2).toLowerCase()}`,
      USDC.evmAddress,
      `0x${'0'.repeat(64)}`,
      BigInt(0),
      STANDARD_FINALITY,
    ])
    expect(STANDARD_FINALITY).toBeGreaterThan(1000)
  })

  it('refuses a zero amount, a burn to Injective itself and a fee as large as the amount', () => {
    const base = { amountBase: BigInt(1_000_000), destinationDomain: ETHEREUM, recipient: PARTNER, maxFee: BigInt(0) } as const
    expect(() => depositForBurnCall({ ...base, amountBase: BigInt(0) })).toThrow('greater than zero')
    expect(() => depositForBurnCall({ ...base, destinationDomain: INJECTIVE_CCTP_DOMAIN })).toThrow('another chain')
    expect(() => depositForBurnCall({ ...base, maxFee: BigInt(1_000_000) })).toThrow('less than the amount')
  })
})
