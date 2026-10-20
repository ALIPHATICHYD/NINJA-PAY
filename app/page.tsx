import Link from 'next/link'
import Image from 'next/image'
import { ArrowDownLeft, ArrowUpRight, BarChart3, Receipt } from 'lucide-react'
import { Dither } from '@/components/Dither'
import { Reveal } from '@/components/landing/Reveal'
import { Steps } from '@/components/landing/Steps'
import { Faq } from '@/components/landing/Faq'
import { Marquee } from '@/components/landing/Marquee'
import { CountUp } from '@/components/landing/CountUp'
import { StatusChip } from '@/components/StatusChip'
import { siteUrl } from '@/lib/site'

// Network figures as published on injective.com ("Injective by the Numbers").
// `count` figures roll up once in view; the rest render as written.
const NETWORK_STATS: { label: string; text?: string; count?: { value: number; decimals?: number; suffix?: string } }[] = [
  { label: 'Block time', count: { value: 0.59, decimals: 2, suffix: 's' } },
  { label: 'Median transaction cost', text: '$0.0001' },
  { label: 'On-chain transactions', count: { value: 3, suffix: 'B+' } },
  { label: 'Wallets: Keplr, Leap, MetaMask, Phantom', count: { value: 4 } },
]

const MARQUEE = ['Send USDC', 'Send INJ', 'Batch payroll', 'Claim links', 'Receipts', 'Keplr', 'Leap', 'MetaMask', 'Phantom', 'Non-custodial']

const PRODUCTS = [
  {
    href: '/send',
    code: '01',
    title: 'Send',
    desc: "USDC and INJ to any Injective or EVM address. No INJ for the fee? On a USDC send, NinjaPay can pay it for you.",
    seed: 0,
    tone: 'accent' as const,
  },
  {
    href: '/payroll',
    code: '02',
    title: 'Payroll',
    desc: 'Pay a whole team in one transaction. Add recipients, check the total, sign once.',
    seed: 2.1,
    tone: 'ink' as const,
  },
  {
    href: '/claims',
    code: '03',
    title: 'Claim links',
    desc: "Fund a link and share it. Anyone with the link claims with their own wallet, and you can take back what's left.",
    seed: 4.3,
    tone: 'accent' as const,
  },
]

const MORE = [
  { href: '/receive', icon: ArrowDownLeft, title: 'Receive', desc: 'Your address and a QR code, in both Injective formats.' },
  { href: '/transactions', icon: BarChart3, title: 'History and analytics', desc: 'Every transfer, with a receipt and a link to the chain.' },
]

// An illustration of the receipt layout, labelled as an example everywhere it shows.
const EXAMPLE_RUN = [
  { who: 'Contractor A', addr: 'inj1…7k2q', amount: '450.00', state: 'confirmed' as const },
  { who: 'Contractor B', addr: '0x9f…56aa', amount: '320.00', state: 'confirmed' as const },
  { who: 'Contractor C', addr: 'inj1…q9fz', amount: '275.50', state: 'confirmed' as const },
  { who: 'Contractor D', addr: '0x2c…7c9d', amount: '600.00', state: 'awaiting-signature' as const },
]

const STEPS = [
  { title: 'Connect your wallet', desc: 'Keplr, Leap, MetaMask or Phantom. Your keys never leave your device.' },
  { title: 'Choose what to do', desc: 'Send, run payroll or make a claim link from the app.' },
  { title: 'Review and sign', desc: 'Check the amount, the address and the fee, then sign in your wallet.' },
  { title: 'Settled on chain', desc: 'Injective confirms in under a second, and you get a receipt.' },
]

const FAQS = [
  {
    q: 'What networks does NinjaPay support?',
    a: "NinjaPay runs natively on Injective. Wallet connect supports Keplr and Leap (Cosmos) as well as MetaMask (EVM-compatible via Injective's EVM layer). Phantom works too: it can't join Injective's EVM, so it signs transfers from its Ethereum network, and it can send INJ and USDC, run payroll and make claim links.",
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
    a: "Sending on Injective costs a network fee paid in INJ, which your wallet shows before you sign. If you hold USDC but no INJ, NinjaPay can pay the fee for that USDC send when its fee service is available. There are no off-ramp fees because the off-ramp is not live.",
  },
  {
    q: 'Can I pay Nigerian utility bills with crypto?',
    a: 'Not yet. Bill payments are not live and no payment is taken.',
  },
]

const APP_LINKS = [
  { label: 'App home', href: '/home' },
  { label: 'Wallet setup', href: '/setup' },
  { label: 'Send', href: '/send' },
  { label: 'Receive', href: '/receive' },
  { label: 'Claim links', href: '/claims' },
  { label: 'Payroll', href: '/payroll' },
  { label: 'Transactions', href: '/transactions' },
]

const container = 'mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8'
const h2 = 'text-[2.25rem] font-medium leading-[1.05] tracking-[-0.03em] text-ink text-balance md:text-5xl'

// lucide-react has no X logo, so the mark is drawn inline.
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className={className}>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  )
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image src="/brand/ninja-mark.svg" alt="" width={28} height={28} />
      <span className="text-[17px] font-semibold tracking-tight text-ink">NinjaPay</span>
    </Link>
  )
}

function Arrow() {
  return <span aria-hidden="true" className="btn-arrow">→</span>
}

// Structured data so search engines and AI answer engines can describe the app
// accurately. It states only what the app does today.
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'NinjaPay',
  url: siteUrl(),
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  description:
    'Non-custodial payments on Injective: send INJ and USDC, run batch payroll, and share claim links. Off-ramp and bill payments are not live yet.',
}

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-page font-sans text-ink">
      <script
        type="application/ld+json"
        // Static object defined above; nothing user-supplied goes in it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, '\\u003c') }}
      />

      <header className="sticky top-0 z-40 border-b border-line bg-page">
        <nav aria-label="Main" className={`${container} flex h-16 items-center justify-between gap-6`}>
          <Logo />
          <div className="hidden items-center gap-7 text-sm text-ink-2 md:flex">
            <a href="#product" className="transition-colors hover:text-ink">Product</a>
            <a href="#receipts" className="transition-colors hover:text-ink">Receipts</a>
            <a href="#network" className="transition-colors hover:text-ink">Network</a>
            <a href="#faq" className="transition-colors hover:text-ink">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 border border-[color-mix(in_srgb,var(--success)_25%,transparent)] px-2.5 py-1.5 font-mono text-[11px] tracking-[0.1em] text-lime sm:inline-flex">
              <span aria-hidden="true" className="size-1.5 bg-lime" />
              LIVE ON TESTNET
            </span>
            <Link href="/home" className="btn-light px-4 py-2.5">
              Launch app
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className={`${container} grid items-center gap-12 pb-20 pt-12 md:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-24`}>
          <div className="flex min-w-0 flex-col gap-7">
            <p className="kicker hero-fade">[01] Payments on Injective</p>
            {/* Each line rises from behind its own mask on first paint (CSS only, so it never waits on JS). */}
            <h1 className="text-[3.1rem] font-medium leading-[0.98] tracking-[-0.045em] text-ink sm:text-6xl lg:text-[4.75rem]">
              <span className="rise-line"><span>Payroll and payments,</span></span>{' '}
              <span className="rise-line"><span style={{ animationDelay: '90ms' }}>settled in under</span></span>{' '}
              <span className="rise-line"><span style={{ animationDelay: '180ms' }}>a second<span className="text-ocean-text">.</span><span className="caret" aria-hidden="true" /></span></span>
            </h1>
            <p className="hero-fade max-w-[48ch] text-lg leading-relaxed text-ink-2" style={{ animationDelay: '300ms' }}>
              Send USDC and INJ from your own wallet. Run batch payroll, share claim links and keep a receipt for every
              payout. NinjaPay never holds your funds.
            </p>
            <div className="hero-fade flex flex-wrap gap-3" style={{ animationDelay: '400ms' }}>
              <Link href="/home" className="btn-primary px-6 py-3.5 text-[15px]">
                Launch app <Arrow />
              </Link>
              <a href="#how-it-works" className="btn-secondary px-6 py-3.5 text-[15px]">
                How it works
              </a>
            </div>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-[560px] border border-line bg-page-2">
            <Dither
              field="sphere"
              image="/brand/ninja-hero.svg"
              width={224}
              height={224}
              fieldDensity={0.6}
              imageScale={0.62}
              imageOffsetY={0.04}
              imageGain={0.82}
              label="The NinjaPay ninja in front of a turning globe, drawn in dithered pixels"
            />
            <div className="pointer-events-none absolute inset-0 grid grid-cols-2 content-between p-4 font-mono text-[11px] tracking-[0.08em] text-ink-2 sm:p-5">
              <span>INJECTIVE EVM</span>
              <span className="text-right">BLOCK ≈ 0.59 S</span>
              <span>MEDIAN FEE ≈ $0.0001</span>
              <span className="text-right">CUSTODY: NONE</span>
            </div>
          </div>
        </section>

        <Marquee items={MARQUEE} />

        {/* Product */}
        <section id="product" className={`${container} scroll-mt-20 pt-24 md:pt-28`}>
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <h2 className={`${h2} max-w-[18ch]`}>Three ways to move money. One wallet signs.</h2>
            <p className="kicker">[02] Product</p>
          </Reveal>
          <div className="mt-12 grid border-l border-t border-line md:grid-cols-3">
            {PRODUCTS.map((p, i) => (
              <Reveal key={p.href} delay={i * 0.06} className="border-b border-r border-line">
                <Link href={p.href} className="group flex h-full flex-col transition-colors hover:bg-surface">
                  <div className="h-40 border-b border-line">
                    <Dither field="wave" seed={p.seed} tone={p.tone} width={200} height={96} />
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-6 md:p-7">
                    <span className="flex items-center justify-between font-mono text-xs text-ink-3">
                      {p.code}
                      <ArrowUpRight size={16} aria-hidden="true" className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
                    </span>
                    <h3 className="text-2xl font-medium tracking-[-0.02em]">{p.title}</h3>
                    <p className="text-[15px] leading-relaxed text-ink-2">{p.desc}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
            {MORE.map(({ href, icon: Icon, title, desc }, i) => (
              <Reveal key={href} delay={i * 0.06} className="border-b border-r border-line">
                <Link href={href} className="group flex h-full items-start gap-4 p-6 transition-colors hover:bg-surface md:p-7">
                  <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-ocean-text" />
                  <span className="flex flex-col gap-1.5">
                    <span className="text-[17px] font-medium">{title}</span>
                    <span className="text-sm leading-relaxed text-ink-2">{desc}</span>
                  </span>
                </Link>
              </Reveal>
            ))}
            <Reveal delay={0.12} className="border-b border-r border-line">
              <Link href="/bills" className="flex h-full items-start gap-4 p-6 transition-colors hover:bg-surface md:p-7">
                <Receipt size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-coral" />
                <span className="flex flex-col items-start gap-1.5">
                  <span className="text-[17px] font-medium">Bills and naira cash-out</span>
                  <span className="text-sm leading-relaxed text-ink-2">Only with a licensed partner. None is connected today.</span>
                  <StatusChip state="not-live" className="mt-2" />
                </span>
              </Link>
            </Reveal>
          </div>
        </section>

        {/* Receipts */}
        <section id="receipts" className={`${container} grid scroll-mt-20 items-start gap-12 pt-28 md:pt-32 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16`}>
          <Reveal className="flex min-w-0 flex-col gap-5">
            <p className="kicker">[03] Receipts</p>
            <h2 className={h2}>Every payout leaves a receipt.</h2>
            <p className="max-w-[46ch] text-[17px] leading-relaxed text-ink-2">
              Each line links to its transaction on the chain, so your accountant and your contractors see the same record you do.
            </p>
            <Link href="/payroll" className="btn-secondary mt-2 self-start">
              Set up a pay run <Arrow />
            </Link>
          </Reveal>
          <Reveal delay={0.08} className="min-w-0 border border-line bg-surface">
            <div className="flex justify-between border-b border-line px-5 py-3.5 font-mono text-[11px] tracking-[0.1em] text-ink-3">
              <span>PAY RUN · EXAMPLE</span>
              <span>4 RECIPIENTS</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] border-collapse text-sm">
                <thead>
                  <tr className="text-left font-mono text-[11px] tracking-[0.08em] text-ink-3">
                    <th scope="col" className="px-5 py-3 font-normal">RECIPIENT</th>
                    <th scope="col" className="px-5 py-3 text-right font-normal">AMOUNT</th>
                    <th scope="col" className="px-5 py-3 font-normal">STATUS</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {EXAMPLE_RUN.map(r => (
                    <tr key={r.who} className="border-t border-line-soft">
                      <td className="px-5 py-3.5">
                        {r.who} <span className="ml-1 font-mono text-xs text-ink-3">{r.addr}</span>
                      </td>
                      <td className="num px-5 py-3.5 text-right">{r.amount} USDC</td>
                      <td className="px-5 py-3.5">
                        <StatusChip state={r.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between border-t border-line px-5 py-4 font-mono text-sm tabular-nums">
              <span className="text-ink-3">TOTAL</span>
              <span>1,645.50 USDC</span>
            </div>
          </Reveal>
        </section>

        {/* Network */}
        <section id="network" className={`${container} scroll-mt-20 pt-28 md:pt-32`}>
          <Reveal>
            <p className="kicker">[04] The network underneath</p>
          </Reveal>
          <dl className="mt-8 grid border-t border-line sm:grid-cols-2 lg:grid-cols-4">
            {NETWORK_STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.06} className="flex flex-col-reverse gap-2 border-b border-line py-7 sm:pr-6">
                <dt className="text-[15px] text-ink-2">{s.label}</dt>
                <dd className="num text-5xl font-normal tracking-[-0.04em] md:text-6xl">
                  {s.count ? <CountUp {...s.count} /> : s.text}
                </dd>
              </Reveal>
            ))}
          </dl>
          <p className="mt-5 text-[13px] text-ink-3">
            Injective network figures as published on{' '}
            <a href="https://injective.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-ink">
              injective.com
            </a>
            .
          </p>
        </section>

        {/* How it works */}
        <section id="how-it-works" className={`${container} scroll-mt-20 pt-28 md:pt-32`}>
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <h2 className={h2}>From wallet to receipt in four steps.</h2>
            <p className="kicker">[05] How it works</p>
          </Reveal>
          <div className="mt-12">
            <Steps steps={STEPS} />
          </div>
        </section>

        {/* Not live yet */}
        <section className={`${container} pt-24`}>
          <div className="flex flex-wrap items-baseline gap-4 border border-dashed border-line-strong px-6 py-5">
            <span className="font-mono text-xs tracking-[0.1em] text-coral">NOT LIVE YET</span>
            <span className="text-[15px] text-ink-2">Naira cash-out and bill payments. They will only launch with a licensed partner.</span>
          </div>
        </section>

        {/* Community */}
        <section className={`${container} pt-24`}>
          <Reveal>
            <a
              href="https://injective-by-examples.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="group grid gap-6 border border-line p-6 transition-colors hover:bg-surface sm:grid-cols-[1fr_auto] sm:items-center md:p-10"
            >
              <span className="flex flex-col gap-3">
                <span className="kicker">[06] Also from the community</span>
                <span className="text-3xl font-medium tracking-[-0.03em]">Injective By Examples</span>
                <span className="max-w-[55ch] text-[15px] leading-relaxed text-ink-2">
                  Hands-on examples built to onboard the African community into the Injective ecosystem.
                </span>
              </span>
              <span className="inline-flex size-12 items-center justify-center border border-line-strong transition-colors group-hover:border-ocean group-hover:bg-ocean group-hover:text-white">
                <ArrowUpRight size={20} aria-hidden="true" />
                <span className="sr-only">Open Injective By Examples</span>
              </span>
            </a>
          </Reveal>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 pt-28 md:pt-32">
          <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
            <Reveal className="flex flex-col gap-5">
              <p className="kicker">[07] FAQ</p>
              <h2 className={h2}>Questions, answered plainly.</h2>
            </Reveal>
            <Faq items={FAQS} />
          </div>
        </section>

        {/* CTA */}
        <section className="relative mt-28 overflow-hidden border-y border-line md:mt-32">
          <div className="absolute inset-0 opacity-85">
            <Dither field="flow" width={480} height={96} />
          </div>
          <div className={`${container} relative flex flex-col items-start gap-6 py-24 md:py-32`}>
            <h2 className="bg-page px-3.5 pb-3 pt-2 text-5xl font-medium leading-none tracking-[-0.04em] md:text-7xl">Try it on testnet.</h2>
            <p className="max-w-[48ch] bg-page px-3.5 py-2 text-[15px] leading-relaxed text-ink-2">
              Connect a wallet and send your first USDC.{' '}
              <Link href="/setup" className="text-ink underline underline-offset-4">New to Injective? Set up a wallet first.</Link>
            </p>
            <Link href="/home" className="btn-light px-6 py-3.5 text-[15px]">
              Launch app <Arrow />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer: the blue band with the engraved savanna rising out of it like the end of a printed
          page, kept from the earlier design. A dithered edge carries the dark page down into it. */}
      <footer className="overflow-hidden [&_a:focus-visible]:outline-white">
        <div aria-hidden="true" className="h-20 md:h-28">
          <Dither field="fade" width={480} height={40} />
        </div>
        <div className="bg-ocean text-white">
          <div className={`${container} grid grid-cols-2 gap-x-8 gap-y-12 pb-10 pt-12 md:pt-16 lg:grid-cols-[1.6fr_1fr_1fr_1fr]`}>
            <div className="col-span-2 lg:col-span-1">
              <Link href="/" className="flex items-center gap-2.5">
                <Image src="/brand/ninja-mark.svg" alt="" width={32} height={32} />
                <span className="text-[17px] font-semibold tracking-tight">NinjaPay</span>
              </Link>
              <p className="mt-5 max-w-[30ch] text-xl leading-snug">
                Non-custodial crypto payments, payroll and claim links on Injective.
              </p>
            </div>
            <FooterColumn title="App">
              {APP_LINKS.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className={footerLink}>{link.label}</Link>
                </li>
              ))}
            </FooterColumn>
            <FooterColumn title="Ecosystem">
              <li><a href="https://injective.com" target="_blank" rel="noopener noreferrer" className={footerLink}>Injective</a></li>
              <li><a href="https://injective-by-examples.vercel.app/" target="_blank" rel="noopener noreferrer" className={footerLink}>Injective By Examples</a></li>
              <li><a href="https://github.com/ALIPHATICHYD/NINJA-PAY" target="_blank" rel="noopener noreferrer" className={footerLink}>GitHub</a></li>
            </FooterColumn>
            <FooterColumn title="Socials">
              <li>
                <a href="https://x.com/NINJA_PAY" target="_blank" rel="noopener noreferrer" className={footerLink}>
                  {/* Inline, not flex, so the label shares a baseline with the other footer columns. */}
                  <XIcon className="mr-2 inline-block h-3.5 w-3.5 align-[-0.15em]" />X
                </a>
              </li>
            </FooterColumn>
          </div>
          <p className={`${container} pb-8 font-mono text-[11px] tracking-[0.1em] text-white/85`}>© 2026 NINJAPAY · BUILT ON INJECTIVE</p>
          {/* The sky is transparent, so the footer's blue shows through it. Under ~720px the art keeps
              its height and crops to the middle, where the ninja walks. */}
          <div className="relative aspect-[1440/380] min-h-[190px] w-full">
            <Image src="/brand/savanna.webp" alt="" fill sizes="(min-width: 720px) 100vw, 720px" className="object-cover object-bottom" />
          </div>
        </div>
      </footer>
    </div>
  )
}

const footerLink = 'text-[15px] text-white/90 underline-offset-4 transition-colors hover:text-white hover:underline'

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-pixel text-[13px] uppercase tracking-[0.08em]">{title}</p>
      <span aria-hidden="true" className="mt-3 block h-px w-8 bg-white/70" />
      <ul className="mt-5 grid gap-3">{children}</ul>
    </div>
  )
}

