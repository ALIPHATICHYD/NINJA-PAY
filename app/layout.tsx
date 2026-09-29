import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })

const title = 'NinjaPay | Crypto Payments & Payroll on Injective'
const description =
  'Send INJ and USDC, run payroll, and distribute tokens with claim links on Injective. Non-custodial. Off-ramp and bill payments are not live yet.'

export const metadata: Metadata = {
  metadataBase: new URL('https://ninjapay.xyz'),
  title,
  description,
  icons: {
    icon: '/favicon.png',
  },
  openGraph: {
    title,
    description,
    type: 'website',
    siteName: 'NinjaPay',
    images: [{ url: '/favicon.png', width: 192, height: 192, alt: 'NinjaPay' }],
  },
  twitter: {
    card: 'summary',
    title,
    description,
    images: ['/favicon.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {children}
      </body>
    </html>
  )
}
