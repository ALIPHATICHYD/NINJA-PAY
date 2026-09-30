'use client'

/**
 * Saved beneficiaries, stored in this browser only (localStorage).
 * Kept off the shared database on purpose: it has no auth yet, so names and
 * addresses stored there would be readable by anyone with the public anon key.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react'

export interface Beneficiary {
  id: string
  name: string
  address: string
  tag?: string
  addedAt: string
}

const STORAGE_KEY = 'ninjapay:beneficiaries'
const CHANGE_EVENT = 'ninjapay:beneficiaries-change'

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

function parse(raw: string): Beneficiary[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Saved beneficiaries plus a setter. Renders an empty list on the server. */
export function useBeneficiaries(): [Beneficiary[], (next: Beneficiary[]) => void] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '[]')
  const list = useMemo(() => parse(raw), [raw])
  const setList = useCallback((next: Beneficiary[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage unavailable (private mode or blocked); nothing is persisted.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])
  return [list, setList]
}
