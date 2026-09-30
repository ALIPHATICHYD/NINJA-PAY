import { describe, expect, it } from 'vitest'
import { parsePaymentRequest, paymentRequestUrl, requestAmountBase } from '@/lib/payment-request'

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
