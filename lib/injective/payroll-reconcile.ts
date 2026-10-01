/**
 * Checks a saved payroll run against its transaction on the chain.
 *
 * The run on this device says who should have been paid what; the chain says
 * what happened. A run shows as paid only when its transaction succeeded and
 * paid every saved row exactly (same account, same denom, same base units)
 * from the run's account, and nothing else from it.
 */

import { sameDenom } from './tokens'
import type { Receipt } from './receipt'
import type { PayrollRun } from '../payroll-runs'

export type RunCheck =
  | { status: 'paid'; timestamp: Date | null }
  | { status: 'failed'; reason: string }
  | { status: 'pending' }
  | { status: 'not-found' }
  /** `missingRows` are 1-based row numbers; `extra` counts transfers from the run's account that no row accounts for. */
  | { status: 'mismatch'; missingRows: number[]; extra: number }

export function reconcileRun(run: Pick<PayrollRun, 'from' | 'denom' | 'rows'>, receipt: Receipt | null): RunCheck {
  if (!receipt) return { status: 'not-found' }
  if (receipt.status === 'pending') return { status: 'pending' }
  if (receipt.status === 'failed') return { status: 'failed', reason: receipt.failure ?? '' }

  const unmatched = receipt.transfers.filter(t => t.from === run.from)
  const missingRows: number[] = []
  run.rows.forEach((row, i) => {
    const match = unmatched.findIndex(
      t => t.to === row.address && sameDenom(t.coin.denom, run.denom) && t.coin.amountBase === row.amountBase,
    )
    if (match < 0) missingRows.push(i + 1)
    else unmatched.splice(match, 1)
  })
  if (missingRows.length || unmatched.length) return { status: 'mismatch', missingRows, extra: unmatched.length }
  return { status: 'paid', timestamp: receipt.timestamp }
}

/** One plain sentence for a check, as the Payroll page shows it. */
export function describeRunCheck(check: RunCheck): string {
  switch (check.status) {
    case 'paid':
      return 'Paid on chain: every row matches the transaction.'
    case 'failed':
      return `The transaction failed on chain, so nobody was paid${check.reason ? ` (${check.reason})` : ''}.`
    case 'pending':
      return 'The transaction is still waiting to be included in a block.'
    case 'not-found':
      return "The node NinjaPay reads from doesn't have this transaction. It may be older than the node keeps, or from another network."
    case 'mismatch': {
      const parts = []
      if (check.missingRows.length) {
        parts.push(`${check.missingRows.length === 1 ? 'row' : 'rows'} ${check.missingRows.join(', ')} weren't paid as saved`)
      }
      if (check.extra) parts.push(`it also paid ${check.extra} transfer${check.extra === 1 ? '' : 's'} not in this run`)
      return `This saved run doesn't match its transaction: ${parts.join(', and ')}.`
    }
  }
}
