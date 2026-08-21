import type { CSSProperties } from 'react'

type BackgroundVariant = 'lg' | 'sm'
type BackgroundPosition = 'top-left' | 'top-right' | 'bottom-center'

interface BackgroundProps {
  variant: BackgroundVariant
  position: BackgroundPosition
}

const SIZE: Record<BackgroundVariant, string> = {
  lg: '600px',
  sm: '400px',
}

const DELAY: Record<BackgroundVariant, string> = {
  lg: '0s',
  sm: '4s',
}

const POSITION_STYLES: Record<BackgroundPosition, CSSProperties> = {
  'top-left':      { top: '-200px', left: '-200px' },
  'top-right':     { top: '-100px', right: '-100px' },
  'bottom-center': { top: '-200px', left: '50%', transform: 'translateX(-50%)' },
}

const COLOR: Record<BackgroundVariant, string> = {
  lg: 'rgba(91,88,240,0.12)',
  sm: 'rgba(139,92,246,0.08)',
}

export function Background({ variant, position }: BackgroundProps) {
  const size = SIZE[variant]
  return (
    <div
      className="orb"
      style={{
        width: size,
        height: size,
        background: COLOR[variant],
        animationDelay: DELAY[variant],
        ...POSITION_STYLES[position],
      }}
    />
  )
}
