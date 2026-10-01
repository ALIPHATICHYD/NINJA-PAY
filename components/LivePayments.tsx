'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useConnectedAccounts } from '@/hooks/useConnectedAccounts'
import { useTokenList } from '@/hooks/useTokenList'
import { formatCoin, mergeSources, fetchCosmosPage, type ActivityDraft } from '@/lib/injective/activity'
import { fetchEvmTokenPage, fetchEvmTxPage } from '@/lib/injective/evm-activity'
import { parseAccountAddress, shortAddress } from '@/lib/injective/address'
import { ACTIVITY_EVENT, takeNew, watchPortfolio, watchTokensReceived } from '@/lib/injective/live'
import { labelDenom } from '@/lib/injective/token-list'

/** After a signal, history is read again at these delays, since indexers can lag the chain by a few seconds. */
const CHECK_DELAYS_MS = [1_500, 8_000]
/** Transfers this much older than the page opening are history, not news. Allows for clock differences. */
const RECENT_MS = 2 * 60_000
const NOTICE_MS = 12_000
const MAX_NOTICES = 3

/**
 * Watches the connected accounts while the dashboard is open. When the chain
 * signals a change it re-reads balances and the newest history, tells open
 * history pages to do the same, and shows a notice for each new transfer
 * received. Everything shown is read from the chain's indexers, never from
 * the signal itself.
 */
export function LivePayments() {
  const { addresses, mine } = useConnectedAccounts()
  const queryClient = useQueryClient()
  const tokens = useTokenList()
  const [notices, setNotices] = useState<ActivityDraft[]>([])

  useEffect(() => {
    if (addresses.length === 0) return
    const since = Date.now() - RECENT_MS
    const seen = new Set<string>()
    let timers: ReturnType<typeof setTimeout>[] = []
    let stopped = false

    const check = async () => {
      const pages = await Promise.allSettled(
        addresses.flatMap(inj => {
          const evm = parseAccountAddress(inj)!.evm
          return [fetchCosmosPage(inj, mine, null), fetchEvmTxPage(evm, mine, null), fetchEvmTokenPage(evm, mine, null)]
        }),
      )
      if (stopped) return
      const loaded = pages.flatMap(page => (page.status === 'fulfilled' ? [{ ...page.value, next: null }] : []))
      const fresh = takeNew(mergeSources(loaded).drafts, seen, since)
      if (fresh.length === 0) return
      window.dispatchEvent(new Event(ACTIVITY_EVENT))
      const received = fresh.filter(d => d.direction === 'in' && d.success && d.coins.some(c => c.verified))
      if (received.length) setNotices(current => [...current, ...received].slice(-MAX_NOTICES))
    }

    const onSignal = () => {
      void queryClient.invalidateQueries({ queryKey: ['bank-balances'] })
      timers.forEach(clearTimeout)
      timers = CHECK_DELAYS_MS.map(ms => setTimeout(() => void check().catch(() => {}), ms))
    }

    const stops = addresses.flatMap(inj => [
      watchPortfolio(inj, onSignal),
      watchTokensReceived(parseAccountAddress(inj)!.evm as Address, onSignal),
    ])
    return () => {
      stopped = true
      timers.forEach(clearTimeout)
      stops.forEach(stop => stop())
    }
  }, [addresses, mine, queryClient])

  const dismiss = useCallback((hash: string) => setNotices(current => current.filter(n => n.hash !== hash)), [])

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', right: '16px', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', zIndex: 60,
        display: 'flex', flexDirection: 'column', gap: '8px', width: 'min(360px, calc(100vw - 32px))', pointerEvents: 'none',
      }}
    >
      {notices.map(notice => (
        <Notice key={`${notice.hash}|${notice.counterparty}`} notice={notice} tokens={tokens} onDismiss={dismiss} />
      ))}
    </div>
  )
}

type NoticeProps = { notice: ActivityDraft; tokens: ReturnType<typeof useTokenList>; onDismiss: (hash: string) => void }

function Notice({ notice, tokens, onDismiss }: NoticeProps) {
  const { hash } = notice
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(hash), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [hash, onDismiss])

  const coins = notice.coins.filter(c => c.verified).map(c => formatCoin({ ...c, ...labelDenom(c.denom, tokens) }, 6))
  return (
    <div
      style={{
        pointerEvents: 'auto', display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 14px 14px 16px',
        background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '12px',
        boxShadow: '0 8px 24px var(--shadow-tint)',
      }}
    >
      <ArrowDownLeft size={18} aria-hidden="true" style={{ color: 'var(--success)', flexShrink: 0, marginTop: '2px' }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Payment received</p>
        <p style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
          +{coins.join(', +')}
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', overflowWrap: 'anywhere' }}>
          From {shortAddress(notice.counterparty)}
        </p>
        <Link href={`/receipt/${notice.hash}`} style={{ display: 'inline-block', fontSize: '12px', color: 'var(--accent-text)', marginTop: '6px' }}>
          Receipt
        </Link>
      </div>
      <button
        onClick={() => onDismiss(hash)}
        aria-label="Dismiss"
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
