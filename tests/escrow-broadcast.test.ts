import { beforeEach, describe, expect, it, vi } from 'vitest'
import { USDC } from '@/lib/injective/tokens'

// A scripted stand-in for the chain: simulation results and broadcast outcomes.
const chain = vi.hoisted(() => ({
  balances: [] as { denom: string; amount: string }[],
  simulate: [] as (number | Error)[],
  broadcast: [] as { code: number; rawLog?: string }[],
  sent: [] as { gas: number; gasPrice: string; amount: { denom: string; amount: string }[] }[],
  /** Gas prices the chain reports, one per read; the minimum once they run out. */
  gasPrices: [] as bigint[],
}))

vi.mock('@/lib/injective/gas-price', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/injective/gas-price')>()),
  fetchGasPrice: async () => chain.gasPrices.shift() ?? BigInt(160_000_000),
}))

vi.mock('@/lib/injective/bank', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/injective/bank')>()),
  fetchAllBalances: async () => chain.balances,
}))

vi.mock('@injectivelabs/sdk-ts', async importOriginal => {
  const actual = await importOriginal<typeof import('@injectivelabs/sdk-ts')>()
  class FakeBroadcaster {
    async simulate() {
      const next = chain.simulate.shift()
      if (next === undefined || next instanceof Error) throw next ?? new Error('simulation unavailable')
      return { gasInfo: { gasUsed: next } }
    }
    async broadcast({ msgs, gas }: { msgs: { toData(): { amount: { denom: string; amount: string }[] } }; gas: { gas: number; gasPrice: string } }) {
      chain.sent.push({ gas: gas.gas, gasPrice: gas.gasPrice, amount: msgs.toData().amount })
      const next = chain.broadcast.shift() ?? { code: 0 }
      return { ...next, txHash: `HASH${chain.sent.length}` }
    }
  }
  return { ...actual, MsgBroadcasterWithPk: FakeBroadcaster }
})

const { payShareFromEscrow, sweepEscrow } = await import('@/lib/injective/claim-escrow')

const KEY = '1'.repeat(64)
const CLAIMER = 'inj15qx9nl66pqxjh92dp367gm3z5rphzg669sh88w'
const HOOK_OOG =
  'transfer is restricted by EVM hook: panic during EVM hook: types.ErrorOutOfGas: {EVM hook call failed}: contract hook query error: restricted action'
const HOOK_BLOCKED = 'transfer is restricted by EVM hook: contract hook query error: restricted action'
const GAS_PRICE = BigInt(160_000_000)

beforeEach(() => {
  chain.balances = [
    { denom: 'inj', amount: '1000000000000000' },
    { denom: USDC.denom, amount: '5000000' },
  ]
  chain.simulate = []
  chain.broadcast = []
  chain.sent = []
  chain.gasPrices = []
})

describe('escrow payouts', () => {
  it('sizes gas from simulation with a 1.3x buffer', async () => {
    chain.simulate = [100_000]
    await expect(payShareFromEscrow(KEY, CLAIMER, 'USDC', '2500000')).resolves.toBe('HASH1')
    expect(chain.sent[0].gas).toBe(130_000)
  })

  it('retries once with twice the gas when the USDC hook runs out of gas', async () => {
    chain.simulate = [100_000, 100_000]
    chain.broadcast = [{ code: 11, rawLog: HOOK_OOG }, { code: 0 }]
    await expect(payShareFromEscrow(KEY, CLAIMER, 'USDC', '2500000')).resolves.toBe('HASH2')
    expect(chain.sent.map(t => t.gas)).toEqual([130_000, 260_000])
  })

  it('pays the gas price Injective requires at that moment', async () => {
    chain.simulate = [100_000]
    chain.gasPrices = [BigInt(320_000_000)]
    await payShareFromEscrow(KEY, CLAIMER, 'USDC', '2500000')
    expect(chain.sent[0].gasPrice).toBe('320000000')
  })

  it('says the network is busy, not that the pool ran out, when only the higher price breaks the reserve', async () => {
    chain.simulate = [100_000]
    chain.gasPrices = [GAS_PRICE * BigInt(100)]
    await expect(payShareFromEscrow(KEY, CLAIMER, 'USDC', '2500000')).rejects.toThrow(/Injective is busy right now.*Nothing was sent/)
    expect(chain.sent).toHaveLength(0)
  })

  it('reads the price again and retries once when it rose before the chain checked the transaction', async () => {
    chain.simulate = [100_000, 100_000]
    chain.gasPrices = [GAS_PRICE, BigInt(180_000_000)]
    chain.broadcast = [{ code: 13, rawLog: 'insufficient fee; got: 20800000000000inj required: 23400000000000inj' }, { code: 0 }]
    await expect(payShareFromEscrow(KEY, CLAIMER, 'USDC', '2500000')).resolves.toBe('HASH2')
    expect(chain.sent.map(t => t.gasPrice)).toEqual(['160000000', '180000000'])
  })

  it('caps gas at what the fee reserve covers', async () => {
    chain.simulate = [550_000]
    await payShareFromEscrow(KEY, CLAIMER, 'USDC', '2500000')
    expect(chain.sent[0].gas).toBe(600_000)
  })

  it('reports a real restriction neutrally and does not broadcast', async () => {
    chain.simulate = [new Error(HOOK_BLOCKED)]
    await expect(payShareFromEscrow(KEY, CLAIMER, 'USDC', '2500000')).rejects.toThrow(/issuer's rules.*NinjaPay doesn't screen transfers/)
    expect(chain.sent).toHaveLength(0)
  })

  it('refuses a payout the pool cannot cover', async () => {
    chain.simulate = [100_000]
    await expect(payShareFromEscrow(KEY, CLAIMER, 'USDC', '9000000')).rejects.toThrow(/not have enough funds/)
  })

  it("doesn't broadcast what simulation shows the chain would refuse, so the fee reserve isn't spent", async () => {
    chain.simulate = [new Error('failed to execute message; message index: 0: unauthorized: signer is not the sender')]
    await expect(payShareFromEscrow(KEY, CLAIMER, 'USDC', '2500000')).rejects.toThrow(
      "Injective would refuse this transaction (unauthorized: signer is not the sender), so it wasn't signed or sent and no fee was charged.",
    )
    expect(chain.sent).toHaveLength(0)
  })
})

describe('escrow sweep', () => {
  it('returns INJ minus the simulated fee', async () => {
    chain.simulate = [100_000]
    await sweepEscrow(KEY, CLAIMER)
    const fee = BigInt(130_000) * GAS_PRICE
    const inj = chain.sent[0].amount.find(c => c.denom === 'inj')
    expect(inj?.amount).toBe((BigInt('1000000000000000') - fee).toString())
  })
})
