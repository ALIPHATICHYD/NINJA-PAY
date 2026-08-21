interface SectionHeaderProps {
  badge?: string
  title: string
  centered?: boolean
}

export function SectionHeader({ badge, title, centered }: SectionHeaderProps) {
  return (
    <div
      className="reveal"
      style={{
        marginBottom: '52px',
        textAlign: centered ? 'center' : 'left',
      }}
    >
      {badge && (
        <p
          style={{
            fontSize: '12px',
            fontWeight: '700',
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginBottom: '12px',
          }}
        >
          {badge}
        </p>
      )}
      <h2
        style={{
          fontSize: 'clamp(26px, 4vw, 42px)',
          fontWeight: '800',
          color: 'var(--text-primary)',
          letterSpacing: '-0.03em',
        }}
      >
        {title}
      </h2>
    </div>
  )
}
