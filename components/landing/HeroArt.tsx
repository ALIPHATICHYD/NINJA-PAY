'use client'

import Image from 'next/image'
import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'

const EASE = [0.16, 1, 0.3, 1] as const

// A tilted orbit drawn in a 100×100 box. The ring and its Lime dot pass behind the ninja on the
// far side and in front of it on the near side, so the mark sits inside the orbit.
const ORBIT = 'M 3 58 a 47 15 0 1 0 94 0 a 47 15 0 1 0 -94 0'
const TILT = 'rotate(-12 50 58)'

function OrbitDot({ still }: { still: boolean }) {
  return (
    <g transform={still ? 'translate(50 73)' : undefined}>
      <circle r={3.4} className="fill-lime opacity-20" />
      <circle r={1.5} className="fill-lime" />
      {!still && <animateMotion dur="16s" repeatCount="indefinite" path={ORBIT} />}
    </g>
  )
}

/**
 * Hero art: the NinjaPay mark, lit like a glossy object, on the black stage with an Ocean bloom
 * and a slow orbit, standing in for the 3D hero video on injective.com. Rests in its final frame
 * under prefers-reduced-motion.
 */
export function HeroArt() {
  const reduce = useReducedMotion() ?? false
  const clipId = `orbit-front-${useId().replace(/[^\w-]/g, '')}`
  const fadeIn = {
    initial: reduce ? false : { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 1, delay: 0.6, ease: EASE },
  } as const

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[480px]">
      <motion.div
        aria-hidden="true"
        className="absolute inset-[6%]"
        initial={reduce ? false : { opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, delay: 0.1, ease: EASE }}
      >
        <div className="hero-bloom size-full rounded-full" />
      </motion.div>

      <motion.svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 size-full overflow-visible" {...fadeIn}>
        <g transform={TILT}>
          <path d={ORBIT} vectorEffect="non-scaling-stroke" strokeWidth={1} className="fill-none stroke-ocean-text/30" />
          <OrbitDot still={reduce} />
        </g>
      </motion.svg>

      <motion.div
        className="absolute inset-[13%] left-[15%]"
        initial={reduce ? false : { opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.2, delay: 0.2, ease: EASE }}
      >
        <Image src="/brand/ninja-hero.svg" alt="The NinjaPay ninja mark" width={400} height={400} priority className="size-full" />
      </motion.div>

      <motion.svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 size-full overflow-visible" {...fadeIn}>
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <rect x={-5} y={58} width={110} height={30} />
          </clipPath>
        </defs>
        <g transform={TILT}>
          <g clipPath={`url(#${clipId})`}>
            <path d={ORBIT} vectorEffect="non-scaling-stroke" strokeWidth={1} className="fill-none stroke-ocean-text/30" />
            <OrbitDot still={reduce} />
          </g>
        </g>
      </motion.svg>
    </div>
  )
}
