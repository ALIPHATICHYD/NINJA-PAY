/**
 * Whether what NinjaPay depends on is working, for an uptime monitor to poll.
 * Answers 200 when every check passes and 503 when any fails, with one line
 * per check. It returns no addresses, keys or configuration values, and keeps
 * its answer for 15 seconds so polling it can't hammer the services behind it.
 */

import { NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { checkCosmosHealth, checkEvmHealth } from '@/lib/injective/health'
import { INJECTIVE_EVM } from '@/lib/injective/network'
import { MAX_RELAY_FEE, relayBackend, serverEvmRpc } from '@/lib/injective/usdc-relay'
import { isSupabaseConfigured, pingDatabase } from '@/lib/supabase'
import { serviceSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const CACHE_MS = 15_000
/** Below this the relayer can pay for fewer than 20 more transfers. */
export const RELAYER_LOW = MAX_RELAY_FEE * BigInt(20)

type Check = { ok: boolean; detail: string }

async function relayCheck(): Promise<Check> {
  const backend = relayBackend()
  if (!backend) return { ok: true, detail: 'off' }
  if (backend.kind === 'facilitator') return { ok: true, detail: 'on, through a facilitator' }
  try {
    const client = createPublicClient({ chain: INJECTIVE_EVM, transport: http(serverEvmRpc(), { timeout: 10_000 }) })
    const balance = await client.getBalance({ address: privateKeyToAccount(backend.privateKey).address })
    return balance >= RELAYER_LOW
      ? { ok: true, detail: 'on' }
      : { ok: false, detail: 'on, but the relayer wallet is low on INJ for gas. Top it up.' }
  } catch {
    return { ok: false, detail: "on, but the relayer wallet's balance couldn't be read" }
  }
}

async function runChecks(): Promise<Record<string, Check>> {
  const [chain, evm, database, relay] = await Promise.all([
    checkCosmosHealth(),
    checkEvmHealth(undefined, serverEvmRpc()),
    isSupabaseConfigured ? pingDatabase() : Promise.resolve(false),
    relayCheck(),
  ])
  return {
    chain: chain.ok ? { ok: true, detail: 'producing blocks' } : { ok: false, detail: chain.reason },
    evm: evm.ok ? { ok: true, detail: 'producing blocks' } : { ok: false, detail: evm.reason },
    database: database
      ? { ok: true, detail: serviceSupabase() ? 'answering; the server writes claim links' : 'answering; browsers write claim links' }
      : { ok: false, detail: isSupabaseConfigured ? 'not answering' : 'not configured' },
    relay,
  }
}

let last: { at: number; checks: Record<string, Check> } | null = null
let running: Promise<Record<string, Check>> | null = null

export async function GET() {
  if (!last || Date.now() - last.at > CACHE_MS) {
    // Requests that arrive while the checks run share them.
    running ??= runChecks().finally(() => { running = null })
    last = { at: Date.now(), checks: await running }
  }
  const ok = Object.values(last.checks).every(c => c.ok)
  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', checkedAt: new Date(last.at).toISOString(), checks: last.checks },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  )
}
