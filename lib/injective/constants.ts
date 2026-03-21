import { Network } from '@injectivelabs/networks'
import { ChainId } from '@injectivelabs/ts-types'

// Network configuration
export const NETWORK = Network.Testnet // Switch to Network.Mainnet for production
export const CHAIN_ID = ChainId.Testnet

// Token denominations
export const DENOMS = {
  INJ: 'inj',
  // USDC denom on Injective
  // Mainnet: canonical USDC address from Circle's Cross-Chain Transfer Protocol (peggy0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)
  // Testnet: Polygon bridged USDC preview address
  USDC: 'peggy0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Testnet USDC
}

// Exchange market IDs
export const MARKETS = {
  INJ_USDC: 'INJ/USDC',
}

// USDC Testnet Configuration
export const USDC_TESTNET_CONFIG = {
  // Testnet USDC contract/denom configurations
  bankDenom: DENOMS.USDC, // Bank native USDC
  cwTokenAddress: process.env.NEXT_PUBLIC_NUSDC_CONTRACT || 'inj1...', // nUSDC wrapped token (if applicable)
  decimals: 6,
}

// For testnet, verify denoms and market IDs
// Check @injectivelabs/networks for current testnet config

// Backend configuration
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

// Supabase configuration
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Escrow wallet address (backend will manage this)
export const ESCROW_WALLET = process.env.NEXT_PUBLIC_ESCROW_WALLET || ''
