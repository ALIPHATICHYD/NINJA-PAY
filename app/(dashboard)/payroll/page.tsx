'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { useEvmSigner } from '@/hooks/useEvmSigner'
import { KEPLR, signAndBroadcast, signerAddress } from '@/lib/injective/cosmos-transactions'
import { CHAIN_ID } from '@/lib/injective/network'
import { formatBaseUnits, toChainAmount } from '@/lib/money'
import { TOKENS, sameDenom, type TokenSymbol } from '@/lib/injective/tokens'
import { buildPayrollMultiSend, resolveHeldDenom } from '@/lib/injective/bank'
import { budgetLeft, budgetProblem, buildBudgetPayroll, fetchBudgets, type PayrollBudget } from '@/lib/injective/payroll-budget'
import { MSG_EXEC, MSG_SEND } from '@/lib/injective/transfer-checks'
import { usePayrollRuns, type PayrollRun } from '@/lib/payroll-runs'
import { PayrollRuns } from '@/components/PayrollRuns'
import { PayrollBudgetForm } from '@/components/PayrollBudgetForm'
import { ChainHealthNotice } from '@/components/ChainHealthNotice'
import { useChainHealth } from '@/hooks/useChainHealth'
import { useCosmosGasPrice } from '@/hooks/useCosmosGasPrice'
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

const OWN = 'own'
const BUDGET_MSGS = [MSG_EXEC, MSG_SEND]

/** The tokens a budget still has something left of. */
const budgetTokens = (budget: PayrollBudget) =>
  (Object.keys(TOKENS) as TokenSymbol[]).filter(t => budgetLeft(budget, TOKENS[t].denom) > BigInt(0))

const STEPS = [
  { n: 1 as Step, label: 'Configure' },
  { n: 2 as Step, label: 'Recipients' },
  { n: 3 as Step, label: 'Review' },
]

export default function PayrollPage() {
  const { isConnected, address } = useWallet()
  const {
    userAddress: cosmosAddress,
    isReady: cosmosReady,
    loading: cosmosLoading,
    error: cosmosError,
    initializeWallet: connectCosmosWallet,
  } = useCosmosTransaction()
  // Keplr or Leap signs once connected; otherwise the EVM wallet signs the
  // same MultiSend as EIP-712 typed data. Balances and checks follow the signer.
  const evmSigner = useEvmSigner()
  const signer = cosmosReady ? KEPLR : evmSigner
  const signerAccount = toInjectiveAddress(cosmosAddress ?? address)
  const own = useBalance(cosmosAddress ?? address)
  const queryClient = useQueryClient()
  const { save: saveRun } = usePayrollRuns()

  const chainHealth = useChainHealth('cosmos')

  // Pay from this account, or from another account's payroll budget given to this one.
  const [payFrom, setPayFrom] = useState(OWN)
  const budgetsQuery = useQuery({
    queryKey: ['payroll-budgets', signerAccount],
    queryFn: () => fetchBudgets(signerAccount!),
    enabled: !!signerAccount,
    staleTime: 15_000,
  })
  const budgets = budgetsQuery.data ?? []
  const budget = payFrom === OWN ? null : budgets.find(b => b.owner === payFrom) ?? null
  const budgetGone = payFrom !== OWN && !budget && !budgetsQuery.isLoading
  const fromAccount = budget ? budget.owner : signerAccount
  const ownerBalance = useBalance(budget?.owner ?? null)
  const { inj, usdc } = budget ? ownerBalance : own
  const balLoading = own.loading || (!!budget && ownerBalance.loading)

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
  // The exact denom a budget was given in, which its payments must use.
  const budgetDenom = budget?.remaining.find(c => sameDenom(c.denom, TOKENS[token].denom))?.denom ?? null

  // Fees are paid in INJ, by whoever signs. Payroll is one transaction, so one
  // fee; this is the estimate until the batch is simulated just before signing.
  // From a budget, the owner's account pays the total and the signer only the fee.
  const gasPrice = useCosmosGasPrice()
  const fee = networkFee(payrollGas(recipients.length), gasPrice)
  const feeCheck = checkFee(BigInt(own.inj || '0'), fee, token === 'INJ' && !budget ? totalBase : BigInt(0))
  const fundsError = balLoading ? null
    : overBalance && budget ? `The total is more than ${shortAddress(budget.owner)} holds: ${formatBaseUnits(balance, decimals, 4)} ${token}.`
    : overBalance ? `The total is more than your ${token} balance of ${formatBaseUnits(balance, decimals, 4)} ${token}.`
    : !feeCheck.ok ? feeShortfallMessage(feeCheck, token === 'INJ' && !budget)
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

  // The paying account (this one, or a budget's owner) and every row, checked on the review step.
  const checks = usePayrollChecks(token, fromAccount, step === 3 ? accounts : [], budget ? BUDGET_MSGS : undefined)

  // Exact base units per row, once every row has an account and an amount.
  const outputs = accounts.every(Boolean) && amounts.every(a => a !== null && a > BigInt(0))
    ? recipients.map((_, i) => ({ address: accounts[i]!, amountBase: amounts[i]!.toString() }))
    : null
  const budgetError = budget && outputs ? budgetProblem(budget, budgetDenom ?? TOKENS[token].denom, outputs) : null

  const canProceedStep1 = payrollName.trim().length > 0 && !budgetGone
  const canProceedStep2 = outputs !== null

  const chooseFrom = (choice: string) => {
    setPayFrom(choice)
    const chosen = budgets.find(b => b.owner === choice)
    const tokens = chosen ? budgetTokens(chosen) : []
    if (chosen && tokens.length && !tokens.includes(token)) setToken(tokens[0])
  }

  // Start a new run from a saved one: same name, token, payer and rows, all editable.
  const reuseRun = (run: PayrollRun) => {
    const { decimals: runDecimals } = TOKENS[run.token]
    setPayrollName(run.name)
    setToken(run.token)
    setPayFrom(run.operator ? run.from : OWN)
    setRecipients(run.rows.map((row, i) => ({
      id: `${Date.now()}-${i}`,
      label: row.label ?? '',
      address: row.address,
      amount: formatBaseUnits(row.amountBase, runDecimals),
    })))
    setPaid(null)
    setStatus({ type: null, message: '' })
    setStep(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDispatch = async () => {
    setLoading(true)
    setStatus({ type: null, message: '' })
    setPaid(null)
    try {
      if (!signer) throw new Error('Connect a wallet to sign the payroll.')
      if (!outputs) throw new Error('Every row needs an account and an amount.')
      const sender = await signerAddress(signer)
      let denom: string
      let hash: string
      if (budget) {
        // One MsgExec of one MsgSend per row, from the owner's account, signed by this one.
        if (budget.operator !== sender) throw new Error(`This budget was given to ${shortAddress(budget.operator)}. Sign with that account.`)
        denom = budgetDenom ?? TOKENS[token].denom
        hash = await signAndBroadcast(buildBudgetPayroll(budget, denom, outputs), CHAIN_ID, MEMO_PAYROLL, signer)
      } else {
        // One MsgMultiSend for everyone, in the denom spelling this account holds.
        denom = await resolveHeldDenom(sender, TOKENS[token])
        const msg = buildPayrollMultiSend(sender, denom, outputs.map(o => ({ address: o.address, amount: o.amountBase })))
        hash = await signAndBroadcast(msg, CHAIN_ID, MEMO_PAYROLL, signer)
      }
      saveRun({
        id: hash,
        name: payrollName.trim(),
        token,
        denom,
        from: budget ? budget.owner : sender,
        ...(budget && { operator: sender }),
        rows: outputs.map((o, i) => ({ ...(recipients[i].label?.trim() && { label: recipients[i].label!.trim() }), ...o })),
        hash,
        paidAt: new Date().toISOString(),
      })
      void queryClient.invalidateQueries({ queryKey: ['bank-balances'] })
      if (budget) void queryClient.invalidateQueries({ queryKey: ['payroll-budgets'] })
      const n = recipients.length
      const source = budget ? ` from ${shortAddress(budget.owner)}'s account` : ''
      setPaid({
        hash,
        message: `Payroll "${payrollName.trim()}" paid ${n} recipient${n > 1 ? 's' : ''} in ${token}${source} in one transaction, confirmed on chain. It's saved under Past runs on this device.`,
      })
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
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Batch-pay your team in one on-chain transaction, from your account or from a payroll budget you were given.</p>
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
              {budget ? (
                <>
                  Left in this budget: <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{formatBaseUnits(budgetLeft(budget, TOKENS[token].denom), decimals, 4)} {token}</span>
                  {' · '}{shortAddress(budget.owner)} holds {balLoading ? '—' : formatBaseUnits(balance, decimals, 4)} {token}
                </>
              ) : (
                <>Available: <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{balLoading ? '—' : formatBaseUnits(balance, decimals, 4)} {token}</span></>
              )}
            </p>
          </div>
          {(budgets.length > 0 || payFrom !== OWN) && (
            <div>
              <label className="label">Pay from</label>
              <div role="radiogroup" aria-label="Pay from" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[null, ...budgets].map(b => {
                  const value = b ? b.owner : OWN
                  const selected = payFrom === value
                  return (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => chooseFrom(value)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: '9px',
                        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                        background: selected ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600 }}>
                        {b ? `${shortAddress(b.owner)}'s payroll budget` : 'Your account'}
                      </span>
                      <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.5 }}>
                        {b
                          ? [
                              budgetTokens(b).map(t => `${formatBaseUnits(budgetLeft(b, TOKENS[t].denom), TOKENS[t].decimals, 4)} ${t} left`).join(', ') || 'Only tokens NinjaPay doesn\u2019t pay in',
                              b.expiresAt ? `until ${format(b.expiresAt, 'd MMM yyyy')}` : 'no end date',
                              b.allowList.length ? `only ${b.allowList.length} listed account${b.allowList.length === 1 ? '' : 's'}` : 'any account',
                            ].join(' · ')
                          : signerAccount ? shortAddress(signerAccount) : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
              {budget && (
                <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  The total comes out of {shortAddress(budget.owner)}&rsquo;s account and its budget. You sign and pay the network fee.
                </p>
              )}
              {budgetGone && (
                <div role="alert" className="alert-error" style={{ marginTop: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>
                    {budgetsQuery.isError
                      ? 'Couldn\u2019t read your payroll budgets from Injective. Try again in a moment, or pay from your account.'
                      : `The payroll budget from ${shortAddress(payFrom)} is no longer open: it was revoked, used up or has ended. Pay from your account, or ask for a new budget.`}
                  </span>
                </div>
              )}
            </div>
          )}
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
          {budget && budget.allowList.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              This budget may only pay the {budget.allowList.length} account{budget.allowList.length === 1 ? '' : 's'} {shortAddress(budget.owner)} listed. Injective refuses anyone else.
            </p>
          )}
          {budgetError && step === 2 && <p style={{ fontSize: '12px', color: 'var(--error)' }}>{budgetError}</p>}
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
            {budget && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Paid from</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', textAlign: 'right' }}>{shortAddress(budget.owner)}&rsquo;s payroll budget</span>
              </div>
            )}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <span style={{ flex: 1, minWidth: '180px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Your EVM wallet signs this payroll. It shows the payments as a block of text to approve, not as a usual transaction.
              </span>
              <button onClick={connectCosmosWallet} disabled={cosmosLoading} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                {cosmosLoading ? 'Connecting…' : 'Use Keplr or Leap instead'}
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

          {[budgetGone ? 'This payroll budget is no longer open. Go back and pay from your account.' : budgetError, fundsError].filter(Boolean).map(message => (
            <div key={message} className="alert-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
              <span>{message}</span>
            </div>
          ))}

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
            <button onClick={handleDispatch} disabled={loading || cosmosLoading || balLoading || !!fundsError || !!budgetError || budgetGone || !signer || !chainHealth.canSend || checks.blocks.length > 0} className="btn-primary" style={{ flex: 2, padding: '13px' }}>
              {(loading || cosmosLoading) ? <><span className="spinner" /> Dispatching...</> : <><Users2 size={15} /> Dispatch Payroll</>}
            </button>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.6' }}>
            {budget
              ? 'Sent as one transaction with a payment per recipient under the budget: one signature and one fee, and either every recipient is paid or none is.'
              : 'Sent as one MsgMultiSend transaction: one signature and one fee, and either every recipient is paid or none is.'}
          </p>
        </div>
      )}

      <PayrollRuns onReuse={reuseRun} />
      <PayrollBudgetForm owner={signerAccount} signer={signer} />
    </div>
  )
}
