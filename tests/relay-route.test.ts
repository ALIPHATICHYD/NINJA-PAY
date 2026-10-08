import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { newTransferAuthorization, serializeAuthorization } from '@/lib/injective/usdc-authorization'
import { relayStateFrom } from '@/hooks/useUsdcRelay'

const relayTransfer = vi.hoisted(() => vi.fn())
vi.mock('@/lib/injective/usdc-relay', async original => ({
  ...(await original<typeof import('@/lib/injective/usdc-relay')>()),
  relayTransfer,
}))
const { GET, POST, UNAVAILABLE_MESSAGE } = await import('@/app/api/relay/usdc/route')

const HASH = `0x${'cd'.repeat(32)}` as const
const SIGNATURE = `0x${'11'.repeat(65)}`
const recipient = privateKeyToAccount(generatePrivateKey()).address
const body = (from = privateKeyToAccount(generatePrivateKey()).address) =>
  ({ authorization: serializeAuthorization(newTransferAuthorization(from, recipient, BigInt(1_000_000))), signature: SIGNATURE })
const post = (payload: unknown) =>
  POST(new Request('http://localhost/api/relay/usdc', { method: 'POST', body: typeof payload === 'string' ? payload : JSON.stringify(payload) }))

afterEach(() => {
  vi.unstubAllEnvs()
  relayTransfer.mockReset()
})

describe('the USDC relay route', () => {
  it('says it is off, and answers UNAVAILABLE, until the server is set up', async () => {
    vi.stubEnv('USDC_RELAY_FACILITATOR_URL', '')
    vi.stubEnv('USDC_RELAYER_PRIVATE_KEY', '')
    expect(await (await GET()).json()).toEqual({ available: false })
    const response = await post(body())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'UNAVAILABLE', message: UNAVAILABLE_MESSAGE })
    expect(relayTransfer).not.toHaveBeenCalled()
  })

  it('turns down malformed requests before relaying', async () => {
    vi.stubEnv('USDC_RELAYER_PRIVATE_KEY', generatePrivateKey())
    expect((await GET()).status).toBe(200)
    expect(await (await GET()).json()).toEqual({ available: true })
    for (const bad of ['{', { ...body(), signature: '0x1234' }, { ...body(), authorization: { from: 'x' } }, 'x'.repeat(5000)]) {
      expect((await post(bad)).status).toBeGreaterThanOrEqual(400)
    }
    expect(relayTransfer).not.toHaveBeenCalled()
  })

  it.each([
    ['CONFIRMED', 200], ['SUBMITTED', 202], ['REFUSED', 400], ['FAILED', 502], ['UNCERTAIN', 504],
  ] as const)('answers %s with HTTP %i', async (status, http) => {
    vi.stubEnv('USDC_RELAYER_PRIVATE_KEY', generatePrivateKey())
    relayTransfer.mockResolvedValue({ status, hash: HASH, message: 'm' })
    const response = await post(body())
    expect(response.status).toBe(http)
    expect((await response.json()).status).toBe(status)
  })

  it('limits each sender to 10 relays an hour on this instance', async () => {
    vi.stubEnv('USDC_RELAYER_PRIVATE_KEY', generatePrivateKey())
    relayTransfer.mockResolvedValue({ status: 'CONFIRMED', hash: HASH })
    const sender = privateKeyToAccount(generatePrivateKey()).address
    const statuses = []
    for (let i = 0; i < 11; i++) statuses.push((await post(body(sender))).status)
    expect(statuses.slice(0, 10).every(s => s === 200)).toBe(true)
    expect(statuses[10]).toBe(429)
    expect((await post(body())).status).toBe(200)
  })

  it('says nothing was sent when the chain could not be read', async () => {
    vi.stubEnv('USDC_RELAYER_PRIVATE_KEY', generatePrivateKey())
    relayTransfer.mockRejectedValue(new Error('fetch failed'))
    const response = await post(body())
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ status: 'REFUSED' })
  })
})

describe('what Send shows for the route’s answer', () => {
  it('counts as sent only with a hash from the chain', () => {
    expect(relayStateFrom({ status: 'CONFIRMED', hash: HASH })).toEqual({ step: 'sent', hash: HASH, confirmed: true })
    expect(relayStateFrom({ status: 'SUBMITTED', hash: HASH })).toEqual({ step: 'sent', hash: HASH, confirmed: false })
    expect(relayStateFrom({ status: 'CONFIRMED' })).toMatchObject({ step: 'error' })
    expect(relayStateFrom({ status: 'FAILED', hash: HASH, message: 'reverted' })).toEqual({ step: 'reverted', hash: HASH, message: 'reverted' })
    expect(relayStateFrom({ status: 'UNCERTAIN', message: 'check' })).toEqual({ step: 'error', message: 'check', uncertain: true })
    expect(relayStateFrom({ status: 'UNAVAILABLE', message: 'off' })).toEqual({ step: 'error', message: 'off', uncertain: false })
    expect(relayStateFrom({})).toMatchObject({ step: 'error', uncertain: false })
  })
})
