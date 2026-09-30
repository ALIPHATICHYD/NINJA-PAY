import { AlertCircle } from 'lucide-react'
import type { ChainHealthState } from '@/hooks/useChainHealth'
import { NETWORK_LABEL } from '@/lib/injective/network'

/** Explains why sending is paused, or warns about a scheduled network upgrade. Renders nothing when all is well. */
export function ChainHealthNotice({ state }: { state: ChainHealthState }) {
  const { health, upgrade } = state
  if (health && !health.ok) {
    return (
      <div className="alert-error" role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} aria-hidden="true" />
        <span>{health.reason}</span>
      </div>
    )
  }
  if (upgrade) {
    return (
      <div className="alert-warning" style={{ fontSize: '12px' }}>
        {NETWORK_LABEL} has a network upgrade ({upgrade.name}) scheduled at block {upgrade.height.toLocaleString('en')}. Sending pauses while the chain upgrades.
      </div>
    )
  }
  return null
}
