'use client'

interface SectionHeaderProps {
  badge?: string
  title: string
  description?: string
  centered?: boolean
}

export function SectionHeader({
  badge,
  title,
  description,
  centered = false,
}: SectionHeaderProps) {
  return (
    <div className="reveal" style={{ marginBottom: '52px', textAlign: centered ? 'center' : 'left' }}>
      {badge && (
        <p style={{
          fontSize: '12px',
          fontWeight: '700',
          color: 'var(--accent)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          marginBottom: '12px',
        }}>
          {badge}
        </p>
      )}
      <h2 style={{
        fontSize: 'clamp(26px, 4vw, 42px)',
        fontWeight: '800',
        color: 'var(--text-primary)',
        letterSpacing: '-0.03em',
        marginBottom: description ? '12px' : '0',
      }}>
        {title}
      </h2>
      {description && (
        <p style={{
          fontSize: '16px',
          color: 'var(--text-secondary)',
          maxWidth: '520px',
          margin: centered ? '0 auto' : '0',
          lineHeight: '1.7',
        }}>
          {description}
        </p>
      )}
    </div>
  )
}
