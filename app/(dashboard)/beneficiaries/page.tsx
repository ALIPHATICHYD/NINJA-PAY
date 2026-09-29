'use client'

import { useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { Plus, Trash2, Send, Users2 } from 'lucide-react'
import Link from 'next/link'

interface Beneficiary {
  id: string; name: string; address: string; tag?: string; addedAt: string
}

const MOCK_BENEFICIARIES: Beneficiary[] = [
  { id: '1', name: 'Alex — DevOps', address: 'inj1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s', tag: 'Team', addedAt: '2026-03-10' },
  { id: '2', name: 'Sara — Design', address: 'inj1b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9st', tag: 'Team', addedAt: '2026-03-11' },
]

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  Team:   { bg: 'var(--accent-subtle)',   color: 'var(--accent-text)' },
  Vendor: { bg: 'rgba(245,158,11,0.1)',   color: 'var(--warning)' },
  Family: { bg: 'var(--success-subtle)',  color: 'var(--success)' },
}

function getInitials(name: string) {
  return name.split(' ')[0]?.slice(0, 2).toUpperCase() || '??'
}

function getAvatarColor(name: string) {
  const colors = ['#4d3dff', '#193d6d', '#4669b9', '#7a4515', '#611447']
  return colors[name.charCodeAt(0) % colors.length]
}

export default function BeneficiariesPage() {
  const { isConnected } = useWallet()

  const [showForm, setShowForm]   = useState(false)
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>(MOCK_BENEFICIARIES)
  const [name, setName]           = useState('')
  const [address, setAddress]     = useState('')
  const [tag, setTag]             = useState('')
  const [search, setSearch]       = useState('')
  const [status, setStatus]       = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })

  const filtered = beneficiaries.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.address.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = () => {
    if (!name || !address) { setStatus({ type: 'error', message: 'Name and address are required.' }); return }
    if (!address.startsWith('inj1')) { setStatus({ type: 'error', message: 'Must be a valid Injective address (inj1...)' }); return }
    const newB: Beneficiary = { id: Date.now().toString(), name, address, tag: tag || undefined, addedAt: new Date().toISOString().split('T')[0] }
    setBeneficiaries(prev => [newB, ...prev])
    setStatus({ type: 'success', message: `${name} added to beneficiaries.` })
    setName(''); setAddress(''); setTag(''); setShowForm(false)
  }

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to manage beneficiaries.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '660px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>Beneficiaries</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Save wallet addresses for quick access when sending.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary" style={{ fontSize: '13px', padding: '9px 16px' }}>
          <Plus size={15} /> Add Beneficiary
        </button>
      </div>

      {status.type && !showForm && (
        <div className={status.type === 'success' ? 'alert-success' : 'alert-error'} style={{ marginBottom: '16px' }}>{status.message}</div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Add New Beneficiary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="label">Name / Label</label>
              <input className="input" placeholder="e.g. Alex — DevOps" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Tag (Optional)</label>
              <input className="input" placeholder="e.g. Team, Vendor" value={tag} onChange={e => setTag(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Injective Address</label>
            <input className="input input-mono" placeholder="inj1..." value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          {status.type && <div className={status.type === 'success' ? 'alert-success' : 'alert-error'}>{status.message}</div>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleAdd} className="btn-primary" style={{ flex: 1 }}><Users2 size={14} /> Save</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input className="input" placeholder="Search by name or address..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
      </div>

      {/* List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Saved — {filtered.length}
          </p>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Users2 size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: '500' }}>No beneficiaries found</p>
            <p>Add wallet addresses for quick sending.</p>
          </div>
        ) : (
          filtered.map(b => {
            const tagStyle = b.tag ? TAG_COLORS[b.tag] || { bg: 'var(--bg-hover)', color: 'var(--text-secondary)' } : null
            return (
              <div
                key={b.id}
                style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                    background: getAvatarColor(b.name), display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: '#fff',
                  }}
                >
                  {getInitials(b.name)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{b.name}</p>
                    {b.tag && tagStyle && (
                      <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: tagStyle.bg, color: tagStyle.color }}>{b.tag}</span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.address.slice(0, 20)}...{b.address.slice(-6)}
                  </p>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <Link
                    href={`/send?to=${b.address}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px',
                      borderRadius: '7px', fontSize: '12px', fontWeight: '600',
                      background: 'var(--accent-subtle)', color: 'var(--accent-text)',
                      border: '1px solid var(--accent-border)', transition: 'all 0.15s',
                    }}
                  >
                    <Send size={12} /> Send
                  </Link>
                  <button
                    onClick={() => setBeneficiaries(prev => prev.filter(x => x.id !== b.id))}
                    className="btn-ghost"
                    style={{ color: 'var(--error)', padding: '6px 8px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
