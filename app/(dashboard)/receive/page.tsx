'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { CopyButton } from '@/components/CopyButton'
import { QrCode } from '@/components/QrCode'
import { toInjectiveAddress } from '@/lib/injective/address'
import { IS_MAINNET, NETWORK_LABEL } from '@/lib/injective/network'
import { TOKENS, type TokenSymbol } from '@/lib/injective/tokens'
import { paymentRequestUrl, requestAmountBase } from '@/lib/payment-request'

type OpenRequest = { token: TokenSymbol; amount: string; amountBase: bigint; baseline: bigint; url: string }

export default function ReceivePage() {
  const { address, isConnected } = useWallet()
  const { inj, usdc, loading: balLoading, refetch } = useBalance(address)
  const injectiveAddress = toInjectiveAddress(address)

  const [token, setToken] = useState<TokenSymbol>('USDC')
  const [amount, setAmount] = useState('')
  const [request, setRequest] = useState<OpenRequest | null>(null)

  const balanceOf = (t: TokenSymbol) => BigInt((t === 'USDC' ? usdc : inj) || '0')
  const amountBase = amount.trim() ? requestAmountBase(amount, token) : null

  if (!isConnected || !address || !injectiveAddress) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to see your receiving address.</div>
      </div>
    )
  }

  const createRequest = () => {
    if (amountBase === null) return
    setRequest({
      token,
      amount: amount.trim(),
      amountBase,
      baseline: balanceOf(token),
      url: paymentRequestUrl(window.location.origin, { to: injectiveAddress, token, amount: amount.trim() }),
    })
  }

  // Confirmed from the chain: the account's balance of that token has gone up
  // by at least the amount asked for since the request was made.
  const received = request ? balanceOf(request.token) - request.baseline >= request.amountBase : false

  const addresses = [
    { title: 'Injective address', hint: 'For Keplr, Leap and other Cosmos wallets', value: injectiveAddress },
    { title: 'EVM address', hint: 'For MetaMask and other EVM wallets', value: address },
  ]

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>
          Receive
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          Show someone where to send you INJ or USDC, or ask them for a set amount.
        </p>
      </div>

      <div className="alert-warning" style={{ fontSize: '12px', lineHeight: 1.5 }}>
        Ask the sender to use {NETWORK_LABEL}. Tokens sent on another network, such as Ethereum or BNB Chain, don&apos;t arrive
        on Injective and won&apos;t show up here.{!IS_MAINNET && ' Testnet tokens have no value.'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        {addresses.map(a => (
          <div key={a.title} className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div style={{ alignSelf: 'stretch' }}>
              <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{a.title}</p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{a.hint}</p>
            </div>
            <QrCode value={a.value} label={`QR code for ${a.title.toLowerCase()} ${a.value}`} />
            <p style={{ alignSelf: 'stretch', fontSize: '12px', fontFamily: 'var(--font-geist-mono), monospace', color: 'var(--text-secondary)', overflowWrap: 'anywhere', textAlign: 'center' }}>
              {a.value}
            </p>
            <CopyButton value={a.value} label="Copy address" />
          </div>
        ))}
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-8px' }}>
        These are the same account written two ways. Either one receives INJ and USDC.
      </p>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Ask for a set amount</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Make a link that opens NinjaPay&apos;s Send page with your address and the amount filled in. Share it only with the person paying you.
          </p>
        </div>

        {!request ? (
          <>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label className="label">Token</label>
                <div className="seg-control">
                  {(['USDC', 'INJ'] as const).map(t => (
                    <button key={t} onClick={() => { setToken(t); setAmount('') }} className={`seg-btn${token === t ? ' active' : ''}`} style={{ fontSize: '13px' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: '160px' }}>
                <label className="label">Amount ({token})</label>
                <input className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
            </div>
            {amount.trim() && amountBase === null && (
              <p style={{ fontSize: '11px', color: 'var(--error)', marginTop: '-8px' }}>
                Enter an amount above zero with at most {TOKENS[token].decimals} decimal places.
              </p>
            )}
            <button onClick={createRequest} disabled={amountBase === null || balLoading} className="btn-primary" style={{ alignSelf: 'flex-start' }}>
              Create request link
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <QrCode value={request.url} label={`QR code for a request of ${request.amount} ${request.token}`} size={160} />
            <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {request.amount} {request.token} to {NETWORK_LABEL}
              </p>
              <p style={{ fontSize: '11px', fontFamily: 'var(--font-geist-mono), monospace', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                {request.url}
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <CopyButton value={request.url} label="Copy link" />
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={() => navigator.share({ title: 'NinjaPay request', text: `Send me ${request.amount} ${request.token} on ${NETWORK_LABEL}`, url: request.url }).catch(() => {})}
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    <Share2 size={12} /> Share
                  </button>
                )}
              </div>
              <div role="status" className={received ? 'alert-success' : undefined} style={received ? { fontSize: '12px' } : { fontSize: '12px', color: 'var(--text-secondary)' }}>
                {received
                  ? `Received. Your ${request.token} balance on Injective has gone up by at least ${request.amount} since you made this request.`
                  : `Waiting for ${request.amount} ${request.token}. NinjaPay checks your balance on Injective every 30 seconds, so any incoming ${request.token} counts toward it.`}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {!received && (
                  <button onClick={refetch} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>Check now</button>
                )}
                <button onClick={() => { setRequest(null); setAmount('') }} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                  New request
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
