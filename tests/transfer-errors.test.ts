import { describe, expect, it } from 'vitest'
import { describeExecutionFailure, describeTransferError, isExecutionFailure, isHookOutOfGas, isHookRestriction, isInsufficientFee } from '@/lib/injective/transfer-errors'

// The out-of-gas text is quoted from Injective's USDC page.
const OUT_OF_GAS =
  'transfer is restricted by EVM hook: panic during EVM hook: types.ErrorOutOfGas: {EVM hook call failed}: contract hook query error: restricted action'
const RESTRICTED = 'transfer is restricted by EVM hook: contract hook query error: restricted action'

describe('USDC hook errors', () => {
  it('treats ErrorOutOfGas as retryable, not a restriction', () => {
    expect(isHookOutOfGas(OUT_OF_GAS)).toBe(true)
    expect(isHookRestriction(OUT_OF_GAS)).toBe(false)
  })

  it('recognises a real restriction', () => {
    expect(isHookRestriction(RESTRICTED)).toBe(true)
    expect(isHookOutOfGas(RESTRICTED)).toBe(false)
  })

  it("describes a restriction as the issuer's rule, not NinjaPay's decision", () => {
    const text = describeTransferError(RESTRICTED)
    expect(text).toMatch(/issuer's rules/)
    expect(text).toMatch(/NinjaPay doesn't screen transfers/)
  })

  it('leaves other errors unchanged', () => {
    expect(describeTransferError('insufficient funds')).toBe('insufficient funds')
  })
})

// Quoted from a local injective-core v1.20.3 chain's /cosmos/tx/v1beta1/simulate.
const OVERSPEND =
  "failed to execute message; message index: 0: spendable balance 100ninjapaytest is smaller than 1000ninjapaytest: insufficient funds [!injective!labs/cosmos-sdk@v0.50.14-inj.11/x/bank/keeper/send.go:307] With gas wanted: '10000000' and gas used: '103816' "

describe('transactions the chain refuses in simulation', () => {
  it('recognises a refused message, but not hook out-of-gas, which more gas fixes', () => {
    expect(isExecutionFailure(OVERSPEND)).toBe(true)
    expect(isExecutionFailure(`failed to execute message; message index: 0: ${OUT_OF_GAS}`)).toBe(false)
    expect(isExecutionFailure('The request to /cosmos/tx/v1beta1/simulate has failed.')).toBe(false)
    expect(isExecutionFailure('spendable balance 1000inj is smaller than 32000000000000inj: insufficient funds')).toBe(false)
  })

  it('says nothing was signed or charged', () => {
    expect(describeExecutionFailure(OVERSPEND)).toBe(
      "This account doesn't hold enough of that token for the whole amount. Nothing was signed or sent, so no fee was charged.",
    )
    // Authz sends through an approval: claim links and payroll budgets (cosmos-sdk x/bank/types/send_authorization.go, x/authz).
    const exec = 'failed to execute message; message index: 0: '
    expect(describeExecutionFailure(`${exec}requested amount is more than spend limit: insufficient funds`)).toBe(
      "The total is more than the approval it's sent under allows. Nothing was signed or sent, so no fee was charged.",
    )
    expect(describeExecutionFailure(`${exec}cannot send to inj1abc address: unauthorized`)).toBe(
      "The approval it's sent under doesn't allow paying inj1abc. Nothing was signed or sent, so no fee was charged.",
    )
    expect(describeExecutionFailure(`${exec}failed to get grant with given granter: inj1a, grantee: inj1b & msgType: /cosmos.bank.v1beta1.MsgSend : authorization not found`)).toBe(
      "The approval it's sent under no longer exists: it was revoked, used up or has expired. Nothing was signed or sent, so no fee was charged.",
    )
    expect(describeExecutionFailure('rpc error: failed to execute message; message index: 1: invalid coins [x/bank/types/msgs.go:12] With gas wanted: 1')).toBe(
      "Injective would refuse this transaction (invalid coins), so it wasn't signed or sent and no fee was charged.",
    )
  })
})

describe('fee errors', () => {
  // The txfees module's wording (injective-core v1.20.3, keeper/feedecorator.go) and cosmos-sdk's.
  const TXFEES = 'insufficient fee; got: 20800000000000inj required: 23400000000000inj'
  const SDK = 'insufficient fees; got: 20800000000000inj required: 23400000000000inj'

  it('recognises a gas price below what the chain required', () => {
    expect(isInsufficientFee(TXFEES)).toBe(true)
    expect(isInsufficientFee(SDK)).toBe(true)
    expect(isInsufficientFee('insufficient funds: 1inj is smaller than 2inj')).toBe(false)
  })

  it('explains it in plain words and says nothing was charged', () => {
    expect(describeTransferError(TXFEES)).toMatch(/network fee went up.*no fee was charged\. Try again\./)
  })
})
