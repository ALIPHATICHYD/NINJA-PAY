'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Container } from './Container'
import { Background } from './Background'

export function Hero() {
  return (
    <section
      style={{
        position: 'relative',
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '90px 24px 60px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '64px',
        alignItems: 'center',
      }}
    >
      <Background variant="lg" position="top-left" />
      <Background variant="sm" position="top-right" />

      {/* Left: copy */}
      <div className="reveal-left" style={{ position: 'relative', zIndex: 1 }}>
        <div className="hero-badge reveal delay-1" style={{ marginBottom: '28px', display: 'inline-flex' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />
          Built for the Injective Africa Community
        </div>

        <h1
          className="reveal delay-2"
          style={{
            fontSize: 'clamp(38px, 6vw, 66px)',
            fontWeight: '800',
            color: 'var(--text-primary)',
            letterSpacing: '-0.04em',
            lineHeight: '1.08',
            marginBottom: '24px',
          }}
        >
          Crypto payments{'\u00A0'}for{' '}
          <span className="gradient-text">the real world.</span>
        </h1>

        <p
          className="reveal delay-3"
          style={{
            fontSize: '18px',
            color: 'var(--text-secondary)',
            maxWidth: '520px',
            lineHeight: '1.75',
            marginBottom: '40px',
          }}
        >
          Send INJ and USDC, pay utility bills, run crypto payroll, and
          off-ramp directly to your Nigerian bank — all from one non-custodial
          interface on Injective.
        </p>

        <div className="reveal delay-4" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/send" className="btn-primary" style={{ padding: '13px 28px', fontSize: '15px' }}>
            Get Started
            <ArrowRight size={16} />
          </Link>
          <a href="#how-it-works" className="btn-secondary" style={{ padding: '13px 28px', fontSize: '15px' }}>
            How it works
          </a>
        </div>

        <div className="reveal delay-4" style={{ display: 'flex', gap: '24px', marginTop: '40px', flexWrap: 'wrap' }}>
          {[
            { label: 'Settlement', value: '< 1 second' },
            { label: 'Network fee', value: '~$0.002' },
            { label: 'Wallets', value: 'Keplr · Leap · MetaMask' },
          ].map((s) => (
            <div key={s.label}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {s.value}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
