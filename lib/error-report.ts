/**
 * Error tracking without a third-party service: every server error and every
 * error a visitor's page reports becomes one structured log line, and the
 * operator is alerted (lib/alerts.ts) the first time each one shows up in an
 * hour. Only the error's message, digest, route and method are kept. Paths
 * are cut at `?` and `#`, so query strings and a claim link's key in the
 * fragment are never logged.
 */

import { alertOperator } from './alerts'

export type ErrorEvent = {
  source: 'server' | 'browser'
  message: string
  digest?: string
  path?: string
  method?: string
  routeType?: string
}

const MAX_MESSAGE = 300

/** A path with its query and fragment removed. */
export function pathOnly(path: string | undefined): string | undefined {
  if (!path) return undefined
  return path.split(/[?#]/)[0].slice(0, 200)
}

/** Trim an error event to what is safe and useful to keep. */
export function cleanErrorEvent(event: ErrorEvent): ErrorEvent {
  return {
    source: event.source,
    message: (event.message || 'Unknown error').replace(/\s+/g, ' ').slice(0, MAX_MESSAGE),
    digest: event.digest?.slice(0, 64),
    path: pathOnly(event.path),
    method: event.method?.slice(0, 10),
    routeType: event.routeType?.slice(0, 20),
  }
}

export async function reportError(raw: ErrorEvent): Promise<void> {
  const event = cleanErrorEvent(raw)
  console.error(JSON.stringify({ level: 'error', ...event, at: new Date().toISOString() }))
  const where = event.path ? ` on ${event.method ? `${event.method} ` : ''}${event.path}` : ''
  // Grouped by digest when there is one, so the same failure alerts once an hour.
  const key = `error:${event.source}:${event.digest ?? event.message.slice(0, 80)}`
  await alertOperator(key, `${event.source === 'browser' ? 'A visitor hit an error' : 'Server error'}${where}: ${event.message}`)
}
