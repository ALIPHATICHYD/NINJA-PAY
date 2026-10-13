import { beforeEach, describe, expect, it, vi } from 'vitest'

// A scripted chain: what each broadcast does, and which hashes it knows.
const chain = vi.hoisted(() => ({
  broadcasts: [] as (({ code: number; rawLog?: string }) | Error)[],
  known: new Map<string, number>(),
  lookupFails: false,
  sent: [] as number[],
}))

vi.mock('@injectivelabs/sdk-ts', async importOriginal => {
  const actual = await importOriginal<typeof import('@injectivelabs/sdk-ts')>()
  class FakeTxRestApi {
    async broadcast(txRaw: { sequence: number }) {
      chain.sent.push(txRaw.sequence)
      const next = chain.broadcasts.shift() ?? { code: 0 }
      if (next instanceof Error) throw next
      return { ...next, txHash: `HASH${txRaw.sequence}` }
    }
    async fetchTx(hash: string) {
      if (chain.lookupFails) throw new Error('There was an issue while fetching transaction details')
      const code = chain.known.get(hash)
      if (code === undefined) throw new Error(`The transaction with ${hash} is not found`)
      if (code !== 0) throw Object.assign(new Error('out of gas'), { errorClass: 'TransactionException' })
      return { txHash: hash, code }
    }
  }
  return { ...actual, TxRestApi: FakeTxRestApi, TxClient: { hash: (txRaw: { sequence: number }) => `HASH${txRaw.sequence}` } }
})

const { CROWD_BUSY_MESSAGE, PayoutUncertainError, broadcastForLink, crowdPause, expectedSequence, payoutOutcome } = await import(
  '@/lib/injective/link-broadcast'
)

const mismatch = (expected: number, got: number) =>
  new Error(
    `broadcast error on transaction validation: tx X is invalid: code=32, data=, log='account sequence mismatch, expected ${expected}, got ${got}: incorrect account sequence', codespace='sdk'`,
  )
const sign = (sequence: number) => ({ sequence }) as never
const noWait = { sleep: async () => {} }

beforeEach(() => {
  chain.broadcasts = []
  chain.known = new Map()
  chain.lookupFails = false
  chain.sent = []
})

describe('claim link broadcasts', () => {
  it('reads the sequence the chain expects from its refusal', () => {
    expect(expectedSequence(mismatch(12, 11).message)).toBe(12)
    expect(expectedSequence('insufficient fee')).toBeNull()
  })

  it('pauses a little longer on each try, up to a cap', () => {
    expect(crowdPause(0, () => 0)).toBe(150)
    expect(crowdPause(0, () => 0.999)).toBeLessThan(150 + 250)
    expect(crowdPause(20, () => 0.999)).toBeLessThan(150 + 1_500)
  })

  it('takes the next sequence when another claimer got there first, and records each hash before sending', async () => {
    chain.broadcasts = [mismatch(1, 0), mismatch(2, 1), { code: 0 }]
    const recorded: string[] = []
    await expect(broadcastForLink(sign, 0, { ...noWait, onSigned: hash => { recorded.push(hash) } })).resolves.toEqual({ txHash: 'HASH2' })
    expect(chain.sent).toEqual([0, 1, 2])
    expect(recorded).toEqual(['HASH0', 'HASH1', 'HASH2'])
  })

  it('gives up behind a crowd after a while, having sent nothing that landed', async () => {
    let clock = 0
    chain.broadcasts = Array.from({ length: 100 }, (_, i) => mismatch(i + 1, i))
    const result = await broadcastForLink(sign, 0, { now: () => clock, sleep: async () => { clock += 5_000 } })
    expect(result).toEqual({ failure: CROWD_BUSY_MESSAGE })
  })

  it("doesn't send when the hash can't be recorded", async () => {
    await expect(broadcastForLink(sign, 0, { ...noWait, onSigned: () => { throw new Error('db down') } })).rejects.toThrow('db down')
    expect(chain.sent).toEqual([])
  })

  it('reports a refusal or a failed run as paying nothing', async () => {
    chain.broadcasts = [Object.assign(new Error('out of gas in location: ReadFlat'), { errorClass: 'TransactionException' })]
    await expect(broadcastForLink(sign, 0, noWait)).resolves.toEqual({ failure: 'out of gas in location: ReadFlat' })
    chain.broadcasts = [{ code: 11, rawLog: 'out of gas' }]
    await expect(broadcastForLink(sign, 0, noWait)).resolves.toEqual({ failure: 'out of gas' })
  })

  it('asks the chain when the answer was lost, and only then decides', async () => {
    chain.broadcasts = [new Error('Network Error')]
    chain.known.set('HASH0', 0)
    await expect(broadcastForLink(sign, 0, noWait)).resolves.toEqual({ txHash: 'HASH0' })

    chain.broadcasts = [new Error('Transaction was not included in a block before timeout of 60000ms')]
    chain.known.clear()
    const lost = await broadcastForLink(sign, 0, noWait).catch(error => error)
    expect(lost).toBeInstanceOf(PayoutUncertainError)
    expect(lost.txHash).toBe('HASH0')
  })
})

describe('reading back a pending payout', () => {
  it('is paid once the chain has it, and failed if it ran and failed', async () => {
    chain.known.set('A', 0)
    chain.known.set('B', 11)
    expect(await payoutOutcome('A', 0, 1_000)).toBe('paid')
    expect(await payoutOutcome('B', 0, 1_000)).toBe('failed')
  })

  it('is only called lost when the chain says it has never seen it, after it could no longer land', async () => {
    expect(await payoutOutcome('C', 500, 1_000)).toBe('unknown')
    expect(await payoutOutcome('C', 5_000, 1_000)).toBe('failed')
    chain.lookupFails = true
    expect(await payoutOutcome('C', 5_000, 1_000)).toBe('unknown')
  })
})
