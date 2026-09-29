'use client'

import { useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { fromWei } from '@/lib/injective/bank'
import { CreditCard, Phone, Wifi, Zap, Tv, AlertCircle } from 'lucide-react'

type BillType = 'airtime' | 'data' | 'electricity' | 'cable'

const BILL_TYPES: { id: BillType; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'airtime',     label: 'Airtime',     icon: Phone, desc: 'Top up any number' },
  { id: 'data',        label: 'Data',        icon: Wifi,  desc: 'Buy data bundles' },
  { id: 'electricity', label: 'Electricity', icon: Zap,   desc: 'Pay meter bills' },
  { id: 'cable',       label: 'Cable TV',    icon: Tv,    desc: 'DStv, GOtv, etc.' },
]

const PROVIDERS: Record<BillType, string[]> = {
  airtime:     ['MTN', 'Glo', 'Airtel', '9mobile'],
  data:        ['MTN', 'Glo', 'Airtel', '9mobile'],
  electricity: ['EKEDC', 'IKEDC', 'PHCN', 'BEDC'],
  cable:       ['DStv', 'GOtv', 'Startimes'],
}

const PLACEHOLDERS: Record<BillType, string> = {
  airtime:     'Phone number (e.g. 08012345678)',
  data:        'Phone number',
  electricity: 'Meter number',
  cable:       'Smart card number',
}

export default function BillsPage() {
  const { address, isConnected } = useWallet()
  const { usdc } = useBalance(address)

  const [billType, setBillType] = useState<BillType>('airtime')
  const [provider, setProvider] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentToken, setPaymentToken] = useState<'NGN' | 'USDC'>('USDC')
  const availableUsdc = usdc ? parseFloat(fromWei(usdc)).toFixed(2) : '0'

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to pay bills.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '540px', margin: '0 auto' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>
          Pay Bills
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          Pay Nigerian utility bills with USDC.
        </p>
      </div>

      <div className="alert-warning" role="status" style={{ marginBottom: '20px' }}>
        Bill payments are not live yet. No payment is taken and nothing is sent to a provider.
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Payment method selector */}
        <div>
          <label className="label">Payment Method</label>
          <div className="seg-control">
            {(['USDC', 'NGN'] as const).map(t => (
              <button 
                key={t} 
                onClick={() => setPaymentToken(t)} 
                className={`seg-btn${paymentToken === t ? ' active' : ''}`}
                style={{ fontSize: '13px' }}
              >
                {t === 'USDC' ? '💵 USDC' : '₦ NGN'}
              </button>
            ))}
          </div>
          <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
            Available: <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{availableUsdc} USDC</span>
          </p>
        </div>

        {/* Bill type — icon-tile selector */}
        <div>
          <label className="label">Bill Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {BILL_TYPES.map(bt => {
              const Icon = bt.icon
              const active = billType === bt.id
              return (
                <button
                  key={bt.id}
                  onClick={() => { setBillType(bt.id); setProvider('') }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '14px 8px',
                    borderRadius: '10px',
                    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  <Icon size={20} />
                  <span style={{ fontSize: '11px', fontWeight: '600', color: active ? 'var(--accent)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {bt.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Provider */}
        <div>
          <label className="label">Provider</label>
          <div style={{ position: 'relative' }}>
            <select className="select" value={provider} onChange={e => setProvider(e.target.value)}>
              <option value="">Select provider</option>
              {PROVIDERS[billType].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}>
              <path d="M2 4.5L6.5 9L11 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Identifier */}
        <div>
          <label className="label">{billType === 'electricity' ? 'Meter Number' : 'Identifier'}</label>
          <input
            className="input"
            type="text"
            placeholder={PLACEHOLDERS[billType]}
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
          />
        </div>

        {/* Amount */}
        <div>
          <label className="label">Amount ({paymentToken === 'NGN' ? 'NGN' : 'USDC'})</label>
          <input
            className="input"
            type="number"
            placeholder={paymentToken === 'NGN' ? 'e.g. 1000' : 'e.g. 10.00'}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            min="0"
            step={paymentToken === 'NGN' ? '100' : '0.01'}
          />
        </div>

        <button
          disabled
          className="btn-primary"
          style={{ width: '100%', padding: '13px', fontSize: '15px' }}
        >
          <CreditCard size={15} /> Not live yet
        </button>
      </div>
    </div>
  )
}
