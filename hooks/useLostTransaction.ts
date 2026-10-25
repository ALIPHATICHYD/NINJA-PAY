'use client'

import { useEffect, useRef, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { INJECTIVE_EVM } from '@/lib/injective/network'
import { findSentTx } from '@/lib/injective/evm-activity'

const POLL_MS = 4_000
const IDLE_POLL_MS = 15_000

/**
 * The hash of a transaction the wallet sent while the page was still waiting for its answer.
 *
 * A wallet opened in another app (MetaMask from Leap's browser) can send the transaction and
 * never hand the hash back, which left Send spinning after the INJ had gone. The account's
 * nonce is kept up to date while nothing is pending, so it is known from before the wallet
 * opened (the page may be paused as soon as it does). While `waiting`, once the nonce moves
 * past that, the transaction with that nonce is read from Blockscout. `round` (the request's
 * submittedAt) keeps one request's answer from showing for the next.
 */
export function useLostTransaction(waiting: boolean, address: string | null, round: number): `0x${string}` | undefined {
  const client = usePublicClient({ chainId: INJECTIVE_EVM.id })
  const [found, setFound] = useState<{ round: number; hash: `0x${string}` } | null>(null)
  const idleNonce = useRef<{ address: string; nonce: number } | null>(null)

  useEffect(() => {
    if (!address || !client) return
    const account = address as `0x${string}`
    const readNonce = () => client.getTransactionCount({ address: account, blockTag: 'latest' })
    let stopped = false

    if (!waiting) {
      const remember = () => {
        readNonce().then(nonce => { if (!stopped) idleNonce.current = { address, nonce } }).catch(() => undefined)
      }
      remember()
      const timer = setInterval(remember, IDLE_POLL_MS)
      return () => { stopped = true; clearInterval(timer) }
    }

    let start = idleNonce.current?.address === address ? idleNonce.current.nonce : null
    const check = async () => {
      try {
        const nonce = await readNonce()
        if (start === null) { start = nonce; return }
        if (nonce <= start) return
        const hash = await findSentTx(account, start)
        if (hash && !stopped) setFound({ round, hash: hash as `0x${string}` })
      } catch {
        // Checked again on the next tick.
      }
    }
    void check()
    const timer = setInterval(check, POLL_MS)
    // Phones pause timers in the background, so check as soon as the page is back.
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [waiting, address, client, round])

  return waiting && found?.round === round ? found.hash : undefined
}
