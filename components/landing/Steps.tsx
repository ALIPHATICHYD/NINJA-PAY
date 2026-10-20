'use client'

import { motion, useReducedMotion } from 'motion/react'

type Step = { title: string; desc: string }

/**
 * Horizontal timeline. The accent segment on each step draws in sequence
 * to show the order of the flow; static under reduced motion.
 */
export function Steps({ steps }: { steps: Step[] }) {
  const reduce = useReducedMotion()
  return (
    <ol className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
      {steps.map((step, i) => (
        <li key={step.title} className="relative pt-6 lg:pr-8">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-line" />
          <motion.span
            aria-hidden="true"
            className="absolute left-0 top-0 h-px w-full origin-left bg-ocean"
            initial={reduce ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.7, delay: i * 0.18, ease: [0.16, 1, 0.3, 1] }}
          />
          <span className="font-mono text-xs text-ink-3">{String(i + 1).padStart(2, '0')}</span>
          <h3 className="mt-3 text-lg font-medium tracking-tight text-ink">{step.title}</h3>
          <p className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-ink-2">{step.desc}</p>
        </li>
      ))}
    </ol>
  )
}
