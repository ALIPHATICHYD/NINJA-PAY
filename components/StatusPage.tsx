import Link from 'next/link'
import Image from 'next/image'

/** A full-page message in the brand's look, for not-found and error pages. */
export function StatusPage({
  code,
  title,
  children,
  action,
}: {
  code: string
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Link href="/" aria-label="NinjaPay home" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Image src="/brand/ninja-mark.svg" alt="" width={36} height={36} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>NinjaPay</span>
        </Link>
        <p style={{ fontFamily: 'var(--font-geist-mono), monospace', color: 'var(--accent-text)', fontSize: 14, letterSpacing: '0.08em' }}>
          {code}
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, lineHeight: 1.1, fontWeight: 500 }}>{title}</h1>
        <div style={{ color: 'var(--text-secondary)', fontSize: 16, lineHeight: 1.6 }}>{children}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {action}
          <Link href="/" className="btn-secondary">Go to the home page</Link>
        </div>
      </div>
    </main>
  )
}
