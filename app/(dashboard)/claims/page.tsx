'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useUSDCConversion } from '@/hooks/useUSDCConversion'
import { createClaimPool, getClaimPoolsByCreator } from '@/lib/supabase'
import { Copy, Plus, Share2, Users2, Check, RefreshCcw, AlertCircle } from 'lucide-react'

// Map from the DB type to our UI type
interface UIClaim {
  id: string
  name: string
  totalAmount: string
  token: 'INJ' | 'USDC'
  splitType: 'equal' | 'percentage' | 'custom'
  recipients: number
  status: 'active' | 'claimed' | 'expired'
  createdAt: string
  link: string
}

const SPLIT_TYPES = [
  { id: 'equal',      label: 'Equal',      desc: 'All recipients get the same amount' },
  { id: 'percentage', label: 'Percentage', desc: 'Distribute by % share' },
  { id: 'custom',     label: 'Custom',     desc: 'Set individual amounts' },
] as const

export default function ClaimsPage() {
  const { address, isConnected } = useWallet()
  const { injUsdcRate } = useUSDCConversion(1)

  const [showForm, setShowForm] = useState(false)
  const [claimName, setClaimName] = useState('')
  const [token, setToken] = useState<'INJ' | 'USDC'>('USDC')
  const [amount, setAmount] = useState('')
  const [splitType, setSplitType] = useState<'equal' | 'percentage' | 'custom'>('equal')
  const [recipientCount, setRecipientCount] = useState('2')
  
  const [created, setCreated] = useState<UIClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })

  // Fetch claims
  useEffect(() => {
    let mounted = true
    async function fetchClaims() {
      if (!address) return
      setLoading(true)
      try {
        const pools = await getClaimPoolsByCreator(address)
        if (mounted) {
          const uiPools: UIClaim[] = pools.map(p => ({
            id: p.id,
            name: claimName || `Claim Pool #${p.linkCode.slice(0, 4)}`,
            totalAmount: p.totalAmount,
            token: token as 'INJ' | 'USDC',
            splitType: p.claimType as any,
            recipients: p.shares ? p.shares.length : 0,
            status: 'active',
            createdAt: new Date(p.createdAt).toISOString().split('T')[0],
            link: `https://ninjapay.xyz/claim/${p.linkCode}`
          }))
          setCreated(uiPools)
        }
      } catch (e) {
        console.error('Failed to load claims', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchClaims()
    return () => { mounted = false }
  }, [address])

  const perRecipient = amount && recipientCount
    ? (parseFloat(amount) / parseInt(recipientCount)).toFixed(token === 'USDC' ? 2 : 4)
    : '—'

  const handleCreate = async () => {
    if (!address) return
    if (!claimName || !amount || !recipientCount) {
      setStatus({ type: 'error', message: 'Please fill in all fields.' })
      return
    }
    setSubmitting(true)
    setStatus({ type: null, message: '' })

    try {
      const linkCode = Math.random().toString(36).slice(2, 10)
      const count = parseInt(recipientCount)
      const shareAmount = (parseFloat(amount) / count).toString()
      
      // Create shares with placeholder addresses (recipients will fill their own wallet when claiming)
      const shares = Array(count).fill(null).map((_, i) => ({
        address: '', // Empty initially - will be filled when recipients claim
        amount: shareAmount
      }))

      const newPool = await createClaimPool({
        creatorAddress: address,
        name: claimName,
        totalAmount: amount,
        claimType: splitType,
        shares,
        linkCode,
        createdAt: new Date()
      })

      const uiClaim: UIClaim = {
        id: newPool.id,
        name: claimName,
        totalAmount: amount,
        token,
        splitType,
        recipients: parseInt(recipientCount),
        status: 'active',
        createdAt: new Date().toISOString().split('T')[0],
        link: `https://ninjapay.xyz/claim/${newPool.linkCode}`,
      }

      setCreated(prev => [uiClaim, ...prev])
      setStatus({ type: 'success', message: `Claim "${claimName}" created. Copy the link to share.` })
      setClaimName(''); setAmount(''); setRecipientCount('2'); setShowForm(false)
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Failed to create claim.' })
    } finally {
      setSubmitting(false)
    }
  }

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to create and manage claims.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>Claims</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Create shareable links to distribute tokens to a group.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary" style={{ fontSize: '13px', padding: '9px 16px' }}>
          <Plus size={15} /> New Claim
        </button>
      </div>

      {status.type && !showForm && (
        <div className={`${status.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '16px' }}>
          {status.message}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Create Claim Pool</h3>

          <div>
            <label className="label">Claim Name</label>
            <input className="input" placeholder="e.g. Team Bonus Q1" value={claimName} onChange={e => setClaimName(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="label">Token</label>
              <div className="seg-control">
                {(['INJ', 'USDC'] as const).map(t => (
                  <button key={t} onClick={() => setToken(t)} className={`seg-btn${token === t ? ' active' : ''}`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Total Amount ({token})</label>
              <input className="input" type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} min="0" />
            </div>
          </div>

          <div>
            <label className="label">Split Type</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {SPLIT_TYPES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSplitType(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', borderRadius: '9px', textAlign: 'left',
                    border: splitType === s.id ? '1px solid rgba(91,88,240,0.5)' : '1px solid var(--border)',
                    background: splitType === s.id ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div
                    style={{
                      width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                      border: splitType === s.id ? '2px solid var(--accent)' : '2px solid var(--border-light)',
                      background: splitType === s.id ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {splitType === s.id && <Check size={10} color="white" />}
                  </div>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: splitType === s.id ? 'var(--accent)' : 'var(--text-primary)', marginBottom: '2px' }}>{s.label}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Number of Recipients</label>
            <input className="input" type="number" placeholder="e.g. 5" value={recipientCount} onChange={e => setRecipientCount(e.target.value)} min="1" />
          </div>

          {splitType === 'equal' && amount && recipientCount && (
            <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: '9px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Each recipient receives</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{perRecipient} {token}</span>
            </div>
          )}

          {status.type && (
            <div className={status.type === 'success' ? 'alert-success' : 'alert-error'}>{status.message}</div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleCreate} disabled={submitting} className="btn-primary" style={{ flex: 1 }}>
              {submitting ? <><span className="spinner" /> Creating…</> : <><Share2 size={14} /> Create &amp; Get Link</>}
            </button>
            <button onClick={() => setShowForm(false)} disabled={submitting} className="btn-secondary" style={{ flex: 1 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Claims list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Claim Pools — {created.length}
          </h3>
        </div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <RefreshCcw size={24} className="spinner" style={{ color: 'var(--accent)', margin: '0 auto' }} />
          </div>
        ) : created.length === 0 ? (
          <div className="empty-state">
            <Users2 size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: '500' }}>No claims yet</p>
            <p>Create your first claim pool to distribute tokens.</p>
          </div>
        ) : (
          created.map(claim => (
            <div key={claim.id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{claim.name}</p>
                    <span className={`badge badge-${claim.status === 'active' ? 'success' : claim.status === 'expired' ? 'error' : 'neutral'}`}>
                      {claim.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {claim.totalAmount} {claim.token} · {claim.recipients} recipients · {claim.splitType} · {claim.createdAt}
                  </p>
                </div>
                <button onClick={() => copyLink(claim.link, claim.id)} className="btn-secondary" style={{ fontSize: '12px', padding: '7px 12px', flexShrink: 0 }}>
                  {copiedId === claim.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy Link</>}
                </button>
              </div>
              <div className="copy-field" onClick={() => copyLink(claim.link, claim.id)}>
                <Copy size={12} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{claim.link}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
