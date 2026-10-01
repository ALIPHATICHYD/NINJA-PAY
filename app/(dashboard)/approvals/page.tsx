'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { RefreshCcw, ShieldAlert } from 'lucide-react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@/hooks/useWallet'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { useEvmSigner } from '@/hooks/useEvmSigner'
import { TxStatus } from '@/components/TxStatus'
import type { ChainState } from '@/components/StatusChip'
import { CHAIN_ID, NETWORK_LABEL } from '@/lib/injective/network'
import { shortAddress, toInjectiveAddress } from '@/lib/injective/address'
import { KEPLR, signAndBroadcast, type CosmosSigner } from '@/lib/injective/cosmos-transactions'
import { fetchApprovals, revokeMessage, type Approval } from '@/lib/injective/grants'
import { resolveClaimEscrows } from '@/lib/supabase'

type Revoking = { key: string; state: ChainState; message: string; hash?: string }

const keyOf = (a: Approval) => `${a.kind}|${a.granter}|${a.grantee}|${a.type}|${a.revokeType ?? ''}`
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'The wallet or the chain rejected the transaction.')

export default function ApprovalsPage() {
  const { address: evmAddress } = useWallet()
  const { userAddress: cosmosAddress, isReady: cosmosReady, loading: cosmosLoading, error: cosmosError, initializeWallet } = useCosmosTransaction()
  const evmSigner = useEvmSigner()
  const queryClient = useQueryClient()
  const [revoking, setRevoking] = useState<Revoking | null>(null)

  // Keplr or Leap signs for its account; the EVM wallet signs for its own
  // account as EIP-712 typed data. Only the account that gave an approval can revoke it.
  const signerFor = (account: string): CosmosSigner | null =>
    account === cosmosAddress ? KEPLR : evmSigner && account === toInjectiveAddress(evmSigner.address) ? evmSigner : null

  const accounts = useMemo(() => {
    const list: { address: string; label: string }[] = []
    const evmAccount = toInjectiveAddress(evmAddress)
    if (evmAccount) list.push({ address: evmAccount, label: "Your EVM wallet's account" })
    if (cosmosAddress && cosmosAddress !== evmAccount) list.push({ address: cosmosAddress, label: 'Your Keplr or Leap account' })
    else if (cosmosAddress) list[0].label = 'Your account'
    return list
  }, [evmAddress, cosmosAddress])

  const results = useQueries({
    queries: accounts.map(account => ({
      queryKey: ['approvals', account.address],
      queryFn: () => fetchApprovals(account.address),
      staleTime: 30_000,
      retry: 1,
    })),
  })

  // Approvals given to a claim link's key read better under the link's name.
  const grantees = [...new Set(results.flatMap(r => r.data?.given.map(a => a.grantee) ?? []))].sort()
  const { data: claimLinks } = useQuery({
    queryKey: ['claim-links', grantees],
    queryFn: () => resolveClaimEscrows(grantees),
    enabled: grantees.length > 0,
    staleTime: 60_000,
  })

  const refresh = () => accounts.forEach(account => void queryClient.invalidateQueries({ queryKey: ['approvals', account.address] }))

  const revoke = async (approval: Approval) => {
    const msg = revokeMessage(approval)
    const signer = signerFor(approval.granter)
    if (!msg || !signer) return
    const key = keyOf(approval)
    setRevoking({ key, state: 'awaiting-signature', message: 'Approve the revoke in your wallet.' })
    try {
      const hash = await signAndBroadcast(msg, CHAIN_ID, '', signer)
      const who = shortAddress(approval.grantee)
      const message = approval.kind === 'feegrant' ? `Revoked: ${who} can no longer pay network fees from your account.` : `Revoked: ${who} can no longer ${approval.action}.`
      setRevoking({ key, state: 'confirmed', message, hash })
      void queryClient.invalidateQueries({ queryKey: ['approvals', approval.granter] })
    } catch (error) {
      setRevoking({ key, state: 'failed', message: errorText(error) })
    }
  }

  if (accounts.length === 0) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect a wallet to see the approvals its account has given.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>Approvals</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '560px', lineHeight: 1.6 }}>
            Permissions your accounts have given other accounts on {NETWORK_LABEL}: to act for you, or to pay network fees from
            your INJ. Read from the chain.
          </p>
        </div>
        <button onClick={refresh} className="btn-secondary" style={{ fontSize: '12px', padding: '7px 12px' }}>
          <RefreshCcw size={12} /> Refresh
        </button>
      </div>

      {!cosmosReady && (
        <div className="alert-pending" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span>Have a Keplr or Leap account too? Connect it to see and revoke the approvals it gave.</span>
          <button onClick={initializeWallet} disabled={cosmosLoading} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
            {cosmosLoading ? 'Connecting…' : 'Connect Keplr or Leap'}
          </button>
        </div>
      )}
      {cosmosError && <div className="alert-error" style={{ marginBottom: '20px' }}>{cosmosError}</div>}
      {revoking?.state === 'confirmed' && (
        <div style={{ marginBottom: '20px' }}>
          <TxStatus state="confirmed" message={revoking.message} hash={revoking.hash} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {accounts.map((account, i) => {
          const result = results[i]
          const canSign = signerFor(account.address) !== null
          return (
            <section key={account.address}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{account.label}</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-geist-mono), monospace', overflowWrap: 'anywhere', marginBottom: '12px' }}>
                {account.address}
              </p>

              {result?.isLoading ? (
                <div className="skeleton" style={{ height: '84px', borderRadius: '10px' }} />
              ) : result?.error ? (
                <div className="alert-error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <span>Couldn&rsquo;t read this account&rsquo;s approvals from Injective.</span>
                  <button onClick={() => void result.refetch()} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>Try again</button>
                </div>
              ) : (
                <>
                  {result?.data?.given.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {result.data.given.map(approval => (
                        <ApprovalCard
                          key={keyOf(approval)}
                          approval={approval}
                          side="given"
                          canSign={canSign}
                          claimLink={claimLinks?.get(approval.grantee)?.poolName ?? null}
                          revoking={revoking?.key === keyOf(approval) ? revoking : null}
                          busy={revoking?.state === 'awaiting-signature'}
                          onRevoke={() => void revoke(approval)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>This account hasn&rsquo;t given any approvals.</p>
                  )}
                  {!!result?.data?.received.length && (
                    <>
                      <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', margin: '18px 0 10px' }}>Given to this account</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {result.data.received.map(approval => (
                          <ApprovalCard key={keyOf(approval)} approval={approval} side="received" claimLink={null} canSign={false} revoking={null} busy={false} onRevoke={() => {}} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )
        })}
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '28px', lineHeight: 1.6 }}>
        Only the account that gave an approval can revoke it. Approvals made by EVM contracts, such as an ERC-20 spending
        allowance, aren&rsquo;t listed here.
      </p>
    </div>
  )
}

type CardProps = {
  approval: Approval
  side: 'given' | 'received'
  /** The name of the claim link whose key holds this approval, if it is one. */
  claimLink: string | null
  canSign: boolean
  revoking: Revoking | null
  busy: boolean
  onRevoke: () => void
}

function ApprovalCard({ approval, side, claimLink, canSign, revoking, busy, onRevoke }: CardProps) {
  const now = new Date()
  const expired = approval.expiration !== null && approval.expiration < now
  const other = side === 'given' ? approval.grantee : approval.granter
  const sentence =
    side === 'given'
      ? `${claimLink ? `Your claim link \u201c${claimLink}\u201d` : shortAddress(other)} can ${approval.action} from this account.`
      : `This account can ${approval.action} from ${shortAddress(other)}.`
  const revocable = approval.kind === 'feegrant' || approval.revokeType !== null
  const done = revoking?.state === 'confirmed'

  return (
    <div className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: done ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <span className="badge badge-neutral">{approval.kind === 'authz' ? 'Acts for the account' : 'Pays network fees'}</span>
        {approval.unlimited && (
          <span className="badge badge-warning">
            <ShieldAlert size={11} aria-hidden="true" /> No limit
          </span>
        )}
        {expired ? (
          <span className="badge badge-neutral">Expired {format(approval.expiration!, 'd MMM yyyy')}</span>
        ) : approval.expiration ? (
          <span className="badge badge-neutral">Until {format(approval.expiration, 'd MMM yyyy')}</span>
        ) : (
          <span className="badge badge-warning">No expiry</span>
        )}
      </div>
      <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5 }} title={other}>
        {sentence}
      </p>
      {approval.limits.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
          {approval.limits.map(limit => <li key={limit}>{limit}</li>)}
        </ul>
      )}
      {side === 'given' && !done && (
        expired ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>This has expired and no longer works.</p>
        ) : revocable && canSign ? (
          <div>
            <button onClick={onRevoke} disabled={busy} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
              {revoking?.state === 'awaiting-signature' ? 'Waiting for your wallet…' : 'Revoke'}
            </button>
          </div>
        ) : (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {revocable
              ? 'To revoke this, connect the wallet that holds this account.'
              : 'NinjaPay can’t revoke this kind of permission yet. Revoke it from the app that set it up.'}
          </p>
        )
      )}
      {revoking && revoking.state !== 'confirmed' && <TxStatus state={revoking.state} message={revoking.message} hash={revoking.hash} />}
    </div>
  )
}
