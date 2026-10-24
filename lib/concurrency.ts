/**
 * Run `fn` once per distinct item, at most `limit` at a time, and return the
 * results in the items' order. Rejects with the first error, like Promise.all.
 * A payroll of 50 rows asks the chain about each address once, a few at a
 * time, instead of firing every lookup at once and tripping the public
 * endpoint's rate limit.
 */
export async function mapUnique<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = 6): Promise<R[]> {
  const distinct = [...new Set(items)]
  const results = new Map<T, R>()
  let next = 0
  let failed = false
  async function worker() {
    while (next < distinct.length && !failed) {
      const item = distinct[next++]
      try {
        results.set(item, await fn(item))
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, distinct.length) }, worker))
  return items.map(item => results.get(item) as R)
}
