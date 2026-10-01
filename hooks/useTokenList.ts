'use client'

import { useQuery } from '@tanstack/react-query'
import { NO_TOKENS, tokenMap, type ListedToken, type TokenMap } from '@/lib/injective/token-list'

/**
 * Injective's verified tokens for this network, keyed by lowercase denom.
 * Empty until the list loads, or if it can't be loaded.
 */
export function useTokenList(): TokenMap {
  const { data } = useQuery({
    queryKey: ['token-list'],
    staleTime: 60 * 60_000,
    retry: 1,
    queryFn: async () => {
      const response = await fetch('/api/tokens')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const { tokens } = (await response.json()) as { tokens?: ListedToken[] }
      // An empty list means the server couldn't read it: ask again later.
      if (!Array.isArray(tokens) || tokens.length === 0) throw new Error('Token list unavailable')
      return tokenMap(tokens)
    },
  })
  return data ?? NO_TOKENS
}
