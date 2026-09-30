'use client'

import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useSwapQuote, SLIPPAGE_BPS } from '@/hooks/useSwapQuote'
import { ORACLE_TOLERANCE } from '@/lib/injective/swap'
import { formatFee } from '@/lib/injective/fees'
import { NETWORK_LABEL } from '@/lib/injective/network'
import { INJ, USDC } from '@/lib/injective/tokens'
import { formatBaseUnits, toChainAmount } from '@/lib/money'

const UNAVAILABLE = {
  'no-market': `Injective has no active INJ/USDC spot market for native USDC on ${NETWORK_LABEL}, so there's nothing to quote.`,
  'swaps-off': `Swaps through Injective's swap module aren't switched on for ${NETWORK_LABEL} yet.`,
  'not-allowlisted': "Injective's INJ/USDC market isn't on its swap allowlist yet. Only Injective can add it, so there's no quote to show.",
  'no-token': "Injective lists no ERC20 address for INJ, so its swap module can't quote INJ.",
} as const

const pct = (fraction: number) => `${(fraction * 100).toFixed(fraction < 0.01 ? 2 : 1)}%`

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12px' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

/**
 * What Injective's orderbook would give for INJ in USDC right now, through
 * the Swap precompile. A quote only: no swap button, and never a naira amount.
 */
export function SwapQuote() {
  const [amount, setAmount] = useState('')
  const amountIn = useMemo(() => {
    if (!amount.trim()) return null
    try { return BigInt(toChainAmount(amount, INJ.decimals)) } catch { return null }
  }, [amount])
  const q = useSwapQuote(amountIn && amountIn > BigInt(0) ? amountIn : null)

  return (
    <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          INJ <ArrowRight size={13} aria-hidden="true" /> USDC quote
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '4px' }}>
          An off-ramp would first turn INJ into USDC on Injective. This shows what Injective&apos;s orderbook would give for that
          step right now. It&apos;s a quote only: NinjaPay doesn&apos;t swap tokens, and this isn&apos;t a naira amount.
        </p>
      </div>

      {q.checking ? (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Checking Injective&apos;s swap markets…</p>
      ) : q.unreachable ? (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Couldn&apos;t reach Injective to check for a quote. Try again later.</p>
      ) : q.unavailable ? (
        <p role="status" style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{UNAVAILABLE[q.unavailable]}</p>
      ) : (
        <>
          <div>
            <label className="label" htmlFor="swap-quote-amount">Amount (INJ)</label>
            <input id="swap-quote-amount" className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            {amount.trim() && amountIn === null && (
              <p style={{ fontSize: '11px', color: 'var(--error)', marginTop: '5px' }}>Enter an amount with at most {INJ.decimals} decimal places.</p>
            )}
            {amountIn !== null && q.quantity !== null && q.quantity !== amountIn && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
                {q.quantity > BigInt(0)
                  ? `Quoted for ${formatBaseUnits(q.quantity, INJ.decimals)} INJ, rounded down to the market's quantity step.`
                  : "That's below the market's smallest quantity step."}
              </p>
            )}
          </div>

          {q.quoting && <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Asking Injective for a quote…</p>}
          {q.quoteFailed && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Injective didn&apos;t return a quote for this amount. The orderbook may not have enough USDC bids for it.
            </p>
          )}
          {q.amountOut !== null && q.minOut !== null && (
            <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Orderbook quote</span>
                <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatBaseUnits(q.amountOut, USDC.decimals, 2)} USDC
                </span>
              </div>
              <Row label={`At least, with ${SLIPPAGE_BPS / 100}% slippage`} value={`${formatBaseUnits(q.minOut, USDC.decimals, 2)} USDC`} />
              {Number.isFinite(q.route?.takerFeeRate) && <Row label="Market taker fee rate" value={pct(q.route!.takerFeeRate)} />}
              {q.networkFee !== null && <Row label="Network fee for the swap" value={`≈ ${formatFee(q.networkFee)} INJ`} />}
              {q.oracleGap !== null && (
                <p style={{ fontSize: '11px', lineHeight: 1.5, color: q.oracleGap > ORACLE_TOLERANCE ? 'var(--warning)' : 'var(--text-muted)' }}>
                  {q.oracleGap > ORACLE_TOLERANCE
                    ? `This quote is ${pct(q.oracleGap)} away from Injective's Pyth price for INJ. The orderbook may be thin for this amount.`
                    : `Within ${pct(q.oracleGap)} of Injective's Pyth price for INJ.`}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
