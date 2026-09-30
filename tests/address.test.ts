import { describe, expect, it } from 'vitest'
import { isSameAccount, parseAccountAddress, shortAddress, toInjectiveAddress } from '@/lib/injective/address'

// Mainnet USDC contract from Injective's USDC page, and its inj1 form computed
// independently with the BIP-173 reference bech32 encoder.
const EVM = '0xa00C59fF5a080D2b954d0c75e46E22a0c371235a'
const INJ = 'inj15qx9nl66pqxjh92dp367gm3z5rphzg669sh88w'

describe('parseAccountAddress', () => {
  it('returns both forms from a 0x address', () => {
    expect(parseAccountAddress(EVM)).toEqual({ evm: EVM, injective: INJ })
  })

  it('returns both forms from an inj1 address', () => {
    expect(parseAccountAddress(INJ)).toEqual({ evm: EVM, injective: INJ })
  })

  it('accepts lowercase 0x, uppercase inj1 and surrounding spaces', () => {
    expect(parseAccountAddress(EVM.toLowerCase())?.injective).toBe(INJ)
    expect(parseAccountAddress(`  ${INJ.toUpperCase()} `)?.evm).toBe(EVM)
  })

  it('rejects a mixed-case 0x address with a wrong checksum', () => {
    expect(parseAccountAddress(EVM.replace('a00C', 'A00C'))).toBeNull()
  })

  it('rejects an inj1 address with a bad checksum', () => {
    expect(parseAccountAddress(INJ.slice(0, -1) + 'x')).toBeNull()
  })

  it('rejects other chains, wrong lengths and junk', () => {
    expect(parseAccountAddress('cosmos15qx9nl66pqxjh92dp367gm3z5rphzg660eqr4k')).toBeNull()
    expect(parseAccountAddress(EVM.slice(0, -2))).toBeNull()
    expect(parseAccountAddress('inj1')).toBeNull()
    expect(parseAccountAddress('')).toBeNull()
    expect(parseAccountAddress('hello')).toBeNull()
  })
})

describe('isSameAccount', () => {
  it('matches an account across formats', () => {
    expect(isSameAccount(EVM, INJ)).toBe(true)
    expect(isSameAccount(EVM.toLowerCase(), INJ)).toBe(true)
  })

  it('never matches invalid or missing addresses', () => {
    expect(isSameAccount(null, null)).toBe(false)
    expect(isSameAccount('junk', 'junk')).toBe(false)
    expect(isSameAccount(EVM, '0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d')).toBe(false)
  })
})

describe('toInjectiveAddress and shortAddress', () => {
  it('normalises to inj1', () => {
    expect(toInjectiveAddress(EVM)).toBe(INJ)
    expect(toInjectiveAddress(undefined)).toBeNull()
  })

  it('shortens long addresses only', () => {
    expect(shortAddress(INJ)).toBe('inj15qx9nl…9sh88w')
    expect(shortAddress('inj1abc')).toBe('inj1abc')
  })
})
