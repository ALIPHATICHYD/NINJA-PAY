import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadOpenRequest, parsePaymentRequest, paymentRequestUrl, requestAmountBase, saveOpenRequest } from '@/lib/payment-request'

const TO = 'inj15qx9nl66pqxjh92dp367gm3z5rphzg669sh88w'

describe('payment-request links', () => {
  it('round-trips a request through the Send page URL', () => {
    const url = paymentRequestUrl('https://ninjapay.example', { to: TO, token: 'USDC', amount: '12.5' })
    expect(url).toBe(`https://ninjapay.example/send?to=${TO}&token=USDC&amount=12.5`)
    expect(parsePaymentRequest(new URL(url).search)).toEqual({ to: TO, token: 'USDC', amount: '12.5' })
  })

  it('keeps only the fields that are valid', () => {
    expect(parsePaymentRequest(`?to=${TO}`)).toEqual({ to: TO, token: null, amount: null })
    expect(parsePaymentRequest(`?to=inj1nope&token=usdc&amount=1`)).toEqual({ to: null, token: 'USDC', amount: '1' })
    expect(parsePaymentRequest(`?to=${TO}&token=DOGE&amount=1`)).toEqual({ to: TO, token: null, amount: null })
    expect(parsePaymentRequest(`?to=${TO}&token=USDC&amount=1.0000001`).amount).toBeNull()
    expect(parsePaymentRequest(`?to=${TO}&token=USDC&amount=-1`).amount).toBeNull()
  })

  it('needs a positive amount within the token decimals', () => {
    expect(requestAmountBase('1.5', 'USDC')).toBe(BigInt(1_500_000))
    expect(requestAmountBase('0', 'INJ')).toBeNull()
    expect(requestAmountBase('0.000000000000000001', 'INJ')).toBe(BigInt(1))
    expect(requestAmountBase('abc', 'INJ')).toBeNull()
  })
})

describe('open requests', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const stubStorage = () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } })
  }

  it('survive a reload, per account, until cleared', () => {
    stubStorage()
    const request = { token: 'INJ' as const, amount: '0.5', amountBase: BigInt('500000000000000000'), baseline: BigInt('1000000000000000000'), url: `https://ninjapay.example/send?to=${TO}` }
    saveOpenRequest(TO, request)
    expect(loadOpenRequest(TO)).toEqual(request)
    expect(loadOpenRequest('inj1someoneelse')).toBeNull()
    saveOpenRequest(TO, null)
    expect(loadOpenRequest(TO)).toBeNull()
  })

  it('are skipped when storage is unavailable', () => {
    vi.stubGlobal('window', { get localStorage(): Storage { throw new Error('blocked') } })
    expect(loadOpenRequest(TO)).toBeNull()
    expect(() => saveOpenRequest(TO, null)).not.toThrow()
  })
})
