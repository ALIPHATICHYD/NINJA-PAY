import Link from 'next/link'
import Image from 'next/image'
import {
  Send,
  CreditCard,
  Share2,
  Users2,
  BarChart3,
  ListOrdered,
  ArrowRight,
  ArrowUpRight,
  Shield,
  Zap,
  Wallet,
  Receipt,
  type LucideIcon,
} from 'lucide-react'
import { HeroArt } from '@/components/landing/HeroArt'
import { Reveal } from '@/components/landing/Reveal'
import { Steps } from '@/components/landing/Steps'
import { Faq } from '@/components/landing/Faq'

// Network figures as published on injective.com ("Injective by the Numbers").
const NETWORK_STATS = [
  { value: '0.59s', label: 'Block time' },
  { value: '$0.0001', label: 'Median transaction cost' },
  { value: '3.00B', label: 'Onchain transactions' },
  { value: '3', label: 'Wallets: Keplr, Leap, MetaMask' },
]

const WHY = [
  { icon: Shield, title: 'Non-Custodial', desc: 'You hold your keys. NinjaPay never takes custody of your funds.' },
  { icon: Zap, title: 'Sub-Second Finality', desc: 'Injective blocks finalize in under a second, so transfers land almost immediately.' },
  { icon: Wallet, title: 'Multi-Wallet', desc: 'Keplr, Leap, and MetaMask. Use the wallet you already have.' },
  { icon: Receipt, title: 'Transparent Fees', desc: 'Your wallet shows the network fee before you sign anything.' },
]

const STEPS = [
  { title: 'Connect your wallet', desc: 'Use Keplr, Leap, or MetaMask to connect your Injective wallet with one click.' },
  { title: 'Choose an action', desc: 'Send tokens, create a claim pool, or run payroll from the dashboard.' },
  { title: 'Sign the transaction', desc: 'Review all details, then sign from your wallet. No private keys ever leave your device.' },
  { title: 'Settle on-chain', desc: 'Transactions settle on Injective in under a second. View them in your history instantly.' },
]

const FAQS = [
  {
    q: 'What networks does NinjaPay support?',
    a: "NinjaPay runs natively on Injective. Wallet connect supports Keplr and Leap (Cosmos) as well as MetaMask (EVM-compatible via Injective's EVM layer).",
  },
  {
    q: 'Is NinjaPay non-custodial?',
    a: 'Yes. Your wallet keys never leave your device. All on-chain transactions are signed by your wallet and broadcast to Injective directly.',
  },
  {
    q: 'How does off-ramping work?',
    a: "It isn't live yet. NinjaPay will not hold your crypto or convert it to naira itself. The off-ramp will only launch through a licensed partner, and none is connected today.",
  },
  {
    q: 'What are the fees?',
    a: 'Sending on Injective costs a network fee paid in INJ, shown by your wallet before you sign. NinjaPay has no off-ramp fees because the off-ramp is not live.',
  },
  {
    q: 'Can I pay Nigerian utility bills with crypto?',
    a: 'Not yet. Bill payments are not live and no payment is taken.',
  },
]

const APP_LINKS = [
  { label: 'Send', href: '/send' },
  { label: 'Bills', href: '/bills' },
  { label: 'Claims', href: '/claims' },
  { label: 'Payroll', href: '/payroll' },
  { label: 'Transactions', href: '/transactions' },
  { label: 'Analytics', href: '/analytics' },
]

const container = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'
const btnPrimary =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-ocean px-6 py-3 text-[15px] font-semibold text-snow transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px hover:bg-ocean-hover active:translate-y-0 active:scale-[0.98]'
const btnSecondary =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-line-strong px-6 py-3 text-[15px] font-medium text-ink transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px hover:bg-surface-hover active:translate-y-0 active:scale-[0.98]'
const h2 = 'text-3xl font-semibold tracking-tight text-ink md:text-4xl'

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <Image src="/favicon.png" alt="" width={32} height={32} className="rounded-md" />
      <span className="text-[17px] font-bold tracking-tight text-ink">NinjaPay</span>
    </Link>
  )
}

function FeatureCell({
  href,
  icon: Icon,
  title,
  desc,
  className = '',
  tone = 'plain',
  tag,
}: {
  href: string
  icon: LucideIcon
  title: string
  desc: string
  className?: string
  tone?: 'ocean' | 'band' | 'plain'
  tag?: string
}) {
  const tones = {
    ocean: 'bg-ocean text-snow border-transparent hover:bg-ocean-hover',
    band: 'bg-band text-snow border-transparent',
    plain: 'bg-surface text-ink border-line hover:border-line-strong hover:bg-surface-hover',
  }
  const descTone = tone === 'ocean' ? 'text-snow/90' : tone === 'band' ? 'text-sky' : 'text-ink-2'
  const iconTone = tone === 'plain' ? 'bg-ocean-subtle text-ocean-text' : 'bg-snow/10 text-snow'
  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between gap-10 rounded-2xl border p-6 transition duration-300 md:p-8 ${tones[tone]} ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`inline-flex size-10 items-center justify-center rounded-full ${iconTone}`}>
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        {tag ? (
          <span className="rounded-full bg-coral-subtle px-3 py-1 text-xs font-semibold text-coral">{tag}</span>
        ) : (
          <ArrowUpRight
            size={18}
            strokeWidth={1.75}
            aria-hidden="true"
            className="opacity-60 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
          />
        )}
      </div>
      <div>
        <h3 className={`font-semibold tracking-tight ${tone === 'ocean' ? 'text-2xl md:text-3xl' : 'text-lg'}`}>{title}</h3>
        <p className={`mt-2 max-w-[42ch] text-[15px] leading-relaxed ${descTone}`}>{desc}</p>
      </div>
    </Link>
  )
}

export default function LandingPage() {
  return (
    <div className="theme-auto min-h-[100dvh] overflow-x-hidden bg-page font-sans text-ink">
      {/* Navbar */}
      <nav className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg-primary)_86%,transparent)] backdrop-blur-lg">
        <div className={`${container} flex h-16 items-center justify-between`}>
          <Logo />
          <Link href="/send" className={`${btnPrimary} px-5 py-2.5 text-sm`}>
            Launch App
            <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className={`${container} grid items-center gap-12 pb-20 pt-12 md:pt-20 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16`}>
          <Reveal>
            <p className="mb-6 text-sm font-medium text-ocean-text">Built for the Injective Africa Community</p>
            <h1 className="text-5xl font-semibold leading-[1.02] tracking-tighter text-ink md:text-6xl">
              Crypto payments for <span className="text-ocean-text">the real world.</span>
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-ink-2">
              Send INJ and USDC from one non-custodial interface on Injective. Off-ramp and bill payments are not live yet.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/send" className={btnPrimary}>
                Launch App
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Link>
              <a href="#how-it-works" className={btnSecondary}>
                How it works
              </a>
            </div>
          </Reveal>
          <div className="mx-auto w-full max-w-sm sm:max-w-md lg:max-w-none">
            <HeroArt />
          </div>
        </section>

        {/* Network figures */}
        <section className="bg-band text-snow">
          <div className={`${container} py-16 md:py-20`}>
            <Reveal>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Built on Injective</h2>
            </Reveal>
            <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4">
              {NETWORK_STATS.map((s, i) => (
                <Reveal key={s.label} delay={i * 0.08} className="flex flex-col-reverse">
                  <dt className="mt-2 text-sm text-sky">{s.label}</dt>
                  <dd className="font-mono text-4xl font-medium tracking-tight md:text-5xl">{s.value}</dd>
                </Reveal>
              ))}
            </dl>
            <p className="mt-10 text-sm text-sky">
              Network figures as published on{' '}
              <a href="https://injective.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-snow">
                injective.com
              </a>
              .
            </p>
          </div>
        </section>

        {/* Features */}
        <section className={`${container} py-20 md:py-28`}>
          <Reveal>
            <h2 className={h2}>Everything you need in one place</h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-4 md:auto-rows-[minmax(200px,auto)]">
            <Reveal className="md:col-span-2 md:row-span-2 [&>a]:h-full">
              <FeatureCell
                href="/send"
                icon={Send}
                title="Send"
                desc="Transfer INJ or USDC to any Injective wallet address instantly."
                tone="ocean"
                className="h-full"
              />
            </Reveal>
            <Reveal className="md:col-span-2 [&>a]:h-full" delay={0.06}>
              <FeatureCell href="/payroll" icon={Users2} title="Payroll" desc="Batch-pay your team or DAO in a single transaction." tone="band" />
            </Reveal>
            <Reveal className="[&>a]:h-full" delay={0.12}>
              <FeatureCell href="/claims" icon={Share2} title="Claims" desc="Create shareable links to distribute tokens to any group." />
            </Reveal>
            <Reveal className="[&>a]:h-full" delay={0.18}>
              <FeatureCell href="/bills" icon={CreditCard} title="Pay Bills" desc="Airtime, data, electricity, and cable." tag="Not live yet" />
            </Reveal>
            <Reveal className="md:col-span-3 [&>a]:h-full" delay={0.06}>
              <FeatureCell href="/transactions" icon={ListOrdered} title="Transactions" desc="Full on-chain history, filterable by type and status." />
            </Reveal>
            <Reveal className="[&>a]:h-full" delay={0.12}>
              <FeatureCell href="/analytics" icon={BarChart3} title="Analytics" desc="Track volume, transaction counts, and performance over time." />
            </Reveal>
          </div>
        </section>

        {/* Why NinjaPay */}
        <section className="border-t border-line bg-page-2">
          <div className={`${container} grid gap-12 py-20 md:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20`}>
            <Reveal>
              <h2 className={h2}>Why NinjaPay</h2>
              <p className="mt-4 max-w-[40ch] text-lg leading-relaxed text-ink-2">
                Payments that stay in your wallet until you sign, on a chain built for finance.
              </p>
            </Reveal>
            <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2">
              {WHY.map((item, i) => {
                const Icon = item.icon
                return (
                  <Reveal key={item.title} delay={i * 0.08} className="border-t border-line pt-6">
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" className="text-ocean-text" />
                    <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink">{item.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{item.desc}</p>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-line">
          <div className={`${container} py-20 md:py-28`}>
            <Reveal>
              <h2 className={h2}>Get started in minutes</h2>
            </Reveal>
            <div className="mt-14">
              <Steps steps={STEPS} />
            </div>
          </div>
        </section>

        {/* Community ecosystem */}
        <section className="border-t border-line bg-page-2">
          <div className={`${container} py-20 md:py-28`}>
            <Reveal>
              <h2 className={h2}>Other Community Products</h2>
            </Reveal>
            <Reveal delay={0.08}>
              <a
                href="https://injective-by-examples.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-10 flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 transition duration-300 hover:border-line-strong hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between md:p-10"
              >
                <div>
                  <h3 className="text-2xl font-semibold tracking-tight text-ink">Injective By Examples</h3>
                  <p className="mt-2 max-w-[55ch] text-[15px] leading-relaxed text-ink-2">
                    Hands-on examples built to onboard the African community into the Injective ecosystem.
                  </p>
                </div>
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink transition duration-300 group-hover:border-transparent group-hover:bg-ocean group-hover:text-snow">
                  <ArrowUpRight size={20} strokeWidth={1.75} aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  <span className="sr-only">Open Injective By Examples</span>
                </span>
              </a>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-line">
          <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 md:py-28">
            <Reveal>
              <h2 className={`${h2} mb-10`}>Frequently asked questions</h2>
            </Reveal>
            <Faq items={FAQS} />
          </div>
        </section>

        {/* CTA */}
        <section className={`${container} pb-20 md:pb-28`}>
          <Reveal>
            <div className="grid items-center gap-8 rounded-2xl bg-ocean px-6 py-14 text-snow sm:px-10 md:grid-cols-[1fr_auto] md:px-16 md:py-16">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Ready to get started?</h2>
                <p className="mt-3 max-w-[48ch] text-lg leading-relaxed text-snow/90">
                  Connect your wallet to send INJ and USDC on Injective testnet.
                </p>
              </div>
              <Link
                href="/send"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-snow px-7 py-3.5 text-[15px] font-semibold text-midnight transition duration-300 hover:-translate-y-px hover:bg-white active:translate-y-0 active:scale-[0.98]"
              >
                Launch App
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className={`${container} grid gap-10 py-14 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1fr]`}>
          <div>
            <Logo />
            <p className="mt-4 max-w-[36ch] text-sm leading-relaxed text-ink-2">
              Non-custodial crypto payments, payroll, and claim links on Injective.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">App</p>
            <ul className="mt-4 grid gap-3">
              {APP_LINKS.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-ink-2 transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Ecosystem</p>
            <ul className="mt-4 grid gap-3">
              <li>
                <a href="https://injective.com" target="_blank" rel="noopener noreferrer" className="text-sm text-ink-2 transition-colors hover:text-ink">
                  Injective
                </a>
              </li>
              <li>
                <a href="https://injective-by-examples.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-sm text-ink-2 transition-colors hover:text-ink">
                  Injective By Examples
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <p className={`${container} py-6 text-sm text-ink-3`}>© 2026 NinjaPay. Built on Injective.</p>
        </div>
      </footer>
    </div>
  )
}
