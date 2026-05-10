'use client'

import { Container } from './Container'

export function StatsStrip() {
  const stats = [
    { label: 'Settlement time', value: '< 1 second' },
    { label: 'Network fee', value: '~$0.002' },
    { label: 'Wallets supported', value: '3 wallets' },
    { label: 'Off-ramp currency', value: 'NGN via Onboard' },
  ]

  return (
    <section className="reveal" style={{
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
    }}>
      <Container style={{ padding: '28px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '24px' }}>
        {stats.map((stat, i) => (
          <div key={stat.label} style={{ textAlign: 'center' }}>
            <p style={{
              fontSize: '22px',
              fontWeight: '700',
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              marginBottom: '4px',
            }}>
              {stat.value}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {stat.label}
            </p>
          </div>
        ))}
      </Container>
    </section>
  )
}
