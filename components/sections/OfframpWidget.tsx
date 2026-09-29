'use client'

import { OfframpUnavailable } from '@/components/OfframpUnavailable'

// The NGN off-ramp is not live; see OfframpUnavailable.
export function OfframpWidget() {
  return (
    <div className="reveal-right" style={{ position: 'relative', zIndex: 1, marginTop: '20px' }}>
      <OfframpUnavailable className="card-glass" />
    </div>
  )
}
