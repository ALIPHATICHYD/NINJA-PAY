'use client'

/**
 * Payroll runs, saved once they are paid, in this browser only (localStorage).
 * Kept off the shared database on purpose, like beneficiaries: it has no auth
 * yet, and who was paid how much is personal data under Nigeria's NDPA.
 *
 * A saved run is a claim about the chain, not a record of payment: the
 * Payroll page checks each one against its transaction before showing it as
 * paid (lib/injective/payroll-reconcile.ts).
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react'

export type PayrollRunRow = {
  label?: string
  /** inj1 address that was paid. */
  address: string
  /** Exact base units, as sent. */
  amountBase: string
}

export interface PayrollRun {
  id: string
  name: string
  token: 'INJ' | 'USDC'
  /** The exact denom sent. */
  denom: string
  /** The account the run paid from (inj1). */
  from: string
  /** The account that signed, when it paid from someone else's account through a payroll budget. */
  operator?: string
  rows: PayrollRunRow[]
  hash: string
  /** ISO time the run was confirmed. */
  paidAt: string
}

const STORAGE_KEY = 'ninjapay:payroll-runs'
const CHANGE_EVENT = 'ninjapay:payroll-runs-change'
// Older runs drop off the end, so storage stays small.
export const MAX_SAVED_RUNS = 100

function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '[]'
  } catch {
    return '[]'
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange) // other tabs
  window.addEventListener(CHANGE_EVENT, onChange) // this tab
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function parse(raw: string): PayrollRun[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(runs: PayrollRun[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_SAVED_RUNS)))
  } catch {
    // Storage unavailable (private mode or blocked); nothing is persisted.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Saved runs, newest first, with ways to add and remove one. Empty on the server. */
export function usePayrollRuns(): { runs: PayrollRun[]; save: (run: PayrollRun) => void; remove: (id: string) => void } {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '[]')
  const runs = useMemo(() => parse(raw), [raw])
  const save = useCallback((run: PayrollRun) => write([run, ...parse(readRaw()).filter(r => r.id !== run.id)]), [])
  const remove = useCallback((id: string) => write(parse(readRaw()).filter(r => r.id !== id)), [])
  return { runs, save, remove }
}

/** The run's total in base units. */
export const runTotal = (run: Pick<PayrollRun, 'rows'>) => run.rows.reduce((sum, row) => sum + BigInt(row.amountBase), BigInt(0))
