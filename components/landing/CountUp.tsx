'use client'

import { useEffect, useRef } from 'react'
import { animate, useInView, useReducedMotion } from 'motion/react'

type CountUpProps = { value: number; decimals?: number; prefix?: string; suffix?: string }

/**
 * Counts a published figure up from zero the first time it scrolls into view, like the
 * counters on injective.com. The server renders the final value, so the figure is correct
 * without JavaScript and under reduced motion.
 */
export function CountUp({ value, decimals = 0, prefix = '', suffix = '' }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()
  const format = (n: number) => `${prefix}${n.toFixed(decimals)}${suffix}`

  useEffect(() => {
    const el = ref.current
    if (!el || reduce) return
    if (!inView) {
      el.textContent = `${prefix}${(0).toFixed(decimals)}${suffix}`
      return
    }
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: n => { el.textContent = `${prefix}${n.toFixed(decimals)}${suffix}` },
    })
    return () => controls.stop()
  }, [inView, reduce, value, decimals, prefix, suffix])

  return <span ref={ref}>{format(value)}</span>
}
