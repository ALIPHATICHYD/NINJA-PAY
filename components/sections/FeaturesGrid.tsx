'use client'

import { Send, CreditCard, Share2, Users2, BarChart3, ListOrdered } from 'lucide-react'
import { Container } from './Container'
import { SectionHeader } from './SectionHeader'

const FEATURES = [
  { icon: Send, title: 'Send', desc: 'Transfer INJ or USDC to any Injective wallet address instantly.' },
  { icon: CreditCard, title: 'Pay Bills', desc: 'Airtime, data, electricity, and cable. Not live yet.' },
  { icon: Share2, title: 'Claims', desc: 'Create shareable links to distribute tokens to any group.' },
  { icon: Users2, title: 'Payroll', desc: 'Batch-pay your team or DAO in a single transaction.' },
  { icon: BarChart3, title: 'Analytics', desc: 'Track volume, transaction counts, and performance over time.' },
  { icon: ListOrdered, title: 'Transactions', desc: 'Full on-chain history, filterable by type and status.' },
]

export function FeaturesGrid() {
  return (
    <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '88px 24px' }}>
      <Container>
        <SectionHeader badge="Features" title="Everything you need in one place" />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <div key={f.title} className={`feature-card reveal delay-${(i % 3) + 1}`}>
                <div className="icon-box" style={{ marginBottom: '18px' }}>
                  <Icon size={18} />
                </div>
                <h3 style={{
                  fontSize: '15px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.65' }}>
                  {f.desc}
                </p>
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
