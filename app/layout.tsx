import type { Metadata, Viewport } from 'next'
import { Figtree, Geist_Mono, Newsreader } from 'next/font/google'
import './globals.css'

// Injective's brand pairs ABC Marist (old-style serif) with TT Commons (geometric sans).
// Both are commercial, so Newsreader and Figtree stand in. To use licensed files, swap these
// two for next/font/local and keep the same `variable` names; nothing else changes.
const display = Newsreader({
  subsets: ['latin'],
  variable: '--font-display-face',
  display: 'swap',
  style: ['normal', 'italic'],
  axes: ['opsz'],
})
const ui = Figtree({ subsets: ['latin'], variable: '--font-ui-face', display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })

const title = 'NinjaPay | Crypto Payments & Payroll on Injective'
const description =
  'Send INJ and USDC, run payroll, and distribute tokens with claim links on Injective. Non-custodial. Off-ramp and bill payments are not live yet.'

export const metadata: Metadata = {
  metadataBase: new URL('https://ninjapay.xyz'),
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    siteName: 'NinjaPay',
    images: [{ url: '/favicon.png', width: 512, height: 512, alt: 'NinjaPay' }],
  },
  twitter: {
    card: 'summary',
    title,
    description,
    images: ['/favicon.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // suppressHydrationWarning: browser extensions add attributes before React hydrates, to <html>
    // (QuillBot's data-qb-installed) and to <body> (Grammarly's data-gr-ext-installed). This only
    // silences attribute diffs on these two elements, not on their children.
    <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
