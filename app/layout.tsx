import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Silkscreen } from 'next/font/google'
import './globals.css'
import { siteUrl } from '@/lib/site'

// "Dithered Ledger": Geist for text, Geist Mono for every amount and address, Silkscreen (a pixel
// face) only for short section codes like [02] PRODUCT.
const ui = Geist({ subsets: ['latin'], variable: '--font-ui-face', display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })
const pixel = Silkscreen({ subsets: ['latin'], weight: '400', variable: '--font-pixel-face', display: 'swap' })

const title = 'NinjaPay | Crypto Payments & Payroll on Injective'
const description =
  'Send INJ and USDC, run payroll, and distribute tokens with claim links on Injective. Non-custodial. Off-ramp and bill payments are not live yet.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    siteName: 'NinjaPay',
  },
  // The share image comes from app/opengraph-image.tsx and twitter-image.tsx.
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export const viewport: Viewport = {
  themeColor: '#08080A',
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
    <html lang="en" className={`${ui.variable} ${mono.variable} ${pixel.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
