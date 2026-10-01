'use client'

import { useQuery } from '@tanstack/react-query'
import {
  MSG_MULTI_SEND,
  checkCircuitBreaker,
  checkRecipientHistory,
  checkTokenPermissionsForMany,
  type TransferCheck,
} from '@/lib/injective/transfer-checks'
import { TOKENS, type TokenSymbol } from '@/lib/injective/tokens'

/**
 * Pre-send checks for a payroll run, which goes out as one MsgMultiSend, or
 * as one MsgExec of MsgSends when it's paid from a payroll budget. One
 * blocked recipient fails the whole batch, so every row is checked first:
 * the circuit breaker for `typeUrls`, the token's permission rules for the
 * account paying and each recipient, and whether each recipient has ever
 * been used.
 */
export function usePayrollChecks(
  token: TokenSymbol,
  sender: string | null,
  recipients: (string | null)[],
  typeUrls: string[] = [MSG_MULTI_SEND],
) {
  const ready = !!sender && recipients.length > 0 && recipients.every(Boolean)
  const query = useQuery({
    queryKey: ['payroll-checks', token, sender, recipients, typeUrls],
    enabled: ready,
    staleTime: 30_000,
    queryFn: async (): Promise<TransferCheck[]> => {
      const to = recipients as string[]
      const { denom, symbol } = TOKENS[token]
      const [circuit, permissions, history] = await Promise.all([
        checkCircuitBreaker(typeUrls),
        token === 'INJ' ? null : checkTokenPermissionsForMany(denom, symbol, sender!, to),
        Promise.all(to.map(checkRecipientHistory)),
      ])
      const row = (i: number, check: TransferCheck): TransferCheck => ({ ...check, message: `Row ${i + 1}: ${check.message}` })
      return [
        ...(circuit ? [circuit] : []),
        ...(permissions?.sender ?? []),
        ...(permissions?.recipients.flatMap((checks, i) => checks.map(c => row(i, c))) ?? []),
        ...history.flatMap((check, i) => (check ? [row(i, check)] : [])),
      ]
    },
  })
  const checks = ready ? query.data ?? [] : []
  return {
    checking: ready && query.isFetching,
    blocks: checks.filter(c => c.level === 'block'),
    warnings: checks.filter(c => c.level === 'warn'),
  }
}
