/**
 * Sends USDC for someone who has no INJ for the network fee: they sign the
 * exact transfer in their wallet (EIP-3009), and NinjaPay has it submitted
 * and pays the gas. See lib/injective/usdc-relay.ts for the checks.
 *
 * Off unless USDC_RELAY_FACILITATOR_URL or USDC_RELAYER_PRIVATE_KEY is set on
 * the server. GET says whether it is on; POST answers 503 UNAVAILABLE while it
 * is off. Nothing is logged: requests carry wallet addresses and signatures.
 */

import { NextResponse } from 'next/server'
import { isHex, type Hex } from 'viem'
import { parseAuthorization } from '@/lib/injective/usdc-authorization'
import { relayBackend, relayTransfer, type RelayOutcome } from '@/lib/injective/usdc-relay'
import { createRateLimiter } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
// A facilitator waits for the block before answering, then the receipt is checked here.
export const maxDuration = 60

const MAX_BODY_BYTES = 4 * 1024
const HOUR_MS = 60 * 60_000
const perSender = createRateLimiter({ limit: 10, windowMs: HOUR_MS })
const everyone = createRateLimiter({ limit: 100, windowMs: HOUR_MS })

export const UNAVAILABLE_MESSAGE = "Sending USDC without INJ isn't set up on this NinjaPay deployment."

const HTTP_STATUS: Record<RelayOutcome['status'], number> = {
  CONFIRMED: 200,
  SUBMITTED: 202,
  REFUSED: 400,
  FAILED: 502,
  UNCERTAIN: 504,
}

const answer = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })

export async function GET() {
  return answer({ available: relayBackend() !== null }, 200)
}

export async function POST(request: Request) {
  const backend = relayBackend()
  if (!backend) return answer({ status: 'UNAVAILABLE', message: UNAVAILABLE_MESSAGE }, 503)

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return answer({ status: 'REFUSED', message: 'Request too large.' }, 413)
  let body: { authorization?: unknown; signature?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return answer({ status: 'REFUSED', message: 'Not JSON.' }, 400)
  }
  const authorization = parseAuthorization(body.authorization)
  const signature = body.signature
  if (!authorization || typeof signature !== 'string' || !isHex(signature) || signature.length !== 132) {
    return answer({ status: 'REFUSED', message: 'This signed transfer is incomplete. Sign it again from NinjaPay.' }, 400)
  }

  if (!perSender.take(authorization.from.toLowerCase()) || !everyone.take('all')) {
    return answer({ status: 'REFUSED', message: 'NinjaPay has paid the network fee for a lot of transfers in the last hour. Try again later.' }, 429)
  }

  try {
    const outcome = await relayTransfer(authorization, signature as Hex, { backend })
    return answer(outcome, HTTP_STATUS[outcome.status])
  } catch {
    // Reading the chain failed before anything was sent.
    return answer({ status: 'REFUSED', message: "Couldn't reach Injective to check this transfer. Nothing was sent. Try again." }, 502)
  }
}
