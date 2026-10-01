'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { RefreshCcw } from 'lucide-react'
import { useWallet } from '@/hooks/useWallet'
import { usePrices } from '@/hooks/usePrices'
import { useActivity } from '@/hooks/useActivity'
import { NETWORK_LABEL } from '@/lib/injective/network'
import { ACTIVITY_LABELS, formatCoinAmount, type ActivityType } from '@/lib/injective/activity'
import { periodStart, summarizeWindow, totalCoin, type Period } from '@/lib/injective/analytics'
import { formatUsd } from '@/lib/prices'

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
  const [period, setPeriod] = useState<Period>('30D')
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)

  const now = new Date()
  const start = periodStart(period, now)
  const { items, loading, loadingMore, stoppedShort, coveredSince, error, warnings, readFurther, refetch, addresses } = useActivity({
    coverSince: start.getTime(),
  })
  const mine = useMemo(() => new Set(addresses), [addresses])

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to view analytics.</div>
      </div>
    )
  }

  const summary = summarizeWindow(items, { period, now, prices, mine })
  const reading = loading || loadingMore
  const usd = (value: number) => (pricesLoading || reading ? '…' : formatUsd(value))
  const maxVal = Math.max(0, ...summary.bars.map(b => b.usd))

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>Analytics</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            Your {NETWORK_LABEL} activity from {format(summary.start, 'd MMM yyyy')} to today, read directly from the chain.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={refetch} disabled={reading} className="btn-secondary" style={{ fontSize: '12px', padding: '7px 12px' }}>
            <RefreshCcw size={12} /> {reading ? 'Reading…' : 'Refresh'}
          </button>
          <div className="seg-control" style={{ width: 'fit-content' }}>
            {(['7D', '30D', '90D'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`seg-btn${period === p ? ' active' : ''}`}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
      {warnings.map(warning => (
        <div key={warning} className="alert-warning" style={{ marginBottom: '16px' }}>
          {warning} These totals leave those transfers out.
        </div>
      ))}
      {stoppedShort && coveredSince && (
        <div className="alert-warning" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span>
            These totals cover {format(coveredSince, 'd MMM, HH:mm')} onwards, which is as far back as NinjaPay has read your history so
            far.
          </span>
          <button onClick={readFurther} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
            Read further back
          </button>
        </div>
      )}
      {loadingMore && !loading && (
        <p role="status" style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Reading older history{coveredSince ? `, now back to ${format(coveredSince, 'd MMM')}` : ''}…
        </p>
      )}

      {loading && items.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '84px', borderRadius: '10px' }} />)}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Sent', value: usd(summary.sentUsd) },
              { label: 'Received', value: usd(summary.receivedUsd) },
              { label: 'Transactions', value: reading ? '…' : `${summary.transactions}` },
              { label: 'Counterparties', value: reading ? '…' : `${summary.counterparties}` },
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
            Dollar values use today&rsquo;s price from Injective&rsquo;s Pyth oracle, not the price on the day, and are indicative only.
            {!pricesLoading && summary.unpriced.length > 0 &&
              ` They leave out ${summary.unpriced.join(', ')}, which the oracle has no current price for; see By token for the amounts.`}
          </p>

          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Volume (USD)</h3>
              <span className="badge badge-accent">{period === '7D' ? 'Daily' : 'Weekly'}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '160px', padding: '0 4px' }}>
              {summary.bars.map((b, i) => {
                const hovered = hoveredBar === i
                const height = maxVal === 0 || b.usd === 0 ? 2 : Math.max((b.usd / maxVal) * 130, 4)
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
                      ${b.usd.toFixed(2)}
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

          <div className="card" style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '16px' }}>By token</h3>
            {summary.tokens.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Nothing sent or received in this period.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ fontWeight: '600', padding: '0 12px 8px 0' }}>Token</th>
                      <th style={{ fontWeight: '600', padding: '0 12px 8px', textAlign: 'right' }}>Sent</th>
                      <th style={{ fontWeight: '600', padding: '0 0 8px 12px', textAlign: 'right' }}>Received</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontFamily: 'var(--font-geist-mono), monospace', fontVariantNumeric: 'tabular-nums' }}>
                    {summary.tokens.map(t => (
                      <tr key={t.denom} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px 10px 0', color: 'var(--text-secondary)', fontFamily: 'inherit' }} title={t.denom}>
                          {t.token}{t.verified ? '' : ' (unverified)'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-primary)' }}>
                          {t.sentBase > BigInt(0) ? formatCoinAmount(totalCoin(t, t.sentBase)) : '—'}
                        </td>
                        <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', color: 'var(--text-primary)' }}>
                          {t.receivedBase > BigInt(0) ? formatCoinAmount(totalCoin(t, t.receivedBase)) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px' }}>Transaction Breakdown</h3>
            {summary.breakdown.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No transactions in this period.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {summary.breakdown.map(row => (
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

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '16px', lineHeight: 1.6 }}>
            Failed transactions, moves between your own connected accounts and claim funds you took back aren&rsquo;t counted as
            sent or received. Amounts by token are exact; dollar values are indicative.
          </p>
        </>
      )}
    </div>
  )
}
