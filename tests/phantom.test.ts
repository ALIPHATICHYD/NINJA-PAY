import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('Phantom', () => {
  it('is spotted by RainbowKit id, EIP-6963 rdns or name, and nothing else', async () => {
    const { isPhantomConnector } = await import('@/lib/injective/phantom')
    expect(isPhantomConnector({ id: 'phantom', name: 'Phantom' })).toBe(true)
    expect(isPhantomConnector({ id: 'app.phantom', name: 'Phantom' })).toBe(true)
    expect(isPhantomConnector({ id: 'injected', name: 'Phantom' })).toBe(true)
    expect(isPhantomConnector({ id: 'metaMask', name: 'MetaMask' })).toBe(false)
    expect(isPhantomConnector({ id: 'io.metamask', name: 'MetaMask' })).toBe(false)
    expect(isPhantomConnector(undefined)).toBe(false)
    expect(isPhantomConnector(null)).toBe(false)
  })

  it('signs under Sepolia on testnet, with a Testnet Mode hint', async () => {
    const { ETHEREUM_SIGNING_CHAIN_ID } = await import('@/lib/injective/network')
    const { PHANTOM_NETWORK_HINT } = await import('@/lib/injective/phantom')
    expect(ETHEREUM_SIGNING_CHAIN_ID).toBe(11155111)
    expect(PHANTOM_NETWORK_HINT).toMatch(/Testnet Mode/)
  })

  it('signs under Ethereum mainnet on mainnet', async () => {
    vi.stubEnv('NEXT_PUBLIC_INJECTIVE_NETWORK', 'mainnet')
    const { ETHEREUM_SIGNING_CHAIN_ID } = await import('@/lib/injective/network')
    const { PHANTOM_NETWORK_HINT } = await import('@/lib/injective/phantom')
    expect(ETHEREUM_SIGNING_CHAIN_ID).toBe(1)
    expect(PHANTOM_NETWORK_HINT).not.toMatch(/Testnet/)
  })

  it('links only https bridge guides', async () => {
    const { SOLANA_BRIDGES } = await import('@/lib/injective/phantom')
    expect(SOLANA_BRIDGES.length).toBeGreaterThan(0)
    for (const bridge of SOLANA_BRIDGES) expect(bridge.href).toMatch(/^https:\/\/([a-z]+\.)?injective\.(com|network)\//)
  })
})
