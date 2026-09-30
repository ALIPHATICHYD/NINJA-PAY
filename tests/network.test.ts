import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('network config', () => {
  it('defaults to testnet on native Injective EVM 1439, never inEVM 2424', async () => {
    const { INJECTIVE_EVM, CHAIN_ID, EXPLORERS, FAUCETS } = await import('@/lib/injective/network')
    expect(INJECTIVE_EVM.id).toBe(1439)
    expect(INJECTIVE_EVM.rpcUrls.default.http[0]).toBe('https://k8s.testnet.json-rpc.injective.network/')
    expect(CHAIN_ID).toBe('injective-888')
    expect(EXPLORERS.evm).toBe('https://testnet.blockscout.injective.network')
    expect(FAUCETS?.inj).toBe('https://testnet.faucet.injective.network/')
  })

  it('switches to mainnet 1776 / injective-1 with native USDC when configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_INJECTIVE_NETWORK', 'mainnet')
    const { INJECTIVE_EVM, CHAIN_ID, EXPLORERS, FAUCETS } = await import('@/lib/injective/network')
    const { USDC } = await import('@/lib/injective/tokens')
    expect(INJECTIVE_EVM.id).toBe(1776)
    expect(INJECTIVE_EVM.rpcUrls.default.http[0]).toBe('https://sentry.evm-rpc.injective.network/')
    expect(CHAIN_ID).toBe('injective-1')
    expect(EXPLORERS.cosmos).toBe('https://injscan.com')
    expect(FAUCETS).toBeNull()
    expect(USDC.evmAddress).toBe('0xa00C59fF5a080D2b954d0c75e46E22a0c371235a')
    expect(USDC.denom).toBe('erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a')
  })

  it('gives wallets the right EIP-3085 chain id', async () => {
    const { INJECTIVE_EVM_WALLET_CONFIG } = await import('@/lib/injective/evm-config')
    expect(INJECTIVE_EVM_WALLET_CONFIG.chainId).toBe('0x59f')
    expect(INJECTIVE_EVM_WALLET_CONFIG.rpcUrls).toEqual(['https://k8s.testnet.json-rpc.injective.network/'])
  })
})

describe('explorer links', () => {
  const EVM_HASH = `0x${'ab'.repeat(32)}`
  const COSMOS_HASH = 'CD'.repeat(32)

  it('sends EVM hashes to Blockscout and Cosmos hashes to InjScan', async () => {
    const { explorerTxUrl, explorerName } = await import('@/lib/injective/network')
    expect(explorerTxUrl(EVM_HASH)).toBe(`https://testnet.blockscout.injective.network/tx/${EVM_HASH}`)
    expect(explorerName(EVM_HASH)).toBe('Blockscout')
    expect(explorerTxUrl(COSMOS_HASH)).toBe(`https://testnet.explorer.injective.network/transaction/${COSMOS_HASH}`)
    expect(explorerName(COSMOS_HASH)).toBe('InjScan')
  })

  it('uses the mainnet explorers on mainnet', async () => {
    vi.stubEnv('NEXT_PUBLIC_INJECTIVE_NETWORK', 'mainnet')
    const { explorerTxUrl } = await import('@/lib/injective/network')
    expect(explorerTxUrl(EVM_HASH)).toBe(`https://blockscout.injective.network/tx/${EVM_HASH}`)
    expect(explorerTxUrl(COSMOS_HASH)).toBe(`https://injscan.com/transaction/${COSMOS_HASH}`)
  })
})
