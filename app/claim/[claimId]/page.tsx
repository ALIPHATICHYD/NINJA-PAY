'use client'

import { use, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { getInjectiveAddress } from '@injectivelabs/sdk-ts'
import { Gift, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { useWallet } from '@/hooks/useWallet'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import {
  getClaimPoolByLink,
  getClaimsForPools,
  getClaimByClaimer,
  reserveClaimShare,
  markClaimPaid,
  releaseClaim,
  isSupabaseConfigured,
} from '@/lib/supabase'
import { escrowAddressFromKey, readKeyFromFragment, payShareFromEscrow } from '@/lib/injective/claim-escrow'
import type { ClaimPool } from '@/lib/injective/types'
import { EXPLORER_TX_URL } from '@/lib/injective/activity'

type Status =
  | { type: 'idle' }
  | { type: 'error'; message: string }
  | { type: 'success'; message: string; txHash: string }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-page text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/favicon.png" alt="" width={32} height={32} className="rounded-md" />
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

  const { address: evmAddress } = useWallet()
  const {
    userAddress: cosmosAddress,
    loading: cosmosLoading,
    error: cosmosError,
    initializeWallet,
  } = useCosmosTransaction()

  // Injective EVM and Cosmos addresses share a key, so a 0x address maps to an inj1 address.
  const claimerAddress = cosmosAddress ?? (evmAddress ? getInjectiveAddress(evmAddress) : null)

  const [pool, setPool] = useState<ClaimPool | null>(null)
  const [loading, setLoading] = useState(true)
  const [escrowKey, setEscrowKey] = useState<string | null>(null)
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
        const p = await getClaimPoolByLink(claimId)
        if (!active) return
        setPool(p)
        const key = readKeyFromFragment(window.location.hash)
        setEscrowKey(key)
        if (p?.escrowAddress && key) setKeyMismatch(escrowAddressFromKey(key) !== p.escrowAddress)
        if (p) {
          const claims = await getClaimsForPools([p.id])
          if (active) setClaimedCount(claims.filter(c => c.status === 'paid').length)
        }
      } catch {
        if (active) setPool(null)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [claimId])

  useEffect(() => {
    if (!pool || !claimerAddress) return
    getClaimByClaimer(pool.id, claimerAddress).then(c => setAlreadyClaimed(c?.status === 'paid'))
  }, [pool, claimerAddress])

  const handleClaim = async () => {
    if (!pool || !escrowKey || !claimerAddress || !pool.token) return
    setClaiming(true)
    setStatus({ type: 'idle' })

    try {
      const reservation = await reserveClaimShare(pool, claimerAddress)
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
        await releaseClaim(record.id)
        throw new Error('This share has no payable amount.')
      }

      try {
        const txHash = await payShareFromEscrow(escrowKey, claimerAddress, pool.token, share.amountBase)
        await markClaimPaid(record.id, txHash)
        setAlreadyClaimed(true)
        setClaimedCount(n => n + 1)
        setStatus({ type: 'success', message: `You received ${share.amount} ${pool.token}.`, txHash })
      } catch (payoutError) {
        // Nothing was paid, so free the share for someone else.
        await releaseClaim(record.id)
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
              href={`${EXPLORER_TX_URL}${status.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm text-ocean-text underline underline-offset-4"
            >
              View transaction <ExternalLink size={13} aria-hidden="true" />
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
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ocean px-6 py-3.5 text-[15px] font-semibold text-snow transition hover:bg-ocean-hover active:scale-[0.98] disabled:opacity-50"
          >
            {claiming ? <><span className="spinner" /> Claiming…</> : `Claim ${shareAmount} ${pool.token}`}
          </button>
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
