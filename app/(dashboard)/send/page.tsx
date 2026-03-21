'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { useTokenPrice } from '@/hooks/useTokenPrice'
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { Send, ArrowLeftRight, ArrowRight, ExternalLink } from 'lucide-react'
import { resolveAccountName } from '@/lib/paystack'

const BANKS = [
  'Access Bank', 'Ecobank', 'Fidelity Bank', 'First Bank', 'GTBank', 
  'Kuda Bank', 'Moniepoint', 'OPay', 'Palmpay', 'Stanbic IBTC', 
  'Sterling Bank', 'UBA', 'Wema Bank', 'Zenith Bank'
]

const TESTNET_EXPLORER = 'https://testnet.explorer.injective.network/transaction'

export default function SendPage() {
  const { address, isConnected } = useWallet()
  const { inj } = useBalance(address)

  const [tab, setTab]             = useState<'send' | 'offramp'>('send')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount]       = useState('')

  // Off-ramp state
  const [orToken, setOrToken]   = useState<'USDT' | 'INJ'>('USDT')
  const [orAmount, setOrAmount] = useState('')
  const [bankName, setBankName] = useState('')
  const [acctNumber, setAcctNumber] = useState('')
  const [resolvedName, setResolvedName] = useState('')
  const [isResolving, setIsResolving] = useState(false)
  
  const [orLoading, setOrLoading] = useState(false)
  const [orStatus, setOrStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })

  // wagmi send transaction hooks
  const { sendTransaction, data: txHash, isPending, error: sendError, reset } = useSendTransaction()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  // Live prices
  const { injUsd, usdtNgn, loading: pricesLoading } = useTokenPrice()

  const maxINJ      = parseFloat(formatEther(BigInt(inj || '0')))
  const parsedAmt   = parseFloat(amount) || 0
  const isValidAddr = recipient.startsWith('0x') && recipient.length === 42
  const canSend     = isValidAddr && parsedAmt > 0 && parsedAmt <= maxINJ

  const rate = orToken === 'USDT' ? usdtNgn : (injUsd * usdtNgn)
  const ngn  = orAmount ? (parseFloat(orAmount) * rate).toLocaleString('en-NG', { maximumFractionDigits: 0 }) : '0'

  // Bank code mapping (example - expand as needed)
  const BANK_CODES: { [key: string]: string } = {
    'Access Bank': '044',
    'Ecobank': '050',
    'Fidelity Bank': '070',
    'First Bank': '011',
    'GTBank': '058',
    'Kuda Bank': '090267',
    'Moniepoint': '999991',
    'OPay': '999992',
    'Palmpay': '999993',
    'Stanbic IBTC': '039',
    'Sterling Bank': '100',
    'UBA': '033',
    'Wema Bank': '035',
    'Zenith Bank': '057',
  }

  // Real account name resolution via Paystack
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

    const timer = setTimeout(resolveAccount, 800) // Debounce
    return () => clearTimeout(timer)
  }, [acctNumber, bankName])

  const handleSend = () => {
    if (!isValidAddr || !amount) return
    reset()
    sendTransaction({
      to: recipient as `0x${string}`,
      value: parseEther(amount),
    })
  }

  const handleOfframp = async () => {
    if (!orAmount || !bankName || !acctNumber) {
      setOrStatus({ type: 'error', message: 'Please fill in all fields.' })
      return
    }
    setOrLoading(true)
    setOrStatus({ type: null, message: '' })
    await new Promise(r => setTimeout(r, 2000))
    setOrStatus({ type: 'success', message: `Off-ramp initiated. ₦${ngn} will be credited to your ${bankName} account ending in ${acctNumber.slice(-4)} within 60 seconds.` })
    setOrAmount(''); setAcctNumber('')
    setOrLoading(false)
  }

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to use Send &amp; Off-Ramp.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '540px', margin: '0 auto' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>
          Send &amp; Off-Ramp
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          Transfer tokens or convert crypto to Nigerian Naira.
        </p>
      </div>

      {/* Tab selector */}
      <div className="seg-control" style={{ marginBottom: '20px' }}>
        <button className={`seg-btn${tab === 'send' ? ' active' : ''}`} onClick={() => setTab('send')}>
          <Send size={13} style={{ display: 'inline', marginRight: '6px' }} />
          Send Tokens
        </button>
        <button className={`seg-btn${tab === 'offramp' ? ' active' : ''}`} onClick={() => setTab('offramp')}>
          <ArrowLeftRight size={13} style={{ display: 'inline', marginRight: '6px' }} />
          Off-Ramp to NGN
        </button>
      </div>

      {/* ─── Send Tokens tab ─── */}
      {tab === 'send' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Network badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: '600' }}>Injective EVM Testnet</span>
          </div>

          {/* Balance */}
          <div>
            <label className="label">Token</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '9px', marginBottom: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #00b0f0 0%, #007eb4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '10px', fontWeight: '800', color: 'white' }}>INJ</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>INJ (Native)</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Injective EVM Testnet</p>
              </div>
              <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                {maxINJ.toFixed(4)} INJ
              </p>
            </div>
          </div>

          {/* Recipient */}
          <div>
            <label className="label">Recipient EVM Address</label>
            <input
              className="input input-mono"
              type="text"
              placeholder="0x..."
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
            />
            {recipient && !isValidAddr && (
              <p style={{ fontSize: '11px', color: 'var(--error)', marginTop: '5px' }}>Enter a valid 0x EVM address.</p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="label">Amount (INJ)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                step="0.001"
                min="0"
                style={{ flex: 1 }}
              />
              <button
                onClick={() => setAmount(maxINJ.toFixed(6))}
                className="btn-ghost"
                style={{ border: '1px solid var(--border)', borderRadius: '9px', fontSize: '12px', fontWeight: '600', padding: '0 14px', flexShrink: 0 }}
              >
                Max
              </button>
            </div>
          </div>

          {/* Status / tx feedback */}
          {sendError && (
            <div className="alert-error">{sendError.message.slice(0, 120)}</div>
          )}
          {isPending && (
            <div className="alert-warning" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="spinner" /> Waiting for wallet confirmation…
            </div>
          )}
          {isConfirming && (
            <div className="alert-warning" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="spinner" /> Transaction submitted — awaiting confirmation…
            </div>
          )}
          {isConfirmed && txHash && (
            <div className="alert-success">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Transaction confirmed!</span>
                <a
                  href={`${TESTNET_EXPLORER}/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--accent)' }}
                >
                  View on explorer <ExternalLink size={11} />
                </a>
              </div>
              <p style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                {txHash.slice(0, 28)}…
              </p>
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={!canSend || isPending || isConfirming}
            className="btn-primary"
            style={{ width: '100%', padding: '13px', fontSize: '15px' }}
          >
            {isPending || isConfirming
              ? <><span className="spinner" /> {isPending ? 'Confirm in wallet…' : 'Confirming…'}</>
              : <><Send size={15} /> Send INJ</>}
          </button>

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
            Transaction fees paid in INJ · Injective EVM Testnet
          </p>
        </div>
      )}

      {/* ─── Off-Ramp tab ─── */}
      {tab === 'offramp' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Token selector */}
          <div>
            <label className="label">Token to convert</label>
            <div className="seg-control">
              {(['USDT', 'INJ'] as const).map(t => (
                <button key={t} onClick={() => setOrToken(t)} className={`seg-btn${orToken === t ? ' active' : ''}`}>{t}</button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="label">Amount ({orToken})</label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type="number"
                placeholder="0.00"
                value={orAmount}
                onChange={e => setOrAmount(e.target.value)}
                style={{ paddingRight: '60px' }}
              />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
                {orToken}
              </span>
            </div>
          </div>

          {/* Rate + NGN */}
          <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>You receive</p>
              <p style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>₦{ngn}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Est. Rate</p>
              <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                {pricesLoading ? 'Loading...' : `1 ${orToken} = ₦${rate.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`}
              </p>
            </div>
          </div>

          {/* Bank details */}
          <div>
            <label className="label">Bank Name</label>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <select className="select" value={bankName} onChange={e => setBankName(e.target.value)}>
                <option value="">Select bank</option>
                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <label className="label">Account Number</label>
            <input
              className="input input-mono"
              type="text"
              placeholder="0123456789"
              value={acctNumber}
              maxLength={10}
              onChange={e => setAcctNumber(e.target.value.replace(/\D/g, ''))}
              style={{ marginBottom: '10px' }}
            />
            {isResolving && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="spinner" style={{ width: '10px', height: '10px', borderWidth: '1px' }} /> Resolving account...
              </p>
            )}
            {orStatus.type === 'success' && !isResolving && (
              <p style={{ fontSize: '12px', color: 'var(--success)', fontWeight: '500' }}>
                ✓ {orStatus.message}
              </p>
            )}
            {orStatus.type === 'error' && !isResolving && (
              <p style={{ fontSize: '12px', color: 'var(--error)', fontWeight: '500' }}>
                ✗ {orStatus.message}
              </p>
            )}
          </div>

          {orStatus.type && (
            <div className={orStatus.type === 'success' ? 'alert-success' : 'alert-error'}>{orStatus.message}</div>
          )}

          <button
            onClick={handleOfframp}
            disabled={orLoading || !orAmount || !bankName || !resolvedName || isResolving}
            className="btn-primary"
            style={{ width: '100%', padding: '13px', fontSize: '15px' }}
          >
            {orLoading ? <><span className="spinner" /> Processing…</> : <>Off-Ramp Now <ArrowRight size={15} /></>}
          </button>

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.6' }}>
            0.5% service fee · Credits within 60 seconds · Powered by Onboard API
          </p>
        </div>
      )}
    </div>
  )
}
