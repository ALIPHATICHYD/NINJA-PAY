import React from 'react'

interface BackgroundProps {
  variant?: 'sm' | 'lg'
  position?: 'top-left' | 'top-right' | 'bottom-center'
}

export function Background({ variant = 'lg', position = 'top-left' }: BackgroundProps) {
  const sizeMap = {
    sm: { width: '400px', height: '400px', blur: '80px' },
    lg: { width: '600px', height: '600px', blur: '80px' },
  }

  const positionMap = {
    'top-left': { top: '-200px', left: '-200px', right: 'auto', bottom: 'auto' },
    'top-right': { top: '-100px', right: '-100px', left: 'auto', bottom: 'auto' },
    'bottom-center': { bottom: '-200px', left: '50%', right: 'auto', top: 'auto', transform: 'translateX(-50%)' },
  }

  const size = sizeMap[variant]
  const pos = positionMap[position]

  return (
    <div
      className="orb"
      style={{
        width: size.width,
        height: size.height,
        background: 'rgba(91,88,240,0.12)',
        ...pos,
      } as React.CSSProperties}
    />
  )
}
