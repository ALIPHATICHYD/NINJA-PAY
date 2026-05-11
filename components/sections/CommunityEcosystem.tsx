'use client'

import { Container } from '../Container'
import { SectionHeader } from '../SectionHeader'

export function CommunityEcosystem() {
  return (
    <section style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
      <Container style={{ padding: '88px 24px' }}>
        <SectionHeader badge="Ecosystem" title="Other Community Products" centered />

        <div className="reveal delay-1" style={{ display: 'flex', justifyContent: 'center' }}>
          <a
            href="https://injective-by-examples.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="card card-hover"
            style={{
              textDecoration: 'none',
              maxWidth: '400px',
              textAlign: 'center',
              padding: '32px 24px',
            }}
          >
            <h3 style={{
              fontSize: '18px',
              fontWeight: '800',
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}>
              Injective By Examples
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.65' }}>
              Built for the African Community for onboarding into the Injective ecosystem.
            </p>
          </a>
        </div>
      </Container>
    </section>
  )
}
