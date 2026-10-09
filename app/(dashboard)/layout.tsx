'use client'

import React from 'react'
import { Navigation } from '@/components/Navigation'
import { Web3Providers } from '@/components/Web3Providers'
import { LivePayments } from '@/components/LivePayments'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Web3Providers>
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
        </div>
      </footer>
      <LivePayments />
    </div>
    </Web3Providers>
  )
}
