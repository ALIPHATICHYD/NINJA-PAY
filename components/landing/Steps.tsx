'use client'

import { motion, useReducedMotion } from 'motion/react'

type Step = { title: string; desc: string }

/**
 * Horizontal timeline. The Ocean segment on each step draws in sequence
 * to show the order of the flow; static under reduced motion.
 */
export function Steps({ steps }: { steps: Step[] }) {
  const reduce = useReducedMotion()
  return (
    <ol className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
      {steps.map((step, i) => (
        <li key={step.title} className="relative pt-6">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-line" />
          <motion.span
            aria-hidden="true"
            className="absolute left-0 top-0 h-0.5 w-full origin-left bg-ocean"
            initial={reduce ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.7, delay: i * 0.18, ease: [0.16, 1, 0.3, 1] }}
          />
          <h3 className="text-lg font-semibold tracking-tight text-ink">{step.title}</h3>
          <p className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-ink-2">{step.desc}</p>
        </li>
      ))}
    </ol>
  )
}
