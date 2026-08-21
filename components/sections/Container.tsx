import { CSSProperties, ReactNode } from 'react'

interface ContainerProps {
  children: ReactNode
  style?: CSSProperties
  className?: string
}

export function Container({ children, style, className }: ContainerProps) {
  return (
    <div
      className={className}
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '88px 24px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
