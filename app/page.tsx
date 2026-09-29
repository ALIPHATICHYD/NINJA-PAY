'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  Send,
  CreditCard,
  Share2,
  Users2,
  BarChart3,
  ListOrdered,
  ArrowRight,
  Shield,
  Zap,
  Wallet,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react'
import { OfframpUnavailable } from '@/components/OfframpUnavailable'

const FEATURES = [
  { icon: Send,        title: 'Send',          desc: 'Transfer INJ or USDC to any Injective wallet address instantly.' },
  { icon: CreditCard,  title: 'Pay Bills',     desc: 'Airtime, data, electricity, and cable. Not live yet.' },
  { icon: Share2,      title: 'Claims',        desc: 'Create shareable links to distribute tokens to any group.' },
  { icon: Users2,      title: 'Payroll',       desc: 'Batch-pay your team or DAO in a single transaction.' },
  { icon: BarChart3,   title: 'Analytics',     desc: 'Track volume, transaction counts, and performance over time.' },
  { icon: ListOrdered, title: 'Transactions',  desc: 'Full on-chain history, filterable by type and status.' },
]

const FAQS = [
  {
    q: 'What networks does NinjaPay support?',
    a: 'NinjaPay runs natively on Injective. Wallet connect supports Keplr and Leap (Cosmos) as well as MetaMask (EVM-compatible via Injective\'s EVM layer).',
  },
  {
    q: 'Is NinjaPay non-custodial?',
    a: 'Yes. Your wallet keys never leave your device. All on-chain transactions are signed by your wallet and broadcast to Injective directly.',
  },
  {
    q: 'How does off-ramping work?',
    a: 'It isn\'t live yet. NinjaPay will not hold your crypto or convert it to naira itself. The off-ramp will only launch through a licensed partner, and none is connected today.',
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

export default function LandingPage() {
  const [openFaq, setOpenFaq]         = useState<number | null>(null)
  // Scroll Reveal Animations Observer
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active')
        }
      })
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' })

    document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', overflowX: 'hidden' }}>

      {/* ─── Navbar ─── */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(8,10,14,0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '0 32px',
            height: '72px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Left: Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 1L13 4.5V10.5L7.5 14L2 10.5V4.5L7.5 1Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(255,255,255,0.15)" />
                <circle cx="7.5" cy="7.5" r="2" fill="white" />
              </svg>
            </div>
            <span style={{ fontWeight: '800', fontSize: '19px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              NinjaPay
            </span>
          </div>

          {/* Right: CTA */}
          <Link href="/send" className="btn-primary" style={{ padding: '10px 24px', fontSize: '14px', borderRadius: '8px' }}>
            Launch App
            <ArrowRight size={15} />
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section
        style={{
          position: 'relative',
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '90px 24px 60px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '64px',
          alignItems: 'center',
        }}
      >
        {/* Orbs */}
        <div
          className="orb"
          style={{ width: '600px', height: '600px', background: 'rgba(91,88,240,0.12)', top: '-200px', left: '-200px' }}
        />
        <div
          className="orb"
          style={{ width: '400px', height: '400px', background: 'rgba(139,92,246,0.08)', top: '-100px', right: '-100px', animationDelay: '4s' }}
        />

        {/* Left: copy */}
        <div className="reveal-left" style={{ position: 'relative', zIndex: 1 }}>
          <div className="hero-badge reveal delay-1" style={{ marginBottom: '28px', display: 'inline-flex' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />
            Built for the Injective Africa Community
          </div>

          <h1
            className="reveal delay-2"
            style={{
              fontSize: 'clamp(38px, 6vw, 66px)',
              fontWeight: '800',
              color: 'var(--text-primary)',
              letterSpacing: '-0.04em',
              lineHeight: '1.08',
              marginBottom: '24px',
            }}
          >
            Crypto payments{'\u00A0'}for{' '}
            <span className="gradient-text">the real world.</span>
          </h1>

          <p
            className="reveal delay-3"
            style={{
              fontSize: '18px',
              color: 'var(--text-secondary)',
              maxWidth: '520px',
              lineHeight: '1.75',
              marginBottom: '40px',
            }}
          >
            Send INJ and USDC from one non-custodial interface on Injective.
            Off-ramp to Nigerian bank accounts and bill payments are not live yet.
          </p>

          <div className="reveal delay-4" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link href="/send" className="btn-primary" style={{ padding: '13px 28px', fontSize: '15px' }}>
              Get Started
              <ArrowRight size={16} />
            </Link>
            <a href="#how-it-works" className="btn-secondary" style={{ padding: '13px 28px', fontSize: '15px' }}>
              How it works
            </a>
          </div>

          <div className="reveal delay-4" style={{ display: 'flex', gap: '24px', marginTop: '40px', flexWrap: 'wrap' }}>
            {[
              { label: 'Settlement', value: '< 1 second' },
              { label: 'Network fee', value: '~$0.002' },
              { label: 'Wallets', value: 'Keplr · Leap · MetaMask' },
            ].map(s => (
              <div key={s.label}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{s.value}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: off-ramp status (not live) */}
        <div className="reveal-right" style={{ position: 'relative', zIndex: 1, marginTop: '20px' }}>
          <OfframpUnavailable className="card-glass" />
        </div>
      </section>

      {/* ─── Stats strip ─── */}
      <section className="reveal" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '28px 24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '24px',
          }}
        >
          {[
            { label: 'Settlement time',   value: '< 1 second' },
            { label: 'Network fee',       value: '~$0.002' },
            { label: 'Wallets supported', value: '3 wallets' },
            { label: 'NGN off-ramp', value: 'Not live yet' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '4px' }}>
                {stat.value}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features ─── */}
      <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '88px 24px' }}>
        <div className="reveal" style={{ marginBottom: '52px' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>
            Features
          </p>
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
            Everything you need in one place
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <div key={f.title} className={`feature-card reveal delay-${(i % 3) + 1}`}>
                <div className="icon-box" style={{ marginBottom: '18px' }}>
                  <Icon size={18} />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.65' }}>
                  {f.desc}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section id="how-it-works" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '88px 24px' }}>
          <div className="reveal" style={{ marginBottom: '52px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>
              How It Works
            </p>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
              Get started in minutes
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '40px' }}>
            {[
              { step: '01', title: 'Connect your wallet', desc: 'Use Keplr, Leap, or MetaMask to connect your Injective wallet with one click.' },
              { step: '02', title: 'Choose an action',    desc: 'Send tokens, pay a bill, create a claim pool, or run payroll from the dashboard.' },
              { step: '03', title: 'Sign the transaction',desc: 'Review all details, then sign from your wallet. No private keys ever leave your device.' },
              { step: '04', title: 'Settlement on-chain', desc: 'Transactions settle on Injective in under a second. View them in your history instantly.' },
            ].map((s, i) => (
              <div key={s.step} className={`reveal delay-${(i % 4) + 1}`}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: '9px',
                    background: 'var(--accent-subtle)',
                    border: '1px solid rgba(91,88,240,0.25)',
                    marginBottom: '16px',
                    fontSize: '12px',
                    fontWeight: '800',
                    color: 'var(--accent)',
                  }}
                >
                  {s.step}
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.65' }}>
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why NinjaPay ─── */}
      <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '88px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {[
            { icon: Shield, title: 'Non-Custodial',      desc: 'You hold your keys. NinjaPay never takes custody of your funds.' },
            { icon: Zap,    title: 'Sub-Second Finality',desc: 'Injective settles transactions faster than any EVM chain.' },
            { icon: Wallet, title: 'Multi-Wallet',       desc: 'Keplr, Leap, and MetaMask — pick whatever you already use.' },
            { icon: CheckCircle2, title: 'Transparent Fees', desc: 'All fees shown upfront. No hidden charges, ever.' },
          ].map((item, i) => {
            const Icon = item.icon
            return (
              <div key={item.title} className={`card card-hover reveal delay-${(i % 4) + 1}`}>
                <div className="icon-box" style={{ marginBottom: '16px' }}>
                  <Icon size={18} />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.65' }}>
                  {item.desc}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ─── Community Ecosystem ─── */}
      <section style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '88px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: '52px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>
              Ecosystem
            </p>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
              Other Community Products
            </h2>
          </div>

          <div className="reveal delay-1" style={{ display: 'flex', justifyContent: 'center' }}>
            <a
              href="https://injective-by-examples.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="card card-hover"
              style={{ textDecoration: 'none', maxWidth: '400px', textAlign: 'center', padding: '32px 24px' }}
            >
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Injective By Examples
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.65' }}>
                Built for the African Community for onboarding into the Injective ecosystem.
              </p>
            </a>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '88px 24px' }}>
          <h2 className="reveal" style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: '48px' }}>
            Frequently asked questions
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {FAQS.map((faq, idx) => (
              <div
                key={idx}
                className={`reveal delay-${(idx % 4) + 1}`}
                style={{
                  borderRadius: '11px',
                  border: '1px solid',
                  borderColor: openFaq === idx ? 'var(--border-light)' : 'var(--border)',
                  background: openFaq === idx ? 'var(--bg-card)' : 'transparent',
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '18px 20px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    gap: '16px',
                  }}
                >
                  <span style={{ fontSize: '15px', fontWeight: '500', color: 'var(--text-primary)' }}>
                    {faq.q}
                  </span>
                  <ChevronDown
                    size={16}
                    style={{
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      transform: openFaq === idx ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </button>
                {openFaq === idx && (
                  <div
                    style={{
                      padding: '0 20px 18px',
                      paddingTop: '4px',
                      fontSize: '14px',
                      color: 'var(--text-secondary)',
                      lineHeight: '1.75',
                      borderTop: '1px solid var(--border)',
                      paddingBlock: '16px 18px',
                    }}
                  >
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="reveal" style={{ maxWidth: '1280px', margin: '0 auto', padding: '88px 24px' }}>
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-light)',
            borderRadius: '20px',
            padding: '72px 40px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            className="orb"
            style={{ width: '400px', height: '400px', background: 'rgba(91,88,240,0.12)', top: '-200px', left: '50%', transform: 'translateX(-50%)' }}
          />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 44px)', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: '16px' }}>
              Ready to get started?
            </h2>
            <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 36px', lineHeight: '1.7' }}>
              Connect your wallet to send INJ and USDC on Injective testnet.
            </p>
            <Link href="/send" className="btn-primary" style={{ padding: '14px 36px', fontSize: '16px' }}>
              Launch App
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer style={{ borderTop: '1px solid var(--border)' }}>
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '28px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            © 2026 NinjaPay. Built on Injective.
          </p>
          <div style={{ display: 'flex', gap: '20px' }}>
            {['Terms', 'Privacy', 'Twitter', 'Discord'].map(item => (
              <a
                key={item}
                href="#"
                style={{ fontSize: '13px', color: 'var(--text-muted)', transition: 'color 0.15s' }}
                onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)')}
                onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)')}
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
