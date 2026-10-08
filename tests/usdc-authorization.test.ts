import { describe, expect, it } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  AUTHORIZATION_LIFETIME_SECONDS,
  authorizationProblem,
  isSignedBySender,
  newTransferAuthorization,
  parseAuthorization,
  serializeAuthorization,
  transferAuthorizationTypedData,
  transferAuthorizationTypedDataJson,
} from '@/lib/injective/usdc-authorization'

const USDC_MAINNET = '0xa00C59fF5a080D2b954d0c75e46E22a0c371235a'
const sender = privateKeyToAccount(generatePrivateKey())
const recipient = privateKeyToAccount(generatePrivateKey()).address
const NOW = new Date('2026-10-08T12:00:00Z')
const nowSeconds = Math.floor(NOW.getTime() / 1000)

describe('a USDC transfer authorization (EIP-3009)', () => {
  it('is valid for ten minutes and has a fresh 32-byte nonce each time', () => {
    const a = newTransferAuthorization(sender.address, recipient, BigInt(2_500_000), NOW)
    const b = newTransferAuthorization(sender.address, recipient, BigInt(2_500_000), NOW)
    expect(a.validAfter).toBe(BigInt(0))
    expect(a.validBefore).toBe(BigInt(nowSeconds + AUTHORIZATION_LIFETIME_SECONDS))
    expect(a.nonce).toMatch(/^0x[0-9a-f]{64}$/)
    expect(a.nonce).not.toBe(b.nonce)
  })

  it("uses Injective USDC's EIP-712 domain: name USDC, version 2", () => {
    const auth = newTransferAuthorization(sender.address, recipient, BigInt(1), NOW)
    const json = JSON.parse(transferAuthorizationTypedDataJson(auth, 1776, USDC_MAINNET))
    expect(json.domain).toEqual({ name: 'USDC', version: '2', chainId: 1776, verifyingContract: USDC_MAINNET })
    expect(json.primaryType).toBe('TransferWithAuthorization')
    expect(json.types.EIP712Domain.map((f: { name: string }) => f.name)).toEqual(['name', 'version', 'chainId', 'verifyingContract'])
    // eth_signTypedData_v4 takes numbers as decimal strings.
    expect(json.message).toEqual(serializeAuthorization(auth))
    expect(json.message.validBefore).toBe(String(nowSeconds + AUTHORIZATION_LIFETIME_SECONDS))
  })

  it('accepts only the sender signing exactly this transfer on this chain and contract', async () => {
    const auth = newTransferAuthorization(sender.address, recipient, BigInt(2_500_000), NOW)
    const signature = await sender.signTypedData(transferAuthorizationTypedData(auth, 1776, USDC_MAINNET))
    expect(await isSignedBySender(auth, signature, 1776, USDC_MAINNET)).toBe(true)
    expect(await isSignedBySender({ ...auth, value: BigInt(2_500_001) }, signature, 1776, USDC_MAINNET)).toBe(false)
    expect(await isSignedBySender({ ...auth, to: sender.address }, signature, 1776, USDC_MAINNET)).toBe(false)
    expect(await isSignedBySender(auth, signature, 1439, USDC_MAINNET)).toBe(false)
    expect(await isSignedBySender(auth, signature, 1776, '0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d')).toBe(false)
    const other = await privateKeyToAccount(generatePrivateKey()).signTypedData(transferAuthorizationTypedData(auth, 1776, USDC_MAINNET))
    expect(await isSignedBySender(auth, other, 1776, USDC_MAINNET)).toBe(false)
    expect(await isSignedBySender(auth, '0x1234', 1776, USDC_MAINNET)).toBe(false)
  })

  it('reads back what the browser sends, and nothing malformed', () => {
    const auth = newTransferAuthorization(sender.address, recipient, BigInt(2_500_000), NOW)
    const sent = serializeAuthorization(auth)
    expect(parseAuthorization(JSON.parse(JSON.stringify(sent)))).toEqual(auth)
    expect(parseAuthorization({ ...sent, nonce: sent.nonce.toUpperCase().replace('0X', '0x') })).toEqual(auth)

    expect(parseAuthorization(null)).toBeNull()
    expect(parseAuthorization('x')).toBeNull()
    expect(parseAuthorization({ ...sent, from: 'inj1abc' })).toBeNull()
    expect(parseAuthorization({ ...sent, value: '-1' })).toBeNull()
    expect(parseAuthorization({ ...sent, value: '1.5' })).toBeNull()
    expect(parseAuthorization({ ...sent, value: 2500000 })).toBeNull()
    expect(parseAuthorization({ ...sent, nonce: '0x1234' })).toBeNull()
    expect(parseAuthorization({ ...sent, validBefore: undefined })).toBeNull()
  })

  it('is turned down before any chain call when it is too small, not yet valid, expiring or valid too long', () => {
    const auth = newTransferAuthorization(sender.address, recipient, BigInt(2_500_000), NOW)
    expect(authorizationProblem(auth, nowSeconds)).toBeNull()
    expect(authorizationProblem({ ...auth, to: sender.address }, nowSeconds)).toMatch(/same account/)
    expect(authorizationProblem({ ...auth, value: BigInt(9_999) }, nowSeconds)).toMatch(/0\.01 USDC or more/)
    expect(authorizationProblem({ ...auth, validAfter: BigInt(nowSeconds + 60) }, nowSeconds)).toMatch(/isn't valid yet/)
    expect(authorizationProblem({ ...auth, validBefore: BigInt(nowSeconds + 20) }, nowSeconds)).toMatch(/expired/)
    expect(authorizationProblem({ ...auth, validBefore: BigInt(nowSeconds + 21 * 60) }, nowSeconds)).toMatch(/too long/)
  })
})
