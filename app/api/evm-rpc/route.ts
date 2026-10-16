/**
 * EVM JSON-RPC proxy, so a premium RPC provider's API key stays on the server.
 *
 * Off unless configured. To use it, set:
 * - INJECTIVE_EVM_RPC_URL: the provider's URL, key included. Server-only: it
 *   has no NEXT_PUBLIC_ prefix, so it never reaches the browser.
 * - NEXT_PUBLIC_INJECTIVE_EVM_RPC=/api/evm-rpc, so the app sends reads here.
 *
 * Each request goes to the provider first and to Injective's public RPC if the
 * provider fails. After a failure the provider is skipped for 30 seconds, so
 * while it is down each request goes straight to the public RPC instead of
 * waiting out a timeout first. Only the read methods the app needs and
 * eth_sendRawTransaction (already signed by the user's wallet) are forwarded.
 * Nothing is logged: requests carry wallet addresses.
 */

import { NextResponse } from 'next/server'
import { PUBLIC_EVM_RPC } from '@/lib/injective/network'
import { createCircuitBreaker } from '@/lib/circuit-breaker'
import { createRateLimiter } from '@/lib/rate-limit'

const ALLOWED_METHODS = new Set([
  'eth_chainId',
  'net_version',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getBalance',
  'eth_getCode',
  'eth_getTransactionCount',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_getLogs',
  'eth_sendRawTransaction',
])

const MAX_BODY_BYTES = 64 * 1024
const MAX_BATCH = 20
const UPSTREAM_TIMEOUT_MS = 10_000
const provider = createCircuitBreaker({ coolDownMs: 30_000 })

// The provider bills per request, so one script shouldn't be able to spend the
// plan through this proxy. A wallet page polls a few reads every few seconds,
// and many people in Nigeria share a carrier's IP address, so the limit is
// generous. Counted in memory: a database round trip on every read would slow
// the app down more than it is worth.
export const RPC_LIMIT_PER_MINUTE = 600
const perNetwork = createRateLimiter({ limit: RPC_LIMIT_PER_MINUTE, windowMs: 60_000 })

function callerNetwork(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

type RpcRequest = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown }

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

async function forward(url: string, body: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    cache: 'no-store',
  })
}

export async function POST(request: Request) {
  const premium = process.env.INJECTIVE_EVM_RPC_URL?.trim()
  if (!premium) {
    return NextResponse.json(rpcError(null, -32601, 'EVM RPC proxy is not configured'), { status: 404 })
  }
  if (!perNetwork.take(callerNetwork(request))) {
    return NextResponse.json(rpcError(null, -32005, 'Too many requests from your network. Wait a minute and try again.'), {
      status: 429,
      headers: { 'retry-after': '60' },
    })
  }

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json(rpcError(null, -32600, 'Request too large'), { status: 413 })
  }

  let payload: RpcRequest | RpcRequest[]
  try {
    payload = JSON.parse(text)
  } catch {
    return NextResponse.json(rpcError(null, -32700, 'Parse error'), { status: 400 })
  }

  const calls = Array.isArray(payload) ? payload : [payload]
  if (calls.length === 0 || calls.length > MAX_BATCH) {
    return NextResponse.json(rpcError(null, -32600, 'Invalid batch size'), { status: 400 })
  }
  const refused = calls.find(c => typeof c.method !== 'string' || !ALLOWED_METHODS.has(c.method))
  if (refused) {
    return NextResponse.json(rpcError(refused.id, -32601, 'Method not allowed'), { status: 403 })
  }

  const upstreams = provider.allows() ? [premium, PUBLIC_EVM_RPC] : [PUBLIC_EVM_RPC]
  for (const url of upstreams) {
    try {
      const upstream = await forward(url, text)
      if (upstream.ok) {
        if (url === premium) provider.succeeded()
        return new NextResponse(upstream.body, {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        })
      }
    } catch {
      // Try the next endpoint.
    }
    if (url === premium) provider.failed()
  }
  return NextResponse.json(rpcError(null, -32603, 'Injective EVM RPC unavailable'), { status: 502 })
}
