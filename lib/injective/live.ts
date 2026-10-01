/**
 * Live signals that something changed for the connected accounts, so the app
 * can re-read balances and the newest history without waiting for a reload.
 *
 * Both are opened from the user's browser to Injective's endpoints. A
 * server-side watcher (Chain Stream) would let NinjaPay's server link
 * wallets to people, which is personal data under Nigeria's NDPA, so that
 * stays a compliance question and is not built.
 *
 * - EVM: an ERC-20 `Transfer` log subscription (eth_subscribe over the EVM
 *   WebSocket endpoint) for transfers to the wallet's 0x address.
 * - Cosmos: the indexer's account portfolio stream for each inj1 account,
 *   run by the SDK's StreamManagerV2, which reconnects with backoff.
 *
 * Neither is trusted for what moved or how much. A signal only makes the app
 * read balances and history again, from the same sources as a reload.
 *
 * Sources (checked 2026-10-01):
 * - EVM WebSocket endpoints: https://docs.injective.network/developers-evm/network-information
 * - Portfolio stream: https://docs.injective.network/developers-native/query-indexer-stream/portfolio
 * - Chain Stream server: https://docs.injective.network/infra/websocket-server
 */

import { createPublicClient, parseAbiItem, webSocket, type Address } from 'viem'
import { IndexerGrpcAccountPortfolioStreamV2, StreamManagerV2 } from '@injectivelabs/sdk-ts'
import { ENDPOINTS, INJECTIVE_EVM } from './network'
import type { ActivityDraft } from './activity'

/** Dispatched on `window` when live signals found new activity; history hooks read their newest page again. */
export const ACTIVITY_EVENT = 'ninjapay:chain-activity'

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

/** Calls `onSignal` when an ERC-20 transfer of more than zero to `wallet` is mined. Returns a function that stops. */
export function watchTokensReceived(wallet: Address, onSignal: () => void): () => void {
  const client = createPublicClient({ chain: INJECTIVE_EVM, transport: webSocket(ENDPOINTS.evmWs) })
  return client.watchEvent({
    event: TRANSFER,
    args: { to: wallet },
    // Zero-value transfers are address-poisoning spam.
    onLogs: logs => {
      if (logs.some(log => (log.args.value ?? BigInt(0)) > BigInt(0))) onSignal()
    },
    // viem reconnects the socket itself; history still loads on page open.
    onError: () => {},
  })
}

/** Calls `onSignal` on every update of an inj1 account's portfolio from the indexer. Returns a function that stops. */
export function watchPortfolio(account: string, onSignal: () => void): () => void {
  const stream = new IndexerGrpcAccountPortfolioStreamV2(ENDPOINTS.indexer)
  const manager: StreamManagerV2<unknown> = new StreamManagerV2<unknown>({
    id: `portfolio:${account}`,
    streamFactory: () => stream.streamAccountPortfolio({ accountAddress: account, callback: update => manager.emit('data', update) }),
    onData: () => onSignal(),
    retryConfig: { enabled: true },
  })
  manager.start()
  return () => manager.destroy()
}

/**
 * Transfers in `drafts` that are not in `seen` and happened at or after
 * `since` (ms), oldest first. Marks them as seen, so each is reported once.
 */
export function takeNew(drafts: ActivityDraft[], seen: Set<string>, since: number): ActivityDraft[] {
  const fresh: ActivityDraft[] = []
  for (const draft of drafts) {
    const key = [draft.hash, draft.direction, draft.counterparty, ...draft.coins.map(c => `${c.denom}:${c.amountBase}`)].join('|')
    if (seen.has(key) || draft.timestamp.getTime() < since) continue
    seen.add(key)
    fresh.push(draft)
  }
  return fresh.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
}
