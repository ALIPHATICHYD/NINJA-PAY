'use client'

import { useQueries } from '@tanstack/react-query'
import { lookupName, parseRecipientInput, resolveInjName } from '@/lib/injective/names'
import { parseAccountAddress, type AccountAddress } from '@/lib/injective/address'

export type Recipient = {
  /** What was typed: an address, a .inj name, nothing, or neither. */
  kind: 'empty' | 'address' | 'name' | 'invalid'
  /** The account to pay, once known. */
  account: AccountAddress | null
  /** The typed .inj name, or a typed address's verified primary name. */
  name: string | null
  resolving: boolean
  /** True when a name couldn't be looked up because the chain didn't answer. */
  lookupFailed: boolean
  /** Why there's no account to pay, as a sentence. */
  error: string | null
}

const INVALID = 'Enter a valid inj1… or 0x… address, or a .inj name.'
const BAD_NAME = 'That isn\'t a .inj name. Names are at least 3 lowercase letters, digits or hyphens, then .inj.'

/**
 * Recipient fields that take an inj1… or 0x… address or a .inj name. Names
 * are resolved through INS; typed addresses get their primary name, if it
 * resolves back to them, for display only.
 */
export function useRecipients(inputs: string[]): Recipient[] {
  const parsed = inputs.map(parseRecipientInput)
  const results = useQueries({
    queries: parsed.map(p =>
      p.kind === 'name'
        ? { queryKey: ['ins', 'resolve', p.name], queryFn: () => resolveInjName(p.name), staleTime: 60_000, retry: 1 }
        : p.kind === 'address'
          ? {
              queryKey: ['ins', 'name-of', p.account.injective],
              queryFn: () => lookupName(p.account.injective).catch(() => null),
              staleTime: 5 * 60_000,
              retry: false,
            }
          : { queryKey: ['ins', 'none'], queryFn: () => null, enabled: false },
    ),
  })

  return parsed.map((p, i): Recipient => {
    const { data, isPending, isError } = results[i]
    switch (p.kind) {
      case 'empty':
        return { kind: 'empty', account: null, name: null, resolving: false, lookupFailed: false, error: null }
      case 'invalid':
        return { kind: 'invalid', account: null, name: null, resolving: false, lookupFailed: false, error: INVALID }
      case 'bad-name':
        return { kind: 'name', account: null, name: null, resolving: false, lookupFailed: false, error: BAD_NAME }
      case 'address':
        return { kind: 'address', account: p.account, name: data ?? null, resolving: false, lookupFailed: false, error: null }
      case 'name': {
        const account = data ? parseAccountAddress(data) : null
        const error = isError
          ? `Couldn't look up ${p.name} on Injective. Try again, or paste the address instead.`
          : !isPending && !account ? `No address is set for ${p.name}.` : null
        return { kind: 'name', account, name: p.name, resolving: isPending && !isError, lookupFailed: isError, error }
      }
    }
  })
}

export function useRecipient(input: string): Recipient {
  return useRecipients([input])[0]
}
