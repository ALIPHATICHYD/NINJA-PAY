import type { Metadata } from 'next'
import './globals.css'
import { Web3Providers } from '@/components/Web3Providers'

export const metadata: Metadata = {
  title: 'NinjaPay — Crypto Off-Ramp & Payroll on Injective',
  description:
    'Send, off-ramp, pay bills, run payroll, and distribute crypto rewards on Injective. Fast, non-custodial, built for DeFi.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <Web3Providers>{children}</Web3Providers>
      </body>
    </html>
  )
}
