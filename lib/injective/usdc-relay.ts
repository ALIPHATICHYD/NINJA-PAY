/**
 * The server side of sending USDC without INJ: it checks a signed EIP-3009
 * transfer (see usdc-authorization.ts), has it submitted, and pays the INJ
 * gas. Server-only: the route in app/api/relay/usdc imports it.
 *
 * Off unless one of these server-only settings is set (never NEXT_PUBLIC_):
 * - USDC_RELAY_FACILITATOR_URL: an x402 facilitator that settles Injective
 *   USDC, such as one Injective runs. It submits the transfer and pays gas, so
 *   NinjaPay holds no key. Used when both are set.
 * - USDC_RELAYER_PRIVATE_KEY: a wallet NinjaPay controls that holds only a
 *   little INJ for gas. It never holds or receives anyone's USDC: the signed
 *   transfer moves USDC straight from the sender to the recipient.
 *
 * Every transfer is checked before any gas is spent: the signature, the time
 * window, that the authorization is unused, that the sender holds the USDC,
 * that the chain would accept it (a dry run, which also runs Circle's
 * compliance hook), that the fee is within MAX_RELAY_FEE, and that the sender
 * really can't pay the fee in INJ. A transfer counts as sent only once its
 * receipt shows the USDC Transfer event. Nothing here logs addresses,
 * signatures or the key.
 *
 * Sources (checked 2026-10-08):
 * - Injective's USDC integration skill, "Server-side relayer checks":
 *   https://github.com/InjectiveLabs/agent-skills/blob/master/skills/injective-usdc-integration/SKILL.md
 * - x402 v2 facilitator API (POST /verify and /settle) as @injectivelabs/x402
 *   0.0.1 implements it: https://docs.injective.network/developers-ai/x402
 */

import {
  BaseError,
  RpcRequestError,
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  isHex,
  keccak256,
  parseEventLogs,
  parseSignature,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ENDPOINTS, INJECTIVE_EVM, PUBLIC_EVM_RPC } from './network'
import { USDC } from './tokens'
import { networkFee, withGasHeadroom } from './fees'
import { HOOK_RESTRICTION_MESSAGE, errorMessage, isHookRestriction, isInsufficientFee } from './transfer-errors'
import {
  AUTHORIZATION_LIFETIME_SECONDS,
  USDC_EIP712_NAME,
  USDC_EIP712_VERSION,
  authorizationProblem,
  isSignedBySender,
  serializeAuthorization,
  type TransferAuthorization,
} from './usdc-authorization'

export const EIP3009_ABI = [
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'authorizationState',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

/** The most INJ NinjaPay pays for one transfer: 0.002 INJ, about 50 times the usual fee. */
export const MAX_RELAY_FEE = BigInt('2000000000000000')

/** How long the route waits for a block before handing the hash to the browser to keep watching. */
const RECEIPT_TIMEOUT_MS = 15_000

export type RelayBackend = { kind: 'facilitator'; url: string } | { kind: 'relayer'; privateKey: Hex }

/** Which way transfers are submitted, from the server's settings, or null when the feature is off. */
export function relayBackend(env: Record<string, string | undefined> = process.env): RelayBackend | null {
  const url = env.USDC_RELAY_FACILITATOR_URL?.trim()
  if (url) {
    if (/^https?:\/\//.test(url)) return { kind: 'facilitator', url: url.replace(/\/+$/, '') }
    console.warn('USDC_RELAY_FACILITATOR_URL is set but is not an http(s) URL, so gasless USDC stays off.')
    return null
  }
  const key = env.USDC_RELAYER_PRIVATE_KEY?.trim()
  if (key) {
    if (/^0x[0-9a-fA-F]{64}$/.test(key)) return { kind: 'relayer', privateKey: key as Hex }
    // Say what's wrong without echoing any of it.
    console.warn('USDC_RELAYER_PRIVATE_KEY is set but is not 0x plus 64 hex digits, so gasless USDC stays off.')
  }
  return null
}

/** The EVM RPC the server uses: the server-only premium URL, else the app's own if it is absolute, else Injective's public one. */
export function serverEvmRpc(env: Record<string, string | undefined> = process.env): string {
  const premium = env.INJECTIVE_EVM_RPC_URL?.trim()
  if (premium) return premium
  return /^https?:\/\//.test(ENDPOINTS.evmRpc) ? ENDPOINTS.evmRpc : PUBLIC_EVM_RPC
}

export type RelayOutcome =
  /** In a block, and the receipt shows the USDC moving from sender to recipient. */
  | { status: 'CONFIRMED'; hash: Hash }
  /** Sent, but not seen in a block yet. The browser keeps watching the hash. */
  | { status: 'SUBMITTED'; hash: Hash }
  /** Turned down before anything was sent: no USDC moved and no fee was paid. */
  | { status: 'REFUSED'; message: string }
  /** Sent and failed, or turned down by the chain or the facilitator: no USDC moved. */
  | { status: 'FAILED'; message: string; hash?: Hash }
  /** It can't be told whether the transfer went through. */
  | { status: 'UNCERTAIN'; message: string }

export const RELAY_MESSAGES = {
  badSignature: "This signature doesn't match the transfer. Sign it again from NinjaPay.",
  used: 'This signed transfer was already used. Check your activity before sending again.',
  balance: "This account doesn't hold enough USDC for this transfer.",
  hasInj: 'This account has enough INJ to pay the network fee, so NinjaPay sends it the usual way.',
  feeTooHigh: "Injective's network fee is unusually high right now, so NinjaPay can't pay it. Try again later.",
  outOfGas: "NinjaPay can't pay network fees right now. Try again later, or add a little INJ and send it the usual way.",
  uncertain: "NinjaPay couldn't tell whether this transfer went through. Check your USDC balance and activity before you send again.",
  reverted: 'The transfer failed on chain, so no USDC was sent. NinjaPay paid the network fee.',
  noTransfer: "The transaction went through but didn't move the USDC as signed. Check your activity.",
} as const

export type RelayOptions = {
  backend: RelayBackend
  rpcUrl?: string
  chain?: Chain
  usdc?: Address
  /** Unix seconds; defaults to now. */
  now?: number
  receiptTimeoutMs?: number
}

const SUBMIT_TIMEOUT_MS = 10_000

/** The calldata for transferWithAuthorization with the signature split into v, r, s. */
export function transferWithAuthorizationData(auth: TransferAuthorization, signature: Hex): Hex {
  const { r, s, v, yParity } = parseSignature(signature)
  return encodeFunctionData({
    abi: EIP3009_ABI,
    functionName: 'transferWithAuthorization',
    args: [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, Number(v ?? BigInt(yParity + 27)), r, s],
  })
}

// One transaction at a time from the relayer wallet on this server instance,
// so two transfers don't take the same account nonce.
let relayerQueue: Promise<unknown> = Promise.resolve()
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = relayerQueue.then(task, task)
  relayerQueue = run.catch(() => undefined)
  return run
}

/** True when the node answered with a JSON-RPC error, so the transaction was not accepted. */
function wasRejected(error: unknown): boolean {
  return error instanceof BaseError && !!error.walk(e => e instanceof RpcRequestError)
}

function failureText(error: unknown): string {
  const full = errorMessage(error)
  if (isHookRestriction(full)) return HOOK_RESTRICTION_MESSAGE
  if (/insufficient funds|balance < tx cost/i.test(full)) return RELAY_MESSAGES.outOfGas
  const short = error instanceof BaseError ? error.shortMessage : full
  return `Injective would not accept this transfer: ${short.slice(0, 160)}`
}

/** Waits for the receipt and checks it shows exactly the signed USDC transfer. */
async function confirm(client: PublicClient, hash: Hash, auth: TransferAuthorization, usdc: Address, timeout: number): Promise<RelayOutcome> {
  let receipt
  try {
    receipt = await client.waitForTransactionReceipt({ hash, timeout })
  } catch {
    // Not in a block yet, or the chain couldn't be read: the browser keeps watching the hash.
    return { status: 'SUBMITTED', hash }
  }
  if (receipt.status !== 'success') return { status: 'FAILED', message: RELAY_MESSAGES.reverted, hash }
  const moved = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs }).some(log =>
    getAddress(log.address) === usdc && log.args.from === auth.from && log.args.to === auth.to && log.args.value === auth.value,
  )
  return moved ? { status: 'CONFIRMED', hash } : { status: 'FAILED', message: RELAY_MESSAGES.noTransfer, hash }
}

/** Signs and sends from NinjaPay's relayer wallet. The hash is known before sending, so a lost reply still leaves it to watch. */
async function submitFromRelayer(
  client: PublicClient,
  privateKey: Hex,
  chain: Chain,
  usdc: Address,
  data: Hex,
  gas: bigint,
  gasPrice: bigint,
): Promise<{ hash: Hash } | { rejected: string }> {
  const account = privateKeyToAccount(privateKey)
  const nonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' })
  const serialized = await account.signTransaction({
    type: 'eip1559',
    chainId: chain.id,
    to: usdc,
    data,
    gas,
    nonce,
    // Injective charges the whole gas limit at the fee cap and refunds
    // nothing (see receipt.ts), so the cap is the current price, with no tip.
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: BigInt(0),
    value: BigInt(0),
  })
  const hash = keccak256(serialized)
  try {
    await client.sendRawTransaction({ serializedTransaction: serialized })
    return { hash }
  } catch (error) {
    if (wasRejected(error)) return { rejected: errorMessage(error) }
    return { hash }
  }
}

type SettleResponse = { success?: boolean; errorReason?: string; transaction?: string; network?: string; payer?: string }

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS + RECEIPT_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

/** The x402 v2 "exact" request a facilitator expects for this transfer. */
export function facilitatorRequest(auth: TransferAuthorization, signature: Hex, chainId: number, usdc: Address) {
  const requirements = {
    scheme: 'exact',
    network: `eip155:${chainId}`,
    amount: auth.value.toString(),
    asset: usdc,
    payTo: auth.to,
    maxTimeoutSeconds: AUTHORIZATION_LIFETIME_SECONDS,
    extra: { name: USDC_EIP712_NAME, version: USDC_EIP712_VERSION },
  }
  return {
    x402Version: 2,
    paymentPayload: { x402Version: 2, accepted: requirements, payload: { signature, authorization: serializeAuthorization(auth) } },
    paymentRequirements: requirements,
  }
}

/** Facilitator reasons that mean the transfer was never sent. */
const NOT_SENT_REASONS: Record<string, string> = {
  insufficient_funds: RELAY_MESSAGES.balance,
  nonce_already_used: RELAY_MESSAGES.used,
  payment_expired: 'This signed transfer has expired. Sign it again.',
  signature_verification_failed: RELAY_MESSAGES.badSignature,
  signature_payer_mismatch: RELAY_MESSAGES.badSignature,
}

async function submitToFacilitator(
  url: string,
  auth: TransferAuthorization,
  signature: Hex,
  chainId: number,
  usdc: Address,
): Promise<{ sent: Hash } | { outcome: RelayOutcome }> {
  const request = facilitatorRequest(auth, signature, chainId, usdc)
  let verified: { isValid?: boolean; invalidReason?: string }
  try {
    verified = await postJson(`${url}/verify`, request)
  } catch {
    return { outcome: { status: 'REFUSED', message: RELAY_MESSAGES.outOfGas } }
  }
  if (!verified.isValid) {
    const reason = verified.invalidReason ?? ''
    return { outcome: { status: 'REFUSED', message: NOT_SENT_REASONS[reason] ?? `The facilitator turned this transfer down (${reason.slice(0, 60) || 'no reason given'}).` } }
  }

  let settled: SettleResponse
  try {
    settled = await postJson<SettleResponse>(`${url}/settle`, request)
  } catch {
    // It may have been sent before the reply was lost.
    return { outcome: { status: 'UNCERTAIN', message: RELAY_MESSAGES.uncertain } }
  }
  if (settled.success) {
    const hash = settled.transaction
    const matches = settled.network === request.paymentRequirements.network && settled.payer?.toLowerCase() === auth.from.toLowerCase()
    if (!hash || !isHex(hash) || hash.length !== 66 || !matches) return { outcome: { status: 'UNCERTAIN', message: RELAY_MESSAGES.uncertain } }
    return { sent: hash as Hash }
  }
  const reason = settled.errorReason ?? ''
  if (reason === 'transaction_reverted') return { outcome: { status: 'FAILED', message: 'The transfer failed on chain, so no USDC was sent.' } }
  if (NOT_SENT_REASONS[reason]) return { outcome: { status: 'FAILED', message: NOT_SENT_REASONS[reason] } }
  return { outcome: { status: 'UNCERTAIN', message: RELAY_MESSAGES.uncertain } }
}

/**
 * Check a signed USDC transfer and have it submitted with NinjaPay paying
 * the gas. Resolves to what happened; it never reports a transfer as sent
 * unless its receipt shows the USDC moving.
 */
export async function relayTransfer(auth: TransferAuthorization, signature: Hex, options: RelayOptions): Promise<RelayOutcome> {
  const chain = options.chain ?? INJECTIVE_EVM
  const usdc = getAddress(options.usdc ?? USDC.evmAddress!)
  const now = options.now ?? Math.floor(Date.now() / 1000)

  const problem = authorizationProblem(auth, now)
  if (problem) return { status: 'REFUSED', message: problem }
  if (!(await isSignedBySender(auth, signature, chain.id, usdc))) return { status: 'REFUSED', message: RELAY_MESSAGES.badSignature }

  const client = createPublicClient({
    chain,
    transport: http(options.rpcUrl ?? serverEvmRpc(), { timeout: SUBMIT_TIMEOUT_MS }),
    // Injective makes a block about every second; viem's default is to look every 4.
    pollingInterval: 1_000,
  }) as PublicClient
  const relayer = options.backend.kind === 'relayer' ? privateKeyToAccount(options.backend.privateKey).address : undefined
  const data = transferWithAuthorizationData(auth, signature)

  const [used, usdcBalance, injBalance, gasPrice] = await Promise.all([
    client.readContract({ address: usdc, abi: EIP3009_ABI, functionName: 'authorizationState', args: [auth.from, auth.nonce] }),
    client.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [auth.from] }),
    client.getBalance({ address: auth.from }),
    client.getGasPrice(),
  ])
  if (used) return { status: 'REFUSED', message: RELAY_MESSAGES.used }
  if (usdcBalance < auth.value) return { status: 'REFUSED', message: RELAY_MESSAGES.balance }

  // A dry run: it fails here, before any gas is spent, if the chain would reject the transfer.
  // The gas limit is always set from it: left to the node (eth_fillTransaction),
  // Injective estimates against block 0 and returns too little for a contract call.
  let estimate: bigint
  try {
    estimate = await client.estimateGas({ account: relayer ?? auth.from, to: usdc, data })
  } catch (error) {
    return { status: 'REFUSED', message: failureText(error) }
  }
  const gas = withGasHeadroom(estimate)
  const fee = networkFee(gas, gasPrice)
  if (fee > MAX_RELAY_FEE) return { status: 'REFUSED', message: RELAY_MESSAGES.feeTooHigh }
  if (injBalance >= fee) return { status: 'REFUSED', message: RELAY_MESSAGES.hasInj }

  const timeout = options.receiptTimeoutMs ?? RECEIPT_TIMEOUT_MS
  if (options.backend.kind === 'facilitator') {
    const result = await submitToFacilitator(options.backend.url, auth, signature, chain.id, usdc)
    return 'sent' in result ? confirm(client, result.sent, auth, usdc, timeout) : result.outcome
  }

  const { privateKey } = options.backend
  return oneAtATime(async () => {
    let sent = await submitFromRelayer(client, privateKey, chain, usdc, data, gas, gasPrice)
    // The base fee rose between reading the price and sending: read it again, once.
    if ('rejected' in sent && isInsufficientFee(sent.rejected)) {
      const price = await client.getGasPrice()
      if (networkFee(gas, price) > MAX_RELAY_FEE) return { status: 'REFUSED', message: RELAY_MESSAGES.feeTooHigh } as const
      sent = await submitFromRelayer(client, privateKey, chain, usdc, data, gas, price)
    }
    if ('rejected' in sent) {
      if (/insufficient funds|balance < tx cost/i.test(sent.rejected)) {
        console.warn('The USDC relayer wallet is out of INJ for gas. Top it up with INJ.')
      }
      return { status: 'FAILED', message: failureText(new Error(sent.rejected)) } as const
    }
    return confirm(client, sent.hash, auth, usdc, timeout)
  })
}
