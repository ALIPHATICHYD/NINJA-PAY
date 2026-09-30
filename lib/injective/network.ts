/**
 * The one place that says which Injective network NinjaPay runs on.
 *
 * Injective's EVM and its Cosmos side are the same chain: EVM chain 1439 is
 * testnet `injective-888` and 1776 is mainnet `injective-1`. A 0x address and
 * its inj1 form are one account with one balance.
 *
 * NinjaPay used to point wallets at chain 2424 (inEVM). Injective's EVM
 * cheat sheet says "Do not use inEVM, as that has been deprecated."
 *
 * Sources (checked 2026-09-30):
 * - https://docs.injective.network/developers-evm/network-information
 * - https://docs.injective.network/developers/network-information
 * - https://docs.injective.network/developers-evm/evm-integrations-cheat-sheet
 */

import { defineChain } from 'viem'
import { Network } from '@injectivelabs/networks'
import { ChainId } from '@injectivelabs/ts-types'

/** Set NEXT_PUBLIC_INJECTIVE_NETWORK=mainnet to target mainnet. Anything else means testnet. */
export const IS_MAINNET = process.env.NEXT_PUBLIC_INJECTIVE_NETWORK === 'mainnet'

export const NETWORK: Network = IS_MAINNET ? Network.Mainnet : Network.Testnet

/** Cosmos chain id: `injective-1` or `injective-888`. */
export const CHAIN_ID: ChainId = IS_MAINNET ? ChainId.Mainnet : ChainId.Testnet

export const NETWORK_LABEL = IS_MAINNET ? 'Injective' : 'Injective testnet'

const EVM = IS_MAINNET
  ? {
      id: 1776,
      name: 'Injective',
      rpc: 'https://sentry.evm-rpc.injective.network/',
      ws: 'wss://sentry.evm-ws.injective.network',
      blockscout: 'https://blockscout.injective.network',
    }
  : {
      id: 1439,
      name: 'Injective Testnet',
      rpc: 'https://k8s.testnet.json-rpc.injective.network/',
      ws: 'wss://k8s.testnet.ws.injective.network/',
      blockscout: 'https://testnet.blockscout.injective.network',
    }

/** Injective's native EVM, for wagmi, RainbowKit and viem. */
export const INJECTIVE_EVM = defineChain({
  id: EVM.id,
  name: EVM.name,
  nativeCurrency: { name: 'Injective', symbol: 'INJ', decimals: 18 },
  rpcUrls: {
    default: { http: [EVM.rpc], webSocket: [EVM.ws] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: EVM.blockscout },
  },
  // Multicall3 is listed on the EVM network information page for mainnet only.
  ...(IS_MAINNET && {
    contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
  }),
  testnet: !IS_MAINNET,
})

/**
 * Explorers. Blockscout shows EVM transactions (0x hashes from MetaMask);
 * InjScan (formerly explorer.injective.network) shows Cosmos transactions.
 */
export const EXPLORERS = {
  evm: EVM.blockscout,
  cosmos: IS_MAINNET ? 'https://injscan.com' : 'https://testnet.explorer.injective.network',
}

/** EVM transaction hashes are 0x plus 64 hex digits; Cosmos ones are 64 hex digits without 0x. */
export function isEvmTxHash(hash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(hash)
}

/** The explorer page for a transaction: Blockscout for EVM hashes, InjScan for Cosmos ones. */
export function explorerTxUrl(hash: string): string {
  return isEvmTxHash(hash) ? `${EXPLORERS.evm}/tx/${hash}` : `${EXPLORERS.cosmos}/transaction/${hash}`
}

export function explorerName(hash: string): 'Blockscout' | 'InjScan' {
  return isEvmTxHash(hash) ? 'Blockscout' : 'InjScan'
}

/** Where to get test funds. Mainnet has no faucet. */
export const FAUCETS = IS_MAINNET
  ? null
  : {
      inj: 'https://testnet.faucet.injective.network/',
      usdc: 'https://faucet.circle.com/',
    }
