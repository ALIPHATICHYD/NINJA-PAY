/**
 * A wallet's picture, worked out from its address alone: a mirrored 5×5
 * pattern on an Ocean-family background. The same address always gets the
 * same picture, and different addresses almost always get different ones, so
 * people can tell at a glance which wallet is connected.
 *
 * Nothing is fetched and nothing is stored.
 */

// Ocean and darker or lighter tones of it, each with enough contrast for Snow
// cells on top.
export const IDENTICON_BACKGROUNDS = ['#4D3DFF', '#3A2BE0', '#2A2185', '#5B2FB8', '#1E3A8A', '#0F5E6E'] as const
export const IDENTICON_FOREGROUND = '#EEEFFF'

/** FNV-1a, 32-bit. Spreads every character of the address across the bits. */
function hash(text: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

export type Identicon = {
  background: string
  /** 5 rows of 5 cells; true cells are drawn. Each row reads the same backwards. */
  cells: boolean[][]
}

export function identicon(address: string): Identicon {
  // EVM addresses arrive in mixed checksum case; the picture shouldn't change with it.
  const key = address.trim().toLowerCase()
  const pattern = hash(key, 0x811c9dc5)
  const colour = hash(key, 0x9e3779b9)
  const cells = Array.from({ length: 5 }, (_, row) => {
    const left = [0, 1, 2].map(col => ((pattern >>> (row * 3 + col)) & 1) === 1)
    return [left[0], left[1], left[2], left[1], left[0]]
  })
  return { background: IDENTICON_BACKGROUNDS[colour % IDENTICON_BACKGROUNDS.length], cells }
}
