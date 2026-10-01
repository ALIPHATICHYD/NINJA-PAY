import { describe, expect, it } from 'vitest'
import { ENDPOINTS } from '@/lib/injective/network'
import { MSG_ETHEREUM_TX, MSG_MULTI_SEND, MSG_SEND, checkCircuitBreaker, checkRecipientHistory, hasAccount } from '@/lib/injective/transfer-checks'
import { INJ, fund, newAccount } from './helpers'

describe('checks before sending, on a local chain', () => {
  it('warns about an address that has never been used, and not about one that has', async () => {
    const used = newAccount()
    await fund([used], INJ)
    const unused = newAccount()

    expect(await hasAccount(used.inj)).toBe(true)
    expect(await hasAccount(unused.inj)).toBe(false)
    expect(await checkRecipientHistory(used.inj)).toBeNull()
    expect(await checkRecipientHistory(unused.inj)).toMatchObject({ level: 'warn' })
  })

  it('reports nothing for the circuit breaker, which this chain version does not include', async () => {
    // injective-core v1.20.3 doesn't wire in cosmos-sdk's circuit module, so the
    // query isn't served. If a later version adds it, this fails and the check is live.
    const response = await fetch(`${ENDPOINTS.rest}/cosmos/circuit/v1/disable_list`)
    expect(response.status).toBe(501)
    expect(await checkCircuitBreaker([MSG_SEND, MSG_MULTI_SEND, MSG_ETHEREUM_TX])).toBeNull()
  })
})
