'use client'

import { useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { ExternalLink, ListOrdered, RefreshCcw } from 'lucide-react'
import { useWallet } from '@/hooks/useWallet'
import { useActivity } from '@/hooks/useActivity'
import { StatusChip } from '@/components/StatusChip'
import { NETWORK_LABEL, explorerName, explorerTxUrl } from '@/lib/injective/network'
import { shortAddress } from '@/lib/injective/address'
import {
  ACTIVITY_LABELS,
  formatCoin,
  type ActivityItem,
  type ActivityType,
} from '@/lib/injective/activity'

type Filter = 'all' | 'sent' | 'received' | 'claims' | 'payroll'

const FILTERS: { id: Filter; label: string; match: (t: ActivityType) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'sent', label: 'Sent', match: t => t === 'send' },
  { id: 'received', label: 'Received', match: t => t === 'receive' },
  { id: 'claims', label: 'Claims', match: t => t.startsWith('claim') },
  { id: 'payroll', label: 'Payroll', match: t => t === 'payroll' },
]

function dayLabel(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'd MMM yyyy')
}

function shorten(value: string): string {
  return /^(inj1|0x)/.test(value) ? shortAddress(value) : value
}

export default function TransactionsPage() {
  const { isConnected } = useWallet()
  const { items, loading, error, refetch } = useActivity()
  const [filter, setFilter] = useState<Filter>('all')

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to view transactions.</div>
      </div>
    )
  }

  const active = FILTERS.find(f => f.id === filter)!
  const filtered = items.filter(tx => active.match(tx.type))

  // Group by calendar day, newest first (items already arrive sorted).
  const groups: { label: string; txs: ActivityItem[] }[] = []
  for (const tx of filtered) {
    const label = dayLabel(tx.timestamp)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.txs.push(tx)
    else groups.push({ label, txs: [tx] })
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>Transactions</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Your {NETWORK_LABEL} transfers, read directly from the chain.</p>
        </div>
        <button onClick={refetch} disabled={loading} className="btn-secondary" style={{ fontSize: '12px', padding: '7px 12px' }}>
          <RefreshCcw size={12} /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="seg-control" style={{ marginBottom: '24px', width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`seg-btn${filter === f.id ? ' active' : ''}`}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="alert-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {loading && items.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <div className="skeleton" style={{ height: '16px', width: '40%' }} />
              <div className="skeleton" style={{ height: '16px', width: '20%' }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <ListOrdered size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontWeight: '500' }}>{items.length === 0 ? 'No transactions yet' : 'Nothing matches this filter'}</p>
            <p>{items.length === 0 ? 'Transfers from your connected Injective accounts will appear here.' : 'Try another filter.'}</p>
          </div>
        </div>
      ) : (
        groups.map(group => (
          <div key={group.label} style={{ marginBottom: '24px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '10px' }}>{group.label}</p>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {group.txs.map((tx, i) => (
                <div
                  key={`${tx.hash}-${i}`}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    padding: '14px 20px',
                    borderBottom: i < group.txs.length - 1 ? '1px solid var(--border)' : 'none',
                    gap: '8px 16px',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600', marginBottom: '3px' }}>
                      {ACTIVITY_LABELS[tx.type]}
                      {tx.label && <span style={{ fontWeight: '400', color: 'var(--text-secondary)' }}>: {tx.label}</span>}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-geist-mono), monospace' }}>
                      {tx.direction === 'out' ? 'To' : 'From'} {shorten(tx.counterparty)}, {format(tx.timestamp, 'HH:mm')}
                    </p>
                  </div>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-geist-mono), monospace', textAlign: 'right' }}>
                    {tx.direction === 'out' ? '−' : '+'}
                    {tx.coins.map(c => formatCoin(c)).join(' + ')}
                  </p>
                  <StatusChip state={tx.success ? 'confirmed' : 'failed'} className="w-fit" />
                  <a
                    href={explorerTxUrl(tx.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`View on ${explorerName(tx.hash)}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--accent-text)', fontFamily: 'var(--font-geist-mono), monospace' }}
                  >
                    {tx.hash.slice(0, 8)}… <ExternalLink size={10} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
        Shows bank transfers on {NETWORK_LABEL} for your Keplr/Leap account and your EVM wallet&apos;s inj1 address.
        Transfers sent from an EVM wallet (MetaMask) are not listed yet.
      </p>
    </div>
  )
}
