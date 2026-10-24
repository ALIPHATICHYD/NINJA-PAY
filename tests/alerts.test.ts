import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_PER_HOUR, alertOperator, resetAlerts } from '@/lib/alerts'
import { cleanErrorEvent, pathOnly, requestIdFrom } from '@/lib/error-report'

const HOOK = 'https://hooks.example/abc'
const sent: { url: string; body: { text: string; content: string } }[] = []
const post = (async (url: string, init: RequestInit) => {
  sent.push({ url, body: JSON.parse(String(init.body)) })
  return new Response(null, { status: 200 })
}) as unknown as typeof fetch

beforeEach(() => {
  resetAlerts()
  sent.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('alerting the operator', () => {
  it('only logs when no webhook is set', async () => {
    expect(await alertOperator('k', 'hello', { env: {}, post })).toBe(false)
    expect(sent).toEqual([])
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('posts a Slack- and Discord-readable message, naming the environment', async () => {
    expect(await alertOperator('k', 'relayer low', { env: { ALERT_WEBHOOK_URL: HOOK, VERCEL_ENV: 'production' }, post })).toBe(true)
    expect(sent).toEqual([{ url: HOOK, body: { text: 'NinjaPay (production): relayer low', content: 'NinjaPay (production): relayer low' } }])
  })

  it('sends the same alert once per window', async () => {
    const env = { ALERT_WEBHOOK_URL: HOOK }
    await alertOperator('k', 'a', { env, post, now: 0, everyMs: 1_000 })
    await alertOperator('k', 'a', { env, post, now: 500, everyMs: 1_000 })
    await alertOperator('k', 'a', { env, post, now: 1_500, everyMs: 1_000 })
    expect(sent).toHaveLength(2)
  })

  it('caps how many alerts go out in an hour, whatever their keys', async () => {
    const env = { ALERT_WEBHOOK_URL: HOOK }
    for (let i = 0; i < MAX_PER_HOUR + 10; i++) await alertOperator(`k${i}`, 'junk', { env, post, now: 1 })
    expect(sent).toHaveLength(MAX_PER_HOUR)
  })

  it('never throws when the webhook is down', async () => {
    const down = (async () => { throw new Error('down') }) as unknown as typeof fetch
    expect(await alertOperator('k', 'a', { env: { ALERT_WEBHOOK_URL: HOOK }, post: down })).toBe(false)
  })
})

describe('cleaning error reports', () => {
  it('drops query strings and fragments, where a claim link keeps its key', () => {
    expect(pathOnly('/claim/abc?x=1#key=secret')).toBe('/claim/abc')
    expect(pathOnly('/claim/abc#k')).toBe('/claim/abc')
  })

  it('keeps messages short and on one line', () => {
    const event = cleanErrorEvent({ source: 'browser', message: `line one\n${'x'.repeat(500)}`, path: '/send?to=inj1' })
    expect(event.message.length).toBe(300)
    expect(event.message).not.toContain('\n')
    expect(event.path).toBe('/send')
  })

  it("keeps Vercel's request id and drops anything that isn't one", () => {
    expect(cleanErrorEvent({ source: 'server', message: 'm', requestId: 'iad1:iad1::dub1::9cxpt-1792857639228-c5818d90fb66' }).requestId)
      .toBe('iad1:iad1::dub1::9cxpt-1792857639228-c5818d90fb66')
    expect(cleanErrorEvent({ source: 'server', message: 'm', requestId: 'a b<script>' }).requestId).toBeUndefined()
    expect(requestIdFrom(['dub1::abc', 'other'])).toBe('dub1::abc')
    expect(requestIdFrom(undefined)).toBeUndefined()
  })
})
