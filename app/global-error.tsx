'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/report-client-error'

// Last resort when the root layout itself fails, so it brings its own <html>
// and plain styles: the app's stylesheet may be what failed.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error), [error])
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#eeefff', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 440 }}>
          <p style={{ color: '#a59cff', fontFamily: 'monospace' }}>{error.digest ? `ERROR ${error.digest}` : 'ERROR'}</p>
          <h1 style={{ fontSize: 32 }}>NinjaPay couldn&apos;t load</h1>
          <p style={{ color: '#b3b4c8', lineHeight: 1.6 }}>
            Your funds are safe: NinjaPay never holds them. Check your wallet before retrying a payment.
          </p>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: '10px 18px', borderRadius: 8, border: 0, background: '#4d3dff', color: '#eeefff', fontSize: 15, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
