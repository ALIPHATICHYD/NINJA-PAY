'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { useQueries } from '@tanstack/react-query'
import { Download, RefreshCcw, Repeat2, Trash2 } from 'lucide-react'
import { StatusChip, type ChainState } from '@/components/StatusChip'
import { usePayrollRuns, runTotal, type PayrollRun } from '@/lib/payroll-runs'
import { fetchReceipt } from '@/lib/injective/receipt'
import { describeRunCheck, reconcileRun, type RunCheck } from '@/lib/injective/payroll-reconcile'
import { shortAddress } from '@/lib/injective/address'
import { TOKENS } from '@/lib/injective/tokens'
import { formatBaseUnits } from '@/lib/money'
import { downloadCsv, payrollRunCsv } from '@/lib/statement'

const SHOWN = 5
const RECHECK_FOR_MS = 10 * 60_000

const CHIP: Record<RunCheck['status'], { state: ChainState; label: string }> = {
  paid: { state: 'confirmed', label: 'Paid on chain' },
  failed: { state: 'failed', label: 'Failed on chain' },
  pending: { state: 'pending', label: 'Pending' },
  'not-found': { state: 'not-live', label: 'Not found on chain' },
  mismatch: { state: 'failed', label: "Doesn't match the chain" },
}

/**
 * Payroll runs saved on this device, each checked against its transaction on
 * the chain before it shows as paid. A run can be used again as the start of
 * a new one, or saved as a CSV.
 */
export function PayrollRuns({ onReuse }: { onReuse: (run: PayrollRun) => void }) {
  const { runs, remove } = usePayrollRuns()
  const [showAll, setShowAll] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const shown = showAll ? runs : runs.slice(0, SHOWN)

  // A transaction never changes once included, so a check that found it holds.
  // One not found yet, or still pending, is checked again for a few minutes after the run.
  const checks = useQueries({
    queries: shown.map(run => ({
      queryKey: ['payroll-run', run.hash],
      queryFn: () => fetchReceipt(run.hash),
      staleTime: Infinity,
      retry: 1,
      refetchInterval: (query: { state: { data?: Awaited<ReturnType<typeof fetchReceipt>> } }) => {
        const settled = query.state.data && query.state.data.status !== 'pending'
        return !settled && Date.now() - Date.parse(run.paidAt) < RECHECK_FOR_MS ? 5_000 : false
      },
    })),
  })

  if (runs.length === 0) return null

  return (
    <section style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Past runs</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Saved on this device only, and checked against each run&rsquo;s transaction on Injective.
        </p>
      </div>

      {shown.map((run, i) => {
        const query = checks[i]
        const check = query?.isSuccess ? reconcileRun(run, query.data ?? null) : null
        const { decimals } = TOKENS[run.token]
        const total = formatBaseUnits(runTotal(run), decimals)
        return (
          <div key={run.id} className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{run.name}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {format(new Date(run.paidAt), 'd MMM yyyy, HH:mm')} · {run.rows.length} recipient{run.rows.length === 1 ? '' : 's'} · {total} {run.token}
                </p>
                {run.operator && (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                    Paid from {shortAddress(run.from)}&rsquo;s payroll budget, signed by {shortAddress(run.operator)}.
                  </p>
                )}
              </div>
              {query?.isLoading ? (
                <StatusChip state="pending" label="Checking" />
              ) : query?.isError ? (
                <StatusChip state="not-live" label="Couldn't check" />
              ) : check ? (
                <StatusChip state={CHIP[check.status].state} label={CHIP[check.status].label} />
              ) : null}
            </div>

            {query?.isError ? (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                Couldn&rsquo;t read this run&rsquo;s transaction from Injective.
                <button onClick={() => void query.refetch()} className="btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }}>
                  <RefreshCcw size={12} /> Try again
                </button>
              </p>
            ) : check && check.status !== 'paid' ? (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{describeRunCheck(check)}</p>
            ) : null}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={() => onReuse(run)} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                <Repeat2 size={13} /> Use again
              </button>
              <Link href={`/receipt/${run.hash}`} className="btn-ghost" style={{ fontSize: '12px', padding: '6px 10px' }}>
                Receipt
              </Link>
              <button
                onClick={() => downloadCsv(
                  payrollRunCsv(run, decimals, check ? CHIP[check.status].label : 'Not checked'),
                  `ninjapay-payroll-${run.paidAt.slice(0, 10)}-${run.id.slice(0, 6)}.csv`,
                )}
                className="btn-ghost"
                style={{ fontSize: '12px', padding: '6px 10px' }}
              >
                <Download size={13} /> CSV
              </button>
              {confirmRemove === run.id ? (
                <>
                  <button onClick={() => { remove(run.id); setConfirmRemove(null) }} className="btn-ghost" style={{ fontSize: '12px', padding: '6px 10px', color: 'var(--error)' }}>
                    Remove from this device
                  </button>
                  <button onClick={() => setConfirmRemove(null)} className="btn-ghost" style={{ fontSize: '12px', padding: '6px 10px' }}>
                    Keep
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmRemove(run.id)} className="btn-ghost" aria-label={`Remove ${run.name}`} style={{ fontSize: '12px', padding: '6px 10px', color: 'var(--text-muted)' }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        )
      })}

      {runs.length > SHOWN && (
        <button onClick={() => setShowAll(!showAll)} className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: '12px' }}>
          {showAll ? 'Show fewer' : `Show all ${runs.length} runs`}
        </button>
      )}
    </section>
  )
}
