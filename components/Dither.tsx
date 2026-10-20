'use client'

import { useEffect, useRef } from 'react'
import {
  STILL_TIME,
  ditherInto,
  fieldValue,
  hexToRgb,
  imageMapFrom,
  shimmer,
  type FieldKind,
  type ImageMap,
  type Rgb,
} from '@/lib/dither'

const INK: Rgb = [237, 235, 230]
const FRAME_MS = 40 // 25 fps is plenty for 1-bit texture and keeps the main thread quiet.

type Tone = 'accent' | 'ink'

type DitherProps = {
  /** Procedural texture. With `image`, it is drawn behind the picture at `fieldDensity`. */
  field?: FieldKind
  /** Same-origin picture to dither (an SVG or bitmap under /public). */
  image?: string
  /** Canvas resolution in dither pixels; CSS scales it up with crisp edges. */
  width: number
  height: number
  seed?: number
  /** Colour of the field. The image always takes the other tone, so the two read apart. */
  tone?: Tone
  imageTone?: Tone
  /** 0–1: how much of the field shows. Lower is quieter. */
  fieldDensity?: number
  /** Scale and nudge the image inside the canvas (1 = contain). */
  imageScale?: number
  imageOffsetY?: number
  /** Brightness boost for the image, for dark artwork. */
  imageGain?: number
  /** Turn animation off for this instance; reduced motion turns it off everywhere. */
  still?: boolean
  label?: string
  className?: string
  style?: React.CSSProperties
}

function accentRgb(el: Element): Rgb {
  return hexToRgb(getComputedStyle(el).getPropertyValue('--dither-accent') || '#5B4BFF')
}

async function loadImageMap(src: string, W: number, H: number, scale: number, offsetY: number): Promise<ImageMap> {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d canvas unavailable')
  const iw = img.naturalWidth || W
  const ih = img.naturalHeight || H
  const fit = Math.min(W / iw, H / ih) * scale
  const dw = iw * fit
  const dh = ih * fit
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2 + offsetY * H, dw, dh)
  return imageMapFrom(ctx.getImageData(0, 0, W, H).data, W, H)
}

/**
 * A low-resolution canvas drawn as 1-bit ordered dither in one colour, scaled up with hard
 * pixels. Decorative unless `label` is given. It pauses off screen and in background tabs,
 * and renders a single still frame under prefers-reduced-motion.
 */
export function Dither({
  field,
  image,
  width,
  height,
  seed = 0,
  tone = 'accent',
  imageTone,
  fieldDensity = 1,
  imageScale = 1,
  imageOffsetY = 0,
  imageGain = 1,
  still = false,
  label,
  className,
  style,
}: DitherProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const frame = ctx.createImageData(width, height)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fieldTone = tone === 'ink' ? INK : accentRgb(canvas)
    const picTone = (imageTone ?? (tone === 'ink' ? 'accent' : 'ink')) === 'ink' ? INK : accentRgb(canvas)
    let map: ImageMap | null = null
    let raf = 0
    let last = 0
    let visible = true
    let disposed = false
    const t0 = performance.now()

    const paint = (t: number) => {
      ditherInto(
        frame.data,
        width,
        height,
        (x, y) => {
          if (map) {
            const i = y * width + x
            const a = map.alpha[i]
            if (a > 0.5) return { value: map.lum[i] * imageGain + shimmer(x, y, t), layer: 1 }
            if (!field) return { value: 0, layer: 0 }
          }
          return { value: field ? fieldValue(field, x, y, width, height, t, seed) * fieldDensity : 0, layer: 0 }
        },
        fieldTone,
        picTone,
      )
      ctx.putImageData(frame, 0, 0)
    }

    const animated = () => !still && !reduce.matches
    const loop = (now: number) => {
      if (disposed) return
      raf = requestAnimationFrame(loop)
      if (!visible || document.hidden || now - last < FRAME_MS) return
      last = now
      paint((now - t0) / 1000)
    }
    const start = () => {
      cancelAnimationFrame(raf)
      if (animated()) raf = requestAnimationFrame(loop)
      else paint(STILL_TIME)
    }

    const io = new IntersectionObserver(entries => {
      visible = entries.some(e => e.isIntersecting)
    })
    io.observe(canvas)
    reduce.addEventListener('change', start)

    if (image) {
      loadImageMap(image, width, height, imageScale, imageOffsetY)
        .then(m => { map = m })
        .catch(() => { map = null }) // Without the picture the field alone still draws.
        .finally(() => { if (!disposed) start() })
    } else {
      start()
    }

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      io.disconnect()
      reduce.removeEventListener('change', start)
    }
  }, [field, image, width, height, seed, tone, imageTone, fieldDensity, imageScale, imageOffsetY, imageGain, still])

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={`dither ${className ?? ''}`}
      style={style}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  )
}
