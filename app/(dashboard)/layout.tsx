'use client'

import React from 'react'
import { Navigation } from '@/components/Navigation'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navigation />

      <main
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '40px 24px 80px',
        }}
      >
        {children}
      </main>

      <footer style={{ borderTop: '1px solid var(--border)' }}>
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '20px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            © 2026 NinjaPay · Built on Injective
          </p>
          <div style={{ display: 'flex', gap: '20px' }}>
            {['Terms of Service', 'Privacy Policy', 'Support'].map(item => (
              <a
                key={item}
                href="#"
                style={{ fontSize: '12px', color: 'var(--text-muted)', transition: 'color 0.15s' }}
                onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)')}
                onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)')}
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
