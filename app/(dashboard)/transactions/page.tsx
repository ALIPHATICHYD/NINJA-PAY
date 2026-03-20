'use client'

import { useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { ExternalLink, ListOrdered } from 'lucide-react'

type TxType = 'all' | 'send' | 'bills' | 'claims' | 'payroll'

interface Transaction {
  id: string; type: Exclude<TxType, 'all'>; amount: string; token: string
  recipient: string; status: 'confirmed' | 'pending' | 'failed'
  date: string; dateLabel: string; txHash: string
}

const MOCK_TXS: Transaction[] = [
  { id: '1', type: 'send',    amount: '5.00',   token: 'INJ',  recipient: 'inj1a2b3c...d4e5f6', status: 'confirmed', date: '2026-03-20', dateLabel: 'Today',     txHash: '0xabc123def456' },
  { id: '2', type: 'bills',   amount: '2000',   token: 'NGN',  recipient: 'MTN:08012345678',    status: 'confirmed', date: '2026-03-20', dateLabel: 'Today',     txHash: '0xfed987cba654' },
  { id: '3', type: 'payroll', amount: '120.00', token: 'USDT', recipient: '6 recipients',       status: 'pending',   date: '2026-03-19', dateLabel: 'Yesterday', txHash: '0x111222333444' },
  { id: '4', type: 'claims',  amount: '50.00',  token: 'USDT', recipient: 'Team Bonus Q1',      status: 'confirmed', date: '2026-03-17', dateLabel: 'Earlier',   txHash: '0x555666777888' },
]

const FILTERS: { id: TxType; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'send', label: 'Send' },
  { id: 'bills', label: 'Bills' }, { id: 'claims', label: 'Claims' },
  { id: 'payroll', label: 'Payroll' },
]

const TYPE_COLORS: Record<Exclude<TxType, 'all'>, string> = {
  send: 'var(--accent)', bills: 'var(--warning)', claims: 'var(--inj-color)', payroll: '#a78bfa',
}

export default function TransactionsPage() {
  const { isConnected } = useWallet()
  const [filter, setFilter] = useState<TxType>('all')

  const filtered = MOCK_TXS.filter(tx => filter === 'all' || tx.type === filter)

  // Group by dateLabel
  const groups = filtered.reduce<Record<string, Transaction[]>>((acc, tx) => {
    if (!acc[tx.dateLabel]) acc[tx.dateLabel] = []
    acc[tx.dateLabel].push(tx)
    return acc
  }, {})
  const dateOrder = ['Today', 'Yesterday', 'Earlier']

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to view transactions.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>Transactions</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Your full on-chain activity history.</p>
      </div>

      {/* Filter */}
      <div className="seg-control" style={{ marginBottom: '24px', width: 'fit-content' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`seg-btn${filter === f.id ? ' active' : ''}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <ListOrdered size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontWeight: '500' }}>No transactions</p>
            <p>Transactions matching this filter will appear here.</p>
          </div>
        </div>
      ) : (
        dateOrder.filter(dl => groups[dl]).map(dateLabel => (
          <div key={dateLabel} style={{ marginBottom: '24px' }}>
            {/* Date group header */}
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              {dateLabel}
            </p>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {groups[dateLabel].map((tx, i) => (
                <div
                  key={tx.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 110px 110px 90px auto',
                    padding: '14px 20px',
                    borderBottom: i < groups[dateLabel].length - 1 ? '1px solid var(--border)' : 'none',
                    gap: '12px',
                    alignItems: 'center',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                >
                  {/* Recipient */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      {/* Type dot */}
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: TYPE_COLORS[tx.type], flexShrink: 0 }} />
                      <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.recipient}
                      </p>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '15px' }}>{tx.date}</p>
                  </div>
                  {/* Amount */}
                  <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                    {tx.amount} <span style={{ fontWeight: '400', color: 'var(--text-muted)', fontSize: '11px' }}>{tx.token}</span>
                  </p>
                  {/* Type badge */}
                  <span className="badge badge-neutral" style={{ width: 'fit-content', textTransform: 'capitalize', color: TYPE_COLORS[tx.type] }}>
                    {tx.type}
                  </span>
                  {/* Status */}
                  <span
                    className={`badge badge-${tx.status === 'confirmed' ? 'success' : tx.status === 'failed' ? 'error' : 'warning'}`}
                    style={{ width: 'fit-content', textTransform: 'capitalize' }}
                  >
                    {tx.status}
                  </span>
                  {/* Hash */}
                  <a
                    href={`https://explorer.injective.network/transaction/${tx.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--accent)', fontFamily: 'monospace' }}
                  >
                    {tx.txHash.slice(0, 8)}...<ExternalLink size={10} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
