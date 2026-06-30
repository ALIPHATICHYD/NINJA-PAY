'use client'

import type { Metadata } from 'next'
import './globals.css'
import { Web3Providers } from '@/components/Web3Providers'
import { useEffect } from 'react'

export const metadata: Metadata = {
  title: 'NinjaPay — Crypto Off-Ramp & Payroll on Injective',
  description:
    'Send, off-ramp, pay bills, run payroll, and distribute crypto rewards on Injective. Fast, non-custodial, built for DeFi.',
  icons: {
    icon: '/favicon.png',
  },
  manifest: '/manifest.json',
  themeColor: '#000000',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NinjaPay',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Silently fail if service worker registration fails
      })
    }
  }, [])

  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="NinjaPay" />
      </head>
      <body>
        <Web3Providers>{children}</Web3Providers>
      </body>
    </html>
  )
}
