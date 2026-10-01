'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConnectedAccounts } from '@/hooks/useConnectedAccounts'
import { useTokenList } from '@/hooks/useTokenList'
import {
  classifyActivity,
  fetchCosmosPage,
  mergeSources,
  withTokenNames,
  type ActivityPage,
  type EscrowInfo,
  type SourceState,
} from '@/lib/injective/activity'
import { fetchEvmTokenPage, fetchEvmTxPage } from '@/lib/injective/evm-activity'
import { parseAccountAddress } from '@/lib/injective/address'
import { ACTIVITY_EVENT } from '@/lib/injective/live'
import { resolveClaimEscrows } from '@/lib/supabase'

type Source = { key: string; kind: 'cosmos' | 'evm'; load: (cursor: string | null) => Promise<ActivityPage> }
type Loaded = SourceState & { failed: boolean; pages: number }

/** How many pages per source `coverSince` reads on its own before it waits to be asked for more. */
export const AUTO_PAGE_LIMIT = 10

const fetchPages = (targets: Source[], cursors: Record<string, string | null>) =>
  Promise.allSettled(targets.map(s => s.load(cursors[s.key] ?? null)))

const FAILURE: Record<Source['kind'], string> = {
  cosmos: "Couldn't load transfers made with Keplr or Leap from Injective's indexer.",
  evm: "Couldn't load transfers made from your EVM wallet from Blockscout.",
}

/**
 * On-chain activity for every Injective account the user has connected:
 * the Keplr/Leap account and the EVM wallet, each read from Injective's
 * indexer (bank transfers) and Blockscout (EVM transfers), one page at a
 * time. Tokens other than INJ and USDC are named from Injective's token list.
 *
 * With `coverSince` (a time in ms), older pages are read on their own until
 * the history is complete back to that time, up to AUTO_PAGE_LIMIT pages per
 * source at a time; `coveredSince` says how far back it is complete and
 * `readFurther` allows another AUTO_PAGE_LIMIT pages.
 */
export function useActivity({ coverSince }: { coverSince?: number } = {}) {
  const { addresses, mine } = useConnectedAccounts()
  const sources = useMemo<Source[]>(
    () =>
      [...mine].flatMap(inj => {
        const evm = parseAccountAddress(inj)!.evm
        return [
          { key: `cosmos:${inj}`, kind: 'cosmos' as const, load: (c: string | null) => fetchCosmosPage(inj, mine, c) },
          { key: `evm-tx:${evm}`, kind: 'evm' as const, load: (c: string | null) => fetchEvmTxPage(evm, mine, c) },
          { key: `evm-token:${evm}`, kind: 'evm' as const, load: (c: string | null) => fetchEvmTokenPage(evm, mine, c) },
        ]
      }),
    [mine],
  )

  const [loaded, setLoaded] = useState<Record<string, Loaded>>({})
  const [escrows, setEscrows] = useState<Map<string, EscrowInfo>>(new Map())
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageLimit, setPageLimit] = useState(AUTO_PAGE_LIMIT)
  // Pages that arrive after the accounts change or a refresh are dropped.
  const generation = useRef(0)

  /**
   * Stores fetched pages, unless the accounts changed or a refresh started
   * meanwhile. `reset` replaces everything, `more` adds older pages, and
   * `newest` adds a fresh first page without moving where paging has got to.
   */
  const applyPages = useCallback(
    async (run: number, targets: Source[], results: PromiseSettledResult<ActivityPage>[], mode: 'reset' | 'more' | 'newest') => {
      if (run !== generation.current) return
      setLoaded(previous => {
        const next = mode === 'reset' ? {} : { ...previous }
        targets.forEach((source, i) => {
          const result = results[i]
          const before = next[source.key]
          if (mode === 'newest' && before) {
            // Duplicates are dropped when sources are merged.
            if (result.status === 'fulfilled') next[source.key] = { ...before, drafts: [...before.drafts, ...result.value.drafts] }
          } else if (result.status === 'fulfilled') {
            next[source.key] = {
              drafts: [...(before?.drafts ?? []), ...result.value.drafts],
              next: result.value.next,
              reached: result.value.reached ?? before?.reached ?? null,
              failed: false,
              pages: (before?.pages ?? 0) + 1,
            }
          } else {
            // Stop paging a source that failed; Refresh tries it again.
            next[source.key] = { drafts: before?.drafts ?? [], next: null, reached: before?.reached ?? null, failed: true, pages: before?.pages ?? 0 }
          }
        })
        return next
      })

      // Label claim activity by matching counterparties to claim escrows.
      const counterparties = new Set(
        results.flatMap(r => (r.status === 'fulfilled' ? r.value.drafts.map(d => d.counterparty) : [])).filter(a => a.startsWith('inj1')),
      )
      if (counterparties.size) {
        const found = await resolveClaimEscrows([...counterparties]).catch(() => new Map<string, EscrowInfo>())
        if (run === generation.current && found.size) setEscrows(previous => new Map([...previous, ...found]))
      }
    },
    [],
  )

  const loadPages = useCallback(
    async (targets: Source[], cursors: Record<string, string | null>, mode: 'reset' | 'more') => {
      const run = ++generation.current
      await applyPages(run, targets, await fetchPages(targets, cursors), mode)
    },
    [applyPages],
  )

  // First page of every source whenever the connected accounts change.
  useEffect(() => {
    const run = ++generation.current
    fetchPages(sources, {}).then(results => applyPages(run, sources, results, 'reset'))
  }, [sources, applyPages])

  // New activity seen by the live watcher (components/LivePayments): read the newest page again.
  useEffect(() => {
    const onActivity = () => {
      const run = generation.current
      fetchPages(sources, {}).then(results => applyPages(run, sources, results, 'newest'))
    }
    window.addEventListener(ACTIVITY_EVENT, onActivity)
    return () => window.removeEventListener(ACTIVITY_EVENT, onActivity)
  }, [sources, applyPages])

  const refetch = useCallback(async () => {
    setRefreshing(true)
    await loadPages(sources, {}, 'reset')
    setRefreshing(false)
  }, [sources, loadPages])

  /** Each source with another page; with `until`, only those not yet read back that far. */
  const nextPages = useCallback(
    (until?: number) => {
      const targets = sources.filter(s => {
        const state = loaded[s.key]
        return state?.next && (until === undefined || !state.reached || state.reached.getTime() > until)
      })
      return { targets, cursors: Object.fromEntries(targets.map(s => [s.key, loaded[s.key].next])) }
    },
    [sources, loaded],
  )

  const loadMore = useCallback(async () => {
    const { targets, cursors } = nextPages()
    if (targets.length === 0) return
    setLoadingMore(true)
    await loadPages(targets, cursors, 'more')
    setLoadingMore(false)
  }, [nextPages, loadPages])

  const tokens = useTokenList()
  const { items, hasMore, coveredSince } = useMemo(() => {
    const merged = mergeSources(sources.map(s => loaded[s.key]).filter(Boolean))
    return {
      items: withTokenNames(classifyActivity(merged.drafts, mine, escrows), tokens),
      hasMore: merged.hasMore,
      coveredSince: merged.coveredSince,
    }
  }, [sources, loaded, mine, escrows, tokens])

  const loading = refreshing || sources.some(s => !loaded[s.key])

  // Read further back until the history is complete to `coverSince`.
  const pagesRead = Math.max(0, ...sources.map(s => loaded[s.key]?.pages ?? 0))
  const short = coverSince !== undefined && coveredSince !== null && coveredSince.getTime() > coverSince
  const autoLoad = short && !loading && !loadingMore && pagesRead < pageLimit
  useEffect(() => {
    if (!autoLoad) return
    const { targets, cursors } = nextPages(coverSince)
    if (targets.length === 0) return
    const run = ++generation.current
    fetchPages(targets, cursors).then(results => applyPages(run, targets, results, 'more'))
  }, [autoLoad, coverSince, nextPages, applyPages])

  const failed = sources.filter(s => loaded[s.key]?.failed)
  const allFailed = sources.length > 0 && failed.length === sources.length
  const warnings = allFailed ? [] : [...new Set(failed.map(s => FAILURE[s.kind]))]

  return {
    items,
    loading,
    error: allFailed ? 'Could not load transaction history. Try again.' : null,
    warnings,
    hasMore,
    coveredSince,
    /** True when `coverSince` stopped at the page limit before reaching it; `readFurther` continues. */
    stoppedShort: short && !autoLoad && !loading && !loadingMore,
    readFurther: () => setPageLimit(pagesRead + AUTO_PAGE_LIMIT),
    loadingMore: loadingMore || autoLoad,
    loadMore,
    refetch,
    addresses,
  }
}
