'use client'

import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address, Hash } from 'viem'
import { useEvmSigner } from '@/hooks/useEvmSigner'
import { INJECTIVE_EVM } from '@/lib/injective/network'
import { USDC } from '@/lib/injective/tokens'
import { errorMessage } from '@/lib/injective/transfer-errors'
import {
  newTransferAuthorization,
  serializeAuthorization,
  transferAuthorizationTypedDataJson,
} from '@/lib/injective/usdc-authorization'

export type RelayState =
  | { step: 'idle' }
  | { step: 'signing' }
  | { step: 'sending' }
  /** Handed to the chain: the page follows the hash like any other send. */
  | { step: 'sent'; hash: Hash; confirmed: boolean }
  /** Failed on chain after it was sent; NinjaPay paid the fee. */
  | { step: 'reverted'; hash: Hash; message: string }
  /** Nothing was sent, or it can't be told (`uncertain`). */
  | { step: 'error'; message: string; uncertain?: boolean }

type RelayReply = { status?: string; hash?: Hash; message?: string }

/** Whether this deployment can send USDC for people without INJ. */
async function fetchAvailable(): Promise<boolean> {
  const response = await fetch('/api/relay/usdc', { cache: 'no-store' })
  if (!response.ok) return false
  return ((await response.json()) as { available?: boolean }).available === true
}

/** Turns the route's answer into what the page shows. Only a hash from the chain counts as sent. */
export function relayStateFrom(reply: RelayReply): RelayState {
  const message = reply.message ?? 'NinjaPay could not send this transfer. Nothing was sent.'
  if ((reply.status === 'CONFIRMED' || reply.status === 'SUBMITTED') && reply.hash) {
    return { step: 'sent', hash: reply.hash, confirmed: reply.status === 'CONFIRMED' }
  }
  if (reply.status === 'FAILED' && reply.hash) return { step: 'reverted', hash: reply.hash, message }
  return { step: 'error', message, uncertain: reply.status === 'UNCERTAIN' }
}

/**
 * Sending USDC without INJ, when the server has it set up. The wallet signs
 * an EIP-3009 transfer (eth_signTypedData_v4, no transaction and no fee), and
 * /api/relay/usdc has it submitted with NinjaPay paying the gas.
 */
export function useUsdcRelay() {
  const signer = useEvmSigner()
  const { data: available = false } = useQuery({
    queryKey: ['usdc-relay-available'],
    queryFn: fetchAvailable,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const [state, setState] = useState<RelayState>({ step: 'idle' })

  const send = useCallback(async (to: Address, value: bigint) => {
    if (!signer) return
    const authorization = newTransferAuthorization(signer.address as Address, to, value)
    setState({ step: 'signing' })
    let signature: string
    try {
      signature = await signer.signTypedData(transferAuthorizationTypedDataJson(authorization, INJECTIVE_EVM.id, USDC.evmAddress!))
    } catch (error) {
      setState({ step: 'error', message: errorMessage(error).slice(0, 160) })
      return
    }
    setState({ step: 'sending' })
    try {
      const response = await fetch('/api/relay/usdc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authorization: serializeAuthorization(authorization), signature }),
      })
      const reply = (await response.json().catch(() => ({}))) as RelayReply
      setState(relayStateFrom(reply))
    } catch {
      // The request may have reached the server before the connection dropped.
      setState({
        step: 'error',
        uncertain: true,
        message: "Lost the connection to NinjaPay, so it can't be told whether this transfer went through. Check your USDC balance and activity before you send again.",
      })
    }
  }, [signer])

  const reset = useCallback(() => setState({ step: 'idle' }), [])

  return { available: available && !!signer, state, send, reset }
}
