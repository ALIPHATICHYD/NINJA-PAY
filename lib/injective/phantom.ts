/**
 * Phantom on Injective.
 *
 * Phantom lists INJ as a Solana token (injective.com/blog/inj-on-solana) but doesn't support
 * Injective's network, and "You can't add new or custom networks to Phantom manually"
 * (help.phantom.com, "Can I manually add a network to Phantom"). It has no Cosmos support
 * either. Its Ethereum account is still an Injective account (same key, same 0x address), so
 * NinjaPay has it sign Injective's Cosmos messages as EIP-712 typed data under an Ethereum
 * chain id the chain accepts (ETHEREUM_SIGNING_CHAIN_ID). Transactions on Injective's EVM,
 * and EIP-712 data bound to it (the gasless USDC transfer), stay out of reach.
 */

import { IS_MAINNET } from './network'

/** RainbowKit's Phantom wallet ('phantom') or Phantom found through EIP-6963 ('app.phantom'). */
export function isPhantomConnector(connector?: { id?: string; name?: string } | null): boolean {
  if (!connector) return false
  return connector.id === 'phantom' || connector.id === 'app.phantom' || connector.name === 'Phantom'
}

/**
 * Where a Phantom user moves INJ and USDC from Solana to Injective. Mainnet only: these
 * bridges move real funds, and testnet funds come from the faucets.
 */
export const SOLANA_BRIDGES = [
  {
    label: "Injective's guide: INJ from Solana with Phantom",
    href: 'https://injective.com/blog/how-to-bridge-from-solana-to-injective-using-phantom/',
  },
  { label: 'Injective Bridge', href: 'https://bridge.injective.network/' },
  { label: 'USDC on Injective (moving USDC from Solana)', href: 'https://injective.com/usdc' },
] as const

/** What Phantom needs before it signs: Sepolia lives behind Phantom's Testnet Mode (docs.phantom.com). */
export const PHANTOM_NETWORK_HINT = IS_MAINNET
  ? 'Phantom signs NinjaPay transfers on its Ethereum network.'
  : 'On testnet, turn on Testnet Mode in Phantom (Settings, Developer Settings, Testnet Mode) so it can sign for Ethereum Sepolia.'
