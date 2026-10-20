'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CheckSquare,
  ChevronDown,
  Contact,
  LayoutGrid,
  Link2,
  ListOrdered,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { WalletAvatar } from '@/components/WalletAvatar'
import { usePhantom } from '@/hooks/useEvmSigner'
import { INJECTIVE_EVM, NETWORK_LABEL } from '@/lib/injective/network'

type NavLink = { label: string; href: string; icon: LucideIcon; notLive?: boolean }

const NAV_LINKS: NavLink[] = [
  { label: 'Home',          href: '/home',          icon: LayoutGrid },
  { label: 'Send',          href: '/send',          icon: ArrowUpRight },
  { label: 'Receive',       href: '/receive',       icon: ArrowDownLeft },
  { label: 'Claim links',   href: '/claims',        icon: Link2 },
  { label: 'Payroll',       href: '/payroll',       icon: Users },
  { label: 'Beneficiaries', href: '/beneficiaries', icon: Contact },
  { label: 'Transactions',  href: '/transactions',  icon: ListOrdered },
  { label: 'Analytics',     href: '/analytics',     icon: BarChart3 },
  { label: 'Approvals',     href: '/approvals',     icon: CheckSquare },
  { label: 'Bills',         href: '/bills',         icon: Receipt, notLive: true },
]

function useIsActive() {
  const pathname = usePathname()
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`)
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[16px] font-semibold tracking-tight text-ink">
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, no optimisation needed */}
      <img src="/brand/ninja-mark.svg" alt="" width={26} height={26} className="block" />
      NinjaPay
    </Link>
  )
}

/** Desktop side rail: brand, every app section with its icon, and the one honest "not live" note. */
export function AppRail() {
  const isActive = useIsActive()
  return (
    <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-7 overflow-y-auto border-r border-line px-4 py-5 lg:flex">
      <div className="px-2 pt-1">
        <Brand />
      </div>
      <nav aria-label="App" className="flex flex-col gap-0.5">
        {NAV_LINKS.map(({ label, href, icon: Icon, notLive }) => (
          <Link key={href} href={href} className="rail-link" aria-current={isActive(href) ? 'page' : undefined}>
            <Icon size={17} aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {notLive && <span className="font-mono text-[10px] tracking-[0.1em] text-coral">SOON</span>}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1.5 border border-dashed border-line-strong p-3.5">
        <span className="font-mono text-[10.5px] tracking-[0.1em] text-coral">NOT LIVE YET</span>
        <span className="text-[13px] leading-snug text-ink-2">Naira cash-out and bills. They launch only with a licensed partner.</span>
      </div>
    </aside>
  )
}

function WalletControl() {
  // Phantom stays on its own Ethereum network and signs Injective transfers from there.
  const phantom = usePhantom()
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain
        if (!mounted) {
          return (
            <button className="btn-primary" style={{ minWidth: 148, opacity: 0 }} aria-hidden="true" tabIndex={-1}>
              Connect wallet
            </button>
          )
        }
        if (!connected) {
          return (
            <button onClick={openConnectModal} className="btn-primary" style={{ minWidth: 148 }}>
              Connect wallet
            </button>
          )
        }
        if (chain.unsupported && !phantom) {
          return (
            <button onClick={openChainModal} className="btn-danger">
              Wrong network
            </button>
          )
        }
        return (
          <button
            onClick={openAccountModal}
            className="flex items-center gap-2.5 border border-line py-1.5 pl-1.5 pr-3 font-mono text-[13px] text-ink transition-colors hover:border-line-strong hover:bg-surface"
          >
            <WalletAvatar address={account.address} ensImage={account.ensAvatar} size={24} />
            {account.displayName}
            <ChevronDown size={13} aria-hidden="true" className="text-ink-3" />
          </button>
        )
      }}
    </ConnectButton.Custom>
  )
}

/** Top bar: network chip and wallet on every width; brand and a swipeable link row on phones. */
export function AppTopBar() {
  const isActive = useIsActive()
  return (
    <header className="app-topbar sticky top-0 z-40 border-b border-line">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="lg:hidden">
          <Brand />
        </div>
        <span className="hidden font-mono text-[11px] tracking-[0.1em] text-lime sm:inline-flex sm:items-center sm:gap-2 sm:border sm:border-[color-mix(in_srgb,var(--success)_25%,transparent)] sm:px-3 sm:py-2 lg:ml-0">
          <span aria-hidden="true" className="size-1.5 bg-lime" />
          {NETWORK_LABEL.toUpperCase()} · {INJECTIVE_EVM.id}
        </span>
        <div className="ml-auto shrink-0">
          <WalletControl />
        </div>
      </div>
      <nav aria-label="App" className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line px-3 py-2 lg:hidden">
        {NAV_LINKS.map(({ label, href, notLive }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 whitespace-nowrap border px-3 py-1.5 text-[13px] transition-colors ${
                active ? 'border-line bg-surface text-ink' : 'border-transparent text-ink-2 hover:text-ink'
              }`}
            >
              {label}
              {notLive && <span className="ml-1.5 font-mono text-[10px] text-coral">SOON</span>}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
