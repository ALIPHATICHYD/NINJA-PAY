import { afterEach, describe, expect, it, vi } from 'vitest'
import { getInjectiveAddress } from '@injectivelabs/sdk-ts'
import { getInjNameRegistryContractForNetwork, getInjNameReverseResolverContractForNetwork } from '@injectivelabs/networks'
import { keccak256, toBytes, concat, bytesToHex } from 'viem'
import { NETWORK } from '@/lib/injective/network'
import {
  lookupName,
  nameToNode,
  normalizeInjName,
  parseRecipientInput,
  resolveInjName,
} from '@/lib/injective/names'

const REGISTRY = getInjNameRegistryContractForNetwork(NETWORK)
const REVERSE = getInjNameReverseResolverContractForNetwork(NETWORK)
const RESOLVER = getInjectiveAddress('0x' + '99'.repeat(20))
const ALICE = getInjectiveAddress('0x' + '11'.repeat(20))
const MALLORY = getInjectiveAddress('0x' + '22'.repeat(20))

// A contract's error for a record it doesn't hold, as the chain's REST API returns it.
const NOT_FOUND = { status: 500, body: { code: 2, message: 'Generic error: Querier contract error: query wasm contract failed: not found', details: [] } }

type Answer = { status: number; body: unknown }
type Query = Record<string, { node?: number[]; address?: string }>
type Contracts = Record<string, (query: Query) => Answer>

// Answers smart queries per contract, decoding the base64 query from the path.
function stubContracts(contracts: Contracts) {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => {
    const match = new URL(String(input)).pathname.match(/\/cosmwasm\/wasm\/v1\/contract\/([^/]+)\/smart\/([^/]+)$/)
    const handler = match && contracts[match[1]]
    if (!handler) return new Response('{"code":5,"message":"no such contract"}', { status: 404 })
    const { status, body } = handler(JSON.parse(atob(decodeURIComponent(match[2]))))
    return new Response(JSON.stringify(body), { status })
  }))
}

const ok = (data: unknown): Answer => ({ status: 200, body: { data } })
const sameNode = (query: Query, name: string) =>
  JSON.stringify(Object.values(query)[0].node) === JSON.stringify(nameToNode(name))

// alice.inj → ALICE through RESOLVER; ALICE's primary name is `reverseName`.
function aliceOnChain(reverseName = 'alice.inj', owner = ALICE): Contracts {
  return {
    [REGISTRY]: q => (sameNode(q, 'alice.inj') ? ok({ resolver: RESOLVER }) : NOT_FOUND),
    [RESOLVER]: q => (sameNode(q, 'alice.inj') ? ok({ address: owner }) : NOT_FOUND),
    [REVERSE]: q => (q.name?.address === ALICE ? ok({ name: reverseName }) : NOT_FOUND),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('names', () => {
  it('normalizes names the way INS stores them', () => {
    expect(normalizeInjName(' Alice.INJ ')).toBe('alice.inj')
    expect(normalizeInjName('ada-lovelace9.inj')).toBe('ada-lovelace9.inj')
  })

  it('rejects what INS cannot hold, including lookalike letters', () => {
    for (const bad of ['ab.inj', 'a_b.inj', 'pay.alice.inj', '-alice.inj', 'alice-.inj', 'alice.eth', 'аlice.inj', '.inj']) {
      expect(normalizeInjName(bad), bad).toBeNull()
    }
  })

  it('hashes a name to its ENS-style node', () => {
    // EIP-137's worked example.
    expect(bytesToHex(new Uint8Array(nameToNode('eth')))).toBe('0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae')
    const inj = keccak256(concat([`0x${'00'.repeat(32)}`, keccak256(toBytes('inj'))]))
    const alice = keccak256(concat([inj, keccak256(toBytes('alice'))]))
    expect(nameToNode('alice.inj')).toEqual(Array.from(toBytes(alice)))
  })

  it('sorts what was typed into a recipient field', () => {
    expect(parseRecipientInput(' ').kind).toBe('empty')
    expect(parseRecipientInput(ALICE)).toMatchObject({ kind: 'address', account: { injective: ALICE } })
    expect(parseRecipientInput('Alice.inj')).toEqual({ kind: 'name', name: 'alice.inj' })
    expect(parseRecipientInput('al.inj').kind).toBe('bad-name')
    expect(parseRecipientInput('alice').kind).toBe('invalid')
  })
})

describe('resolveInjName', () => {
  it('follows the registry to the resolver to the address', async () => {
    stubContracts(aliceOnChain())
    expect(await resolveInjName('Alice.inj')).toBe(ALICE)
  })

  it('returns null for a name nobody registered or with no address set', async () => {
    stubContracts(aliceOnChain())
    expect(await resolveInjName('bob.inj')).toBeNull()
    stubContracts({ ...aliceOnChain(), [RESOLVER]: () => ok({ address: null }) })
    expect(await resolveInjName('alice.inj')).toBeNull()
  })

  it('returns null without asking the chain for an invalid name', async () => {
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await resolveInjName('a.inj')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws when the chain cannot be reached, so that is not read as "no address"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    await expect(resolveInjName('alice.inj')).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad gateway', { status: 502 })))
    await expect(resolveInjName('alice.inj')).rejects.toThrow()
  })
})

describe('lookupName', () => {
  it("gives an address's primary name when it resolves back to that address", async () => {
    stubContracts(aliceOnChain())
    expect(await lookupName(ALICE)).toBe('alice.inj')
  })

  it('ignores a primary name that points somewhere else', async () => {
    stubContracts(aliceOnChain('alice.inj', MALLORY))
    expect(await lookupName(ALICE)).toBeNull()
  })

  it('ignores a primary name INS could not hold and addresses without one', async () => {
    stubContracts(aliceOnChain('аlice.inj'))
    expect(await lookupName(ALICE)).toBeNull()
    stubContracts(aliceOnChain())
    expect(await lookupName(MALLORY)).toBeNull()
  })
})
