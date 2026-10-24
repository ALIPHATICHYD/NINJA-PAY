'use client'

import { use, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Gift, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { useWallet } from '@/hooks/useWallet'
import { useChainHealth } from '@/hooks/useChainHealth'
import { ChainHealthNotice } from '@/components/ChainHealthNotice'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { getClaimPoolByLink, getClaimByClaimer, isSupabaseConfigured } from '@/lib/supabase'
import { CLAIM_IN_PROGRESS_MESSAGE, type Settled } from '@/lib/claim-recovery'
import { confirmPaid, freeStale, recordPayout, release, reserveShare, settle } from '@/lib/claims-client'
import { PAYOUT_UNCERTAIN_MESSAGE, PayoutUncertainError } from '@/lib/injective/link-broadcast'
import { toInjectiveAddress } from '@/lib/injective/address'
import {
  escrowAddressFromKey,
  readKeyFromFragment,
  readKindFromFragment,
  payShareFromEscrow,
  type ClaimLinkKind,
} from '@/lib/injective/claim-escrow'
import { LINK_CANCELLED_MESSAGE, fetchGrantLinkState, payShareFromGrant } from '@/lib/injective/claim-grant'
import type { ClaimPool } from '@/lib/injective/types'
import { explorerName, explorerTxUrl } from '@/lib/injective/network'

type Status =
  | { type: 'idle' }
  | { type: 'error'; message: string }
  | { type: 'success'; message: string; txHash: string }
  /** Sent, but not yet seen on chain: the share stays reserved. */
  | { type: 'pending'; message: string; txHash: string }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-page text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/brand/ninja-mark.svg" alt="" width={32} height={32} className="rounded-md" />
            <span className="text-[17px] font-bold tracking-tight">NinjaPay</span>
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 sm:p-8">{children}</div>
      </main>
    </div>
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <AlertCircle size={28} strokeWidth={1.75} className="text-coral" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{body}</p>
    </Shell>
  )
}

export default function PublicClaimPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = use(params)
  const chainHealth = useChainHealth('cosmos')

  const { address: evmAddress } = useWallet()
  const {
    userAddress: cosmosAddress,
    loading: cosmosLoading,
    error: cosmosError,
    initializeWallet,
  } = useCosmosTransaction()

  // A 0x wallet address and its inj1 form are the same account.
  const claimerAddress = cosmosAddress ?? toInjectiveAddress(evmAddress)

  const [pool, setPool] = useState<ClaimPool | null>(null)
  const [loading, setLoading] = useState(true)
  const [escrowKey, setEscrowKey] = useState<string | null>(null)
  const [kind, setKind] = useState<ClaimLinkKind>('escrow')
  // For a link paid from the sender's wallet: when it stops paying out, or null once it has ended.
  const [grantEnds, setGrantEnds] = useState<Date | null | 'unknown'>('unknown')
  const [keyMismatch, setKeyMismatch] = useState(false)
  const [claimedCount, setClaimedCount] = useState(0)
  const [alreadyClaimed, setAlreadyClaimed] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [status, setStatus] = useState<Status>({ type: 'idle' })

  // Load the pool and read the escrow key from the URL fragment (never sent to a server).
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    let active = true
    ;(async () => {
      try {
        // The pool and its claims come back from one query.
        const found = await getClaimPoolByLink(claimId)
        if (!active) return
        const p = found?.pool ?? null
        const key = readKeyFromFragment(window.location.hash)
        const linkKind = readKindFromFragment(window.location.hash)
        if (p?.escrowAddress && p.token && linkKind === 'grant') {
          fetchGrantLinkState(p.creatorAddress, p.escrowAddress, p.token)
            .then(state => { if (active) setGrantEnds(state.remaining ? state.expiresAt : null) })
            .catch(() => {}) // Leave it unknown; the claim itself reads the chain again.
        }
        // Counted before the pool is set, so settling this claimer's own claim below adds to the count.
        const claims = found?.claims ?? []
        setPool(p)
        setEscrowKey(key)
        setKind(linkKind)
        if (p?.escrowAddress && key) setKeyMismatch(escrowAddressFromKey(key) !== p.escrowAddress)
        setClaimedCount(claims.filter(c => c.status === 'paid').length)
      } catch {
        if (active) setPool(null)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [claimId])

  // A claim this address started before: see how it ended, from the chain.
  useEffect(() => {
    if (!pool || !claimerAddress) return
    let active = true
    getClaimByClaimer(pool.id, claimerAddress).then(async claim => {
      if (!claim) return
      const settled = await settle(claim).catch((): Settled => (claim.status === 'paid' ? 'paid' : 'pending'))
      if (!active) return
      if (settled === 'paid') {
        setAlreadyClaimed(true)
        if (claim.status !== 'paid') setClaimedCount(n => n + 1)
      } else if (settled === 'pending' && claim.txHash) {
        setStatus({ type: 'pending', message: PAYOUT_UNCERTAIN_MESSAGE, txHash: claim.txHash })
      }
    })
    return () => { active = false }
  }, [pool, claimerAddress])

  const handleClaim = async () => {
    if (!pool || !escrowKey || !claimerAddress || !pool.token) return
    setClaiming(true)
    setStatus({ type: 'idle' })

    try {
      // Finish a claim this address started before, rather than start another.
      const earlier = await getClaimByClaimer(pool.id, claimerAddress)
      if (earlier) {
        const settled = await settle(earlier)
        if (settled === 'paid') {
          setAlreadyClaimed(true)
          if (earlier.status !== 'paid') setClaimedCount(n => n + 1)
          return
        }
        if (settled === 'pending') {
          setStatus(earlier.txHash
            ? { type: 'pending', message: PAYOUT_UNCERTAIN_MESSAGE, txHash: earlier.txHash }
            : { type: 'error', message: CLAIM_IN_PROGRESS_MESSAGE })
          return
        }
      }

      let reservation = await reserveShare(pool, claimerAddress, escrowKey)
      // The link looks full: free shares left by claims that never finished, then look again.
      if ('error' in reservation && reservation.error === 'fully-claimed' && (await freeStale(pool.id)) > 0) {
        reservation = await reserveShare(pool, claimerAddress, escrowKey)
      }
      if ('error' in reservation) {
        setStatus({
          type: 'error',
          message: reservation.error === 'already-claimed'
            ? 'This address has already claimed from this pool.'
            : 'All shares in this pool have been claimed.',
        })
        if (reservation.error === 'already-claimed') setAlreadyClaimed(true)
        return
      }

      const { record } = reservation
      const share = pool.shares[record.shareIndex]
      if (!share?.amountBase) {
        await release(record.id, escrowKey)
        throw new Error('This share has no payable amount.')
      }

      try {
        // Each payout's hash is saved on the reservation before it is sent.
        const onSigned = (hash: string) => recordPayout(record.id, hash, escrowKey)
        const txHash = kind === 'grant'
          ? await payShareFromGrant(escrowKey, pool.creatorAddress, claimerAddress, pool.token, share.amountBase, { onSigned })
          : await payShareFromEscrow(escrowKey, claimerAddress, pool.token, share.amountBase, { onSigned })
        await confirmPaid(record, txHash)
        setAlreadyClaimed(true)
        setClaimedCount(n => n + 1)
        setStatus({ type: 'success', message: `You received ${share.amount} ${pool.token}.`, txHash })
      } catch (payoutError) {
        if (payoutError instanceof PayoutUncertainError) {
          // It may have landed, so the share stays reserved. Opening the link again settles it.
          setStatus({ type: 'pending', message: payoutError.message, txHash: payoutError.txHash })
          return
        }
        // Nothing was paid, so free the share for someone else.
        await release(record.id, escrowKey).catch(() => {})
        throw payoutError
      }
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error && error.message ? error.message : 'Claim failed. Please try again.' })
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="skeleton h-7 w-40" />
        <div className="skeleton mt-4 h-4 w-full" />
        <div className="skeleton mt-2 h-4 w-2/3" />
      </Shell>
    )
  }

  if (!isSupabaseConfigured) {
    return <Notice title="Claims are unavailable" body="This NinjaPay instance has no database configured, so claim links cannot be loaded." />
  }
  if (!pool) {
    return <Notice title="Claim not found" body="This claim link does not exist. Check that you copied the whole link." />
  }
  if (!pool.escrowAddress || !pool.token) {
    return <Notice title="This link cannot be claimed" body="It was created before claim links held funds, so there is nothing to pay out." />
  }
  if (!escrowKey) {
    return <Notice title="This link is incomplete" body="The part of the link after # is missing. Ask the sender for the full link." />
  }
  if (keyMismatch) {
    return <Notice title="This link does not match its pool" body="The key in this link belongs to a different claim pool. Ask the sender for the correct link." />
  }
  // Once every share is claimed, or this address has its share, the usual messages below say so.
  if (kind === 'grant' && grantEnds === null && status.type !== 'success' && !alreadyClaimed && claimedCount < pool.shares.length) {
    return <Notice title="This link has ended" body={LINK_CANCELLED_MESSAGE} />
  }

  const total = pool.shares.length
  const remaining = Math.max(total - claimedCount, 0)
  const shareAmount = pool.shares[0]?.amount

  return (
    <Shell>
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-ocean-subtle text-ocean-text">
        <Gift size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{pool.name || 'You have tokens to claim'}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        {total === 1 ? 'One share' : `${total} equal shares`} of {pool.totalAmount} {pool.token} on Injective.
        {kind === 'grant' && (
          <> Paid straight from the sender&rsquo;s wallet{grantEnds instanceof Date ? `, until ${grantEnds.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}. You don&rsquo;t need INJ to claim.</>
        )}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-line bg-page-2 p-4">
        <div className="flex flex-col-reverse">
          <dt className="mt-1 text-sm text-ink-3">Your share</dt>
          <dd className="font-mono text-xl font-medium">{shareAmount} {pool.token}</dd>
        </div>
        <div className="flex flex-col-reverse">
          <dt className="mt-1 text-sm text-ink-3">Shares left</dt>
          <dd className="font-mono text-xl font-medium">{remaining} of {total}</dd>
        </div>
      </dl>

      <div className="mt-6">
        {status.type === 'success' ? (
          <div className="rounded-xl border border-line bg-page-2 p-4">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <CheckCircle2 size={18} strokeWidth={1.75} className="text-[var(--success)]" aria-hidden="true" />
              {status.message}
            </p>
            <a
              href={explorerTxUrl(status.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm text-ocean-text underline underline-offset-4"
            >
              View on {explorerName(status.txHash)} <ExternalLink size={13} aria-hidden="true" />
            </a>
          </div>
        ) : status.type === 'pending' ? (
          <div className="rounded-xl border border-line bg-page-2 p-4">
            <p className="text-[15px] text-ink-2">{status.message}</p>
            <a
              href={explorerTxUrl(status.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm text-ocean-text underline underline-offset-4"
            >
              Look it up on {explorerName(status.txHash)} <ExternalLink size={13} aria-hidden="true" />
            </a>
          </div>
        ) : alreadyClaimed ? (
          <p className="rounded-xl border border-line bg-page-2 p-4 text-[15px] text-ink-2">
            This address has already claimed its share.
          </p>
        ) : remaining === 0 ? (
          <p className="rounded-xl border border-line bg-page-2 p-4 text-[15px] text-ink-2">All shares have been claimed.</p>
        ) : !claimerAddress ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-2">Connect the wallet that should receive your share.</p>
            <button
              onClick={initializeWallet}
              disabled={cosmosLoading}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ocean px-6 py-3 text-[15px] font-semibold text-snow transition hover:bg-ocean-hover active:scale-[0.98] disabled:opacity-50"
            >
              {cosmosLoading ? 'Connecting…' : 'Connect Keplr or Leap'}
            </button>
            <div className="flex justify-center">
              <ConnectButton label="Use an EVM wallet" showBalance={false} chainStatus="none" />
            </div>
            {cosmosError && <p className="text-sm text-coral">{cosmosError}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
          <ChainHealthNotice state={chainHealth} />
          <button
            onClick={handleClaim}
            disabled={claiming || !chainHealth.canSend}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ocean px-6 py-3.5 text-[15px] font-semibold text-snow transition hover:bg-ocean-hover active:scale-[0.98] disabled:opacity-50"
          >
            {claiming ? <><span className="spinner" /> Claiming…</> : `Claim ${shareAmount} ${pool.token}`}
          </button>
          </div>
        )}

        {status.type === 'error' && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-coral">
            <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
            {status.message}
          </p>
        )}
      </div>

      {claimerAddress && (
        <p className="mt-6 border-t border-line pt-4 font-mono text-xs text-ink-3">
          Receiving to {claimerAddress.slice(0, 12)}…{claimerAddress.slice(-6)}
        </p>
      )}
    </Shell>
  )
}
