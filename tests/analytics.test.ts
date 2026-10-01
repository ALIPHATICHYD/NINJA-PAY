import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'
import { formatCoinAmount, mergeSources, parseExplorerTx, type ActivityItem } from '@/lib/injective/activity'
import { periodStart, summarizeWindow, totalCoin } from '@/lib/injective/analytics'
import { labelDenom } from '@/lib/injective/token-list'
import { INJ, USDC } from '@/lib/injective/tokens'

const ME = 'inj1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3t5qxqh' // 0x1111…1111
const ME_EVM = '0x1111111111111111111111111111111111111111'
const OTHER = 'inj1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyf9qgq' // 0x2222…2222
const OTHER_EVM = '0x2222222222222222222222222222222222222222'
const THIRD = 'inj1psuzu6zmhmh7t57ec20znc6plm5wsnza0wew7l'
const mine = new Set([ME])
const prices = { INJ: { usd: 20, publishedAt: new Date() }, USDC: { usd: 1, publishedAt: new Date() } }

const now = new Date(2026, 9, 1, 15, 0) // 1 Oct 2026, 15:00 local
const start = periodStart('30D', now) // 2 Sep 2026, 00:00 local

const coin = (denom: string, amountBase: string) => ({ denom, amountBase, ...labelDenom(denom) })
const item = (hash: string, timestamp: Date, extra: Partial<ActivityItem> = {}): ActivityItem => ({
  hash,
  timestamp,
  type: 'send',
  direction: 'out',
  counterparty: OTHER,
  coins: [coin(USDC.denom, '1000000')],
  success: true,
  ...extra,
})

describe('analytics windows', () => {
  it('covers whole days back to midnight at the start of the window', () => {
    expect(format(start, 'yyyy-MM-dd HH:mm')).toBe('2026-09-02 00:00')
    expect(format(periodStart('7D', now), 'yyyy-MM-dd HH:mm')).toBe('2026-09-25 00:00')
    const summary = summarizeWindow(
      [item('in-window', start), item('before', new Date(start.getTime() - 1))],
      { period: '30D', now, prices, mine },
    )
    expect(summary.transactions).toBe(1)
    expect(summary.sentUsd).toBe(1)
  })

  it('leaves out failed transfers, moves between your own accounts and reclaims', () => {
    const summary = summarizeWindow(
      [
        item('ok', now, { direction: 'in', type: 'receive', coins: [coin(INJ.denom, '2000000000000000000')] }),
        item('failed', now, { success: false }),
        item('to-self', now, { counterparty: ME_EVM }),
        item('reclaim', now, { direction: 'in', type: 'claim-reclaim', counterparty: THIRD }),
      ],
      { period: '30D', now, prices, mine },
    )
    expect(summary.receivedUsd).toBe(40)
    expect(summary.sentUsd).toBe(0)
    // A reclaim is a transaction, but not money received.
    expect(summary.transactions).toBe(2)
    expect(summary.breakdown.map(b => [b.type, b.count])).toEqual([['receive', 1], ['claim-reclaim', 1]])
  })

  it('counts transactions and counterparties once, including everyone a payroll paid', () => {
    const summary = summarizeWindow(
      [
        item('P', now, { type: 'payroll', counterparty: '3 recipients', recipients: [OTHER, THIRD, ME] }),
        item('T', now, { counterparty: OTHER_EVM }),
        item('T', now, { counterparty: THIRD }),
      ],
      { period: '30D', now, prices, mine },
    )
    expect(summary.transactions).toBe(2)
    expect(summary.counterparties).toBe(2)
  })

  it('keeps exact token totals and leaves unpriced tokens out of dollar values', () => {
    const spam = 'factory/inj1x/spam'
    const summary = summarizeWindow(
      [
        item('A', now, { coins: [coin(INJ.denom, '123456789012345678901'), coin(spam, '5')] }),
        item('B', now, { coins: [coin(INJ.denom, '1')] }),
      ],
      { period: '30D', now, prices, mine },
    )
    const inj = summary.tokens.find(t => t.denom === INJ.denom)!
    expect(formatCoinAmount(totalCoin(inj, inj.sentBase), 18)).toBe('123.456789012345678902')
    expect(summary.tokens.map(t => t.token)).toEqual(['INJ', labelDenom(spam).token])
    expect(summary.unpriced).toEqual([`${labelDenom(spam).token} (unverified)`])
    expect(summary.sentUsd).toBeCloseTo(123.456789012345678902 * 20, 6)
  })

  it('draws weekly bars from the start of the window', () => {
    const summary = summarizeWindow([item('A', start), item('B', now)], { period: '30D', now, prices, mine })
    expect(summary.bars[0].label).toBe('2 Sep')
    expect(summary.bars.reduce((sum, b) => sum + b.usd, 0)).toBe(2)
    const week = summarizeWindow([], { period: '7D', now, prices, mine })
    expect(week.bars).toHaveLength(7)
  })
})

describe('history coverage', () => {
  const at = (day: number) => new Date(Date.UTC(2026, 8, day))
  const source = (reached: number, next: string | null) => ({ drafts: [], next, reached: at(reached) })

  it('says how far back the merged history is complete', () => {
    expect(mergeSources([source(20, '50'), source(10, '50'), source(25, null)]).coveredSince).toEqual(at(20))
    expect(mergeSources([source(20, null), source(10, null)]).coveredSince).toBeNull()
  })

  it('keeps everyone a payroll paid', () => {
    const payroll = {
      hash: 'P',
      blockTimestamp: '2026-10-01T10:00:00Z',
      code: 0,
      messages: [
        {
          type: '/cosmos.bank.v1beta1.MsgMultiSend',
          message: { inputs: [{ address: ME, coins: [{ denom: 'inj', amount: '3' }] }], outputs: [{ address: OTHER, coins: [] }, { address: THIRD, coins: [] }] },
        },
      ],
    }
    expect(parseExplorerTx(payroll, mine)).toMatchObject([{ counterparty: '2 recipients', recipients: [OTHER, THIRD] }])
  })
})
