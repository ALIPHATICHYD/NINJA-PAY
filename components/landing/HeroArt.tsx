'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'

/** Hero brand artwork (cropped from public/logo.svg). Fades in once, then stays still. */
export function HeroArt() {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl border border-line bg-[#131c25] shadow-[0_24px_64px_-24px_var(--shadow-tint)]"
    >
      <Image
        src="/ninja-hero.png"
        alt="The NinjaPay ninja, wearing a headband with the Injective mark"
        width={1120}
        height={1174}
        priority
        sizes="(min-width: 1024px) 480px, 90vw"
        className="h-auto w-full"
      />
    </motion.div>
  )
}
