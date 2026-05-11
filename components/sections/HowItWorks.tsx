'use client'

import { Container } from '../Container'
import { SectionHeader } from '../SectionHeader'

const STEPS = [
  { step: '01', title: 'Connect your wallet', desc: 'Use Keplr, Leap, or MetaMask to connect your Injective wallet with one click.' },
  { step: '02', title: 'Choose an action', desc: 'Send tokens, pay a bill, create a claim pool, or run payroll from the dashboard.' },
  { step: '03', title: 'Sign the transaction', desc: 'Review all details, then sign from your wallet. No private keys ever leave your device.' },
  { step: '04', title: 'Settlement on-chain', desc: 'Transactions settle on Injective in under a second. View them in your history instantly.' },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
    }}>
      <Container style={{ padding: '88px 24px' }}>
        <SectionHeader badge="How It Works" title="Get started in minutes" />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '40px',
        }}>
          {STEPS.map((s, i) => (
            <div key={s.step} className={`reveal delay-${(i % 4) + 1}`}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '9px',
                background: 'var(--accent-subtle)',
                border: '1px solid rgba(91,88,240,0.25)',
                marginBottom: '16px',
                fontSize: '12px',
                fontWeight: '800',
                color: 'var(--accent)',
              }}>
                {s.step}
              </div>
              <h3 style={{
                fontSize: '15px',
                fontWeight: '700',
                color: 'var(--text-primary)',
                marginBottom: '8px',
              }}>
                {s.title}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.65' }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
