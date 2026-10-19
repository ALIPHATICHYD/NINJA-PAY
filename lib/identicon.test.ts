import { describe, expect, it } from 'vitest'
import { IDENTICON_BACKGROUNDS, identicon } from './identicon'

const A = '0x45a1B2c3D4e5F60718293a4B5c6D7e8F901257Ee'
const B = '0x45a1B2c3D4e5F60718293a4B5c6D7e8F901257Ef'

describe('identicon', () => {
  it('gives the same picture for the same address, whatever its letter case', () => {
    expect(identicon(A)).toEqual(identicon(A.toLowerCase()))
  })

  it('mirrors every row', () => {
    for (const row of identicon(A).cells) expect(row).toEqual([...row].reverse())
  })

  it('uses only the brand backgrounds', () => {
    expect(IDENTICON_BACKGROUNDS).toContain(identicon(A).background)
  })

  it('tells apart addresses that differ in one character', () => {
    expect(identicon(A)).not.toEqual(identicon(B))
  })

  it('spreads addresses across patterns', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const address = `0x${i.toString(16).padStart(40, '0')}`
      seen.add(JSON.stringify(identicon(address)))
    }
    expect(seen.size).toBeGreaterThan(190)
  })
})
