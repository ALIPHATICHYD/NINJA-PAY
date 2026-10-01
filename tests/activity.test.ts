import { afterEach, describe, expect, it, vi } from 'vitest'
import { USDC } from '@/lib/injective/tokens'

const explorer = vi.hoisted(() => ({ calls: [] as unknown[], transactions: [] as unknown[] }))

vi.mock('@injectivelabs/sdk-ts', async importOriginal => ({
  ...(await importOriginal<typeof import('@injectivelabs/sdk-ts')>()),
  IndexerRestExplorerApi: class {
    constructor(public endpoint: string) {}
    async fetchAccountTransactions(args: unknown) {
      explorer.calls.push({ endpoint: this.endpoint, ...(args as object) })
      return { paging: {}, transactions: explorer.transactions }
    }
  },
}))

const {
  ACTIVITY_PAGE_SIZE,
  classifyActivity,
  fetchCosmosPage,
  mergeSources,
  parseExplorerTx,
  parseTimestamp,
} = await import('@/lib/injective/activity')
const { fetchEvmTokenPage, parseEvmTx, parseTokenTransfer } = await import('@/lib/injective/evm-activity')

const ME = 'inj1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3t5qxqh' // 0x1111…1111
const ME_EVM = '0x1111111111111111111111111111111111111111'
const OTHER = 'inj1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyf9qgq'
const OTHER_EVM = '0x2222222222222222222222222222222222222222' // the 0x form of OTHER
const mine = new Set([ME])

const send = (hash: string, time: string, from: string, to: string, denom: string, amount: string, code = 0) => ({
  hash,
  blockTimestamp: time,
  code,
  memo: '',
  messages: [{ type: '/cosmos.bank.v1beta1.MsgSend', message: { from_address: from, to_address: to, amount: [{ denom, amount }] } }],
})

afterEach(() => vi.unstubAllGlobals())

describe('parseTimestamp', () => {
  it('reads ISO 8601 and Go’s default time format', () => {
    expect(parseTimestamp('2026-10-01T09:55:34.613Z')?.toISOString()).toBe('2026-10-01T09:55:34.613Z')
    expect(parseTimestamp('2026-10-01 09:55:34.613456 +0000 UTC')?.toISOString()).toBe('2026-10-01T09:55:34.613Z')
    expect(parseTimestamp('2026-10-01 10:55:34 +0100 WAT')?.toISOString()).toBe('2026-10-01T09:55:34.000Z')
    expect(parseTimestamp('yesterday')).toBeNull()
    expect(parseTimestamp(null)).toBeNull()
  })
})

describe('indexer transactions', () => {
  it('reads sends, receipts and payroll, and ignores other messages', () => {
    expect(parseExplorerTx(send('A', '2026-10-01T10:00:00Z', ME, OTHER, 'inj', '5'), mine)).toMatchObject([
      { hash: 'A', direction: 'out', counterparty: OTHER, success: true, coins: [{ token: 'INJ', amountBase: '5' }] },
    ])
    expect(parseExplorerTx(send('B', '2026-10-01T10:00:00Z', OTHER, ME, USDC.denom, '7', 5), mine)).toMatchObject([
      { direction: 'in', counterparty: OTHER, success: false, coins: [{ token: 'USDC' }] },
    ])
    const payroll = {
      hash: 'C',
      blockTimestamp: '2026-10-01T10:00:00Z',
      code: 0,
      memo: 'ninjapay:payroll',
      messages: [
        { type: '/cosmos.bank.v1beta1.MsgMultiSend', message: { inputs: [{ address: ME, coins: [{ denom: 'inj', amount: '3' }] }], outputs: [{ address: OTHER, coins: [] }, { address: OTHER, coins: [] }] } },
        { type: '/injective.evm.v1.MsgEthereumTx', message: { data: {} } },
      ],
    }
    expect(parseExplorerTx(payroll, mine)).toMatchObject([{ direction: 'out', counterparty: '2 recipients', isMulti: true }])
    expect(parseExplorerTx(send('D', '2026-10-01T10:00:00Z', OTHER, OTHER, 'inj', '1'), mine)).toEqual([])
  })

  it('pages with skip and limit', async () => {
    explorer.calls = []
    explorer.transactions = Array.from({ length: ACTIVITY_PAGE_SIZE }, (_, i) => send(`H${i}`, `2026-10-01T10:${String(59 - i).padStart(2, '0')}:00Z`, OTHER, ME, 'inj', '1'))
    const page = await fetchCosmosPage(ME, mine, '50')
    expect(explorer.calls[0]).toMatchObject({ account: ME, params: { skip: 50, limit: ACTIVITY_PAGE_SIZE } })
    expect((explorer.calls[0] as { endpoint: string }).endpoint).toMatch(/\/api\/explorer\/v1$/)
    expect(page.next).toBe('100')
    expect(page.reached?.toISOString()).toBe('2026-10-01T10:10:00.000Z')
    explorer.transactions = explorer.transactions.slice(0, 3)
    expect((await fetchCosmosPage(ME, mine, null)).next).toBeNull()
  })
})

describe('Blockscout transfers', () => {
  const tx = { hash: '0x' + 'a'.repeat(64), timestamp: '2026-10-01T10:00:00.000000Z', status: 'ok' as const, value: '1500000000000000000', from: { hash: ME_EVM }, to: { hash: OTHER_EVM } }

  it('reads INJ sent as a transaction’s value', () => {
    expect(parseEvmTx(tx, mine)).toMatchObject({ direction: 'out', counterparty: OTHER_EVM, success: true, coins: [{ token: 'INJ', amountBase: '1500000000000000000' }] })
    expect(parseEvmTx({ ...tx, from: { hash: OTHER_EVM }, to: { hash: ME_EVM.toUpperCase().replace('0X', '0x') }, status: 'error' }, mine)).toMatchObject({ direction: 'in', success: false })
    expect(parseEvmTx({ ...tx, value: '0' }, mine)).toBeNull() // a contract call
    expect(parseEvmTx({ ...tx, status: null }, mine)).toBeNull() // still pending
  })

  it('reads ERC-20 transfers, under either field naming, and skips zero-value spam', () => {
    const transfer = { transaction_hash: tx.hash, timestamp: tx.timestamp, from: { hash: OTHER_EVM }, to: { hash: ME_EVM }, total: { value: '2500000', decimals: '6' }, token: { address_hash: USDC.evmAddress }, token_type: 'ERC-20' }
    expect(parseTokenTransfer(transfer, mine)).toMatchObject({ direction: 'in', counterparty: OTHER_EVM, coins: [{ token: 'USDC', amountBase: '2500000' }] })
    const older = { tx_hash: tx.hash, timestamp: tx.timestamp, from: { hash: OTHER_EVM }, to: { hash: ME_EVM }, total: { value: '1' }, token: { address: USDC.evmAddress!.toLowerCase() } }
    expect(parseTokenTransfer(older, mine)?.coins[0].token).toBe('USDC')
    expect(parseTokenTransfer({ ...transfer, total: { value: '0' } }, mine)).toBeNull()
    expect(parseTokenTransfer({ ...transfer, to: { hash: OTHER_EVM } }, mine)).toBeNull()
  })

  it('follows next_page_params', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ items: [], next_page_params: { block_number: 10, index: 2, items_count: 50 } })))
    vi.stubGlobal('fetch', fetchMock)
    const page = await fetchEvmTokenPage(ME_EVM, mine, 'block_number=20&index=0&items_count=50')
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/v2\/addresses\/0x1{40}\/token-transfers\?type=ERC-20&block_number=20&index=0&items_count=50$/)
    expect(page.next).toBe('block_number=10&index=2&items_count=50')
  })
})

describe('mergeSources', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 10, minute))
  const draft = (hash: string, minute: number, extra: object = {}) => ({
    hash,
    timestamp: at(minute),
    direction: 'in' as const,
    counterparty: OTHER,
    coins: [{ token: 'USDC', denom: USDC.denom, amountBase: '5', decimals: 6, verified: true }],
    success: true,
    memo: '',
    isMulti: false,
    ...extra,
  })

  it('holds back items older than what a source with more pages has reached', () => {
    const cosmos = { drafts: [draft('A', 50), draft('B', 40)], next: '50', reached: at(40) }
    const evm = { drafts: [draft('0x1', 45), draft('0x2', 30)], next: null, reached: at(30) }
    const merged = mergeSources([cosmos, evm])
    expect(merged.drafts.map(d => d.hash)).toEqual(['A', '0x1', 'B'])
    expect(merged.hasMore).toBe(true)
    expect(mergeSources([{ ...cosmos, next: null }, evm]).drafts.map(d => d.hash)).toEqual(['A', '0x1', 'B', '0x2'])
  })

  it('lists a transfer once when two accounts or both sides report it', () => {
    const a = { drafts: [draft('A', 50)], next: null, reached: at(50) }
    const evmCopy = draft('0x' + 'b'.repeat(64), 50, { counterparty: OTHER_EVM })
    const merged = mergeSources([a, { ...a }, { drafts: [evmCopy, draft('0x' + 'c'.repeat(64), 20)], next: null, reached: at(20) }])
    expect(merged.drafts.map(d => d.hash)).toEqual(['A', '0x' + 'c'.repeat(64)])
  })
})

describe('classifyActivity', () => {
  it('labels payroll and claim escrows', () => {
    const base = { hash: 'A', timestamp: new Date(), coins: [], success: true, memo: '', isMulti: false }
    const escrows = new Map([[OTHER, { poolName: 'Team lunch', creatorAddress: ME }]])
    const items = classifyActivity(
      [
        { ...base, direction: 'out', counterparty: '3 recipients', isMulti: true },
        { ...base, direction: 'out', counterparty: OTHER },
        { ...base, direction: 'in', counterparty: OTHER },
      ],
      mine,
      escrows,
    )
    expect(items.map(i => [i.type, i.label])).toEqual([['payroll', undefined], ['claim-fund', 'Team lunch'], ['claim-reclaim', 'Team lunch']])
  })
})
