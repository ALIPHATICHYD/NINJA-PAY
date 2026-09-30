import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/evm-rpc/route'

const PREMIUM = 'https://premium.example/rpc?key=secret'
const call = (body: unknown) => POST(new Request('http://localhost/api/evm-rpc', { method: 'POST', body: JSON.stringify(body) }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
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
})
