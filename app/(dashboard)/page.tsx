'use client'

import Link from 'next/link'
import {
  Send,
  CreditCard,
  Share2,
  Users2,
  BarChart3,
  ListOrdered,
  ArrowUpRight,
  ArrowRight,
  Briefcase,
  TrendingUp,
  DollarSign,
} from 'lucide-react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { useUSDCConversion } from '@/hooks/useUSDCConversion'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { fromWei } from '@/lib/injective/bank'
import { OfframpUnavailable } from '@/components/OfframpUnavailable'

const FEATURES = [
  { icon: Send,         title: 'Send',          desc: 'Transfer INJ or USDC to any wallet.',   href: '/send' },
  { icon: CreditCard,   title: 'Bills',         desc: 'Pay airtime, data, electricity, cable.',href: '/bills' },
  { icon: Share2,       title: 'Claims',        desc: 'Create shareable token-drop links.',     href: '/claims' },
  { icon: Users2,       title: 'Beneficiaries', desc: 'Manage saved recipients.',               href: '/beneficiaries' },
  { icon: Briefcase,    title: 'Payroll',       desc: 'Batch-pay your team in one tx.',         href: '/payroll' },
  { icon: BarChart3,    title: 'Analytics',     desc: 'Volume, transactions, performance.',     href: '/analytics' },
  { icon: ListOrdered,  title: 'Transactions',  desc: 'Full on-chain history.',                 href: '/transactions' },
]

export default function DashboardHome() {
  const { isConnected, address } = useWallet()
  const { inj, usdc, loading: balLoading } = useBalance(address)
  const { injUsdcRate, usdcPrice, loading: priceLoading } = useUSDCConversion(1)
  const { userAddress: cosmosAddress, isReady: cosmosReady } = useCosmosTransaction()

  const injDisplay = balLoading ? '—' : parseFloat(fromWei(inj)).toFixed(4)
  const usdcDisplay = balLoading ? '—' : parseFloat(fromWei(usdc)).toFixed(2)

  // Conversion calculations
  const injValue = balLoading ? 0 : parseFloat(fromWei(inj))
  const usdcValue = balLoading ? 0 : parseFloat(fromWei(usdc))
  const injInUsdc = injValue * (parseFloat(injUsdcRate) || 0)
  const totalUsdc = usdcValue + injInUsdc
  

  /* ── Disconnected state ── */
  if (!isConnected) {
    return (
      <div style={{ maxWidth: '760px', margin: '48px auto 0', textAlign: 'center' }}>
        <div style={{ marginBottom: '48px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <img
              src="/favicon.png"
              alt="NinjaPay"
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '10px',
                objectFit: 'cover',
              }}
            />
          </div>
          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 44px)',
              fontWeight: '800',
              color: 'var(--text-primary)',
              letterSpacing: '-0.03em',
              lineHeight: '1.12',
              marginBottom: '16px',
            }}
          >
            Connect your wallet<br />to get started.
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: '1.7', maxWidth: '480px', margin: '0 auto' }}>
            NinjaPay requires a wallet to access sending, bill payments, claims, and payroll. Use the Connect Wallet button above.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
            gap: '12px',
            marginTop: '40px',
          }}
        >
          {FEATURES.map(f => {
            const Icon = f.icon
            return (
              <div key={f.title} className="card-sm" style={{ textAlign: 'left' }}>
                <div className="icon-box-sm" style={{ marginBottom: '12px' }}>
                  <Icon size={15} />
                </div>
                <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {f.title}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                  {f.desc}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /* ── Connected state ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Top row: Balance card + Off-ramp widget */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>

        {/* Balance hero card */}
        <div className="card" style={{ padding: '28px', background: 'var(--bg-card)', gridColumn: 'span 1' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px' }}>
            Wallet Balance
          </p>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '10px' }}>
              <span style={{ fontSize: 'clamp(34px, 5vw, 48px)', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {balLoading ? <span className="skeleton" style={{ display: 'inline-block', width: '120px', height: '42px' }} /> : injDisplay}
              </span>
              {!balLoading && <span style={{ fontSize: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>INJ</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-secondary)', letterSpacing: '-0.02em' }}>
                {balLoading ? <span className="skeleton" style={{ display: 'inline-block', width: '80px', height: '24px' }} /> : usdcDisplay}
              </span>
              {!balLoading && <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '500' }}>USDC</span>}
            </div>
          </div>

          {/* Address */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                background: 'var(--success-subtle)',
                border: '1px solid rgba(16,214,122,0.2)',
                borderRadius: '20px',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }} />
              <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: '600' }}>Injective</span>
            </div>
            <div
              className="copy-field"
              style={{ flex: 1, padding: '4px 10px', fontSize: '12px', borderRadius: '7px', cursor: 'pointer' }}
              onClick={() => navigator.clipboard.writeText(address || '')}
              title="Click to copy"
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {address?.slice(0, 14)}...{address?.slice(-6)}
              </span>
            </div>
          </div>

          {/* Cosmos address badge */}
          {cosmosReady && cosmosAddress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  background: 'rgba(39, 117, 202, 0.1)',
                  border: '1px solid rgba(39, 117, 202, 0.3)',
                  borderRadius: '20px',
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2775ca' }} />
                <span style={{ fontSize: '11px', color: '#2775ca', fontWeight: '600' }}>Cosmos</span>
              </div>
              <div
                className="copy-field"
                style={{ flex: 1, padding: '4px 10px', fontSize: '12px', borderRadius: '7px', cursor: 'pointer' }}
                onClick={() => navigator.clipboard.writeText(cosmosAddress || '')}
                title="Click to copy"
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cosmosAddress?.slice(0, 14)}...{cosmosAddress?.slice(-6)}
                </span>
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Link href="/send" className="btn-primary" style={{ fontSize: '13px', padding: '9px 16px' }}>
              <Send size={13} /> Send
            </Link>
            <Link href="/claims" className="btn-secondary" style={{ fontSize: '13px', padding: '9px 16px' }}>
              <Share2 size={13} /> Create Claim
            </Link>
            <Link href="/bills" className="btn-secondary" style={{ fontSize: '13px', padding: '9px 16px' }}>
              <CreditCard size={13} /> Pay Bills
            </Link>
          </div>
        </div>

        {/* Off-ramp status (not live) */}
        <OfframpUnavailable />

        {/* USDC Pricing & Conversion Widget */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div className="icon-box" style={{ background: 'linear-gradient(135deg, #2775ca 0%, #1e5ba8 100%)' }}>
              <DollarSign size={16} />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>USDC Rates</p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Live market prices</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>1 INJ</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--accent)' }}>
                {priceLoading ? '...' : `${(parseFloat(injUsdcRate) || 0).toFixed(4)} USDC`}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>1 USDC</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#2775ca' }}>
                ${(parseFloat(usdcPrice) || 1).toFixed(2)}
              </span>
            </div>
          </div>

          <Link href="/send" className="btn-secondary" style={{ width: '100%', padding: '8px', fontSize: '12px' }}>
            <TrendingUp size={12} /> View All Rates
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Total Sent', value: '—' },
          { label: 'Transactions', value: '—' },
          { label: 'Beneficiaries', value: '—' },
        ].map(s => (
          <div key={s.label} className="card-sm">
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {s.label}
            </p>
            <p style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quick access grid */}
      <div>
        <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' }}>
          Quick Access
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '10px' }}>
          {FEATURES.map(f => {
            const Icon = f.icon
            return (
              <Link
                key={f.title}
                href={f.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  transition: 'border-color 0.15s, background 0.15s, transform 0.15s',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLAnchorElement
                  el.style.borderColor = 'var(--border-light)'
                  el.style.background = 'var(--bg-hover)'
                  el.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLAnchorElement
                  el.style.borderColor = 'var(--border)'
                  el.style.background = 'var(--bg-card)'
                  el.style.transform = 'translateY(0)'
                }}
              >
                <div className="icon-box-sm">
                  <Icon size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '1px' }}>
                    {f.title}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.desc}
                  </p>
                </div>
                <ArrowRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </Link>
            )
          })}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Recent Transactions</h3>
          <Link
            href="/transactions"
            style={{ fontSize: '13px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            View all <ArrowUpRight size={12} />
          </Link>
        </div>
        <div className="empty-state">
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
              color: 'var(--text-muted)',
            }}
          >
            <ListOrdered size={20} />
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: '500' }}>No transactions yet</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Start by sending INJ to another wallet or paying a bill.
          </p>
          <Link href="/send" style={{ display: 'inline-block', marginTop: '16px', fontSize: '13px', color: 'var(--accent)' }}>
            Send your first transaction
          </Link>
        </div>
      </div>
    </div>
  )
}
