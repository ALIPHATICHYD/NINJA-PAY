import { describe, expect, it } from 'vitest'
import { describeTransferError, isHookOutOfGas, isHookRestriction } from '@/lib/injective/transfer-errors'

// The out-of-gas text is quoted from Injective's USDC page.
const OUT_OF_GAS =
  'transfer is restricted by EVM hook: panic during EVM hook: types.ErrorOutOfGas: {EVM hook call failed}: contract hook query error: restricted action'
const RESTRICTED = 'transfer is restricted by EVM hook: contract hook query error: restricted action'

describe('USDC hook errors', () => {
  it('treats ErrorOutOfGas as retryable, not a restriction', () => {
    expect(isHookOutOfGas(OUT_OF_GAS)).toBe(true)
    expect(isHookRestriction(OUT_OF_GAS)).toBe(false)
  })

  it('recognises a real restriction', () => {
    expect(isHookRestriction(RESTRICTED)).toBe(true)
    expect(isHookOutOfGas(RESTRICTED)).toBe(false)
  })

  it("describes a restriction as the issuer's rule, not NinjaPay's decision", () => {
    const text = describeTransferError(RESTRICTED)
    expect(text).toMatch(/issuer's rules/)
    expect(text).toMatch(/NinjaPay doesn't screen transfers/)
  })

  it('leaves other errors unchanged', () => {
    expect(describeTransferError('insufficient funds')).toBe('insufficient funds')
  })
})
