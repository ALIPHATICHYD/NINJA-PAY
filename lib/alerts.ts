/**
 * Telling the operator something needs them: one JSON log line, which Vercel
 * keeps with the function's logs, and, when ALERT_WEBHOOK_URL is set, a POST
 * to it. The body carries `text` and `content`, so a Slack or Discord
 * incoming webhook shows it as a message.
 *
 * Each server instance sends the same alert at most once per `everyMs`, and
 * at most MAX_PER_HOUR alerts in all, so a failing dependency or a flood of
 * junk error reports can't flood the channel. The log line is always written.
 * Alerts never carry keys, signatures, request bodies or the webhook's URL.
 */

export const MAX_PER_HOUR = 30
const HOUR_MS = 60 * 60_000

const lastSent = new Map<string, number>()
let hour = { start: 0, sent: 0 }

export type AlertOptions = {
  everyMs?: number
  now?: number
  env?: Record<string, string | undefined>
  post?: typeof fetch
}

/** Log an alert and, unless it was sent recently, send it to ALERT_WEBHOOK_URL. Never throws. */
export async function alertOperator(key: string, message: string, options: AlertOptions = {}): Promise<boolean> {
  const { everyMs = HOUR_MS, now = Date.now(), env = process.env, post = fetch } = options
  console.error(JSON.stringify({ level: 'alert', key, message, at: new Date(now).toISOString() }))

  const url = env.ALERT_WEBHOOK_URL
  if (!url) return false
  const last = lastSent.get(key)
  if (last !== undefined && now - last < everyMs) return false
  if (now - hour.start >= HOUR_MS) hour = { start: now, sent: 0 }
  if (hour.sent >= MAX_PER_HOUR) return false

  lastSent.set(key, now)
  hour.sent++
  if (lastSent.size > 1_000) lastSent.clear()
  const text = `NinjaPay${env.VERCEL_ENV ? ` (${env.VERCEL_ENV})` : ''}: ${message}`
  try {
    const response = await post(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(5_000),
    })
    return response.ok
  } catch {
    return false
  }
}

/** For tests: forget what was sent. */
export function resetAlerts() {
  lastSent.clear()
  hour = { start: 0, sent: 0 }
}
