import type { Instrumentation } from 'next'

// Next calls this for every error thrown while rendering a page or running a
// route handler, server action or proxy. See lib/error-report.ts.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { reportError, requestIdFrom } = await import('./lib/error-report')
  const err = error as Error & { digest?: string }
  await reportError({
    source: 'server',
    message: err?.message ?? String(error),
    digest: err?.digest,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    requestId: requestIdFrom(request.headers['x-vercel-id']),
  })
}
