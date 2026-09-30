import { Network } from '@injectivelabs/networks'
import { ChainId } from '@injectivelabs/ts-types'

// Network configuration
export const NETWORK: Network = Network.Testnet // Switch to Network.Mainnet for production
export const CHAIN_ID = ChainId.Testnet

// Exchange market IDs
export const MARKETS = {
  INJ_USDC: 'INJ/USDC',
}

// Backend configuration
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

// Supabase configuration
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Escrow wallet address (backend will manage this)
export const ESCROW_WALLET = process.env.NEXT_PUBLIC_ESCROW_WALLET || ''
