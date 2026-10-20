'use client'

import React from 'react'
import { AppRail, AppTopBar } from '@/components/Navigation'
import { Web3Providers } from '@/components/Web3Providers'
import { LivePayments } from '@/components/LivePayments'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Web3Providers>
      <div className="min-h-[100dvh] bg-page lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <AppRail />
        <div className="flex min-h-[100dvh] min-w-0 flex-col">
          <AppTopBar />
          <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pt-10">{children}</main>
          <footer className="border-t border-line">
            <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-5 font-mono text-[11px] tracking-[0.08em] text-ink-3 sm:px-6 lg:px-8">
              <span>© 2026 NINJAPAY · BUILT ON INJECTIVE</span>
              <span>NON-CUSTODIAL · YOUR KEYS, YOUR FUNDS</span>
            </div>
          </footer>
        </div>
      </div>
      <LivePayments />
    </Web3Providers>
  )
}
