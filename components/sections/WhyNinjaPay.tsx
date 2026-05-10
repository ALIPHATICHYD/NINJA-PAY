'use client'

import { Shield, Zap, Wallet, CheckCircle2 } from 'lucide-react'
import { Container } from './Container'

const WHY_ITEMS = [
  { icon: Shield, title: 'Non-Custodial', desc: 'You hold your keys. NinjaPay never takes custody of your funds.' },
  { icon: Zap, title: 'Sub-Second Finality', desc: 'Injective settles transactions faster than any EVM chain.' },
  { icon: Wallet, title: 'Multi-Wallet', desc: 'Keplr, Leap, and MetaMask — pick whatever you already use.' },
  { icon: CheckCircle2, title: 'Transparent Fees', desc: 'All fees shown upfront. No hidden charges, ever.' },
]

export function WhyNinjaPay() {
  return (
    <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '88px 24px' }}>
      <Container>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}>
          {WHY_ITEMS.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={item.title} className={`card card-hover reveal delay-${(i % 4) + 1}`}>
                <div className="icon-box" style={{ marginBottom: '16px' }}>
                  <Icon size={18} />
                </div>
                <h3 style={{
                  fontSize: '15px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginBottom: '6px',
                }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.65' }}>
                  {item.desc}
                </p>
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
