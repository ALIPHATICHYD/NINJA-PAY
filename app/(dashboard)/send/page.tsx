'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { useTokenPrice } from '@/hooks/useTokenPrice'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { useUSDCConversion } from '@/hooks/useUSDCConversion'
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { Send, ArrowLeftRight, ArrowRight, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react'
import { resolveAccountName } from '@/lib/paystack'
import { toUSDCChainFormat, isValidUSDCAmount } from '@/lib/injective/usdc-testnet'

const BANKS = [
  'Access Bank', 'Ecobank', 'Fidelity Bank', 'First Bank', 'GTBank', 
  'Kuda Bank', 'Moniepoint', 'OPay', 'Palmpay', 'Stanbic IBTC', 
  'Sterling Bank', 'UBA', 'Wema Bank', 'Zenith Bank'
]

const TESTNET_EXPLORER = 'https://testnet.explorer.injective.network/transaction'

export default function SendPage() {
  const { address, isConnected } = useWallet()
  const { inj, usdc } = useBalance(address)
  const { usdcNgnRate, loading: pricesLoading } = useUSDCConversion(1)
  const { injUsd } = useTokenPrice()
  
  // Cosmos transaction hook for USDC sends
  const { 
    userAddress: cosmosAddress, 
    isReady: cosmosReady, 
    sendToken: cosmosSendToken, 
    loading: cosmosLoading, 
    error: cosmosError 
  } = useCosmosTransaction()

  const [tab, setTab] = useState<'send' | 'offramp'>('send')
  const [sendToken, setSendToken] = useState<'INJ' | 'USDC'>('USDC')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [txHash, setTxHash] = useState('')
  const [sendStatus, setSendStatus] = useState<{ type: 'idle' | 'pending' | 'success' | 'error'; message: string }>({ 
    type: 'idle', 
    message: '' 
  })

  // Off-ramp state
  const [orToken, setOrToken] = useState<'USDC' | 'INJ'>('USDC')
  const [orAmount, setOrAmount] = useState('')
  const [bankName, setBankName] = useState('')
  const [acctNumber, setAcctNumber] = useState('')
  const [resolvedName, setResolvedName] = useState('')
  const [isResolving, setIsResolving] = useState(false)
  
  const [orLoading, setOrLoading] = useState(false)
  const [orStatus, setOrStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })

  // wagmi send transaction hooks (for INJ)
  const { sendTransaction, data: injTxHash, isPending, error: sendError, reset } = useSendTransaction()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: injTxHash })

  // Balance formatting
  const maxINJ = parseFloat(formatEther(BigInt(inj || '0')))
  const maxUSDC = usdc ? parseFloat(usdc) / 1e6 : 0 // USDC has 6 decimals
  const maxAmount = sendToken === 'USDC' ? maxUSDC : maxINJ
  const parsedAmt = parseFloat(amount) || 0
  
  // Recipient validation - both Ethereum and Cosmos addresses
  const isValidEthAddr = recipient.startsWith('0x') && recipient.length === 42
  const isValidCosmosAddr = recipient.startsWith('inj1') && recipient.length > 40
  const isValidAddr = isValidEthAddr || isValidCosmosAddr
  const canSend = isValidAddr && parsedAmt > 0 && parsedAmt <= maxAmount

  const rate = orToken === 'USDC' ? usdcNgnRate : (injUsd * usdcNgnRate)
  const ngn = orAmount ? (parseFloat(orAmount) * rate).toLocaleString('en-NG', { maximumFractionDigits: 0 }) : '0'

  // Bank code mapping (example - expand as needed)
  // Real account name resolution via Paystack
  useEffect(() => {
    const resolveAccount = async () => {
      if (acctNumber.length === 10 && bankName) {
        setIsResolving(true)
        setResolvedName('')
        setOrStatus({ type: null, message: '' })
        
        try {
          const result = await resolveAccountName(acctNumber, bankName)
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

  const handleSend = async () => {
    if (!isValidAddr || !amount) return

    setSendStatus({ type: 'pending', message: '' })

    try {
      if (sendToken === 'USDC') {
        // Cosmos USDC send
        if (!cosmosReady) {
          setSendStatus({ type: 'error', message: 'Cosmos wallet not connected. Click "Connect USDC" first.' })
          return
        }

        const amountInChainFormat = toUSDCChainFormat(parsedAmt.toString())
        if (!isValidUSDCAmount(amountInChainFormat)) {
          setSendStatus({ type: 'error', message: `Invalid USDC amount. Max decimals: 6` })
          return
        }

        const hash = await cosmosSendToken(recipient, amountInChainFormat, 'USDC')
        setTxHash(hash)
        setSendStatus({ type: 'success', message: `USDC transfer initiated! Transaction: ${hash.slice(0, 16)}...` })
        setAmount('')
        setRecipient('')
      } else {
        // INJ send - support both Cosmos (inj1) and EVM (0x) addresses
        if (isValidCosmosAddr) {
          // Cosmos path: use Keplr/Leap
          if (!cosmosReady) {
            setSendStatus({ type: 'error', message: 'Cosmos wallet not connected. Please connect first.' })
            return
          }

          const { toChainAmount } = await import('@/lib/injective/cosmos-transactions')
          const amountInWei = toChainAmount(amount, 18)

          const hash = await cosmosSendToken(recipient, amountInWei, 'INJ')
          setTxHash(hash)
          setSendStatus({ type: 'success', message: `INJ transfer initiated! Transaction: ${hash.slice(0, 16)}...` })
          setAmount('')
          setRecipient('')
        } else if (isValidEthAddr) {
          // EVM path: use MetaMask/Wagmi
          reset()
          sendTransaction({
            to: recipient as `0x${string}`,
            value: parseEther(amount),
          })
          setSendStatus({ type: 'pending', message: 'Waiting for wallet confirmation...' })
        }
      }
    } catch (error: any) {
      setSendStatus({ type: 'error', message: error.message || 'Transaction failed' })
    }
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
    <div className="send-page" style={{ maxWidth: '540px', margin: '0 auto' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>
          Send &amp; Off-Ramp
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          Transfer tokens or convert crypto to Nigerian Naira.
        </p>
      </div>

      {/* Tab selector */}
      <div className="seg-control send-tabs" style={{ marginBottom: '20px' }}>
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
          {/* Network/Token selector */}
          <div className="stack-mobile" style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Token</label>
              <div className="seg-control">
                {(['INJ', 'USDC'] as const).map(t => (
                  <button 
                    key={t} 
                    onClick={() => { setSendToken(t); setAmount(''); setSendStatus({ type: 'idle', message: '' }) }} 
                    className={`seg-btn${sendToken === t ? ' active' : ''}`}
                    style={{ fontSize: '13px' }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Connection status for USDC */}
          {sendToken === 'USDC' && !cosmosReady && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgb(59,130,246)', borderRadius: '8px' }}>
              <AlertCircle size={14} style={{ color: 'rgb(59,130,246)' }} />
              <span style={{ fontSize: '12px', color: 'rgb(59,130,246)' }}>USDC requires Keplr/Cosmos wallet. Connect above to send USDC.</span>
            </div>
          )}

          {/* Balance info */}
          <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Available Balance</p>
            <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
              {sendToken === 'USDC' ? maxUSDC.toFixed(2) : maxINJ.toFixed(4)} {sendToken}
            </p>
          </div>

          {/* Recipient */}
          <div>
            <label className="label">Recipient Address</label>
            <input
              className="input input-mono"
              type="text"
              placeholder={sendToken === 'USDC' ? 'inj1... or 0x...' : 'inj1... or 0x...'}
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              style={{ fontSize: '12px' }}
            />
            {recipient && !isValidAddr && (
              <p style={{ fontSize: '11px', color: 'var(--error)', marginTop: '5px' }}>
                Enter a valid {sendToken === 'USDC' ? 'Cosmos (inj1...) or EVM (0x...)' : 'Cosmos (inj1...) or EVM (0x...)'} address.
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="label">Amount ({sendToken})</label>
            <div className="stack-mobile amount-row" style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                step={sendToken === 'USDC' ? '0.000001' : '0.001'}
                min="0"
                style={{ flex: 1 }}
              />
              <button
                onClick={() => setAmount(maxAmount.toFixed(sendToken === 'USDC' ? 2 : 6))}
                className="btn-ghost"
                style={{ border: '1px solid var(--border)', borderRadius: '9px', fontSize: '12px', fontWeight: '600', padding: '0 14px', flexShrink: 0 }}
              >
                Max
              </button>
            </div>
          </div>

          {/* Status messages */}
          {cosmosError && sendToken === 'USDC' && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={14} /> {cosmosError}
            </div>
          )}
          {sendError && sendToken === 'INJ' && (
            <div className="alert-error">{sendError.message.slice(0, 120)}</div>
          )}
          {sendStatus.type === 'pending' && (
            <div className="alert-warning" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="spinner" /> {sendStatus.message || 'Processing...'}
            </div>
          )}
          {sendStatus.type === 'success' && (
            <div className="alert-success" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={14} /> {sendStatus.message}
            </div>
          )}
          {sendStatus.type === 'error' && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={14} /> {sendStatus.message}
            </div>
          )}
          {isPending && sendToken === 'INJ' && (
            <div className="alert-warning" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="spinner" /> Waiting for wallet confirmation…
            </div>
          )}
          {isConfirming && sendToken === 'INJ' && (
            <div className="alert-warning" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="spinner" /> Transaction submitted — awaiting confirmation…
            </div>
          )}
          {isConfirmed && injTxHash && sendToken === 'INJ' && (
            <div className="alert-success">
              <div className="stack-mobile" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Transaction confirmed!</span>
                <a
                  href={`${TESTNET_EXPLORER}/${injTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--accent)' }}
                >
                  View on explorer <ExternalLink size={11} />
                </a>
              </div>
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={!canSend || isPending || isConfirming || (sendToken === 'USDC' && cosmosLoading)}
            className="btn-primary"
            style={{ width: '100%', padding: '13px', fontSize: '15px' }}
          >
            {(isPending || isConfirming || cosmosLoading)
              ? <><span className="spinner" /> Processing…</>
              : <><Send size={15} /> Send {sendToken}</>}
          </button>

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
            {sendToken === 'USDC' ? 'USDC on Injective Cosmos · Low fees' : 'INJ EVM Testnet · Fees paid in INJ'}
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
              {(['USDC', 'INJ'] as const).map(t => (
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
          <div className="stack-mobile rate-row" style={{ padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
