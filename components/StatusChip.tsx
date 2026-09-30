import { Check } from 'lucide-react'

export type ChainState = 'awaiting-signature' | 'pending' | 'confirmed' | 'failed' | 'not-live'

const CHIPS: Record<ChainState, { className: string; label: string }> = {
  'awaiting-signature': { className: 'badge-neutral', label: 'Waiting for signature' },
  pending: { className: 'badge-pending', label: 'Pending' },
  confirmed: { className: 'badge-success', label: 'Confirmed' },
  failed: { className: 'badge-error', label: 'Failed' },
  'not-live': { className: 'badge-warning', label: 'Not live yet' },
}

/**
 * One chip for every transaction and product state, so a colour always means the same thing:
 * Lemon pending, Lime confirmed, red failed, Coral not live. Show `confirmed` only after the
 * chain has included the transaction, never on a timer.
 */
export function StatusChip({ state, label, className = '' }: { state: ChainState; label?: string; className?: string }) {
  const chip = CHIPS[state]
  return (
    <span className={`badge ${chip.className} ${className}`}>
      {state === 'confirmed' ? (
        <Check size={11} strokeWidth={2.5} aria-hidden="true" />
      ) : (
        <span className="badge-dot" aria-hidden="true" />
      )}
      {label ?? chip.label}
    </span>
  )
}
