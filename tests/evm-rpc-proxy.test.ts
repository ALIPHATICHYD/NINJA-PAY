import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST, RPC_LIMIT_PER_MINUTE } from '@/app/api/evm-rpc/route'

const PREMIUM = 'https://premium.example/rpc?key=secret'
const call = (body: unknown) => POST(new Request('http://localhost/api/evm-rpc', { method: 'POST', body: JSON.stringify(body) }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('EVM RPC proxy', () => {
  it('is off until INJECTIVE_EVM_RPC_URL is set', async () => {
    vi.stubEnv('INJECTIVE_EVM_RPC_URL', '')
    expect((await call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' })).status).toBe(404)
  })

  it('forwards allowed methods to the provider', async () => {
    vi.stubEnv('INJECTIVE_EVM_RPC_URL', PREMIUM)
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"jsonrpc":"2.0","id":1,"result":"0x59f"}'))
    vi.stubGlobal('fetch', fetchMock)
    const response = await call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 1, result: '0x59f' })
    expect(fetchMock.mock.calls[0][0]).toBe(PREMIUM)
  })

  it('falls back to the public RPC when the provider fails', async () => {
    vi.stubEnv('INJECTIVE_EVM_RPC_URL', PREMIUM)
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(new Response('{"jsonrpc":"2.0","id":1,"result":"0x10"}'))
    vi.stubGlobal('fetch', fetchMock)
    const response = await call({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber' })
    expect(response.status).toBe(200)
    expect(fetchMock.mock.calls[1][0]).toBe('https://k8s.testnet.json-rpc.injective.network/')
  })

  it('logs which upstream failed and alerts once, without the URL or the request', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2029, 0, 1, 12))
    vi.stubEnv('INJECTIVE_EVM_RPC_URL', PREMIUM)
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example/alert')
    const posted: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === PREMIUM) return new Response('busy', { status: 503 })
      if (url === 'https://hooks.example/alert') {
        posted.push(String(init?.body))
        return new Response(null, { status: 204 })
      }
      return new Response('{"jsonrpc":"2.0","id":1,"result":"0x10"}')
    }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const balance = { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: ['0x00000000000000000000000000000000000000aa', 'latest'] }

    expect((await call(balance)).status).toBe(200)
    vi.setSystemTime(Date.UTC(2029, 0, 1, 12, 0, 31))
    expect((await call(balance)).status).toBe(200)

    const lines = warn.mock.calls.map(c => JSON.parse(String(c[0])))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ event: 'rpc-upstream-failed', upstream: 'premium', failure: 'HTTP 503' })
    // Alerted the first time only, within the hour.
    expect(posted).toHaveLength(1)
    const everything = [...warn.mock.calls, ...error.mock.calls].flat().join(' ') + posted.join(' ')
    expect(everything).not.toContain('secret')
    expect(everything).not.toContain('00aa')
    warn.mockRestore()
    error.mockRestore()
  })

  it('skips a failed provider for 30 seconds, then tries it again', async () => {
    // Later than any cool-down an earlier test started.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2030, 0, 1, 12))
    vi.stubEnv('INJECTIVE_EVM_RPC_URL', PREMIUM)
    const ok = () => new Response('{"jsonrpc":"2.0","id":1,"result":"0x10"}')
    const fetchMock = vi.fn(async (url: string) => {
      if (url === PREMIUM) throw new Error('down')
      return ok()
    })
    vi.stubGlobal('fetch', fetchMock)
    const block = { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber' }

    await call(block)
    await call(block)
    // The second request went straight to the public RPC.
    expect(fetchMock.mock.calls.map(c => c[0])).toEqual([PREMIUM, 'https://k8s.testnet.json-rpc.injective.network/', 'https://k8s.testnet.json-rpc.injective.network/'])

    vi.setSystemTime(Date.UTC(2030, 0, 1, 12, 0, 31))
    fetchMock.mockImplementation(async () => ok())
    await call(block)
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(PREMIUM)
  })

  it('refuses wallet and admin methods, even inside a batch', async () => {
    vi.stubEnv('INJECTIVE_EVM_RPC_URL', PREMIUM)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await call([
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId' },
      { jsonrpc: '2.0', id: 2, method: 'eth_sendTransaction', params: [] },
    ])
    expect(response.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a network that sends more than the per-minute limit', async () => {
    vi.stubEnv('INJECTIVE_EVM_RPC_URL', PREMIUM)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"jsonrpc":"2.0","id":1,"result":"0x10"}')))
    const from = (ip: string) => POST(new Request('http://localhost/api/evm-rpc', {
      method: 'POST',
      headers: { 'x-forwarded-for': ip },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber' }),
    }))
    for (let i = 0; i < RPC_LIMIT_PER_MINUTE; i++) expect((await from('203.0.113.9')).status).toBe(200)
    const refused = await from('203.0.113.9')
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('60')
    // Another network is unaffected.
    expect((await from('198.51.100.4')).status).toBe(200)
  })
})
