'use client'

import { Container } from '../Container'

export function Footer() {
  const footerLinks = ['Terms', 'Privacy', 'Twitter', 'Discord']

  return (
    <footer style={{ borderTop: '1px solid var(--border)' }}>
      <Container style={{
        padding: '28px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          © 2026 NinjaPay. Built on Injective.
        </p>
        <div style={{ display: 'flex', gap: '20px' }}>
          {footerLinks.map((item) => (
            <a
              key={item}
              href="#"
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)'
              }}
            >
              {item}
            </a>
          ))}
        </div>
      </Container>
    </footer>
  )
}
