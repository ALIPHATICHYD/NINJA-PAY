'use client'

import Link from 'next/link'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Contact,
  Link2,
  ListOrdered,
  Receipt,
  Users,
} from 'lucide-react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { usePrices } from '@/hooks/usePrices'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { useActivity } from '@/hooks/useActivity'
import { ACTIVITY_LABELS, coinValue, formatCoin, pricedAs } from '@/lib/injective/activity'
import { explorerTxUrl } from '@/lib/injective/network'
import { useBeneficiaries } from '@/lib/beneficiaries'
import { format } from 'date-fns'
import { formatBaseUnits } from '@/lib/money'
import { INJ, USDC } from '@/lib/injective/tokens'
import { isSameAccount, shortAddress, toInjectiveAddress } from '@/lib/injective/address'
import { OfframpUnavailable } from '@/components/OfframpUnavailable'
import { formatUsd, sumUsd, usdValue } from '@/lib/prices'
import { Dither } from '@/components/Dither'
import { CopyButton } from '@/components/CopyButton'
import { StatusChip } from '@/components/StatusChip'

const ACTIONS = [
  { icon: ArrowUpRight,  title: 'Send',         desc: 'USDC or INJ to any address',  href: '/send' },
  { icon: ArrowDownLeft, title: 'Receive',      desc: 'Your address and QR code',    href: '/receive' },
  { icon: Users,         title: 'Run payroll',  desc: 'One signature for everyone',  href: '/payroll' },
  { icon: Link2,         title: 'Claim link',   desc: 'Fund it, then share it',      href: '/claims' },
]

const MORE = [
  { icon: Contact,     title: 'Beneficiaries', href: '/beneficiaries' },
  { icon: ListOrdered, title: 'Transactions',  href: '/transactions' },
  { icon: BarChart3,   title: 'Analytics',     href: '/analytics' },
  { icon: Receipt,     title: 'Bills',         href: '/bills', notLive: true },
]

function ActionGrid() {
  return (
    <section aria-label="Quick actions" className="grid grid-cols-2 border-l border-t border-line md:grid-cols-4">
      {ACTIONS.map(({ icon: Icon, title, desc, href }) => (
        <Link key={href} href={href} className="group flex min-w-0 flex-col gap-5 border-b border-r border-line p-5 transition-colors hover:bg-surface">
          <span className="flex items-center justify-between text-ocean-text">
            <Icon size={22} aria-hidden="true" />
            <span aria-hidden="true" className="font-mono text-ink-3 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink">↗</span>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-base font-medium text-ink">{title}</span>
            <span className="text-[13px] text-ink-3">{desc}</span>
          </span>
        </Link>
      ))}
    </section>
  )
}

export default function DashboardHome() {
  const { isConnected, address } = useWallet()
  const { inj, usdc, loading: balLoading } = useBalance(address)
  const { prices, loading: priceLoading } = usePrices()
  const { userAddress: cosmosAddress } = useCosmosTransaction()
  const injectiveAddress = toInjectiveAddress(address)
  const keplrIsOtherAccount = !!cosmosAddress && !!address && !isSameAccount(cosmosAddress, address)
  const { items: activity, loading: activityLoading } = useActivity()
  const [beneficiaries] = useBeneficiaries()

  // Outgoing value at today's Injective oracle prices; null if a token has no fresh price.
  const sentUsd = sumUsd(
    activity
      .filter(tx => tx.success && tx.direction === 'out')
      .flatMap(tx => tx.coins.map(c => usdValue(coinValue(c), pricedAs(c), prices))),
  )
  const recent = activity.slice(0, 6)

  const injDisplay = formatBaseUnits(inj, INJ.decimals, 4)
  const usdcDisplay = formatBaseUnits(usdc, USDC.decimals, 2)

  /* ── Disconnected state ── */
  if (!isConnected) {
    return (
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.9fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <p className="kicker">[Home]</p>
          <h1 className="text-[2.5rem] font-medium leading-[1.02] tracking-[-0.04em] text-balance md:text-6xl">
            Connect your wallet to get started.
          </h1>
          <p className="max-w-[46ch] text-base leading-relaxed text-ink-2">
            Sending, payroll and claim links all sign from your own wallet. Use the Connect wallet button at the top. NinjaPay never holds your funds.
          </p>
          <div className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-4">
            {[...ACTIONS, ...MORE].slice(0, 8).map(({ icon: Icon, title }) => (
              <div key={title} className="flex items-center gap-2.5 border-b border-r border-line px-3.5 py-3 text-[13px] text-ink-2">
                <Icon size={15} aria-hidden="true" className="shrink-0 text-ocean-text" />
                {title}
              </div>
            ))}
          </div>
          <Link href="/setup" className="self-start text-sm text-ocean-text underline-offset-4 hover:underline">
            New to Injective? Set up a wallet first →
          </Link>
        </div>
        <div className="mx-auto aspect-square w-full max-w-[420px] border border-line bg-page-2">
          <Dither field="ramp" image="/brand/ninja-hero.svg" width={168} height={168} fieldDensity={0.45} imageScale={0.7} imageGain={0.82} />
        </div>
      </div>
    )
  }

  /* ── Connected state ── */
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <p className="kicker">[Home]</p>
        <h1 className="text-[1.75rem] font-medium tracking-[-0.025em]">Your wallet</h1>
      </header>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          {/* Balances over a dithered ramp */}
          <section aria-label="Balances" className="relative overflow-hidden border border-line bg-page-2">
            <div className="absolute inset-0 opacity-55">
              <Dither field="ramp" width={320} height={90} />
            </div>
            <div className="relative flex flex-col gap-7 p-6 md:p-7">
              <div className="flex flex-wrap justify-between gap-2 font-mono text-[11px] tracking-[0.1em] text-ink-2">
                <span>WALLET BALANCE</span>
                <span>READ FROM CHAIN</span>
              </div>
              <div className="flex flex-wrap items-end gap-x-14 gap-y-6">
                <div className="flex flex-col gap-1.5">
                  {balLoading ? (
                    <span className="skeleton inline-block h-14 w-52" />
                  ) : (
                    <span className="num -ml-2 self-start bg-page px-2 pb-1.5 pt-1 text-5xl leading-none md:text-6xl">{usdcDisplay}</span>
                  )}
                  <span className="text-sm text-ink-2">USDC</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {balLoading ? (
                    <span className="skeleton inline-block h-10 w-36" />
                  ) : (
                    <span className="num -ml-2 self-start bg-page px-2 pb-1.5 pt-1 text-3xl leading-none md:text-4xl">{injDisplay}</span>
                  )}
                  <span className="text-sm text-ink-2">INJ</span>
                </div>
              </div>
            </div>
          </section>

          <ActionGrid />

          {/* Recent activity */}
          <section aria-label="Recent activity" className="border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-base font-medium">Recent activity</h2>
              <Link href="/transactions" className="font-mono text-xs tracking-[0.06em] text-ocean-text hover:underline">VIEW ALL →</Link>
            </div>
            {activityLoading && recent.length === 0 ? (
              <div className="flex flex-col gap-3 p-5">
                {[0, 1, 2].map(i => <div key={i} className="skeleton h-5" />)}
              </div>
            ) : recent.length === 0 ? (
              <div className="empty-state">
                <ListOrdered size={22} aria-hidden="true" className="mx-auto text-ink-3" />
                <p className="font-medium text-ink-2">No transactions yet</p>
                <p className="text-[13px]">Start by sending USDC or making a claim link.</p>
                <Link href="/send" className="btn-secondary mt-5">Send your first payment</Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left font-mono text-[11px] tracking-[0.08em] text-ink-3">
                      <th scope="col" className="px-5 py-3 font-normal">TYPE</th>
                      <th scope="col" className="px-5 py-3 font-normal">WHEN</th>
                      <th scope="col" className="px-5 py-3 text-right font-normal">AMOUNT</th>
                      <th scope="col" className="px-5 py-3 font-normal">STATUS</th>
                      <th scope="col" className="px-5 py-3 text-right font-normal">TX</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {recent.map((tx, i) => (
                      <tr key={`${tx.hash}-${i}`} className="border-t border-line-soft">
                        <td className="px-5 py-3.5">{ACTIVITY_LABELS[tx.type]}{tx.label ? `: ${tx.label}` : ''}</td>
                        <td className="px-5 py-3.5 text-ink-2">{format(tx.timestamp, 'd MMM, HH:mm')}</td>
                        <td className={`num whitespace-nowrap px-5 py-3.5 text-right ${tx.direction === 'out' ? '' : 'text-lime'}`}>
                          {tx.direction === 'out' ? '−' : '+'}{tx.coins.map(c => formatCoin(c, 4)).join(' + ')}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusChip state={tx.success ? 'confirmed' : 'failed'} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <a href={explorerTxUrl(tx.hash)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-ocean-text hover:underline">
                            {tx.hash.slice(0, 6)}…↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {/* Address: one account, written two ways */}
          <section aria-label="Your address" className="border border-line bg-surface p-5">
            <p className="mono-label">Your address</p>
            <div className="mt-4 flex flex-col gap-3">
              {[
                { format: 'EVM', value: address },
                { format: 'Injective', value: injectiveAddress },
              ].map(({ format: kind, value }) => value && (
                <div key={kind} className="flex items-center gap-3">
                  <span className="w-[72px] shrink-0 font-mono text-[11px] tracking-[0.08em] text-ink-3">{kind.toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{shortAddress(value, 10)}</span>
                  <CopyButton value={value} label="Copy" />
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">Same account in two formats. Either one receives funds.</p>
            {keplrIsOtherAccount && (
              <p className="mt-2 text-xs leading-relaxed text-coral">
                Keplr is signed in to a different account ({shortAddress(cosmosAddress!, 12)}). USDC sends come from that account.
              </p>
            )}
          </section>

          {/* Stats */}
          <section aria-label="Totals" className="grid grid-cols-3 border-l border-t border-line">
            {[
              { label: 'Sent', value: activityLoading || priceLoading ? '…' : formatUsd(sentUsd) },
              { label: 'Txns', value: activityLoading ? '…' : String(activity.length) },
              { label: 'Payees', value: String(beneficiaries.length) },
            ].map(s => (
              <div key={s.label} className="flex min-w-0 flex-col gap-1.5 border-b border-r border-line p-4">
                <span className="mono-label">{s.label}</span>
                <span className="num truncate text-xl">{s.value}</span>
              </div>
            ))}
          </section>

          {/* Prices from Injective's oracle */}
          <section aria-label="Prices" className="border border-line bg-surface p-5">
            <p className="mono-label">Prices · Injective Pyth oracle</p>
            <dl className="mt-4 flex flex-col">
              <div className="flex justify-between border-b border-line-soft py-2.5">
                <dt className="font-mono text-[13px] text-ink-2">1 INJ</dt>
                <dd className="num text-[15px]">{priceLoading ? '…' : prices.INJ ? formatUsd(prices.INJ.usd) : 'Unavailable'}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="font-mono text-[13px] text-ink-2">1 USDC</dt>
                <dd className="num text-[15px]">{priceLoading ? '…' : prices.USDC ? formatUsd(prices.USDC.usd, 4) : 'Unavailable'}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              Indicative only. Injective has no naira price, so NinjaPay shows no naira rate. One will come only from a licensed partner&apos;s quote.
            </p>
          </section>

          {/* Off-ramp status (not live) */}
          <OfframpUnavailable />

          <nav aria-label="More" className="grid grid-cols-2 border-l border-t border-line">
            {MORE.map(({ icon: Icon, title, href, notLive }) => (
              <Link key={href} href={href} className="flex items-center gap-2.5 border-b border-r border-line px-3.5 py-3 text-[13px] text-ink-2 transition-colors hover:bg-surface hover:text-ink">
                <Icon size={15} aria-hidden="true" className={notLive ? 'text-coral' : 'text-ocean-text'} />
                {title}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}
