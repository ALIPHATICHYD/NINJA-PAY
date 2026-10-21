/** Send a page's render error to /api/errors. Best effort: a failed report is dropped. */
export function reportClientError(error: Error & { digest?: string }) {
  try {
    const body = JSON.stringify({ message: error.message, digest: error.digest, path: window.location.pathname })
    if (!navigator.sendBeacon?.('/api/errors', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/errors', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {})
    }
  } catch {
    // Reporting must never break the error page itself.
  }
}
