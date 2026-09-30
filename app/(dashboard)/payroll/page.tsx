'use client'

import { useMemo, useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { useUSDCConversion } from '@/hooks/useUSDCConversion'
import { formatBaseUnits } from '@/lib/money'
import { TOKENS } from '@/lib/injective/tokens'
import { MEMO_PAYROLL } from '@/lib/injective/activity'
import { parseAccountAddress, shortAddress } from '@/lib/injective/address'
import { Plus, Trash2, Users2, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react'

interface PayrollRecipient { id: string; address: string; amount: string; label?: string }

type Step = 1 | 2 | 3

const STEPS = [
  { n: 1 as Step, label: 'Configure' },
  { n: 2 as Step, label: 'Recipients' },
  { n: 3 as Step, label: 'Review' },
]

export default function PayrollPage() {
  const { isConnected, address } = useWallet()
  const { inj, usdc } = useBalance(address)
  const { sendToken, loading: cosmosLoading, error: cosmosError } = useCosmosTransaction()

  const [step, setStep] = useState<Step>(1)
  const [payrollName, setPayrollName] = useState('')
  const [token, setToken] = useState<'INJ' | 'USDC'>('USDC')
  const [recipients, setRecipients] = useState<PayrollRecipient[]>([
    { id: '1', address: '', amount: '', label: '' },
  ])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })

  const totalAmount = recipients.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toFixed(4)
  const available = Number(formatBaseUnits(token === 'INJ' ? inj : usdc, TOKENS[token].decimals))

  const addRecipient = () => setRecipients(prev => [...prev, { id: Date.now().toString(), address: '', amount: '', label: '' }])
  const removeRecipient = (id: string) => { if (recipients.length > 1) setRecipients(prev => prev.filter(r => r.id !== id)) }
  const updateRecipient = (id: string, field: keyof PayrollRecipient, value: string) =>
    setRecipients(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))

  // Each row may be typed as inj1… or 0x…; both name the same account, stored as inj1.
  const accounts = useMemo(() => recipients.map(r => parseAccountAddress(r.address)?.injective ?? null), [recipients])
  const invalidRows = recipients.flatMap((r, i) => (r.address.trim() && !accounts[i] ? [i + 1] : []))
  const repeatedRows = accounts.flatMap((a, i) => (a && accounts.indexOf(a) !== i ? [i + 1] : []))

  const canProceedStep1 = payrollName.trim().length > 0
  const canProceedStep2 = recipients.every((r, i) => accounts[i] && parseFloat(r.amount) > 0)

  const handleDispatch = async () => {
    setLoading(true)
    setStatus({ type: null, message: '' })
    try {
      // One transaction per recipient. sendToken takes the human-readable
      // amount and converts to base units once.
      for (const [i, recipient] of recipients.entries()) {
        await sendToken(accounts[i]!, recipient.amount.trim(), token, MEMO_PAYROLL)
      }

      setStatus({ 
        type: 'success', 
        message: `Payroll "${payrollName}" dispatched to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''} in ${token}.` 
      })
      setPayrollName('')
      setRecipients([{ id: Date.now().toString(), address: '', amount: '', label: '' }])
      setStep(1)
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Dispatch failed.' })
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to run payroll.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>Payroll</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Batch-pay your team in a single on-chain MsgMultiSend transaction.</p>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '28px' }}>
        {STEPS.map((s, i) => {
          const done    = step > s.n
          const current = step === s.n
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                className={done ? 'step-dot step-dot-done' : current ? 'step-dot step-dot-active' : 'step-dot step-dot-inactive'}
                style={{ cursor: done ? 'pointer' : 'default' }}
                onClick={() => done && setStep(s.n as Step)}
              >
                {done ? <CheckCircle2 size={14} /> : s.n}
              </div>
              <span style={{ fontSize: '13px', fontWeight: current ? '700' : '400', color: current ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Configure ── */}
      {step === 1 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Step 1 — Configure Payroll</h3>
          <div>
            <label className="label">Payroll Name</label>
            <input className="input" placeholder="e.g. March 2026 Team Pay" value={payrollName} onChange={e => setPayrollName(e.target.value)} />
          </div>
          <div>
            <label className="label">Token</label>
            <div className="seg-control">
              {(['INJ', 'USDC'] as const).map(t => (
                <button key={t} onClick={() => setToken(t)} className={`seg-btn${token === t ? ' active' : ''}`}>{t}</button>
              ))}
            </div>
            <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Available: <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{available.toFixed(4)} {token}</span>
            </p>
            {token === 'USDC' && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px', background: 'rgba(39, 117, 202, 0.1)', borderRadius: '6px', border: '1px solid rgba(39, 117, 202, 0.2)' }}>
                <AlertCircle size={14} style={{ color: '#2775ca', marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: '#2775ca', lineHeight: '1.4' }}>USDC uses Cosmos wallet (Keplr). Make sure to connect above.</span>
              </div>
            )}
          </div>
          <button onClick={() => { if (canProceedStep1) setStep(2) }} disabled={!canProceedStep1} className="btn-primary" style={{ width: '100%', padding: '12px' }}>
            Continue to Recipients
          </button>
        </div>
      )}

      {/* ── Step 2: Recipients ── */}
      {step === 2 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Step 2 — Add Recipients</h3>
            <button onClick={addRecipient} className="btn-ghost" style={{ fontSize: '12px', padding: '5px 10px' }}>
              <Plus size={13} /> Add Row
            </button>
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px 38px', gap: '8px', paddingLeft: '2px' }}>
            {['Label (opt.)', 'Wallet Address', `Amount (${token})`, ''].map(h => (
              <p key={h} style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</p>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recipients.map((rec, idx) => (
              <div key={rec.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px 38px', gap: '8px', alignItems: 'center' }}>
                <input className="input" placeholder={`Person ${idx + 1}`} value={rec.label || ''} onChange={e => updateRecipient(rec.id, 'label', e.target.value)} style={{ fontSize: '13px' }} />
                <input
                  className="input input-mono"
                  placeholder="inj1… or 0x…"
                  value={rec.address}
                  onChange={e => updateRecipient(rec.id, 'address', e.target.value)}
                  aria-invalid={invalidRows.includes(idx + 1)}
                  style={{ fontSize: '12px', ...(invalidRows.includes(idx + 1) && { borderColor: 'var(--error)' }) }}
                />
                <input className="input" type="number" placeholder="0.00" value={rec.amount} onChange={e => updateRecipient(rec.id, 'amount', e.target.value)} min="0" step="0.01" />
                <button onClick={() => removeRecipient(rec.id)} className="btn-ghost" disabled={recipients.length === 1} style={{ color: 'var(--error)', padding: '8px', opacity: recipients.length === 1 ? 0.3 : 1 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {invalidRows.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--error)' }}>
              {invalidRows.length === 1 ? 'Row' : 'Rows'} {invalidRows.join(', ')}: enter a valid inj1… or 0x… address.
            </p>
          )}
          {repeatedRows.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--warning)' }}>
              {repeatedRows.length === 1 ? 'Row' : 'Rows'} {repeatedRows.join(', ')} {repeatedRows.length === 1 ? 'pays an account' : 'pay accounts'} already listed above (inj1… and 0x… are the same account).
            </p>
          )}

          {/* Running total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: '9px', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Total — {recipients.length} recipients</span>
            <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {totalAmount} <span style={{ fontWeight: '400', fontSize: '13px', color: 'var(--text-muted)' }}>{token}</span>
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setStep(1)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
            <button onClick={() => { if (canProceedStep2) setStep(3) }} disabled={!canProceedStep2} className="btn-primary" style={{ flex: 1 }}>
              Review &amp; Dispatch
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review ── */}
      {step === 3 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Step 3 — Review & Dispatch</h3>

          {/* Summary */}
          <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Payroll Name</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{payrollName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Token</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{token}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Recipients</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{recipients.length}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)' }}>Total Disbursement</span>
              <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {totalAmount} {token}
              </span>
            </div>
          </div>

          {/* Recipient list preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recipients.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px' }}>{r.label || `Recipient ${i + 1}`}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{shortAddress(accounts[i] ?? r.address, 14)}</p>
                </div>
                <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{r.amount} {token}</p>
              </div>
            ))}
          </div>

          {status.type && (
            <div className={status.type === 'success' ? 'alert-success' : 'alert-error'}>{status.message}</div>
          )}

          {cosmosError && token === 'USDC' && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
              <span>{cosmosError}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setStep(2)} className="btn-secondary" style={{ flex: 1 }} disabled={loading || cosmosLoading}>Back</button>
            <button onClick={handleDispatch} disabled={loading || cosmosLoading} className="btn-primary" style={{ flex: 2, padding: '13px' }}>
              {(loading || cosmosLoading) ? <><span className="spinner" /> Dispatching...</> : <><Users2 size={15} /> Dispatch Payroll</>}
            </button>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.6' }}>
            {token === 'USDC' 
              ? 'Broadcasts via Cosmos transactions. All recipients receive USDC simultaneously.' 
              : 'Broadcasts one MsgMultiSend transaction. All recipients receive INJ simultaneously.'}
          </p>
        </div>
      )}
    </div>
  )
}
