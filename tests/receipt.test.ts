import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, pad, toHex } from 'viem'
import { fetchReceipt } from '@/lib/injective/receipt'
import { activityCsv, csvField } from '@/lib/statement'
import { labelDenom } from '@/lib/injective/token-list'
import { USDC } from '@/lib/injective/tokens'

const ME = 'inj1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3t5qxqh'
const OTHER = 'inj1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyf9qgq'
const COSMOS_HASH = 'AB'.repeat(32)
const EVM_HASH = `0x${'cd'.repeat(32)}` as const

afterEach(() => vi.unstubAllGlobals())

const restTx = (messages: object[], code = 0) => ({
  tx: { body: { memo: 'ninjapay:payroll', messages }, auth_info: { fee: { amount: [{ denom: 'inj', amount: '37440000000000' }] } } },
  tx_response: { txhash: COSMOS_HASH, height: '123', code, raw_log: code ? 'insufficient funds' : '', timestamp: '2026-10-01T10:00:00Z' },
})

describe('Cosmos receipts', () => {
  it('reads a payroll MultiSend from the chain', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(restTx([
      {
        '@type': '/cosmos.bank.v1beta1.MsgMultiSend',
        inputs: [{ address: ME, coins: [{ denom: USDC.denom, amount: '3000000' }] }],
        outputs: [{ address: OTHER, coins: [{ denom: USDC.denom, amount: '1000000' }] }, { address: ME, coins: [{ denom: USDC.denom, amount: '2000000' }] }],
      },
      { '@type': '/cosmos.authz.v1beta1.MsgGrant' },
    ]))))
    vi.stubGlobal('fetch', fetchMock)
    const receipt = await fetchReceipt(COSMOS_HASH.toLowerCase())
    expect(String(fetchMock.mock.calls[0][0])).toMatch(new RegExp(`/cosmos/tx/v1beta1/txs/${COSMOS_HASH}$`))
    expect(receipt).toMatchObject({
      status: 'confirmed',
      block: '123',
      memo: 'ninjapay:payroll',
      fee: { token: 'INJ', amountBase: '37440000000000' },
      otherActions: 1,
      transfers: [
        { from: ME, to: OTHER, coin: { token: 'USDC', amountBase: '1000000' } },
        { from: ME, to: ME, coin: { token: 'USDC', amountBase: '2000000' } },
      ],
    })
    expect(receipt?.timestamp?.toISOString()).toBe('2026-10-01T10:00:00.000Z')
  })

  it('reports failures and missing transactions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(restTx([], 5)))))
    expect(await fetchReceipt(COSMOS_HASH)).toMatchObject({ status: 'failed', failure: 'insufficient funds' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 5, message: 'tx not found: AB' }), { status: 400 })))
    expect(await fetchReceipt(COSMOS_HASH)).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    await expect(fetchReceipt(COSMOS_HASH)).rejects.toThrow()
    expect(await fetchReceipt('not-a-hash')).toBeNull()
  })
})

describe('EVM receipts', () => {
  it('reads value, ERC-20 transfers, the fee charged and time over JSON-RPC', async () => {
    const from = '0x1111111111111111111111111111111111111111'
    const to = '0x2222222222222222222222222222222222222222'
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    const results: Record<string, unknown> = {
      eth_chainId: '0x59f',
      eth_getTransactionByHash: {
        hash: EVM_HASH, from, to: USDC.evmAddress, value: '0x0', input: '0x', nonce: '0x1', gas: '0x30d40',
        // An EIP-1559 transaction with its fee cap 1.2x the price, as viem sets it by default.
        gasPrice: '0x9896800', maxFeePerGas: '0xb71b000', maxPriorityFeePerGas: '0x0', accessList: [],
        blockHash: `0x${'1'.repeat(64)}`, blockNumber: '0x7b', transactionIndex: '0x0', type: '0x2', v: '0x1', r: '0x1', s: '0x1', chainId: '0x59f', yParity: '0x1',
      },
      eth_getTransactionReceipt: {
        transactionHash: EVM_HASH, blockHash: `0x${'1'.repeat(64)}`, blockNumber: '0x7b', transactionIndex: '0x0', from, to: USDC.evmAddress,
        status: '0x1', gasUsed: '0x1fbd0', cumulativeGasUsed: '0x1fbd0', effectiveGasPrice: '0x9896800', type: '0x2', contractAddress: null,
        logsBloom: `0x${'0'.repeat(512)}`,
        logs: [{
          address: USDC.evmAddress!.toLowerCase(), topics: [transferTopic, pad(from), pad(to)], data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(1_500_000)]),
          blockHash: `0x${'1'.repeat(64)}`, blockNumber: '0x7b', transactionHash: EVM_HASH, transactionIndex: '0x0', logIndex: '0x0', removed: false,
        }],
      },
      eth_getBlockByNumber: { number: '0x7b', hash: `0x${'1'.repeat(64)}`, timestamp: toHex(1790845200), transactions: [] },
    }
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      const one = (r: { id: number; method: string }) => ({ jsonrpc: '2.0', id: r.id, result: results[r.method] ?? null })
      return new Response(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)), { headers: { 'content-type': 'application/json' } })
    }))
    const receipt = await fetchReceipt(EVM_HASH)
    expect(receipt).toMatchObject({
      status: 'confirmed',
      block: '123',
      // Injective charges the whole gas limit at the fee cap, not gas used at the effective price.
      fee: { token: 'INJ', amountBase: (BigInt(0x30d40) * BigInt(0xb71b000)).toString() },
      transfers: [{ from, to, coin: { token: 'USDC', amountBase: '1500000', denom: `erc20:${USDC.evmAddress}` } }],
      otherActions: 0,
    })
    expect(receipt?.timestamp?.getTime()).toBe(1790845200 * 1000)
    // The page says "paid by" only when the fee payer isn't the sender, as for USDC sent without INJ.
    expect(receipt?.feePayer?.toLowerCase()).toBe(from)
  })
})

describe('CSV statement', () => {
  it('keeps spreadsheets from running text as a formula', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvField('@SUM')).toBe("'@SUM")
    expect(csvField('Team lunch, Friday')).toBe('"Team lunch, Friday"')
    expect(csvField('inj1abc')).toBe('inj1abc')
  })

  it('writes one row per coin with the full amount', () => {
    const coin = (denom: string, amountBase: string) => ({ denom, amountBase, ...labelDenom(denom) })
    const csv = activityCsv([{
      hash: COSMOS_HASH,
      timestamp: new Date('2026-10-01T10:00:00Z'),
      type: 'claim-received',
      direction: 'in',
      counterparty: OTHER,
      coins: [coin(USDC.denom, '1234567'), coin('factory/inj1x/spam', '9')],
      success: true,
      label: '=cmd',
    }])
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('Date (UTC),Type,Direction,Counterparty,Amount,Token,Denom,Status,Claim pool,Transaction,Explorer')
    expect(lines[1]).toBe(`2026-10-01T10:00:00.000Z,Claim received,Received,${OTHER},1.234567,USDC,${USDC.denom},Confirmed,'=cmd,${COSMOS_HASH},https://testnet.explorer.injective.network/transaction/${COSMOS_HASH}`)
    expect(lines[2]).toContain(',9,factory/in… (unverified · base units),factory/inj1x/spam,')
  })
})
