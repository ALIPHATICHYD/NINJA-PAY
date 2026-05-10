import React from 'react'

interface ContainerProps {
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg'
  className?: string
  id?: string
  style?: React.CSSProperties
}

export function Container({
  children,
  maxWidth = 'lg',
  className = '',
  id,
  style = {},
}: ContainerProps) {
  const maxWidthMap = {
    sm: '1024px',
    md: '1280px',
    lg: '1440px',
  }

  return (
    <div
      id={id}
      className={className}
      style={{
        maxWidth: maxWidthMap[maxWidth],
        margin: '0 auto',
        padding: '0 24px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
