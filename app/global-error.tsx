'use client'

// Last resort when the root layout itself fails, so it brings its own <html>
// and plain styles: the app's stylesheet may be what failed.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#08080A', color: '#ffffff', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 440 }}>
          <p style={{ color: '#9c93ff', fontFamily: 'monospace' }}>{error.digest ? `ERROR ${error.digest}` : 'ERROR'}</p>
          <h1 style={{ fontSize: 32 }}>NinjaPay couldn&apos;t load</h1>
          <p style={{ color: '#a3a1a8', lineHeight: 1.6 }}>
            Your funds are safe: NinjaPay never holds them. Check your wallet before retrying a payment.
          </p>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: '10px 18px', borderRadius: 0, border: 0, background: '#5b4bff', color: '#ffffff', fontSize: 15, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
