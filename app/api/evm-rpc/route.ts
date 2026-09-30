/**
 * EVM JSON-RPC proxy, so a premium RPC provider's API key stays on the server.
 *
 * Off unless configured. To use it, set:
 * - INJECTIVE_EVM_RPC_URL: the provider's URL, key included. Server-only: it
 *   has no NEXT_PUBLIC_ prefix, so it never reaches the browser.
 * - NEXT_PUBLIC_INJECTIVE_EVM_RPC=/api/evm-rpc, so the app sends reads here.
 *
 * Each request goes to the provider first and to Injective's public RPC if the
 * provider fails. Only the read methods the app needs and
 * eth_sendRawTransaction (already signed by the user's wallet) are forwarded.
 * Nothing is logged: requests carry wallet addresses.
 */

import { NextResponse } from 'next/server'
import { PUBLIC_EVM_RPC } from '@/lib/injective/network'

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

  for (const url of [premium, PUBLIC_EVM_RPC]) {
    try {
      const upstream = await forward(url, text)
      if (upstream.ok) {
        return new NextResponse(upstream.body, {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        })
      }
    } catch {
      // Try the next endpoint.
    }
  }
  return NextResponse.json(rpcError(null, -32603, 'Injective EVM RPC unavailable'), { status: 502 })
}
