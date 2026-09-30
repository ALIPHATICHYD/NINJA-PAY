import { ArrowLeftRight } from 'lucide-react'
import { StatusChip } from '@/components/StatusChip'

/**
 * Honest placeholder for the NGN off-ramp.
 *
 * The off-ramp is not live: no payout partner is connected and NinjaPay
 * does not convert crypto to NGN itself. Nothing here quotes a rate,
 * collects bank details, or moves value.
 */
export function OfframpUnavailable({ className = 'card' }: { className?: string }) {
  return (
    <div className={className} style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div className="icon-box">
          <ArrowLeftRight size={16} />
        </div>
        <div>
          <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Off-ramp to NGN</p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Not available yet</p>
        </div>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
        Cashing out to a Nigerian bank account isn&apos;t live. It will only launch through a
        licensed partner, and none is connected today. Nothing here quotes a rate or moves money.
      </p>
      <StatusChip state="not-live" className="mt-4" />
    </div>
  )
}
