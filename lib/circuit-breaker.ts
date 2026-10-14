/**
 * Stops calling an upstream for a while after it fails, so an outage costs
 * one timeout per cool-down instead of one per request. Kept in this server
 * instance's memory: each instance finds out on its own, which is enough for
 * skipping a slow endpoint.
 */
export function createCircuitBreaker({ coolDownMs }: { coolDownMs: number }) {
  let openUntil = 0
  return {
    /** False while the upstream is being skipped after a failure. */
    allows(now: number = Date.now()): boolean {
      return now >= openUntil
    },
    failed(now: number = Date.now()): void {
      openUntil = now + coolDownMs
    },
    succeeded(): void {
      openUntil = 0
    },
  }
}
