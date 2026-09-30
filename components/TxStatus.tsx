import { ExternalLink } from 'lucide-react'
import { StatusChip, type ChainState } from '@/components/StatusChip'
import { explorerName, explorerTxUrl } from '@/lib/injective/network'

/**
 * One line for a transfer in flight or done: its chain state, a sentence, and
 * a link to the explorer that shows that kind of hash.
 */
export function TxStatus({ state, message, hash }: { state: ChainState; message: string; hash?: string }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px', flexWrap: 'wrap',
        padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
        <StatusChip state={state} />
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{message}</span>
      </div>
      {hash && (
        <a
          href={explorerTxUrl(hash)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--accent-text)' }}
        >
          View on {explorerName(hash)} <ExternalLink size={11} aria-hidden="true" />
        </a>
      )}
    </div>
  )
}
