import { describe, expect, it } from 'vitest'
import { MsgMultiSend, MsgSend } from '@injectivelabs/sdk-ts'
import {
  COSMOS_SEND_GAS,
  EVM_TRANSFER_GAS,
  GAS_PRICE,
  checkFee,
  feeShortfallMessage,
  formatFee,
  injSpentBy,
  maxInjAfterFee,
  networkFee,
  withGasHeadroom,
} from '@/lib/injective/fees'
import { DENOMS } from '@/lib/injective/tokens'

const A = 'inj15qx9nl66pqxjh92dp367gm3z5rphzg669sh88w'
const B = 'inj1psuzu6zmhmh7t57ec20znc6plm5wsnza0wew7l'

describe('network fee', () => {
  it('uses the documented minimum gas price of 160,000,000inj', () => {
    expect(GAS_PRICE).toBe(BigInt(160_000_000))
  })

  it('matches the docs example: 104,519 gas costs 0.000016723 INJ', () => {
    expect(formatFee(networkFee(BigInt(104_519)))).toBe('0.00001672')
    expect(networkFee(BigInt(104_519)).toString()).toBe('16723040000000')
  })

  it('prices a plain EVM transfer and a Cosmos send', () => {
    expect(formatFee(networkFee(EVM_TRANSFER_GAS))).toBe('0.00000336')
    expect(formatFee(networkFee(COSMOS_SEND_GAS))).toBe('0.000032')
  })

  it('adds 30% to a USDC transfer estimate, rounding down', () => {
    expect(withGasHeadroom(BigInt(100_000))).toBe(BigInt(130_000))
    expect(withGasHeadroom(BigInt(21_001))).toBe(BigInt(27_301))
  })
})

describe('checkFee', () => {
  const fee = networkFee(EVM_TRANSFER_GAS)

  it('passes when the balance covers the fee and the INJ sent', () => {
    expect(checkFee(fee + BigInt(5), fee, BigInt(5))).toEqual({ ok: true })
  })

  it('fails with the amount needed when it does not', () => {
    expect(checkFee(BigInt(0), fee)).toEqual({ ok: false, needed: fee, available: BigInt(0) })
    expect(checkFee(fee, fee, BigInt(1))).toMatchObject({ ok: false, needed: fee + BigInt(1) })
  })

  it('explains that USDC sends still pay fees in INJ', () => {
    const check = checkFee(BigInt(0), networkFee(COSMOS_SEND_GAS))
    if (check.ok) throw new Error('expected a shortfall')
    expect(feeShortfallMessage(check, false)).toMatch(/^Network fees are paid in INJ, even for USDC\. You need about 0\.000032 INJ/)
  })
})

describe('maxInjAfterFee', () => {
  it('keeps twice the fee back and never goes negative', () => {
    expect(maxInjAfterFee(BigInt(1000), BigInt(100))).toBe(BigInt(800))
    expect(maxInjAfterFee(BigInt(150), BigInt(100))).toBe(BigInt(0))
  })
})

describe('injSpentBy', () => {
  it('counts INJ leaving the sender in MsgSend and MsgMultiSend', () => {
    const send = MsgSend.fromJSON({ srcInjectiveAddress: A, dstInjectiveAddress: B, amount: { denom: 'inj', amount: '7' } })
    const usdc = MsgSend.fromJSON({ srcInjectiveAddress: A, dstInjectiveAddress: B, amount: { denom: DENOMS.USDC, amount: '9' } })
    const multi = MsgMultiSend.fromJSON({
      inputs: [{ address: A, coins: [{ denom: 'inj', amount: '10' }] }],
      outputs: [{ address: B, coins: [{ denom: 'inj', amount: '10' }] }],
    })
    expect(injSpentBy(send, A)).toBe(BigInt(7))
    expect(injSpentBy([send, usdc, multi], A)).toBe(BigInt(17))
    expect(injSpentBy(send, B)).toBe(BigInt(0))
  })
})
