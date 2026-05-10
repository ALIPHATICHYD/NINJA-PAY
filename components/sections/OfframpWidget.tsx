'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { ArrowLeftRight, ArrowRight } from 'lucide-react'
import { useTokenPrice } from '@/hooks/useTokenPrice'
import { resolveAccountName } from '@/lib/paystack'

const BANKS = [
  'Access Bank',
  'Ecobank',
  'Fidelity Bank',
  'First Bank',
  'GTBank',
  'Kuda Bank',
  'Moniepoint',
  'OPay',
  'Palmpay',
  'Stanbic IBTC',
  'Sterling Bank',
  'UBA',
  'Wema Bank',
  'Zenith Bank',
]

const BANK_CODES: { [key: string]: string } = {
  'Access Bank': '044',
  Ecobank: '050',
  'Fidelity Bank': '070',
  'First Bank': '011',
  GTBank: '058',
  'Kuda Bank': '090267',
  Moniepoint: '999991',
  OPay: '999992',
  Palmpay: '999993',
  'Stanbic IBTC': '039',
  'Sterling Bank': '100',
  UBA: '033',
  'Wema Bank': '035',
  'Zenith Bank': '057',
}

export function OfframpWidget() {
  const [offrampToken, setOfframpToken] = useState<'INJ' | 'USDC'>('USDC')
  const [offrampAmount, setOfframpAmount] = useState('10')
  const [bankName, setBankName] = useState('')
  const [acctNumber, setAcctNumber] = useState('')
  const [resolvedName, setResolvedName] = useState('')
  const [isResolving, setIsResolving] = useState(false)
  const [orStatus, setOrStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  })

  const { injUsd, usdcNgn, loading } = useTokenPrice()
  const rate = offrampToken === 'USDC' ? usdcNgn : injUsd * usdcNgn
  const ngn = offrampAmount
    ? (parseFloat(offrampAmount) * rate).toLocaleString('en-NG', { maximumFractionDigits: 0 })
    : '0'

  useEffect(() => {
    const resolveAccount = async () => {
      if (acctNumber.length === 10 && bankName) {
        setIsResolving(true)
        setResolvedName('')
        setOrStatus({ type: null, message: '' })

        try {
          const bankCode = BANK_CODES[bankName]
          if (!bankCode) {
            setOrStatus({ type: 'error', message: 'Bank not supported or not found' })
            setIsResolving(false)
            return
          }

          const result = await resolveAccountName(acctNumber, bankCode)
          setResolvedName(result.accountName)
          setOrStatus({ type: 'success', message: `Account verified: ${result.accountName}` })
        } catch (error: any) {
          const errorMsg = error.message || 'Failed to resolve account name'
          setOrStatus({ type: 'error', message: errorMsg })
          setResolvedName('')
        } finally {
          setIsResolving(false)
        }
      } else {
        setResolvedName('')
        setOrStatus({ type: null, message: '' })
      }
    }

    const timer = setTimeout(resolveAccount, 800)
    return () => clearTimeout(timer)
  }, [acctNumber, bankName])

  return (
    <div className="reveal-right" style={{ position: 'relative', zIndex: 1, marginTop: '20px' }}>
      <div
        className="card-glass"
        style={{ borderColor: 'var(--border-light)', boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}
      >
        {/* Widget header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
          <div className="icon-box">
            <ArrowLeftRight size={17} />
          </div>
          <div>
            <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
              Off-Ramp
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Convert crypto → NGN instantly
            </p>
          </div>
        </div>

        {/* Token toggle */}
        <div style={{ marginBottom: '14px' }}>
          <p className="label">You send</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {(['USDC', 'INJ'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOfframpToken(t)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '7px',
                  fontSize: '13px',
                  fontWeight: '600',
                  border: offrampToken === t ? '1px solid rgba(91,88,240,0.4)' : '1px solid var(--border)',
                  background: offrampToken === t ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                  color: offrampToken === t ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <input
              className="input input-lg"
              type="number"
              value={offrampAmount}
              onChange={(e) => setOfframpAmount(e.target.value)}
              placeholder="0.00"
              style={{ paddingRight: '70px' }}
            />
            <span
              style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '13px',
                fontWeight: '600',
                color: offrampToken === 'USDC' ? 'var(--usdc-color)' : 'var(--inj-color)',
              }}
            >
              {offrampToken}
            </span>
          </div>
        </div>

        {/* Rate row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--bg-secondary)',
            borderRadius: '9px',
            marginBottom: '14px',
            border: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Est. Rate</span>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
            {loading
              ? 'Loading...'
              : `1 ${offrampToken} ≈ ₦${rate.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`}
          </span>
        </div>

        {/* NGN output */}
        <div style={{ marginBottom: '18px' }}>
          <p className="label">You receive (NGN)</p>
          <div
            style={{
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontSize: '22px',
                fontWeight: '700',
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              ₦{ngn}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>NGN</span>
          </div>
        </div>

        <Link href="/send" className="btn-primary" style={{ width: '100%', padding: '13px', fontSize: '15px' }}>
          Off-Ramp Now
          <ArrowRight size={15} />
        </Link>

        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '12px', lineHeight: '1.5' }}>
          Connect wallet to proceed · Powered by Onboard API
        </p>
      </div>
    </div>
  )
}
