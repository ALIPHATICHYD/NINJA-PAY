import { afterEach, describe, expect, it, vi } from 'vitest'
import { hostWallet, keplrBrowserLink, walletEvmProvider } from '@/lib/wallet-browser'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36'

const provider = () => ({ request: vi.fn() })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('wallet in-app browsers', () => {
  it("knows it's inside Keplr or Leap on a phone, and Leap wins when both answer", () => {
    expect(hostWallet({ navigator: { userAgent: ANDROID }, keplr: {} })).toBe('keplr')
    expect(hostWallet({ navigator: { userAgent: IPHONE }, leap: {} })).toBe('leap')
    expect(hostWallet({ navigator: { userAgent: ANDROID }, leap: {}, keplr: {} })).toBe('leap')
  })

  it('is not inside a wallet in an ordinary phone browser or with desktop extensions', () => {
    expect(hostWallet({ navigator: { userAgent: ANDROID } })).toBeNull()
    expect(hostWallet({ navigator: { userAgent: ANDROID }, ethereum: provider() })).toBeNull()
    expect(hostWallet({ navigator: { userAgent: DESKTOP }, keplr: {}, leap: {} })).toBeNull()
    expect(hostWallet(undefined)).toBeNull()
  })

  it("uses the wallet's own Ethereum provider first", () => {
    const keplrEth = provider()
    const ethereum = provider()
    const w = { navigator: { userAgent: DESKTOP }, keplr: { ethereum: keplrEth }, ethereum }
    expect(walletEvmProvider('keplr', w)).toBe(keplrEth)
    expect(walletEvmProvider('leap', w)).toBeUndefined()
  })

  it("uses window.ethereum only inside that wallet's browser or when it names the wallet", () => {
    const ethereum = provider()
    expect(walletEvmProvider('keplr', { navigator: { userAgent: ANDROID }, keplr: {}, ethereum })).toBe(ethereum)
    expect(walletEvmProvider('leap', { navigator: { userAgent: ANDROID }, keplr: {}, ethereum })).toBeUndefined()
    // MetaMask on a desktop is not Keplr.
    expect(walletEvmProvider('keplr', { navigator: { userAgent: DESKTOP }, keplr: {}, ethereum })).toBeUndefined()
    const leapEth = { ...provider(), isLeap: true }
    expect(walletEvmProvider('leap', { navigator: { userAgent: DESKTOP }, ethereum: leapEth })).toBe(leapEth)
  })

  it("opens the current page in Keplr's browser through Keplr's https link", () => {
    expect(keplrBrowserLink('https://ninja-pay-ten.vercel.app/send?to=inj1x'))
      .toBe('https://deeplink.keplr.app/web-browser?url=https%3A%2F%2Fninja-pay-ten.vercel.app%2Fsend%3Fto%3Dinj1x')
  })

  it("offers Keplr inside Keplr's browser and not Leap", async () => {
    vi.stubGlobal('window', { navigator: { userAgent: ANDROID }, keplr: { ethereum: provider() } })
    vi.stubGlobal('navigator', { userAgent: ANDROID })
    const { keplrWallet, leapWallet } = await import('@/lib/cosmos-evm-wallets')
    const params = { projectId: 'test', appName: 'test' } as never
    const keplr = keplrWallet(params)
    expect(keplr.installed).toBe(true)
    expect(keplr.iconUrl).toBe('/wallets/keplr.svg')
    expect(leapWallet(params).installed).toBe(false)
  }, 30_000)

  it("adds Injective's EVM when Keplr refuses to switch without code 4902", async () => {
    const calls: string[] = []
    let chainId = '0x1'
    const keplrEth = {
      request: vi.fn(async ({ method, params }: { method: string; params?: unknown }) => {
        calls.push(method)
        if (method === 'eth_chainId') return chainId
        if (method === 'wallet_switchEthereumChain') {
          const target = (params as { chainId: string }[])[0].chainId
          if (!calls.includes('wallet_addEthereumChain')) throw Object.assign(new Error('Unknown chain'), { code: -32603 })
          chainId = target
          return null
        }
        if (method === 'wallet_addEthereumChain') return null
        throw new Error(method)
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    }
    vi.stubGlobal('window', { navigator: { userAgent: ANDROID }, keplr: { ethereum: keplrEth } })
    vi.stubGlobal('navigator', { userAgent: ANDROID })
    const { createConfig, http } = await import('wagmi')
    const { INJECTIVE_EVM } = await import('@/lib/injective/network')
    const { keplrWallet } = await import('@/lib/cosmos-evm-wallets')
    const wallet = keplrWallet({ projectId: 'test', appName: 'test' } as never)
    const config = createConfig({
      chains: [INJECTIVE_EVM],
      transports: { [INJECTIVE_EVM.id]: http() } as never,
      connectors: [wallet.createConnector({ rkDetails: {} } as never)],
      multiInjectedProviderDiscovery: false,
      storage: null,
    })
    const chain = await config.connectors[0].switchChain!({ chainId: INJECTIVE_EVM.id })
    expect(chain.id).toBe(INJECTIVE_EVM.id)
    expect(calls).toContain('wallet_addEthereumChain')
    const added = keplrEth.request.mock.calls.find(([a]) => a.method === 'wallet_addEthereumChain')![0]
    expect((added.params as { chainId: string; rpcUrls: string[] }[])[0]).toMatchObject({ chainId: '0x59f', rpcUrls: [INJECTIVE_EVM.rpcUrls.default.http[0]] })
  }, 30_000)

  it("doesn't add the chain when the user turns the switch down", async () => {
    const keplrEth = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0x1'
        if (method === 'wallet_switchEthereumChain') throw Object.assign(new Error('rejected'), { code: 4001 })
        return null
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    }
    vi.stubGlobal('window', { navigator: { userAgent: ANDROID }, keplr: { ethereum: keplrEth } })
    vi.stubGlobal('navigator', { userAgent: ANDROID })
    const { createConfig, http } = await import('wagmi')
    const { INJECTIVE_EVM } = await import('@/lib/injective/network')
    const { keplrWallet } = await import('@/lib/cosmos-evm-wallets')
    const wallet = keplrWallet({ projectId: 'test', appName: 'test' } as never)
    const config = createConfig({
      chains: [INJECTIVE_EVM],
      transports: { [INJECTIVE_EVM.id]: http() } as never,
      connectors: [wallet.createConnector({ rkDetails: {} } as never)],
      multiInjectedProviderDiscovery: false,
      storage: null,
    })
    await expect(config.connectors[0].switchChain!({ chainId: INJECTIVE_EVM.id })).rejects.toThrow()
    expect(keplrEth.request.mock.calls.map(([a]) => a.method)).not.toContain('wallet_addEthereumChain')
  }, 30_000)
})
