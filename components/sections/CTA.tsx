'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Container } from './Container'
import { Background } from './Background'

export function CTA() {
  return (
    <section className="reveal" style={{ maxWidth: '1280px', margin: '0 auto', padding: '88px 24px' }}>
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: '20px',
          padding: '72px 40px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Background variant="lg" position="bottom-center" />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2
            style={{
              fontSize: 'clamp(26px, 4vw, 44px)',
              fontWeight: '800',
              color: 'var(--text-primary)',
              letterSpacing: '-0.03em',
              marginBottom: '16px',
            }}
          >
            Ready to get started?
          </h2>
          <p
            style={{
              fontSize: '16px',
              color: 'var(--text-secondary)',
              maxWidth: '480px',
              margin: '0 auto 36px',
              lineHeight: '1.7',
            }}
          >
            Connect your wallet and access the full NinjaPay suite — no signup, no KYC delay, no waiting.
          </p>
          <Link href="/send" className="btn-primary" style={{ padding: '14px 36px', fontSize: '16px' }}>
            Launch App
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  )
}
