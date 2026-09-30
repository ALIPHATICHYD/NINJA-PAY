'use client'

import { useState } from 'react'
import { eachDayOfInterval, eachWeekOfInterval, format, isAfter, startOfDay, startOfWeek, subDays } from 'date-fns'
import { RefreshCcw } from 'lucide-react'
import { useWallet } from '@/hooks/useWallet'
import { usePrices } from '@/hooks/usePrices'
import { useActivity } from '@/hooks/useActivity'
import { NETWORK_LABEL } from '@/lib/injective/network'
import { ACTIVITY_LABELS, coinValue, type ActivityItem, type ActivityType } from '@/lib/injective/activity'
import { formatUsd, sumUsd, usdValue } from '@/lib/prices'

type Period = '7D' | '30D' | '90D'

const PERIOD_DAYS: Record<Period, number> = { '7D': 7, '30D': 30, '90D': 90 }

const TYPE_COLORS: Record<ActivityType, string> = {
  send: 'var(--accent)',
  receive: 'var(--success)',
  'claim-fund': 'var(--inj-color)',
  'claim-received': 'var(--inj-color)',
  'claim-reclaim': 'var(--text-muted)',
  payroll: 'var(--warning)',
}

export default function AnalyticsPage() {
  const { isConnected } = useWallet()
  const { prices, loading: pricesLoading } = usePrices()
  const { items, loading, error, refetch } = useActivity()
  const [period, setPeriod] = useState<Period>('30D')
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to view analytics.</div>
      </div>
    )
  }

  // USD value of a transfer at today's Injective oracle price, or null when a token in it has no fresh price.
  const txUsd = (tx: ActivityItem) => sumUsd(tx.coins.map(c => usdValue(coinValue(c), c.token, prices)))

  const now = new Date()
  const start = startOfDay(subDays(now, PERIOD_DAYS[period] - 1))
  const periodTxs = items.filter(tx => tx.success && !isAfter(start, tx.timestamp))

  // Claim reclaims are your own funds coming back, so they are not counted as volume.
  const sentUsd = sumUsd(periodTxs.filter(t => t.direction === 'out').map(txUsd))
  const receivedUsd = sumUsd(periodTxs.filter(t => t.direction === 'in' && t.type !== 'claim-reclaim').map(txUsd))
  const unpriced = !pricesLoading && periodTxs.some(t => txUsd(t) === null)
  const counterparties = new Set(periodTxs.map(t => t.counterparty))

  // Bars: one per day for 7D, one per week for 30D and 90D, including empty ones.
  const weekly = period !== '7D'
  const bucketStarts = weekly
    ? eachWeekOfInterval({ start, end: now }, { weekStartsOn: 1 })
    : eachDayOfInterval({ start, end: now })
  const bars = bucketStarts.map(bucket => ({ label: format(bucket, weekly ? 'd MMM' : 'EEE'), key: bucket.getTime(), value: 0 }))
  for (const tx of periodTxs) {
    if (tx.type === 'claim-reclaim') continue
    const key = (weekly ? startOfWeek(tx.timestamp, { weekStartsOn: 1 }) : startOfDay(tx.timestamp)).getTime()
    const bar = bars.find(b => b.key === key)
    if (bar) bar.value += txUsd(tx) ?? 0
  }
  const maxVal = Math.max(0, ...bars.map(b => b.value))

  const counts = new Map<ActivityType, number>()
  periodTxs.forEach(t => counts.set(t.type, (counts.get(t.type) ?? 0) + 1))
  const total = periodTxs.length || 1
  const breakdown = [...counts.entries()]
    .map(([type, count]) => ({ type, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>Analytics</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Your {NETWORK_LABEL} activity, read directly from the chain.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={refetch} disabled={loading} className="btn-secondary" style={{ fontSize: '12px', padding: '7px 12px' }}>
            <RefreshCcw size={12} /> {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <div className="seg-control" style={{ width: 'fit-content' }}>
            {(['7D', '30D', '90D'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`seg-btn${period === p ? ' active' : ''}`}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="alert-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {loading && items.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '84px', borderRadius: '10px' }} />)}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Sent', value: pricesLoading ? '…' : formatUsd(sentUsd) },
              { label: 'Received', value: pricesLoading ? '…' : formatUsd(receivedUsd) },
              { label: 'Transactions', value: `${periodTxs.length}` },
              { label: 'Counterparties', value: `${counterparties.size}` },
            ].map(stat => (
              <div key={stat.label} className="card-sm">
                <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '10px' }}>{stat.label}</p>
                <p style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-geist-mono), monospace' }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-8px', marginBottom: '20px' }}>
            {unpriced
              ? "Injective has no current price for some of these tokens, so totals that include them aren't shown and the chart leaves them out."
              : "USD values use today's price from Injective's Pyth oracle and are indicative only."}
          </p>

          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Volume (USD)</h3>
              <span className="badge badge-accent">{weekly ? 'Weekly' : 'Daily'}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '160px', padding: '0 4px' }}>
              {bars.map((b, i) => {
                const hovered = hoveredBar === i
                const height = maxVal === 0 || b.value === 0 ? 2 : Math.max((b.value / maxVal) * 130, 4)
                return (
                  <div
                    key={b.key}
                    style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    <div
                      style={{
                        fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)',
                        background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                        borderRadius: '5px', padding: '2px 7px',
                        opacity: hovered ? 1 : 0, transition: 'opacity 0.15s', whiteSpace: 'nowrap',
                      }}
                    >
                      ${b.value.toFixed(2)}
                    </div>
                    <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: '130px' }}>
                      <div
                        style={{
                          width: '100%',
                          height: `${height}px`,
                          background: hovered ? 'var(--accent)' : 'var(--accent-subtle)',
                          border: `1px solid ${hovered ? 'transparent' : 'var(--accent-border)'}`,
                          borderRadius: '5px 5px 0 0',
                          transition: 'background 0.2s',
                        }}
                      />
                    </div>
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
                      {period === '90D' && i % 2 === 1 ? '' : b.label}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px' }}>Transaction Breakdown</h3>
            {breakdown.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No transactions in this period.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {breakdown.map(row => (
                  <div key={row.type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>{ACTIVITY_LABELS[row.type]}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{row.count} {row.count === 1 ? 'txn' : 'txns'}, {row.pct}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${row.pct}%`, background: TYPE_COLORS[row.type], opacity: 0.8 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
