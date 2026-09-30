'use client'

import { useState, useEffect, useCallback } from 'react'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import {
  createClaimPool,
  getClaimPoolsByCreator,
  getClaimsForPools,
  isSupabaseConfigured,
  SUPABASE_SETUP_MESSAGE,
} from '@/lib/supabase'
import { signAndBroadcast } from '@/lib/injective/cosmos-transactions'
import {
  planEscrow,
  createEscrowKey,
  buildFundingMsg,
  buildClaimLink,
  formatBaseUnits,
  saveEscrowKey,
  loadEscrowKey,
  sweepEscrow,
  TOKEN_DECIMALS,
  type ClaimToken,
} from '@/lib/injective/claim-escrow'
import type { ClaimPool } from '@/lib/injective/types'
import { Copy, Plus, Share2, Users2, Check, RefreshCcw, Undo2 } from 'lucide-react'

interface UIClaim {
  pool: ClaimPool
  claimed: number
  link: string | null
}

const MAX_RECIPIENTS = 100

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

function newLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}

export default function ClaimsPage() {
  const {
    userAddress: creatorAddress,
    isReady: walletReady,
    loading: walletLoading,
    error: walletError,
    initializeWallet,
  } = useCosmosTransaction()

  const [showForm, setShowForm] = useState(false)
  const [claimName, setClaimName] = useState('')
  const [token, setToken] = useState<ClaimToken>('USDC')
  const [amount, setAmount] = useState('')
  const [recipientCount, setRecipientCount] = useState('2')

  const [created, setCreated] = useState<UIClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reclaimingId, setReclaimingId] = useState<string | null>(null)

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })

  const loadClaims = useCallback(async (address: string) => {
    setLoading(true)
    try {
      const pools = await getClaimPoolsByCreator(address)
      const claims = await getClaimsForPools(pools.map(p => p.id))
      setCreated(
        pools.map(pool => {
          const stored = loadEscrowKey(pool.linkCode)
          return {
            pool,
            claimed: claims.filter(c => c.poolId === pool.id && c.status === 'paid').length,
            link: stored ? buildClaimLink(window.location.origin, pool.linkCode, stored.privateKeyHex) : null,
          }
        })
      )
    } catch (e) {
      setStatus({ type: 'error', message: errorMessage(e, 'Failed to load your claim pools.') })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (creatorAddress && isSupabaseConfigured) loadClaims(creatorAddress)
    else setLoading(false)
  }, [creatorAddress, loadClaims])

  // Live preview of the split, computed in base units so it matches what is paid.
  let preview: { perShare: string; note: string | null } | null = null
  let previewError: string | null = null
  const count = Number(recipientCount)
  if (amount && recipientCount) {
    try {
      const plan = planEscrow(token, amount, count)
      const smallest = plan.shares[plan.shares.length - 1]
      const largest = plan.shares[0]
      preview = {
        perShare: formatBaseUnits(smallest, TOKEN_DECIMALS[token]),
        note: largest !== smallest ? 'The first few shares get 1 extra base unit so the total divides exactly.' : null,
      }
    } catch (e) {
      previewError = errorMessage(e, 'Invalid amount')
    }
  }

  const handleCreate = async () => {
    if (!creatorAddress) return
    if (!claimName.trim() || !amount || !recipientCount) {
      setStatus({ type: 'error', message: 'Please fill in all fields.' })
      return
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_RECIPIENTS) {
      setStatus({ type: 'error', message: `Recipients must be a whole number from 1 to ${MAX_RECIPIENTS}.` })
      return
    }

    setSubmitting(true)
    setStatus({ type: null, message: '' })

    try {
      const plan = planEscrow(token, amount, count)
      const escrow = createEscrowKey()
      const linkCode = newLinkCode()

      // Save the key before funding so a failure after this point can always be reclaimed.
      saveEscrowKey(linkCode, { privateKeyHex: escrow.privateKeyHex, refundTo: creatorAddress })

      await signAndBroadcast(buildFundingMsg(creatorAddress, escrow.address, plan))

      const pool = await createClaimPool({
        creatorAddress,
        name: claimName.trim(),
        totalAmount: formatBaseUnits(plan.totalBase, TOKEN_DECIMALS[token]),
        claimType: 'equal',
        token,
        escrowAddress: escrow.address,
        shares: plan.shares.map(s => ({ amount: formatBaseUnits(s, TOKEN_DECIMALS[token]), amountBase: s.toString() })),
        linkCode,
      })

      setCreated(prev => [
        { pool, claimed: 0, link: buildClaimLink(window.location.origin, linkCode, escrow.privateKeyHex) },
        ...prev,
      ])
      setStatus({
        type: 'success',
        message: `Claim "${pool.name}" funded. Copy the link and share it privately: anyone with the link can claim.`,
      })
      setClaimName(''); setAmount(''); setRecipientCount('2'); setShowForm(false)
    } catch (e) {
      setStatus({ type: 'error', message: errorMessage(e, 'Failed to create claim.') })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReclaim = async (claim: UIClaim) => {
    const stored = loadEscrowKey(claim.pool.linkCode)
    if (!stored) return
    setReclaimingId(claim.pool.id)
    setStatus({ type: null, message: '' })
    try {
      const txHash = await sweepEscrow(stored.privateKeyHex, stored.refundTo)
      setStatus({ type: 'success', message: `Unclaimed funds returned to your wallet. Tx: ${txHash.slice(0, 16)}...` })
    } catch (e) {
      setStatus({ type: 'error', message: errorMessage(e, 'Reclaim failed.') })
    } finally {
      setReclaimingId(null)
    }
  }

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  if (!isSupabaseConfigured) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">{SUPABASE_SETUP_MESSAGE} Claim links store pool details there.</div>
      </div>
    )
  }

  if (!walletReady) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="alert-warning">
          Claim links are funded from a Keplr or Leap wallet. Connect one to create and manage claims.
        </div>
        {walletError && <div className="alert-error">{walletError}</div>}
        <button onClick={initializeWallet} disabled={walletLoading} className="btn-primary">
          {walletLoading ? <><span className="spinner" /> Connecting…</> : 'Connect Keplr or Leap'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>Claims</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Fund a link that splits tokens equally across a group.</p>
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
            <label className="label" htmlFor="claim-name">Claim Name</label>
            <input id="claim-name" className="input" placeholder="e.g. Team Bonus Q1" value={claimName} onChange={e => setClaimName(e.target.value)} />
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
              <label className="label" htmlFor="claim-amount">Total Amount ({token})</label>
              <input id="claim-amount" className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="claim-count">Number of Recipients</label>
            <input id="claim-count" className="input" type="number" placeholder="e.g. 5" value={recipientCount} onChange={e => setRecipientCount(e.target.value)} min="1" max={MAX_RECIPIENTS} />
          </div>

          {preview && (
            <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: '9px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Each recipient receives</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{preview.perShare} {token}</span>
              </div>
              {preview.note && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>{preview.note}</p>}
            </div>
          )}
          {previewError && <div className="alert-error">{previewError}</div>}

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Your wallet sends the total plus a small INJ reserve for claim fees to a one-time escrow account.
            The escrow key lives only in the link and in this browser. Anyone with the link can claim, so share it privately.
            You can reclaim anything left over.
          </p>

          {status.type && (
            <div className={status.type === 'success' ? 'alert-success' : 'alert-error'}>{status.message}</div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleCreate} disabled={submitting || !!previewError} className="btn-primary" style={{ flex: 1 }}>
              {submitting ? <><span className="spinner" /> Funding…</> : <><Share2 size={14} /> Fund &amp; Get Link</>}
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
            Claim Pools ({created.length})
          </h3>
        </div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <RefreshCcw size={24} className="spinner" style={{ color: 'var(--accent-text)', margin: '0 auto' }} />
          </div>
        ) : created.length === 0 ? (
          <div className="empty-state">
            <Users2 size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: '500' }}>No claims yet</p>
            <p>Create your first claim pool to distribute tokens.</p>
          </div>
        ) : (
          created.map(claim => {
            const { pool } = claim
            const legacy = !pool.escrowAddress
            const total = pool.shares.length
            const fullyClaimed = !legacy && claim.claimed >= total
            return (
              <div key={pool.id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{pool.name || `Claim ${pool.linkCode.slice(0, 4)}`}</p>
                      <span className={`badge badge-${legacy ? 'error' : fullyClaimed ? 'neutral' : 'success'}`}>
                        {legacy ? 'unfunded' : fullyClaimed ? 'fully claimed' : 'active'}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {pool.totalAmount} {pool.token ?? ''}, {legacy ? `${total} shares` : `${claim.claimed} of ${total} claimed`}, created {pool.createdAt.toISOString().split('T')[0]}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {claim.link && (
                      <button onClick={() => copyLink(claim.link!, pool.id)} className="btn-secondary" style={{ fontSize: '12px', padding: '7px 12px' }}>
                        {copiedId === pool.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy Link</>}
                      </button>
                    )}
                    {claim.link && (
                      <button
                        onClick={() => handleReclaim(claim)}
                        disabled={reclaimingId === pool.id}
                        className="btn-secondary"
                        style={{ fontSize: '12px', padding: '7px 12px' }}
                        title="Return unclaimed funds and the unused fee reserve to your wallet. Anyone who has not claimed yet will no longer be able to."
                      >
                        {reclaimingId === pool.id ? <><span className="spinner" /> Reclaiming…</> : <><Undo2 size={12} /> Reclaim</>}
                      </button>
                    )}
                  </div>
                </div>
                {legacy ? (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Created before claim links were funded, so it holds no tokens and cannot be claimed.
                  </p>
                ) : claim.link ? (
                  <div className="copy-field" onClick={() => copyLink(claim.link!, pool.id)}>
                    <Copy size={12} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{claim.link}</span>
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    The link and reclaim key are stored only in the browser that created this pool.
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
