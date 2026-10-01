'use client'

import { useState, type ReactNode } from 'react'
import { useAccount, useSwitchChain, useWatchAsset } from 'wagmi'
import { CheckCircle2, ExternalLink } from 'lucide-react'
import { CopyButton } from '@/components/CopyButton'
import { FAUCETS, GET_INJ_URL, INJECTIVE_EVM, NETWORK_LABEL, PUBLIC_EVM_RPC } from '@/lib/injective/network'
import { USDC } from '@/lib/injective/tokens'

/*
 * Values from https://docs.injective.network/developers-evm/network-information
 * and https://docs.injective.network/developers-defi/usdc-stablecoin.
 * Links to faucets and wallets are plain links: NinjaPay has no referral deals.
 */

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          aria-hidden="true"
          style={{
            width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700,
            background: done ? 'var(--success-subtle)' : 'var(--accent-subtle)', color: done ? 'var(--success)' : 'var(--accent-text)',
          }}
        >
          {done ? <CheckCircle2 size={14} /> : n}
        </span>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Values({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', gap: '8px 16px', fontSize: '12px', margin: 0 }}>
      {rows.map(([label, value, copy]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>{label}</dt>
          <dd style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-geist-mono), monospace', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{value}</span>
            {copy && <CopyButton value={value} label="Copy" />}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Outlink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--accent-text)' }}>
      {children} <ExternalLink size={11} aria-hidden="true" />
    </a>
  )
}

const Note = ({ children }: { children: ReactNode }) => (
  <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{children}</p>
)

export default function SetupPage() {
  const { isConnected, chainId } = useAccount()
  const onInjective = isConnected && chainId === INJECTIVE_EVM.id
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain()
  const { watchAsset, isPending: adding, error: addError } = useWatchAsset()
  const [usdcAdded, setUsdcAdded] = useState(false)

  const addUsdc = () =>
    watchAsset(
      { type: 'ERC20', options: { address: USDC.evmAddress!, symbol: USDC.symbol, decimals: USDC.decimals, image: USDC.logo } },
      { onSuccess: added => setUsdcAdded(added) },
    )

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ marginBottom: '8px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>
          Set up your wallet
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          What you need to send and receive on {NETWORK_LABEL}.
        </p>
      </div>

      <Step n={1} title={`Add ${INJECTIVE_EVM.name} to your wallet`} done={onInjective}>
        {onInjective ? (
          <Note>Your wallet is on {INJECTIVE_EVM.name}.</Note>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => switchChain({ chainId: INJECTIVE_EVM.id })}
              disabled={!isConnected || switching}
              className="btn-primary"
            >
              {switching ? 'Check your wallet…' : `Add ${INJECTIVE_EVM.name}`}
            </button>
            {!isConnected && <Note>Connect a wallet first with the button at the top of the page.</Note>}
          </div>
        )}
        {switchError && <p style={{ fontSize: '12px', color: 'var(--error)' }}>Your wallet didn&apos;t switch networks. You can add it by hand with the values below.</p>}
        <Note>Or add it by hand in your wallet&apos;s network settings:</Note>
        <Values
          rows={[
            ['Network name', INJECTIVE_EVM.name],
            ['Chain ID', String(INJECTIVE_EVM.id)],
            ['RPC URL', PUBLIC_EVM_RPC, true],
            ['Currency symbol', INJECTIVE_EVM.nativeCurrency.symbol],
            ['Block explorer', INJECTIVE_EVM.blockExplorers.default.url],
          ]}
        />
      </Step>

      <Step n={2} title="Add USDC to your token list" done={usdcAdded}>
        <Note>
          This is Circle&apos;s native USDC on Injective. Your wallet shows its balance once it knows the token. It&apos;s the same balance
          Keplr and Leap show.
        </Note>
        {usdcAdded ? (
          <Note>USDC is in your wallet&apos;s token list.</Note>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={addUsdc} disabled={!onInjective || adding} className="btn-primary">
              {adding ? 'Check your wallet…' : 'Add USDC'}
            </button>
            {!onInjective && <Note>Do step 1 first.</Note>}
          </div>
        )}
        {addError && <p style={{ fontSize: '12px', color: 'var(--error)' }}>Your wallet didn&apos;t add USDC. You can import it by hand with the values below.</p>}
        <Values rows={[['Token contract', USDC.evmAddress!, true], ['Symbol', USDC.symbol], ['Decimals', String(USDC.decimals)]]} />
      </Step>

      <Step n={3} title={FAUCETS ? 'Get test funds' : 'Get INJ for fees'}>
        <Note>Every transfer pays its network fee in INJ, including USDC transfers.</Note>
        {FAUCETS ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Outlink href={FAUCETS.inj}>Injective testnet faucet (INJ)</Outlink>
            <Outlink href={FAUCETS.injAlt}>Google Cloud faucet (INJ)</Outlink>
            <Outlink href={FAUCETS.usdc}>Circle faucet (USDC)</Outlink>
            <Note>Testnet tokens have no value.</Note>
          </div>
        ) : (
          <Outlink href={GET_INJ_URL}>Injective&apos;s guide to getting INJ</Outlink>
        )}
      </Step>

      <Step n={4} title="For payroll and claim links">
        <Note>These are signed with Keplr or Leap for now, so you&apos;ll need one of them too.</Note>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <Outlink href="https://www.keplr.app/">Keplr</Outlink>
          <Outlink href="https://www.leapwallet.io/">Leap</Outlink>
        </div>
      </Step>
    </div>
  )
}
