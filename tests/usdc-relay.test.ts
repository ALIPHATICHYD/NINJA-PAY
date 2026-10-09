import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  pad,
  parseTransaction,
  toFunctionSelector,
  toHex,
  type Hex,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { INJECTIVE_EVM } from '@/lib/injective/network'
import { HOOK_RESTRICTION_MESSAGE } from '@/lib/injective/transfer-errors'
import {
  newTransferAuthorization,
  transferAuthorizationTypedData,
  type TransferAuthorization,
} from '@/lib/injective/usdc-authorization'
import {
  MAX_RELAY_FEE,
  RELAY_MESSAGES,
  relayBackend,
  relayTransfer,
  serverEvmRpc,
  transferWithAuthorizationData,
  type RelayBackend,
} from '@/lib/injective/usdc-relay'

const USDC = '0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d'
const RPC = 'https://rpc.test/'
const FACILITATOR = 'https://facilitator.test'
const RELAYER_KEY = generatePrivateKey()
const relayer: RelayBackend = { kind: 'relayer', privateKey: RELAYER_KEY }
const sender = privateKeyToAccount(generatePrivateKey())
const recipient = privateKeyToAccount(generatePrivateKey()).address

const SELECTORS = {
  authorizationState: toFunctionSelector('authorizationState(address,bytes32)'),
  balanceOf: toFunctionSelector('balanceOf(address)'),
}
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const GAS_PRICE = BigInt(160_000_000)
const ESTIMATE = BigInt(90_000)

type Chain = {
  used?: boolean
  usdcBalance?: bigint
  injBalance?: bigint
  gasPrice?: bigint
  estimateError?: string
  sendError?: { code: number; message: string } | 'http'
  receipt?: 'success' | 'reverted' | 'no-transfer' | 'none'
}

/** A JSON-RPC node answering from `chain`, recording what was sent to it. */
function stubNode(chain: Chain, facilitator?: (path: string, body: unknown) => Response | Promise<Response>) {
  const sent: Hex[] = []
  const calls: string[] = []
  let sentHash: Hex | undefined
  const result = (method: string, params: unknown[]): unknown => {
    calls.push(method)
    switch (method) {
      case 'eth_chainId': return toHex(INJECTIVE_EVM.id)
      case 'eth_call': {
        const data = (params[0] as { data: Hex }).data
        if (data.startsWith(SELECTORS.authorizationState)) return encodeAbiParameters([{ type: 'bool' }], [!!chain.used])
        if (data.startsWith(SELECTORS.balanceOf)) return encodeAbiParameters([{ type: 'uint256' }], [chain.usdcBalance ?? BigInt(10_000_000)])
        throw new Error(`unexpected eth_call ${data.slice(0, 10)}`)
      }
      case 'eth_getBalance': return toHex(chain.injBalance ?? BigInt(0))
      case 'eth_gasPrice': return toHex(chain.gasPrice ?? GAS_PRICE)
      case 'eth_estimateGas':
        if (chain.estimateError) throw { code: 3, message: chain.estimateError }
        return toHex(ESTIMATE)
      case 'eth_getTransactionCount': return '0x5'
      case 'eth_sendRawTransaction': {
        const raw = params[0] as Hex
        sent.push(raw)
        sentHash = keccak256(raw)
        if (chain.sendError && chain.sendError !== 'http') throw chain.sendError
        return sentHash
      }
      case 'eth_blockNumber': return '0x10'
      case 'eth_getTransactionByHash': return null
      case 'eth_getTransactionReceipt': {
        const hash = sentHash ?? FACILITATOR_HASH
        if (chain.receipt === 'none') return null
        const logs = chain.receipt === 'no-transfer' ? [] : [{
          address: USDC.toLowerCase(), topics: [TRANSFER_TOPIC, pad(sender.address.toLowerCase() as Hex), pad(recipient.toLowerCase() as Hex)],
          data: encodeAbiParameters([{ type: 'uint256' }], [AMOUNT]), blockHash: `0x${'1'.repeat(64)}`, blockNumber: '0x10',
          transactionHash: hash, transactionIndex: '0x0', logIndex: '0x0', removed: false,
        }]
        return {
          transactionHash: hash, blockHash: `0x${'1'.repeat(64)}`, blockNumber: '0x10', transactionIndex: '0x0',
          from: privateKeyToAccount(RELAYER_KEY).address, to: USDC, status: chain.receipt === 'reverted' ? '0x0' : '0x1',
          gasUsed: '0x10000', cumulativeGasUsed: '0x10000', effectiveGasPrice: toHex(GAS_PRICE), type: '0x2', contractAddress: null,
          logsBloom: `0x${'0'.repeat(512)}`, logs: chain.receipt === 'reverted' ? [] : logs,
        }
      }
      default: throw new Error(`unexpected ${method}`)
    }
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    if (String(url).startsWith(FACILITATOR)) return facilitator!(String(url).slice(FACILITATOR.length), body)
    if (chain.sendError === 'http' && !Array.isArray(body) && body.method === 'eth_sendRawTransaction') {
      result(body.method, body.params)
      return new Response('Bad gateway', { status: 502 })
    }
    const one = (r: { id: number; method: string; params: unknown[] }) => {
      try {
        return { jsonrpc: '2.0', id: r.id, result: result(r.method, r.params) }
      } catch (error) {
        return { jsonrpc: '2.0', id: r.id, error: error as object }
      }
    }
    return new Response(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)), { headers: { 'content-type': 'application/json' } })
  }))
  return { sent, calls }
}

const AMOUNT = BigInt(2_500_000)
const FACILITATOR_HASH = `0x${'ab'.repeat(32)}` as Hex

async function signed(overrides: Partial<TransferAuthorization> = {}) {
  const auth = { ...newTransferAuthorization(sender.address, recipient, AMOUNT), ...overrides }
  const signature = await sender.signTypedData(transferAuthorizationTypedData(auth, INJECTIVE_EVM.id, USDC))
  return { auth, signature }
}

const relay = async (chain: Chain, backend: RelayBackend = relayer, signedTransfer?: Awaited<ReturnType<typeof signed>>) => {
  const { auth, signature } = signedTransfer ?? (await signed())
  return relayTransfer(auth, signature, { backend, rpcUrl: RPC, usdc: USDC, receiptTimeoutMs: 300 })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('gasless USDC settings', () => {
  it('is off until a facilitator or a relayer key is set, and prefers the facilitator', () => {
    expect(relayBackend({})).toBeNull()
    expect(relayBackend({ USDC_RELAYER_PRIVATE_KEY: RELAYER_KEY })).toEqual({ kind: 'relayer', privateKey: RELAYER_KEY })
    expect(relayBackend({ USDC_RELAY_FACILITATOR_URL: `${FACILITATOR}/`, USDC_RELAYER_PRIVATE_KEY: RELAYER_KEY }))
      .toEqual({ kind: 'facilitator', url: FACILITATOR })
  })

  it('stays off with a malformed key, and never repeats the key in the warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const malformed = RELAYER_KEY.slice(2)
    expect(relayBackend({ USDC_RELAYER_PRIVATE_KEY: malformed })).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    expect(JSON.stringify(warn.mock.calls)).not.toContain(malformed.slice(0, 8))
  })

  it('reads the chain through the server-only RPC when one is set', () => {
    expect(serverEvmRpc({ INJECTIVE_EVM_RPC_URL: 'https://premium.test/?key=k' })).toBe('https://premium.test/?key=k')
    expect(serverEvmRpc({})).toBe('https://k8s.testnet.json-rpc.injective.network/')
  })
})

describe("relaying a signed USDC transfer from NinjaPay's wallet", () => {
  it('sends exactly the signed transfer at the current gas price, and confirms it from the receipt', async () => {
    const transfer = await signed()
    const node = stubNode({ receipt: 'success' })
    const outcome = await relay({}, relayer, transfer)

    expect(node.sent).toHaveLength(1)
    const tx = parseTransaction(node.sent[0])
    expect(outcome).toEqual({ status: 'CONFIRMED', hash: keccak256(node.sent[0]) })
    expect(getAddress(tx.to!)).toBe(USDC)
    expect(tx).toMatchObject({
      chainId: INJECTIVE_EVM.id,
      nonce: 5,
      data: transferWithAuthorizationData(transfer.auth, transfer.signature),
      // Injective charges the gas limit at the fee cap and refunds nothing: no tip, no margin on the price.
      maxFeePerGas: GAS_PRICE,
      gas: (ESTIMATE * BigInt(13)) / BigInt(10),
    })
    expect(tx.maxPriorityFeePerGas ?? BigInt(0)).toBe(BigInt(0))
  })

  it('turns down a bad signature without touching the chain', async () => {
    const node = stubNode({})
    const transfer = await signed()
    const outcome = await relay({}, relayer, { ...transfer, auth: { ...transfer.auth, value: AMOUNT + BigInt(1) } })
    expect(outcome).toEqual({ status: 'REFUSED', message: RELAY_MESSAGES.badSignature })
    expect(node.calls).toEqual([])
  })

  it.each([
    ['a used authorization', { used: true }, RELAY_MESSAGES.used],
    ['too little USDC', { usdcBalance: AMOUNT - BigInt(1) }, RELAY_MESSAGES.balance],
    ['a sender who can pay the fee in INJ', { injBalance: BigInt('1000000000000000000') }, RELAY_MESSAGES.hasInj],
    ['a fee above the cap', { gasPrice: MAX_RELAY_FEE }, RELAY_MESSAGES.feeTooHigh],
    ["Circle's compliance hook", { estimateError: 'execution reverted: transfer is restricted by EVM hook' }, HOOK_RESTRICTION_MESSAGE],
  ])('turns down %s before sending anything', async (_name, chain, message) => {
    const node = stubNode(chain)
    expect(await relay(chain)).toEqual({ status: 'REFUSED', message })
    expect(node.sent).toEqual([])
  })

  it('reports a revert as failed, with the hash, and never as sent', async () => {
    const node = stubNode({ receipt: 'reverted' })
    expect(await relay({ receipt: 'reverted' })).toEqual({ status: 'FAILED', message: RELAY_MESSAGES.reverted, hash: keccak256(node.sent[0]) })
  })

  it("doesn't call it sent when the receipt shows no matching USDC transfer", async () => {
    stubNode({ receipt: 'no-transfer' })
    expect(await relay({ receipt: 'no-transfer' })).toMatchObject({ status: 'FAILED', message: RELAY_MESSAGES.noTransfer })
  })

  it('hands back the hash to keep watching when the node took it but no block shows it yet', async () => {
    const node = stubNode({ receipt: 'none' })
    expect(await relay({ receipt: 'none' })).toEqual({ status: 'SUBMITTED', hash: keccak256(node.sent[0]) })
  })

  it("keeps the hash when the node's reply is lost, since it may have been sent", async () => {
    const node = stubNode({ sendError: 'http', receipt: 'none' })
    expect(await relay({ sendError: 'http', receipt: 'none' })).toEqual({ status: 'SUBMITTED', hash: keccak256(node.sent[0]) })
  })

  it('says NinjaPay is out of gas money when the relayer wallet has no INJ', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const chain: Chain = { sendError: { code: -32000, message: 'insufficient funds for gas * price + value' } }
    stubNode(chain)
    expect(await relay(chain)).toEqual({ status: 'FAILED', message: RELAY_MESSAGES.outOfGas })
  })

  it('reads the price again once when the base fee rose before the transaction arrived', async () => {
    let first = true
    const chain: Chain = {}
    const node = stubNode(chain)
    const fetchMock = vi.mocked(fetch)
    const answer = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url, init) => {
      const body = JSON.parse(String(init?.body))
      if (!Array.isArray(body) && body.method === 'eth_sendRawTransaction' && first) {
        first = false
        node.sent.push(body.params[0])
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: 13, message: 'insufficient fee; got: 1inj required: 2inj' } }))
      }
      return answer(url, init)
    })
    chain.receipt = 'success'
    const outcome = await relay(chain)
    expect(node.sent).toHaveLength(2)
    expect(outcome).toEqual({ status: 'CONFIRMED', hash: keccak256(node.sent[1]) })
  })
})

describe('relaying through an x402 facilitator', () => {
  const backend: RelayBackend = { kind: 'facilitator', url: FACILITATOR }

  it('sends an x402 v2 exact request for the signed transfer, then confirms the hash on chain itself', async () => {
    const transfer = await signed()
    const requests: Record<string, unknown>[] = []
    const node = stubNode({ receipt: 'success' }, (path, body) => {
      requests.push({ path, body })
      return Response.json(path === '/verify'
        ? { isValid: true, payer: sender.address }
        : { success: true, transaction: FACILITATOR_HASH, network: `eip155:${INJECTIVE_EVM.id}`, payer: sender.address })
    })
    expect(await relay({}, backend, transfer)).toEqual({ status: 'CONFIRMED', hash: FACILITATOR_HASH })
    expect(node.sent).toEqual([])
    expect(requests.map(r => r.path)).toEqual(['/verify', '/settle'])
    const requirements = {
      scheme: 'exact', network: 'eip155:1439', amount: '2500000', asset: USDC, payTo: recipient, maxTimeoutSeconds: 600,
      extra: { name: 'USDC', version: '2' },
    }
    expect(requests[1].body).toEqual({
      x402Version: 2,
      paymentRequirements: requirements,
      paymentPayload: {
        x402Version: 2,
        accepted: requirements,
        payload: {
          signature: transfer.signature,
          authorization: {
            from: sender.address, to: recipient, value: '2500000', validAfter: '0',
            validBefore: transfer.auth.validBefore.toString(), nonce: transfer.auth.nonce,
          },
        },
      },
    })
  })

  it('passes on why the facilitator turned it down', async () => {
    stubNode({}, () => Response.json({ isValid: false, invalidReason: 'nonce_already_used' }))
    expect(await relay({}, backend)).toEqual({ status: 'REFUSED', message: RELAY_MESSAGES.used })
  })

  it("can't tell whether it went through when the facilitator's answer is lost", async () => {
    stubNode({}, path => (path === '/verify' ? Response.json({ isValid: true }) : new Response('', { status: 504 })))
    expect(await relay({}, backend)).toEqual({ status: 'UNCERTAIN', message: RELAY_MESSAGES.uncertain })
  })

  it("doesn't trust a success for another payer or network", async () => {
    stubNode({}, path => Response.json(path === '/verify'
      ? { isValid: true }
      : { success: true, transaction: FACILITATOR_HASH, network: 'eip155:1776', payer: sender.address }))
    expect(await relay({}, backend)).toEqual({ status: 'UNCERTAIN', message: RELAY_MESSAGES.uncertain })
  })
})
