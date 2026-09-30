'use client'

import { useEffect, useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { Send, ArrowLeftRight, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react'
import { OfframpUnavailable } from '@/components/OfframpUnavailable'

const TESTNET_EXPLORER = 'https://testnet.explorer.injective.network/transaction'

export default function SendPage() {
  const { address, isConnected } = useWallet()
  const { inj, usdc } = useBalance(address)
  
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

  // Prefill from /send?to=<address> (used by the Beneficiaries "Send" button).
  useEffect(() => {
    const to = new URLSearchParams(window.location.search).get('to')
    if (to && /^(inj1[0-9a-z]{38}|0x[0-9a-fA-F]{40})$/.test(to)) setRecipient(to)
  }, [])
  const [amount, setAmount] = useState('')
  const [txHash, setTxHash] = useState('')
  const [sendStatus, setSendStatus] = useState<{ type: 'idle' | 'pending' | 'success' | 'error'; message: string }>({ 
    type: 'idle', 
    message: '' 
  })

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

        if (!/^\d*\.?\d{0,6}$/.test(amount.trim())) {
          setSendStatus({ type: 'error', message: `Invalid USDC amount. Max decimals: 6` })
          return
        }

        // sendToken takes the human-readable amount and converts to base units once
        const hash = await cosmosSendToken(recipient, amount.trim(), 'USDC')
        setTxHash(hash)
        setSendStatus({ type: 'success', message: `USDC sent. Transaction: ${hash.slice(0, 16)}...` })
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

          const hash = await cosmosSendToken(recipient, amount.trim(), 'INJ')
          setTxHash(hash)
          setSendStatus({ type: 'success', message: `INJ sent. Transaction: ${hash.slice(0, 16)}...` })
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

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to send tokens.</div>
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
          Transfer INJ or USDC on Injective. Off-ramp to NGN is not live yet.
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
          Off-Ramp (not live)
        </button>
      </div>

      {/* ─── Send Tokens tab ─── */}
      {tab === 'send' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Network/Token selector */}
          <div style={{ display: 'flex', gap: '12px' }}>
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
            <div style={{ display: 'flex', gap: '8px' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Transaction confirmed!</span>
                <a
                  href={`${TESTNET_EXPLORER}/${injTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--accent-text)' }}
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

      {/* ─── Off-Ramp tab: not live ─── */}
      {tab === 'offramp' && <OfframpUnavailable />}
    </div>
  )
}
