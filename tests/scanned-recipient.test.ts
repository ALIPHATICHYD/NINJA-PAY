import { describe, expect, it } from 'vitest'
import { parseScannedRecipient } from '@/lib/scanned-recipient'

const INJ = 'inj1s9r7kujwfcr4j0arcpe72vml4x7lcemlt06y6s'
const EVM = '0x8147EB724E4e07593FA3C073E5337FA9BDfC677f'

describe('scanned QR codes on Send', () => {
  it('reads the inj1 and 0x codes on the Receive page', () => {
    expect(parseScannedRecipient(INJ)).toEqual({ to: INJ, token: null, amount: null })
    expect(parseScannedRecipient(` ${EVM}\n`)).toEqual({ to: EVM, token: null, amount: null })
  })

  it('reads a payment-request link with its token and amount', () => {
    expect(parseScannedRecipient(`https://ninja-pay-ten.vercel.app/send?to=${INJ}&token=USDC&amount=2.5`))
      .toEqual({ to: INJ, token: 'USDC', amount: '2.5' })
  })

  it('reads wallet URIs', () => {
    expect(parseScannedRecipient(`ethereum:${EVM}@1439?value=1e18`)?.to).toBe(EVM)
    expect(parseScannedRecipient(`ethereum:pay-${EVM}`)?.to).toBe(EVM)
    expect(parseScannedRecipient(`injective:${INJ}`)?.to).toBe(INJ)
  })

  it('reads .inj names', () => {
    expect(parseScannedRecipient('Ninja.inj')?.to).toBe('ninja.inj')
  })

  it('refuses anything else', () => {
    expect(parseScannedRecipient('hello')).toBeNull()
    expect(parseScannedRecipient('https://example.com/')).toBeNull()
    expect(parseScannedRecipient('bitcoin:bc1qxyz')).toBeNull()
    expect(parseScannedRecipient('0x1234')).toBeNull()
    expect(parseScannedRecipient('')).toBeNull()
  })
})
