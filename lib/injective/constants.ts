import { Network } from '@injectivelabs/networks'
import { ChainId } from '@injectivelabs/ts-types'

// Network configuration
export const NETWORK = Network.Testnet // Switch to Network.Mainnet for production
export const CHAIN_ID = ChainId.Testnet

// Token denominations
export const DENOMS = {
  INJ: 'inj',
  // USDT denom depends on network — update based on bridge token used
  USDT: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7', // Mainnet bridged USDT
  // For testnet, typically: USDT_TESTNET = 'factory/inj1q6zlut7ghrst....'
}

// Exchange market IDs
export const MARKETS = {
  INJ_USDT: 'INJ/USDT',
}

// For testnet, you may need to adjust denoms and market IDs
// Check @injectivelabs/networks for current testnet config

// Backend configuration
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

// Supabase configuration
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Escrow wallet address (backend will manage this)
export const ESCROW_WALLET = process.env.NEXT_PUBLIC_ESCROW_WALLET || ''
