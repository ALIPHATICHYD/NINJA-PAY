import { describe, expect, it, vi } from 'vitest'

const reported = vi.hoisted(() => [] as unknown[])
vi.mock('@/lib/error-report', () => ({ reportError: async (event: unknown) => { reported.push(event) } }))

const { POST } = await import('@/app/api/errors/route')
const send = (body: string, ip = '1.1.1.1') =>
  POST(new Request('http://localhost/api/errors', { method: 'POST', body, headers: { 'x-forwarded-for': ip } }))

describe('browser error reports', () => {
  it('reports the message, digest and path', async () => {
    expect((await send(JSON.stringify({ message: 'boom', digest: 'd1', path: '/send' }))).status).toBe(204)
    expect(reported).toEqual([{ source: 'browser', message: 'boom', digest: 'd1', path: '/send', requestId: undefined }])
  })

  it('refuses bodies that are too large or not reports', async () => {
    expect((await send('x'.repeat(3_000))).status).toBe(413)
    expect((await send('not json'))).toHaveProperty('status', 400)
    expect((await send(JSON.stringify({ digest: 'd' }))).status).toBe(400)
  })

  it('limits each network to a trickle', async () => {
    const statuses = []
    for (let i = 0; i < 25; i++) statuses.push((await send(JSON.stringify({ message: 'm' }), '2.2.2.2')).status)
    expect(statuses.filter(s => s === 429)).toHaveLength(5)
  })
})
