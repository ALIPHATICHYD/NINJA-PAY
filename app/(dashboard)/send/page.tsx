'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { useEstimateGas, useGasPrice, useSendTransaction, useTransactionReceipt, useWaitForTransactionReceipt } from 'wagmi'
import { Send, ArrowLeftRight, AlertCircle } from 'lucide-react'
import { OfframpUnavailable } from '@/components/OfframpUnavailable'
import { TxStatus } from '@/components/TxStatus'
import { ChainHealthNotice } from '@/components/ChainHealthNotice'
import { useChainHealth } from '@/hooks/useChainHealth'
import type { ChainState } from '@/components/StatusChip'
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
import { FAUCETS, INJECTIVE_EVM } from '@/lib/injective/network'
import { isSameAccount, parseAccountAddress, shortAddress } from '@/lib/injective/address'
import { parsePaymentRequest } from '@/lib/payment-request'


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

  const [amount, setAmount] = useState('')
  // A payment-request link (/send?to=…&token=…&amount=…) from someone's Receive page.
  const [requested, setRequested] = useState<{ amount: string; token: 'INJ' | 'USDC' } | null>(null)

  // Prefill from the link: /send?to=<address> (the Beneficiaries "Send" button) or a payment request.
  useEffect(() => {
    const request = parsePaymentRequest(window.location.search)
    if (request.to) setRecipient(request.to)
    if (request.token) setSendToken(request.token)
    if (request.to && request.token && request.amount) {
      setAmount(request.amount)
      setRequested({ amount: request.amount, token: request.token })
    }
  }, [])
  const [txHash, setTxHash] = useState('')
  const [sendStatus, setSendStatus] = useState<{ type: 'idle' | 'pending' | 'success' | 'error'; message: string }>({ 
    type: 'idle', 
    message: '' 
  })

  // wagmi send transaction hooks (for INJ)
  const { sendTransaction, data: injTxHash, isPending, error: sendError, reset } = useSendTransaction()
  // wagmi's wait throws when the transaction reverted, so on an error read the
  // receipt directly to tell "failed on chain" from "couldn't check yet".
  const { data: receipt, isLoading: isConfirming, isError: waitFailed } = useWaitForTransactionReceipt({
    hash: injTxHash,
    query: { retry: false },
  })
  const { data: settledReceipt } = useTransactionReceipt({ hash: injTxHash, query: { enabled: !!injTxHash && waitFailed } })

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

  // INJ goes over the EVM, USDC over the Cosmos side: check the one in use is live and on the right chain.
  const chainHealth = useChainHealth(sendToken === 'INJ' ? 'evm' : 'cosmos')

  const canSend = !!to && !isOwnAddress && !balLoading && !balError && chainHealth.canSend &&
    (sendToken === 'INJ' || cosmosReady) &&
    amountBase !== null && amountBase > BigInt(0) && !overBalance && feeCheck.ok

  // One status line per transfer: waiting for the wallet, waiting for a block, confirmed or failed.
  const txStatus = ((): { state: ChainState; message: string; hash?: string } | null => {
    if (sendToken === 'USDC') {
      if (sendStatus.type === 'pending') return { state: 'pending', message: 'Sign in Keplr or Leap, then wait for the block.' }
      if (sendStatus.type === 'success' && txHash) return { state: 'confirmed', message: sendStatus.message, hash: txHash }
      return null
    }
    if (isPending) return { state: 'awaiting-signature', message: 'Confirm the transfer in your wallet.' }
    if (!injTxHash) return null
    if (isConfirming) return { state: 'pending', message: 'Sent. Waiting for it to be included in a block.', hash: injTxHash }
    const final = receipt ?? settledReceipt
    if (final?.status === 'success') return { state: 'confirmed', message: 'INJ sent and confirmed on chain.', hash: injTxHash }
    if (final?.status === 'reverted') return { state: 'failed', message: 'The transfer failed on chain, so no INJ was sent. The network fee was still charged.', hash: injTxHash }
    if (waitFailed) return { state: 'pending', message: "Couldn't confirm it yet. Check the explorer for its status.", hash: injTxHash }
    return null
  })()

  const handleSend = async () => {
    if (!to || !amount) return

    setSendStatus({ type: 'idle', message: '' })

    try {
      if (sendToken === 'USDC') {
        // Cosmos USDC send
        if (!cosmosReady) {
          setSendStatus({ type: 'error', message: 'Connect Keplr or Leap to send USDC.' })
          return
        }

        // sendToken takes the human-readable amount and converts to base units once.
        // It resolves once the transaction is included in a block.
        setSendStatus({ type: 'pending', message: '' })
        const hash = await cosmosSendToken(to.injective, amount.trim(), 'USDC')
        setTxHash(hash)
        setSendStatus({ type: 'success', message: `${amount.trim()} USDC sent and confirmed on chain.` })
        setAmount('')
        setRecipient('')
      } else {
        // INJ goes from the connected wallet as a native EVM transfer. An inj1
        // recipient is converted to its 0x form: same account, same balance.
        reset()
        sendTransaction({
          chainId: INJECTIVE_EVM.id, // wagmi refuses if the wallet is on another chain
          to: to.evm,
          value: amountBase!,
        })
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
          {requested && (
            <div className="alert-warning" style={{ fontSize: '12px', lineHeight: 1.5 }}>
              This link asks you to send {requested.amount} {requested.token}. NinjaPay doesn&apos;t know who made it, so check the
              address with the person before you send.
            </div>
          )}

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
          {!balLoading && !balError && injBalance === BigInt(0) && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-10px' }}>
              No INJ for fees yet. <Link href="/setup" style={{ color: 'var(--accent-text)' }}>Set up your wallet</Link> to add the network and get {FAUCETS ? 'test funds' : 'INJ'}.
            </p>
          )}
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

          <ChainHealthNotice state={chainHealth} />

          {/* Status messages */}
          {sendToken === 'USDC' && cosmosError && sendStatus.type !== 'error' && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={14} /> {cosmosError}
            </div>
          )}
          {sendToken === 'INJ' && sendError && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={14} /> {((sendError as { shortMessage?: string }).shortMessage ?? sendError.message).slice(0, 160)}
            </div>
          )}
          {sendStatus.type === 'error' && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={14} /> {sendStatus.message}
            </div>
          )}
          {txStatus && <TxStatus {...txStatus} />}

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
