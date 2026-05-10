'use client'

import { useEffect } from 'react'

type RevealVariant = 'default' | 'left' | 'right'

export function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active')
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' },
    )

    document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [])
}

export function getRevealClass(variant: RevealVariant = 'default', delay: number = 0): string {
  const variantClass = {
    default: 'reveal',
    left: 'reveal-left',
    right: 'reveal-right',
  }[variant]

  const delayClass = delay > 0 ? `delay-${Math.min(Math.max(delay, 1), 4)}` : ''

  return `${variantClass} ${delayClass}`.trim()
}
