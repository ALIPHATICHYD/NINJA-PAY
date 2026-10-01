'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, KeyRound } from 'lucide-react'
import { useRecipient } from '@/hooks/useRecipients'
import { usePayrollRuns } from '@/lib/payroll-runs'
import { signAndBroadcast, type CosmosSigner } from '@/lib/injective/cosmos-transactions'
import { BUDGET_LIFETIME_DAYS, budgetExpiry, buildBudgetGrant, type BudgetLifetime } from '@/lib/injective/payroll-budget'
import { resolveHeldDenom } from '@/lib/injective/bank'
import { CHAIN_ID } from '@/lib/injective/network'
import { TOKENS, type TokenSymbol } from '@/lib/injective/tokens'
import { shortAddress } from '@/lib/injective/address'
import { errorMessage } from '@/lib/injective/transfer-errors'
import { toChainAmount } from '@/lib/money'

/**
 * Lets another account (an operator, such as a payroll officer) pay payroll
 * from this account: one authz SendAuthorization capped at a total, ending on
 * a date, and optionally only to the accounts of a saved run. The owner signs
 * it; NinjaPay holds nothing and can't use it. Revoked on Approvals.
 */
export function PayrollBudgetForm({ owner, signer }: { owner: string | null; signer: CosmosSigner | null }) {
  const queryClient = useQueryClient()
  const { runs } = usePayrollRuns()
  const ownRuns = runs.filter(r => r.from === owner && !r.operator)
  const [open, setOpen] = useState(false)
  const [operatorInput, setOperatorInput] = useState('')
  const [token, setToken] = useState<TokenSymbol>('USDC')
  const [total, setTotal] = useState('')
  const [days, setDays] = useState<BudgetLifetime>(30)
  const [onlyRun, setOnlyRun] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const operator = useRecipient(operatorInput)
  const operatorAccount = operator.account?.injective ?? null
  let totalBase: bigint | null = null
  try { totalBase = total.trim() ? BigInt(toChainAmount(total, TOKENS[token].decimals)) : null } catch { totalBase = null }
  const allowList = ownRuns.find(r => r.id === onlyRun)?.rows.map(r => r.address) ?? []
  const ends = budgetExpiry(days)

  const problem =
    operatorAccount && operatorAccount === owner ? "That's this account. Give the budget to the account that will run payroll."
    : total.trim() && (totalBase === null || totalBase <= BigInt(0)) ? `Enter a total above zero, with at most ${TOKENS[token].decimals} decimal places.`
    : null
  const ready = !!owner && !!signer && !!operatorAccount && totalBase !== null && totalBase > BigInt(0) && !problem

  const give = async () => {
    if (!ready || !owner || !signer || !operatorAccount || totalBase === null) return
    setBusy(true)
    setStatus(null)
    try {
      const denom = await resolveHeldDenom(owner, TOKENS[token])
      await signAndBroadcast(buildBudgetGrant(owner, operatorAccount, { denom, totalBase, expiresAt: ends, allowList }), CHAIN_ID, '', signer)
      void queryClient.invalidateQueries({ queryKey: ['approvals'] })
      setStatus({
        type: 'success',
        message: `${shortAddress(operatorAccount)} can now pay up to ${total.trim()} ${token} of payroll from this account until ${format(ends, 'd MMM yyyy')}.`,
      })
      setOperatorInput('')
      setTotal('')
      setOnlyRun('')
    } catch (e) {
      setStatus({ type: 'error', message: errorMessage(e) || 'The budget wasn’t given.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Let someone else run payroll</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Give another account a payroll budget: it can pay staff from this account up to a total, until a date. It signs and pays the network fee for each run.
          </p>
        </div>
        {!open && (
          <button onClick={() => { setOpen(true); setStatus(null) }} className="btn-secondary" style={{ fontSize: '12px', padding: '7px 12px' }}>
            <KeyRound size={13} /> Give a payroll budget
          </button>
        )}
      </div>

      {status?.type === 'success' && (
        <div className="alert-success" role="status" style={{ lineHeight: 1.6 }}>
          {status.message} You can revoke it any time on <Link href="/approvals" style={{ textDecoration: 'underline' }}>Approvals</Link>.
        </div>
      )}

      {open && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label className="label" htmlFor="budget-operator">Who runs payroll</label>
            <input
              id="budget-operator"
              className="input input-mono"
              placeholder="inj1…, 0x… or name.inj"
              autoCapitalize="none"
              spellCheck={false}
              value={operatorInput}
              onChange={e => setOperatorInput(e.target.value)}
              aria-invalid={!!operator.error}
              style={{ fontSize: '12px' }}
            />
            {operator.error && <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--error)' }}>{operator.error}</p>}
            {operator.kind === 'name' && operatorAccount && (
              <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{operator.name} is {operatorAccount}.</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <label className="label">Token</label>
              <div className="seg-control">
                {(['USDC', 'INJ'] as const).map(t => (
                  <button key={t} onClick={() => setToken(t)} className={`seg-btn${token === t ? ' active' : ''}`}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label className="label" htmlFor="budget-total">Budget ({token})</label>
              <input id="budget-total" className="input" type="number" min="0" step="0.01" placeholder="0.00" value={total} onChange={e => setTotal(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Ends after</label>
            <div className="seg-control">
              {BUDGET_LIFETIME_DAYS.map(d => (
                <button key={d} onClick={() => setDays(d)} className={`seg-btn${days === d ? ' active' : ''}`}>{d} days</button>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="budget-only">Who it may pay</label>
            <select id="budget-only" className="select" value={onlyRun} onChange={e => setOnlyRun(e.target.value)} style={{ fontSize: '13px' }}>
              <option value="">Any account</option>
              {ownRuns.map(r => (
                <option key={r.id} value={r.id}>Only the {r.rows.length} account{r.rows.length === 1 ? '' : 's'} in “{r.name}”</option>
              ))}
            </select>
            <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {ownRuns.length ? 'A list is checked by Injective on every payment.' : 'Pay a run from this account first to limit a budget to its accounts.'}
            </p>
          </div>

          {problem && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
              <span>{problem}</span>
            </div>
          )}

          {ready && (
            <div className="alert-warning" style={{ lineHeight: 1.6 }}>
              {shortAddress(operatorAccount)} will be able to send up to {total.trim()} {token} from this account
              {allowList.length ? ` to the ${allowList.length} listed account${allowList.length === 1 ? '' : 's'}` : ' to any account'}, without asking you again,
              until {format(ends, 'd MMM yyyy')}. Only give a budget to someone you trust to run payroll.
              If this account already gave them one, this replaces it.
            </div>
          )}

          {status?.type === 'error' && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
              <span>{status.message}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setOpen(false); setStatus(null) }} className="btn-secondary" style={{ flex: 1 }} disabled={busy}>Cancel</button>
            <button onClick={give} disabled={!ready || busy} className="btn-primary" style={{ flex: 2 }}>
              {busy ? <><span className="spinner" /> Waiting for your wallet…</> : 'Give budget'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
