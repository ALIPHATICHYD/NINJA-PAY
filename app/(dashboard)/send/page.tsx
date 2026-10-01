'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import {
  useEstimateGas,
  useGasPrice,
  useSendTransaction,
  useTransactionReceipt,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { encodeFunctionData, erc20Abi } from 'viem'
import { Send, ArrowLeftRight, AlertCircle } from 'lucide-react'
import { OfframpUnavailable } from '@/components/OfframpUnavailable'
import { SwapQuote } from '@/components/SwapQuote'
import { TxStatus } from '@/components/TxStatus'
import { ChainHealthNotice } from '@/components/ChainHealthNotice'
import { useChainHealth } from '@/hooks/useChainHealth'
import { useTransferChecks } from '@/hooks/useTransferChecks'
import { useRecipient } from '@/hooks/useRecipients'
import type { ChainState } from '@/components/StatusChip'
import { formatBaseUnits, toChainAmount } from '@/lib/money'
import { INJ, TOKENS, USDC } from '@/lib/injective/tokens'
import {
  EVM_TOKEN_TRANSFER_GAS,
  EVM_TRANSFER_GAS,
  GAS_PRICE,
  checkFee,
  feeShortfallMessage,
  formatFee,
  maxInjAfterFee,
  networkFee,
  withGasHeadroom,
} from '@/lib/injective/fees'
import { HOOK_RESTRICTION_MESSAGE, errorMessage, isHookOutOfGas, isHookRestriction } from '@/lib/injective/transfer-errors'
import { FAUCETS, INJECTIVE_EVM } from '@/lib/injective/network'
import { isSameAccount, shortAddress, toInjectiveAddress } from '@/lib/injective/address'
import { parsePaymentRequest } from '@/lib/payment-request'

/** A wallet or chain error in plain words, with USDC's compliance-hook cases spelled out. */
function sendErrorText(error: Error): string {
  const full = errorMessage(error)
  if (isHookRestriction(full)) return HOOK_RESTRICTION_MESSAGE
  if (isHookOutOfGas(full)) return "USDC's compliance check ran out of gas. This isn't a restriction on your account. Try again in a moment."
  return ((error as { shortMessage?: string }).shortMessage ?? error.message).slice(0, 160)
}

export default function SendPage() {
  const { address, isConnected } = useWallet()

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

  // Both tokens go from the connected wallet over Injective's EVM: INJ as a
  // native transfer, USDC as an ERC-20 transfer on Circle's contract. USDC is
  // a MultiVM token, so the bank balance Keplr or Leap shows moves with it.
  const injTx = useSendTransaction()
  const usdcTx = useWriteContract()
  const tx = sendToken === 'INJ' ? injTx : usdcTx
  const txHash = tx.data
  // wagmi's wait throws when the transaction reverted, so on an error read the
  // receipt directly to tell "failed on chain" from "couldn't check yet".
  const { data: receipt, isLoading: isConfirming, isError: waitFailed } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { retry: false },
  })
  const { data: settledReceipt } = useTransactionReceipt({ hash: txHash, query: { enabled: !!txHash && waitFailed } })

  // The recipient may be typed as inj1… or 0x… (the same account) or as a .inj name.
  const target = useRecipient(recipient)
  const to = target.account
  const isOwnAddress = isSameAccount(to?.injective, address)

  const { inj, usdc, loading: balLoading, error: balError } = useBalance(address)
  const injBalance = BigInt(inj || '0')
  const tokenBalance = sendToken === 'USDC' ? BigInt(usdc || '0') : injBalance
  const { decimals } = TOKENS[sendToken]

  // Exact base units of the typed amount; null if it isn't a valid amount for this token.
  const amountBase = useMemo(() => {
    if (!amount.trim()) return null
    try { return BigInt(toChainAmount(amount, decimals)) } catch { return null }
  }, [amount, decimals])
  const overBalance = amountBase !== null && amountBase > tokenBalance

  // The USDC transfer call, once there's a recipient and an amount the account holds.
  const usdcTransfer = useMemo(
    () => to && amountBase !== null && amountBase > BigInt(0) && !overBalance
      ? encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to.evm, amountBase] })
      : undefined,
    [to, amountBase, overBalance],
  )

  // Network fee, always in INJ, from the wallet's gas estimate. A contract
  // recipient can make an INJ transfer cost more than 21,000 gas, and every
  // USDC transfer also runs Circle's compliance hook.
  const { data: gasEstimate, error: estimateError } = useEstimateGas({
    account: address as `0x${string}` | undefined,
    chainId: INJECTIVE_EVM.id,
    ...(sendToken === 'INJ' ? { to: to?.evm, value: BigInt(0) } : { to: USDC.evmAddress, data: usdcTransfer }),
    query: { enabled: !!address && (sendToken === 'INJ' ? !!to : !!usdcTransfer), retry: false },
  })
  const { data: gasPrice } = useGasPrice({ chainId: INJECTIVE_EVM.id })
  const gas = gasEstimate ?? (sendToken === 'INJ' ? EVM_TRANSFER_GAS : EVM_TOKEN_TRANSFER_GAS)
  const gasLimit = sendToken === 'USDC' ? withGasHeadroom(gas) : undefined
  const fee = networkFee(gasLimit ?? gas, gasPrice ?? GAS_PRICE)
  const injSpend = sendToken === 'INJ' ? amountBase ?? BigInt(0) : BigInt(0)
  const feeCheck = checkFee(injBalance, fee, injSpend)
  const maxBase = sendToken === 'INJ' ? maxInjAfterFee(injBalance, fee) : tokenBalance

  // Estimating a USDC transfer runs the compliance hook, so a restriction shows up before signing.
  const hookBlock = sendToken === 'USDC' && estimateError && isHookRestriction(errorMessage(estimateError))
    ? HOOK_RESTRICTION_MESSAGE
    : null

  const amountError = amount.trim() && amountBase === null
    ? `Enter a valid amount with at most ${decimals} decimal places.`
    : overBalance
      ? `That's more than your ${sendToken} balance.`
      : null
  const feeError = !balLoading && !balError && amountBase !== null && amountBase > BigInt(0) && !overBalance && !feeCheck.ok
    ? feeShortfallMessage(feeCheck, sendToken === 'INJ')
    : null

  // Both tokens go over the EVM: check it is live and on the right chain.
  const chainHealth = useChainHealth('evm')

  // Circuit breaker, the token's permission rules, and whether the recipient has ever been used.
  const transferChecks = useTransferChecks(sendToken, toInjectiveAddress(address), to && !isOwnAddress ? to.injective : null)

  const canSend = !!to && !isOwnAddress && !balLoading && !balError && chainHealth.canSend &&
    transferChecks.blocks.length === 0 && !hookBlock &&
    amountBase !== null && amountBase > BigInt(0) && !overBalance && feeCheck.ok

  // One status line per transfer: waiting for the wallet, waiting for a block, confirmed or failed.
  const txStatus = ((): { state: ChainState; message: string; hash?: string } | null => {
    if (tx.isPending) return { state: 'awaiting-signature', message: 'Confirm the transfer in your wallet.' }
    if (!txHash) return null
    if (isConfirming) return { state: 'pending', message: 'Sent. Waiting for it to be included in a block.', hash: txHash }
    const final = receipt ?? settledReceipt
    if (final?.status === 'success') return { state: 'confirmed', message: `${sendToken} sent and confirmed on chain.`, hash: txHash }
    if (final?.status === 'reverted') return { state: 'failed', message: `The transfer failed on chain, so no ${sendToken} was sent. The network fee was still charged.`, hash: txHash }
    if (waitFailed) return { state: 'pending', message: "Couldn't confirm it yet. Check the explorer for its status.", hash: txHash }
    return null
  })()

  // An inj1 recipient is sent to its 0x form: same account, same balance.
  // chainId makes wagmi refuse if the wallet is on another chain.
  const handleSend = () => {
    if (!to || amountBase === null) return
    if (sendToken === 'INJ') {
      injTx.reset()
      injTx.sendTransaction({ chainId: INJECTIVE_EVM.id, to: to.evm, value: amountBase })
    } else {
      usdcTx.reset()
      usdcTx.writeContract({
        chainId: INJECTIVE_EVM.id,
        address: USDC.evmAddress!,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to.evm, amountBase],
        gas: gasLimit,
      })
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
                    onClick={() => { setSendToken(t); setAmount('') }} 
                    className={`seg-btn${sendToken === t ? ' active' : ''}`}
                    style={{ fontSize: '13px' }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

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
            <label className="label">Recipient</label>
            <input
              className="input input-mono"
              type="text"
              placeholder="inj1…, 0x… or name.inj"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              style={{ fontSize: '12px' }}
            />
            {target.resolving && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>Looking up {target.name}…</p>
            )}
            {target.error && (
              <p style={{ fontSize: '11px', color: 'var(--error)', marginTop: '5px' }}>{target.error}</p>
            )}
            {to && isOwnAddress && (
              <p style={{ fontSize: '11px', color: 'var(--error)', marginTop: '5px' }}>
                That&apos;s your own wallet address.
              </p>
            )}
            {to && !isOwnAddress && (target.kind === 'name' ? (
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '5px', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                {target.name} points to {to.injective}
              </p>
            ) : (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                {target.name && <>Named {target.name} · </>}
                Same account as {recipient.trim().startsWith('0x') ? shortAddress(to.injective, 14) : shortAddress(to.evm, 12)}
              </p>
            ))}
            {transferChecks.warnings.map(w => (
              <p key={w.message} role="alert" style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '5px' }}>{w.message}</p>
            ))}
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

          {[...transferChecks.blocks.map(b => b.message), ...(hookBlock ? [hookBlock] : [])].map(message => (
            <div key={message} role="alert" className="alert-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} /> <span>{message}</span>
            </div>
          ))}

          <ChainHealthNotice state={chainHealth} />

          {tx.error && (
            <div className="alert-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} /> <span>{sendErrorText(tx.error)}</span>
            </div>
          )}
          {txStatus && <TxStatus {...txStatus} />}

          <button
            onClick={handleSend}
            disabled={!canSend || tx.isPending || isConfirming}
            className="btn-primary"
            style={{ width: '100%', padding: '13px', fontSize: '15px' }}
          >
            {(tx.isPending || isConfirming)
              ? <><span className="spinner" /> Processing…</>
              : <><Send size={15} /> Send {sendToken}</>}
          </button>

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
            {INJECTIVE_EVM.name} (chain {INJECTIVE_EVM.id}) · Fees paid in INJ
          </p>
        </div>
      )}

      {/* ─── Off-Ramp tab: not live ─── */}
      {tab === 'offramp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <OfframpUnavailable />
          <SwapQuote />
        </div>
      )}
    </div>
  )
}
