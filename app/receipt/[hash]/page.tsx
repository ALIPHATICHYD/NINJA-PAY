'use client'

import { use, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AlertCircle, ArrowRight, ExternalLink, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { StatusChip } from '@/components/StatusChip'
import { CopyButton } from '@/components/CopyButton'
import { NETWORK_LABEL, explorerName, explorerTxUrl } from '@/lib/injective/network'
import { fetchReceipt, isTxHash, type Receipt, type ReceiptTransfer } from '@/lib/injective/receipt'
import { labelDenom, NO_TOKENS, tokenMap, type ListedToken, type TokenMap } from '@/lib/injective/token-list'
import { formatCoin } from '@/lib/injective/activity'
import { describeTransferError } from '@/lib/injective/transfer-errors'

type View = { state: 'loading' } | { state: 'missing' } | { state: 'error' } | { state: 'ready'; receipt: Receipt }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-page text-ink">
      <header className="border-b border-line print:hidden">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/brand/ninja-mark.svg" alt="" width={32} height={32} className="rounded-md" />
            <span className="text-[17px] font-bold tracking-tight">NinjaPay</span>
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 sm:p-8">{children}</div>
      </main>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-line py-3 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-[13px] text-ink-3">{label}</dt>
      <dd className="min-w-0 break-all text-[13px] text-ink sm:text-right">{children}</dd>
    </div>
  )
}

const relabel = (transfer: ReceiptTransfer, tokens: TokenMap) => ({ ...transfer.coin, ...labelDenom(transfer.coin.denom, tokens) })

/**
 * A shareable receipt for one transaction. The link carries only the hash;
 * every detail is read from the chain when the page opens.
 */
export default function ReceiptPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = use(params)
  const [view, setView] = useState<View>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [tokens, setTokens] = useState<TokenMap>(NO_TOKENS)

  useEffect(() => {
    let live = true
    fetchReceipt(hash).then(
      receipt => live && setView(receipt ? { state: 'ready', receipt } : { state: 'missing' }),
      () => live && setView({ state: 'error' }),
    )
    fetch('/api/tokens')
      .then(response => response.json() as Promise<{ tokens?: ListedToken[] }>)
      .then(({ tokens: list }) => live && Array.isArray(list) && list.length > 0 && setTokens(tokenMap(list)))
      .catch(() => {})
    return () => { live = false }
  }, [hash, attempt])

  if (view.state === 'loading') {
    return (
      <Shell>
        <p className="text-[15px] text-ink-2">Reading this transaction from {NETWORK_LABEL}…</p>
      </Shell>
    )
  }

  if (view.state !== 'ready') {
    const title = view.state === 'error' ? "Couldn't reach Injective" : isTxHash(hash) ? 'Transaction not found' : 'Not a transaction hash'
    const body =
      view.state === 'error'
        ? 'The receipt is read from the chain each time, and the chain could not be reached just now.'
        : isTxHash(hash)
          ? `${NETWORK_LABEL} has no transaction with this hash. It may be on the other network, or still being sent.`
          : 'A receipt link ends in a transaction hash: 64 hex digits, or 0x and 64 hex digits for an EVM transaction.'
    return (
      <Shell>
        <AlertCircle size={28} strokeWidth={1.75} className="text-coral" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{body}</p>
        {view.state === 'error' && (
          <button onClick={() => { setView({ state: 'loading' }); setAttempt(a => a + 1) }} className="btn-secondary mt-6" style={{ fontSize: '13px', padding: '8px 14px' }}>
            Try again
          </button>
        )}
      </Shell>
    )
  }

  const { receipt } = view
  const [single] = receipt.transfers.length === 1 ? receipt.transfers : []
  const shareUrl = typeof window === 'undefined' ? '' : window.location.href

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] text-ink-3">{receipt.transfers.length ? 'Payment receipt' : 'Transaction receipt'}</p>
          {single && (
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{formatCoin(relabel(single, tokens), 6)}</p>
          )}
        </div>
        <StatusChip state={receipt.status === 'pending' ? 'pending' : receipt.status} />
      </div>

      {receipt.status === 'failed' && receipt.failure && (
        <p className="mt-4 rounded-lg border border-line bg-page p-3 text-[13px] leading-relaxed text-ink-2">
          This transaction failed, so nothing moved. {describeTransferError(receipt.failure).slice(0, 300)}
        </p>
      )}
      {receipt.status === 'pending' && (
        <p className="mt-4 text-[13px] text-ink-2">Waiting for this transaction to be included in a block.</p>
      )}

      <dl className="mt-6">
        {single ? (
          <>
            <Row label="From">{single.from}</Row>
            <Row label="To">{single.to}</Row>
          </>
        ) : (
          receipt.transfers.map((transfer, i) => (
            <Row key={i} label={`Transfer ${i + 1}`}>
              <span className="block">{formatCoin(relabel(transfer, tokens), 6)}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1 text-ink-2 sm:justify-end">
                {transfer.from} <ArrowRight size={12} aria-label="to" /> {transfer.to}
              </span>
            </Row>
          ))
        )}
        {receipt.otherActions > 0 && (
          <Row label="Also in this transaction">
            {receipt.otherActions === 1 ? 'One action that isn’t a transfer' : `${receipt.otherActions} actions that aren’t transfers`}
          </Row>
        )}
        <Row label="Network">{NETWORK_LABEL}</Row>
        {receipt.timestamp && (
          <Row label="Time">
            {format(receipt.timestamp, 'd MMM yyyy, HH:mm:ss')}
            <span className="block text-ink-3">{receipt.timestamp.toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
          </Row>
        )}
        {receipt.block && <Row label="Block">{receipt.block}</Row>}
        {receipt.fee && <Row label="Network fee">{formatCoin(receipt.fee, 8)}</Row>}
        {receipt.memo && <Row label="Memo">{receipt.memo}</Row>}
        <Row label="Transaction">{receipt.hash}</Row>
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-2 print:hidden">
        {shareUrl && <CopyButton value={shareUrl} label="Copy receipt link" />}
        <button onClick={() => window.print()} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
          <Printer size={12} aria-hidden="true" /> Print or save as PDF
        </button>
        <a
          href={explorerTxUrl(receipt.hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[12px] text-ocean-text"
        >
          View on {explorerName(receipt.hash)} <ExternalLink size={11} aria-hidden="true" />
        </a>
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-ink-3">
        Read from {NETWORK_LABEL} when this page opened. NinjaPay keeps no copy of this receipt; the link holds only the
        transaction hash, which is public on Injective.
      </p>
    </Shell>
  )
}
