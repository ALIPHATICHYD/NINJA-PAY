'use client'

import { useEffect } from 'react'
import { StatusPage } from '@/components/StatusPage'
import { reportClientError } from '@/lib/report-client-error'

// Shown when a page fails to render. Nothing was sent or signed by the failure
// itself; any transaction already broadcast is on the chain either way.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error), [error])
  return (
    <StatusPage
      code={error.digest ? `ERROR ${error.digest}` : 'ERROR'}
      title="Something went wrong on this page"
      action={<button type="button" className="btn-primary" onClick={reset}>Try again</button>}
    >
      Your funds are safe: NinjaPay never holds them. If you were sending a payment, check your wallet or
      the transactions page before trying again, so it isn&apos;t sent twice.
    </StatusPage>
  )
}
