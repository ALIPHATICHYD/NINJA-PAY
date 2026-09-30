import { Web3Providers } from '@/components/Web3Providers'

// Wallet providers are scoped to routes that need them so the landing page
// doesn't load the wallet stack.
export default function ClaimLayout({ children }: { children: React.ReactNode }) {
  return <Web3Providers>{children}</Web3Providers>
}
