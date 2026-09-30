'use client'

import { useQuery } from '@tanstack/react-query'
import {
  MSG_ETHEREUM_TX,
  MSG_SEND,
  checkCircuitBreaker,
  checkRecipientHistory,
  checkTokenPermissions,
  type TransferCheck,
} from '@/lib/injective/transfer-checks'
import { TOKENS, type TokenSymbol } from '@/lib/injective/tokens'

/**
 * Pre-send checks for one transfer: the circuit breaker for the message type
 * it will use, the token's permission rules, and whether the recipient has
 * ever been used. INJ goes out as an EVM transaction, USDC as a bank MsgSend.
 */
export function useTransferChecks(token: TokenSymbol, sender: string | null, recipient: string | null) {
  const query = useQuery({
    queryKey: ['transfer-checks', token, sender, recipient],
    enabled: !!sender && !!recipient,
    staleTime: 30_000,
    queryFn: async (): Promise<TransferCheck[]> => {
      const { denom, symbol } = TOKENS[token]
      const [circuit, permissions, history] = await Promise.all([
        checkCircuitBreaker([token === 'INJ' ? MSG_ETHEREUM_TX : MSG_SEND]),
        token === 'INJ' ? Promise.resolve([]) : checkTokenPermissions(denom, symbol, sender!, recipient!),
        checkRecipientHistory(recipient!),
      ])
      return [circuit, ...permissions, history].filter((c): c is TransferCheck => c !== null)
    },
  })
  const checks = query.data ?? []
  return {
    checking: query.isFetching,
    blocks: checks.filter(c => c.level === 'block'),
    warnings: checks.filter(c => c.level === 'warn'),
  }
}
