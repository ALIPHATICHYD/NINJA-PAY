/**
 * 1-bit ordered dither (8×8 Bayer), the texture behind NinjaPay's "Dithered Ledger" look.
 *
 * Everything here is pure so it can be tested without a canvas: a field maps a pixel and a time
 * to a brightness in [0, 1], and `ditherInto` turns brightness into on/off pixels of one colour.
 */

export const BAYER_8 = [
  0, 48, 12, 60, 3, 51, 15, 63,
  32, 16, 44, 28, 35, 19, 47, 31,
  8, 56, 4, 52, 11, 59, 7, 55,
  40, 24, 36, 20, 43, 27, 39, 23,
  2, 50, 14, 62, 1, 49, 13, 61,
  34, 18, 46, 30, 33, 17, 45, 29,
  10, 58, 6, 54, 9, 57, 5, 53,
  42, 26, 38, 22, 41, 25, 37, 21,
] as const

/** The cut-off a brightness must beat for pixel (x, y) to be lit. Always strictly inside (0, 1). */
export function bayerThreshold(x: number, y: number): number {
  return (BAYER_8[(y & 7) * 8 + (x & 7)] + 0.5) / 64
}

export type FieldKind = 'sphere' | 'wave' | 'flow' | 'ramp' | 'fade' | 'coin'

/** Frame shown when motion is off: chosen so every field looks composed, not mid-transition. */
export const STILL_TIME = 1.4

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Brightness of a procedural field at pixel (x, y) of a W×H canvas, `t` seconds in. */
export function fieldValue(kind: FieldKind, x: number, y: number, W: number, H: number, t: number, seed = 0): number {
  const u = x / W
  const v = y / H
  switch (kind) {
    case 'sphere': {
      // A lit globe with latitude and longitude lines, turning slowly, with a faint halo.
      const s = Math.min(W, H) * 0.4
      const px = (x - W / 2) / s
      const py = (y - H / 2) / s
      const r2 = px * px + py * py
      if (r2 > 1) return clamp01((0.3 - (Math.sqrt(r2) - 1) * 1.5) * (0.75 + 0.25 * Math.sin(t * 1.3)))
      const nz = Math.sqrt(1 - r2)
      const lx = Math.cos(t * 0.35) * 0.75
      const ly = -0.45
      const lz = 0.6
      const lam = Math.max(0, (px * lx + py * ly + nz * lz) / Math.hypot(lx, ly, lz))
      const lon = Math.atan2(px, nz) + t * 0.25
      const lat = Math.asin(clamp01((py + 1) / 2) * 2 - 1)
      const grid = Math.max(Math.abs(Math.cos(lon * 6)) ** 60, Math.abs(Math.cos(lat * 6)) ** 60)
      return clamp01(0.04 + lam * 0.92 + grid * 0.4)
    }
    case 'flow': {
      const band = 1 - Math.min(1, Math.abs(v - 0.5) * 1.7)
      return clamp01((0.5 + 0.5 * Math.sin(u * 16 - t * 1.4 + Math.sin(v * 5 + t) * 1.6)) * band * 0.9)
    }
    case 'ramp':
      return clamp01(u * 1.05 - 0.15 + 0.12 * Math.sin(v * 7 + u * 3 + t * 0.8) + 0.06 * Math.sin(u * 23 - t * 1.6))
    case 'fade':
      // Top to bottom, empty to solid, with a slow ripple: blends the dark page into a solid band.
      return clamp01(v * 1.15 - 0.08 + 0.05 * Math.sin(u * 19 + t * 0.9) * Math.sin(v * 7 - t * 0.6))
    case 'coin': {
      // A coin spinning on its vertical axis: the disc narrows with cos(angle), the rim stays bright.
      const s = Math.min(W, H) * 0.36
      const sq = Math.max(0.1, Math.abs(Math.cos(t * 0.9)))
      const px = (x - W / 2) / (s * sq)
      const py = (y - H / 2) / s
      const r = Math.hypot(px, py)
      if (r > 1) return clamp01((0.22 - (Math.hypot((x - W / 2) / s, py) - 1) * 0.8) * (0.7 + 0.3 * Math.sin(t * 1.7)))
      if (r > 0.84) return 0.95
      const mark = Math.abs(px) < 0.12 && Math.abs(py) < 0.5 ? 0.35 : 0
      return clamp01(0.35 + 0.45 * (0.5 - py * 0.5) * sq + 0.12 * Math.cos(r * 22) + mark * sq)
    }
    case 'wave':
    default:
      return clamp01(
        0.5 + (Math.sin(u * 7 + t * 0.9 + seed) + Math.sin(v * 11 - t * 1.2) + Math.sin((u + v) * 6 + t * 0.6 + seed)) / 6 - v * 0.3,
      )
  }
}

/** Per-pixel brightness and coverage of an image, read from RGBA canvas data. */
export type ImageMap = { lum: Float32Array; alpha: Float32Array; width: number; height: number }

export function imageMapFrom(rgba: ArrayLike<number>, width: number, height: number): ImageMap {
  const n = width * height
  const lum = new Float32Array(n)
  const alpha = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4]
    const g = rgba[i * 4 + 1]
    const b = rgba[i * 4 + 2]
    // Rec. 709 luma: the eye weights green most.
    lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    alpha[i] = rgba[i * 4 + 3] / 255
  }
  return { lum, alpha, width, height }
}

/**
 * A slow drift added to an image's brightness so a dithered illustration shimmers instead of
 * sitting frozen. Small on purpose: the picture must stay recognisable at every frame.
 */
export function shimmer(x: number, y: number, t: number, amount = 0.07): number {
  return amount * Math.sin(t * 1.2 + x * 0.21 + y * 0.13) * Math.sin(t * 0.7 - y * 0.17)
}

export type Rgb = readonly [number, number, number]

export function hexToRgb(hex: string, fallback: Rgb = [91, 75, 255]): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return fallback
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Write one frame into `out` (RGBA, W×H). `sample` returns a brightness and which colour the
 * pixel takes when lit (0 = primary, 1 = secondary); off pixels stay transparent.
 */
export function ditherInto(
  out: Uint8ClampedArray,
  W: number,
  H: number,
  sample: (x: number, y: number) => { value: number; layer: 0 | 1 },
  primary: Rgb,
  secondary: Rgb = primary,
): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const { value, layer } = sample(x, y)
      const i = (y * W + x) * 4
      const rgb = layer === 1 ? secondary : primary
      out[i] = rgb[0]
      out[i + 1] = rgb[1]
      out[i + 2] = rgb[2]
      out[i + 3] = value > bayerThreshold(x, y) ? 255 : 0
    }
  }
}
