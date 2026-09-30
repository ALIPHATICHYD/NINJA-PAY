// Network configuration lives in network.ts (set NEXT_PUBLIC_INJECTIVE_NETWORK).
export { NETWORK, CHAIN_ID } from './network'

// Backend configuration
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

// Supabase configuration
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
