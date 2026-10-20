import { describe, expect, it } from 'vitest'
import { BAYER_8, bayerThreshold, ditherInto, fieldValue, hexToRgb, imageMapFrom, type FieldKind } from './dither'

const KINDS: FieldKind[] = ['sphere', 'wave', 'flow', 'ramp', 'fade', 'coin']

describe('bayerThreshold', () => {
  it('uses every level of the 8×8 matrix exactly once', () => {
    expect([...BAYER_8].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i))
  })

  it('stays strictly between 0 and 1 and repeats every 8 pixels', () => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const t = bayerThreshold(x, y)
        expect(t).toBeGreaterThan(0)
        expect(t).toBeLessThan(1)
        expect(bayerThreshold(x + 8, y + 8)).toBe(t)
      }
    }
  })

  it('lights about the right share of pixels for a flat grey', () => {
    const W = 64
    const out = new Uint8ClampedArray(W * W * 4)
    ditherInto(out, W, W, () => ({ value: 0.25, layer: 0 }), [255, 255, 255])
    let lit = 0
    for (let i = 3; i < out.length; i += 4) if (out[i] === 255) lit++
    expect(lit / (W * W)).toBeCloseTo(0.25, 2)
  })
})

describe('fieldValue', () => {
  it('keeps every field inside [0, 1] across the canvas and over time', () => {
    for (const kind of KINDS) {
      for (const t of [0, 1.4, 7.3, 60]) {
        for (let y = 0; y < 40; y += 3) {
          for (let x = 0; x < 60; x += 3) {
            const v = fieldValue(kind, x, y, 60, 40, t, 2.1)
            expect(Number.isFinite(v)).toBe(true)
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })

  it('fades from empty at the top to solid at the bottom', () => {
    expect(fieldValue('fade', 10, 0, 100, 40, 0)).toBe(0)
    expect(fieldValue('fade', 10, 39, 100, 40, 0)).toBeGreaterThan(0.95)
  })

  it('draws the sphere brighter at its lit centre than in the far corner', () => {
    expect(fieldValue('sphere', 50, 50, 100, 100, 0)).toBeGreaterThan(fieldValue('sphere', 0, 0, 100, 100, 0))
  })
})

describe('imageMapFrom', () => {
  it('reads white as bright, black as dark and keeps transparency', () => {
    const map = imageMapFrom([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 0], 3, 1)
    expect(map.lum[0]).toBeCloseTo(1)
    expect(map.lum[1]).toBe(0)
    expect(map.alpha[2]).toBe(0)
  })
})

describe('hexToRgb', () => {
  it('parses a hex colour and falls back on junk', () => {
    expect(hexToRgb(' #5B4BFF')).toEqual([91, 75, 255])
    expect(hexToRgb('nope', [1, 2, 3])).toEqual([1, 2, 3])
  })
})
