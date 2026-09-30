'use client'

import { useEffect, useMemo, useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { useEstimateGas, useGasPrice, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { Send, ArrowLeftRight, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react'
import { OfframpUnavailable } from '@/components/OfframpUnavailable'
import { formatBaseUnits, toChainAmount } from '@/lib/money'
import { INJ, TOKENS } from '@/lib/injective/tokens'
import {
  COSMOS_SEND_GAS,
  EVM_TRANSFER_GAS,
  GAS_PRICE,
  checkFee,
  feeShortfallMessage,
  formatFee,
  maxInjAfterFee,
  networkFee,
} from '@/lib/injective/fees'
import { EXPLORERS, INJECTIVE_EVM } from '@/lib/injective/network'
import { isSameAccount, parseAccountAddress, shortAddress } from '@/lib/injective/address'


export default function SendPage() {
  const { address, isConnected } = useWallet()

  // Cosmos transaction hook for USDC sends
  const { 
    userAddress: cosmosAddress, 
    isReady: cosmosReady, 
    sendToken: cosmosSendToken, 
    loading: cosmosLoading, 
    error: cosmosError,
    initializeWallet: connectCosmosWallet,
  } = useCosmosTransaction()

  const [tab, setTab] = useState<'send' | 'offramp'>('send')
  const [sendToken, setSendToken] = useState<'INJ' | 'USDC'>('USDC')
  const [recipient, setRecipient] = useState('')

  // Prefill from /send?to=<address> (used by the Beneficiaries "Send" button).
  useEffect(() => {
    const to = new URLSearchParams(window.location.search).get('to')
    if (to && parseAccountAddress(to)) setRecipient(to)
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

  // The recipient may be typed as inj1… or 0x…: both are the same account.
  const to = useMemo(() => parseAccountAddress(recipient), [recipient])
  const isOwnAddress = isSameAccount(recipient, address)

  // USDC still signs through Keplr/Leap, which may hold a different account than the wallet.
  // Balances and the fee check use whichever account actually sends.
  const keplrIsOtherAccount = cosmosReady && !!cosmosAddress && !!address && !isSameAccount(cosmosAddress, address)
  const sender = sendToken === 'USDC' && cosmosAddress ? cosmosAddress : address
  const { inj, usdc, loading: balLoading, error: balError } = useBalance(sender)
  const injBalance = BigInt(inj || '0')
  const tokenBalance = sendToken === 'USDC' ? BigInt(usdc || '0') : injBalance
  const { decimals } = TOKENS[sendToken]

  // Exact base units of the typed amount; null if it isn't a valid amount for this token.
  const amountBase = useMemo(() => {
    if (!amount.trim()) return null
    try { return BigInt(toChainAmount(amount, decimals)) } catch { return null }
  }, [amount, decimals])

  // Network fee, always in INJ. INJ sends are EVM transfers: estimate their gas
  // (a contract recipient can cost more than 21,000). USDC sends are Cosmos
  // transactions, simulated exactly when signing; this is the estimate until then.
  const { data: evmGas } = useEstimateGas({
    account: address as `0x${string}` | undefined,
    to: to?.evm,
    value: BigInt(0),
    query: { enabled: sendToken === 'INJ' && !!to && !!address },
  })
  const { data: evmGasPrice } = useGasPrice({ query: { enabled: sendToken === 'INJ' } })
  const fee = sendToken === 'INJ'
    ? networkFee(evmGas ?? EVM_TRANSFER_GAS, evmGasPrice ?? GAS_PRICE)
    : networkFee(COSMOS_SEND_GAS)
  const injSpend = sendToken === 'INJ' ? amountBase ?? BigInt(0) : BigInt(0)
  const feeCheck = checkFee(injBalance, fee, injSpend)
  const overBalance = amountBase !== null && amountBase > tokenBalance
  const maxBase = sendToken === 'INJ' ? maxInjAfterFee(injBalance, fee) : tokenBalance

  const amountError = amount.trim() && amountBase === null
    ? `Enter a valid amount with at most ${decimals} decimal places.`
    : overBalance
      ? `That's more than your ${sendToken} balance.`
      : null
  const feeError = !balLoading && !balError && amountBase !== null && amountBase > BigInt(0) && !overBalance && !feeCheck.ok
    ? feeShortfallMessage(feeCheck, sendToken === 'INJ')
    : null

  const canSend = !!to && !isOwnAddress && !balLoading && !balError &&
    (sendToken === 'INJ' || cosmosReady) &&
    amountBase !== null && amountBase > BigInt(0) && !overBalance && feeCheck.ok

  const handleSend = async () => {
    if (!to || !amount) return

    setSendStatus({ type: 'pending', message: '' })

    try {
      if (sendToken === 'USDC') {
        // Cosmos USDC send
        if (!cosmosReady) {
          setSendStatus({ type: 'error', message: 'Connect Keplr or Leap to send USDC.' })
          return
        }

        // sendToken takes the human-readable amount and converts to base units once
        const hash = await cosmosSendToken(to.injective, amount.trim(), 'USDC')
        setTxHash(hash)
        setSendStatus({ type: 'success', message: `USDC sent. Transaction: ${hash.slice(0, 16)}...` })
        setAmount('')
        setRecipient('')
      } else {
        // INJ goes from the connected wallet as a native EVM transfer. An inj1
        // recipient is converted to its 0x form: same account, same balance.
        reset()
        sendTransaction({
          to: to.evm,
          value: amountBase!,
        })
        setSendStatus({ type: 'pending', message: 'Waiting for wallet confirmation...' })
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgb(59,130,246)', borderRadius: '8px' }}>
              <AlertCircle size={14} style={{ color: 'rgb(59,130,246)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: '180px', fontSize: '12px', color: 'rgb(59,130,246)' }}>USDC sends are signed with Keplr or Leap for now.</span>
              <button onClick={connectCosmosWallet} disabled={cosmosLoading} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                {cosmosLoading ? 'Connecting…' : 'Connect Keplr or Leap'}
              </button>
            </div>
          )}

          {sendToken === 'USDC' && keplrIsOtherAccount && (
            <div className="alert-warning" style={{ fontSize: '12px' }}>
              USDC is sent from your Keplr account {shortAddress(cosmosAddress!)}, which is not your connected wallet. The balances below are that account&apos;s.
            </div>
          )}

          {/* Balance info */}
          <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Available Balance</p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {balLoading ? '—' : formatBaseUnits(tokenBalance, decimals, sendToken === 'USDC' ? 2 : 4)} {sendToken}
              </p>
            </div>
            {sendToken === 'USDC' && (
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>INJ for fees</p>
                <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                  {balLoading ? '—' : formatBaseUnits(injBalance, INJ.decimals, 6)} INJ
                </p>
              </div>
            )}
          </div>
          {balError && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={14} /> {balError}
            </div>
          )}

          {/* Recipient */}
          <div>
            <label className="label">Recipient Address</label>
            <input
              className="input input-mono"
              type="text"
              placeholder="inj1… or 0x…"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              style={{ fontSize: '12px' }}
            />
            {recipient.trim() && !to && (
              <p style={{ fontSize: '11px', color: 'var(--error)', marginTop: '5px' }}>
                Enter a valid inj1… or 0x… address.
              </p>
            )}
            {to && isOwnAddress && (
              <p style={{ fontSize: '11px', color: 'var(--error)', marginTop: '5px' }}>
                That&apos;s your own wallet address.
              </p>
            )}
            {to && !isOwnAddress && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                Same account as {recipient.trim().startsWith('0x') ? shortAddress(to.injective, 14) : shortAddress(to.evm, 12)}
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
                onClick={() => setAmount(formatBaseUnits(maxBase, decimals))}
                title={sendToken === 'INJ' ? 'Your INJ balance minus room for the network fee' : undefined}
                className="btn-ghost"
                style={{ border: '1px solid var(--border)', borderRadius: '9px', fontSize: '12px', fontWeight: '600', padding: '0 14px', flexShrink: 0 }}
              >
                Max
              </button>
            </div>
            {amountError ? (
              <p style={{ fontSize: '11px', color: 'var(--error)', marginTop: '5px' }}>{amountError}</p>
            ) : (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
                Network fee ≈ {formatFee(fee)} INJ{sendToken === 'USDC' && ', paid in INJ'}
              </p>
            )}
          </div>

          {feeError && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} /> <span>{feeError}</span>
            </div>
          )}

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
            <div className="alert-pending" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            <div className="alert-pending" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="spinner" /> Waiting for wallet confirmation…
            </div>
          )}
          {isConfirming && sendToken === 'INJ' && (
            <div className="alert-pending" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="spinner" /> Transaction submitted — awaiting confirmation…
            </div>
          )}
          {isConfirmed && injTxHash && sendToken === 'INJ' && (
            <div className="alert-success">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Transaction confirmed!</span>
                <a
                  href={`${EXPLORERS.evm}/tx/${injTxHash}`}
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
            {sendToken === 'USDC' ? 'USDC on Injective · Low fees' : `${INJECTIVE_EVM.name} EVM (chain ${INJECTIVE_EVM.id}) · Fees paid in INJ`}
          </p>
        </div>
      )}

      {/* ─── Off-Ramp tab: not live ─── */}
      {tab === 'offramp' && <OfframpUnavailable />}
    </div>
  )
}
