'use client'

import { useMemo, useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { formatBaseUnits, toChainAmount } from '@/lib/money'
import { TOKENS } from '@/lib/injective/tokens'
import { ChainHealthNotice } from '@/components/ChainHealthNotice'
import { useChainHealth } from '@/hooks/useChainHealth'
import { useRecipients } from '@/hooks/useRecipients'
import { usePayrollChecks } from '@/hooks/usePayrollChecks'
import { TxStatus } from '@/components/TxStatus'
import { checkFee, feeShortfallMessage, formatFee, networkFee, payrollGas } from '@/lib/injective/fees'
import { MEMO_PAYROLL } from '@/lib/injective/activity'
import { MAX_PAYROLL_RECIPIENTS } from '@/lib/injective/bank'
import { HOOK_RESTRICTION_MESSAGE } from '@/lib/injective/transfer-errors'
import { shortAddress, toInjectiveAddress } from '@/lib/injective/address'
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
  const {
    sendPayroll,
    userAddress: cosmosAddress,
    isReady: cosmosReady,
    loading: cosmosLoading,
    error: cosmosError,
    initializeWallet: connectCosmosWallet,
  } = useCosmosTransaction()
  // Payroll signs with Keplr/Leap, so balances and the fee check use that account once it's connected.
  const { inj, usdc, loading: balLoading } = useBalance(cosmosAddress ?? address)

  const chainHealth = useChainHealth('cosmos')

  const [step, setStep] = useState<Step>(1)
  const [payrollName, setPayrollName] = useState('')
  const [token, setToken] = useState<'INJ' | 'USDC'>('USDC')
  const [recipients, setRecipients] = useState<PayrollRecipient[]>([
    { id: '1', address: '', amount: '', label: '' },
  ])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })
  const [paid, setPaid] = useState<{ message: string; hash: string } | null>(null)

  const { decimals } = TOKENS[token]
  // Exact base units per row; null where the amount isn't valid for this token.
  const amounts = useMemo(() => recipients.map(r => {
    try { return BigInt(toChainAmount(r.amount, decimals)) } catch { return null }
  }), [recipients, decimals])
  const totalBase = amounts.reduce<bigint>((sum, a) => sum + (a ?? BigInt(0)), BigInt(0))
  const totalAmount = formatBaseUnits(totalBase, decimals)
  const balance = BigInt((token === 'INJ' ? inj : usdc) || '0')
  const overBalance = totalBase > balance

  // Fees are paid in INJ. Payroll is one MsgMultiSend, so one fee; this is the
  // estimate until the batch is simulated just before signing.
  const fee = networkFee(payrollGas(recipients.length))
  const feeCheck = checkFee(BigInt(inj || '0'), fee, token === 'INJ' ? totalBase : BigInt(0))
  const fundsError = balLoading ? null
    : overBalance ? `The total is more than your ${token} balance of ${formatBaseUnits(balance, decimals, 4)} ${token}.`
    : !feeCheck.ok ? feeShortfallMessage(feeCheck, token === 'INJ')
    : null

  const addRecipient = () => setRecipients(prev =>
    prev.length >= MAX_PAYROLL_RECIPIENTS ? prev : [...prev, { id: Date.now().toString(), address: '', amount: '', label: '' }])
  const removeRecipient = (id: string) => { if (recipients.length > 1) setRecipients(prev => prev.filter(r => r.id !== id)) }
  const updateRecipient = (id: string, field: keyof PayrollRecipient, value: string) =>
    setRecipients(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))

  // Each row may be an inj1… or 0x… address (the same account, stored as inj1) or a .inj name.
  const targets = useRecipients(recipients.map(r => r.address))
  const accounts = targets.map(t => t.account?.injective ?? null)
  const invalidRows = targets.flatMap((t, i) => (t.error ? [i + 1] : []))
  const resolvingRows = targets.flatMap((t, i) => (t.resolving ? [i + 1] : []))
  const invalidAmountRows = recipients.flatMap((r, i) => (r.amount.trim() && amounts[i] === null ? [i + 1] : []))
  const repeatedRows = accounts.flatMap((a, i) => (a && accounts.indexOf(a) !== i ? [i + 1] : []))

  // The signing account (Keplr/Leap once connected) and every row, checked on the review step.
  const checks = usePayrollChecks(token, toInjectiveAddress(cosmosAddress ?? address), step === 3 ? accounts : [])

  const canProceedStep1 = payrollName.trim().length > 0
  const canProceedStep2 = recipients.every((r, i) => accounts[i] && (amounts[i] ?? BigInt(0)) > BigInt(0))

  const handleDispatch = async () => {
    setLoading(true)
    setStatus({ type: null, message: '' })
    setPaid(null)
    try {
      // One MsgMultiSend for everyone. Amounts are human-readable and
      // converted to base units once inside sendPayroll.
      const hash = await sendPayroll(
        recipients.map((r, i) => ({ address: accounts[i]!, amount: r.amount.trim() })),
        token,
        MEMO_PAYROLL,
      )
      const n = recipients.length
      setPaid({ hash, message: `Payroll "${payrollName}" paid ${n} recipient${n > 1 ? 's' : ''} in ${token} in one transaction, confirmed on chain.` })
      setPayrollName('')
      setRecipients([{ id: Date.now().toString(), address: '', amount: '', label: '' }])
      setStep(1)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Dispatch failed.'
      setStatus({
        type: 'error',
        message: message === HOOK_RESTRICTION_MESSAGE && recipients.length > 1
          ? `${message} One restricted recipient stops the whole payroll, so nobody was paid.`
          : message,
      })
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

      {paid && (
        <div style={{ marginBottom: '20px' }}>
          <TxStatus state="confirmed" message={paid.message} hash={paid.hash} />
        </div>
      )}

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
              Available: <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{balLoading ? '—' : formatBaseUnits(balance, decimals, 4)} {token}</span>
            </p>
            {!cosmosReady && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px', background: 'rgba(39, 117, 202, 0.1)', borderRadius: '6px', border: '1px solid rgba(39, 117, 202, 0.2)' }}>
                <AlertCircle size={14} style={{ color: '#2775ca', marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: '#2775ca', lineHeight: '1.4' }}>Payroll is signed with Keplr or Leap for now. You&apos;ll connect it on the review step.</span>
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
            <button onClick={addRecipient} disabled={recipients.length >= MAX_PAYROLL_RECIPIENTS} title={recipients.length >= MAX_PAYROLL_RECIPIENTS ? `Up to ${MAX_PAYROLL_RECIPIENTS} recipients per run` : undefined} className="btn-ghost" style={{ fontSize: '12px', padding: '5px 10px' }}>
              <Plus size={13} /> Add Row
            </button>
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px 38px', gap: '8px', paddingLeft: '2px' }}>
            {['Label (opt.)', 'Address or .inj Name', `Amount (${token})`, ''].map(h => (
              <p key={h} style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</p>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recipients.map((rec, idx) => (
              <div key={rec.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px 38px', gap: '8px', alignItems: 'center' }}>
                <input className="input" placeholder={`Person ${idx + 1}`} value={rec.label || ''} onChange={e => updateRecipient(rec.id, 'label', e.target.value)} style={{ fontSize: '13px' }} />
                <input
                  className="input input-mono"
                  placeholder="inj1…, 0x… or name.inj"
                  autoCapitalize="none"
                  spellCheck={false}
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

          {recipients.length >= MAX_PAYROLL_RECIPIENTS && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              A run pays up to {MAX_PAYROLL_RECIPIENTS} recipients. Split bigger payrolls into more runs.
            </p>
          )}
          {invalidRows.map(n => (
            <p key={n} style={{ fontSize: '12px', color: 'var(--error)' }}>Row {n}: {targets[n - 1].error}</p>
          ))}
          {resolvingRows.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Looking up {resolvingRows.map(n => targets[n - 1].name).join(', ')}…
            </p>
          )}
          {targets.some(t => t.kind === 'name' && t.account) && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Names are paid at the address they point to now. The review step shows each one.
            </p>
          )}
          {invalidAmountRows.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--error)' }}>
              {invalidAmountRows.length === 1 ? 'Row' : 'Rows'} {invalidAmountRows.join(', ')}: enter an amount with at most {decimals} decimal places.
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Network fee (one transaction)</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>≈ {formatFee(fee)} INJ</span>
            </div>
          </div>

          {!cosmosReady && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgb(59,130,246)', borderRadius: '8px' }}>
              <AlertCircle size={14} style={{ color: 'rgb(59,130,246)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: '180px', fontSize: '12px', color: 'rgb(59,130,246)' }}>Payroll is signed with Keplr or Leap for now.</span>
              <button onClick={connectCosmosWallet} disabled={cosmosLoading} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                {cosmosLoading ? 'Connecting…' : 'Connect Keplr or Leap'}
              </button>
            </div>
          )}

          <ChainHealthNotice state={chainHealth} />

          {checks.blocks.map(b => (
            <div key={b.message} role="alert" className="alert-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
              <span>{b.message}</span>
            </div>
          ))}
          {checks.warnings.map(w => (
            <p key={w.message} role="alert" style={{ fontSize: '12px', color: 'var(--warning)' }}>{w.message}</p>
          ))}

          {fundsError && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
              <span>{fundsError}</span>
            </div>
          )}

          {/* Recipient list preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recipients.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px' }}>{r.label || `Recipient ${i + 1}`}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {targets[i].name && <span style={{ color: 'var(--text-secondary)' }}>{targets[i].name} · </span>}
                    {shortAddress(accounts[i] ?? r.address, 14)}
                  </p>
                </div>
                <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{r.amount} {token}</p>
              </div>
            ))}
          </div>

          {status.type && (
            <div className={status.type === 'success' ? 'alert-success' : 'alert-error'}>{status.message}</div>
          )}

          {cosmosError && status.type !== 'error' && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
              <span>{cosmosError}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setStep(2)} className="btn-secondary" style={{ flex: 1 }} disabled={loading || cosmosLoading}>Back</button>
            <button onClick={handleDispatch} disabled={loading || cosmosLoading || balLoading || !!fundsError || !cosmosReady || !chainHealth.canSend || checks.blocks.length > 0} className="btn-primary" style={{ flex: 2, padding: '13px' }}>
              {(loading || cosmosLoading) ? <><span className="spinner" /> Dispatching...</> : <><Users2 size={15} /> Dispatch Payroll</>}
            </button>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.6' }}>
            Sent as one MsgMultiSend transaction: one signature and one fee, and either every recipient is paid or none is.
          </p>
        </div>
      )}
    </div>
  )
}
