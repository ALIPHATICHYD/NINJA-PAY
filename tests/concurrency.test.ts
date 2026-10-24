import { describe, expect, it } from 'vitest'
import { mapUnique } from '@/lib/concurrency'

describe('mapUnique', () => {
  it('asks once per distinct item and keeps the order', async () => {
    const asked: string[] = []
    const result = await mapUnique(['a', 'b', 'a', 'c', 'b'], async x => { asked.push(x); return x.toUpperCase() })
    expect(result).toEqual(['A', 'B', 'A', 'C', 'B'])
    expect(asked.sort()).toEqual(['a', 'b', 'c'])
  })

  it('never runs more than the limit at once', async () => {
    let running = 0
    let most = 0
    await mapUnique(Array.from({ length: 50 }, (_, i) => i), async () => {
      most = Math.max(most, ++running)
      await new Promise(r => setTimeout(r, 1))
      running--
    }, 6)
    expect(most).toBe(6)
  })

  it('rejects with the first error, like Promise.all', async () => {
    await expect(mapUnique([1, 2, 3], async x => { if (x === 2) throw new Error('boom'); return x })).rejects.toThrow('boom')
  })

  it('handles an empty list', async () => {
    expect(await mapUnique([], async x => x)).toEqual([])
  })
})
