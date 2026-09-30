'use client'

import { useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown } from 'lucide-react'

type FaqItem = { q: string; a: string }

export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const reduce = useReducedMotion()
  const baseId = useId()

  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item, idx) => {
        const isOpen = open === idx
        const panelId = `${baseId}-panel-${idx}`
        const buttonId = `${baseId}-button-${idx}`
        return (
          <div key={item.q}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : idx)}
                className="flex w-full items-center justify-between gap-6 py-5 text-left text-base font-medium text-ink transition-colors hover:text-ocean-text"
              >
                {item.q}
                <ChevronDown
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className={`shrink-0 text-ink-3 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <p className="max-w-[65ch] pb-6 text-[15px] leading-relaxed text-ink-2">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
