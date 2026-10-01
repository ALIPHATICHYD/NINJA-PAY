import { afterEach, describe, expect, it, vi } from 'vitest'
import { SendAuthorization } from '@injectivelabs/core-proto-ts-v2/generated/cosmos/bank/v1beta1/authz_pb'
import { cosmosTransfers, type Receipt } from '@/lib/injective/receipt'
import { describeRunCheck, reconcileRun } from '@/lib/injective/payroll-reconcile'
import { budgetExpiry, budgetProblem, buildBudgetGrant, buildBudgetPayroll, fetchBudgets, type PayrollBudget } from '@/lib/injective/payroll-budget'
import { toCoins } from '@/lib/injective/activity'
import { USDC } from '@/lib/injective/tokens'
import { runTotal } from '@/lib/payroll-runs'
import { payrollRunCsv } from '@/lib/statement'

const OWNER = 'inj1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3t5qxqh'
const OPERATOR = 'inj1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyf9qgq'
const A = 'inj1qqqsyqcyq5rqwzqfpg9scrgwpugpzysn4hwppa'
const B = 'inj1pqqsyqcyq5rqwzqfpg9scrgwpugpzysncvquln'
const NOW = new Date('2026-10-01T12:00:00Z')

afterEach(() => vi.unstubAllGlobals())

const receipt = (transfers: [string, string, string][], status: Receipt['status'] = 'confirmed'): Receipt => ({
  hash: 'AB'.repeat(32),
  status,
  failure: status === 'failed' ? 'insufficient funds' : undefined,
  timestamp: NOW,
  block: '9',
  fee: null,
  memo: '',
  transfers: transfers.map(([from, to, amount]) => ({ from, to, coin: toCoins([{ denom: USDC.denom, amount }])[0] })),
  otherActions: 0,
})

describe('reconcileRun', () => {
  const run = { from: OWNER, denom: USDC.denom.toLowerCase(), rows: [{ address: A, amountBase: '1000000' }, { address: B, amountBase: '2500000' }] }

  it('shows a run as paid only when its transaction paid every row exactly, and nothing else', () => {
    expect(runTotal(run)).toBe(BigInt(3_500_000))
    expect(reconcileRun(run, receipt([[OWNER, B, '2500000'], [OWNER, A, '1000000']]))).toEqual({ status: 'paid', timestamp: NOW })
    expect(reconcileRun(run, receipt([[OWNER, A, '1000000'], [OWNER, B, '2400000']]))).toEqual({ status: 'mismatch', missingRows: [2], extra: 1 })
    expect(reconcileRun(run, receipt([[OWNER, A, '1000000'], [OWNER, B, '2500000'], [OWNER, OPERATOR, '1']]))).toEqual({
      status: 'mismatch',
      missingRows: [],
      extra: 1,
    })
    // Paid by someone else is not paid by this run.
    expect(reconcileRun(run, receipt([[OPERATOR, A, '1000000'], [OWNER, B, '2500000']]))).toEqual({ status: 'mismatch', missingRows: [1], extra: 0 })
  })

  it('reports a failed, missing or pending transaction as such', () => {
    expect(reconcileRun(run, receipt([], 'failed'))).toEqual({ status: 'failed', reason: 'insufficient funds' })
    expect(reconcileRun(run, null)).toEqual({ status: 'not-found' })
    expect(reconcileRun(run, receipt([], 'pending'))).toEqual({ status: 'pending' })
    expect(describeRunCheck({ status: 'mismatch', missingRows: [2, 3], extra: 1 })).toBe(
      "This saved run doesn't match its transaction: rows 2, 3 weren't paid as saved, and it also paid 1 transfer not in this run.",
    )
  })
})

describe('payroll run CSV', () => {
  it('writes one row per recipient with exact amounts, and keeps a label from running as a formula', () => {
    const run = {
      name: 'October team',
      paidAt: '2026-10-01T09:48:00.000Z',
      token: 'USDC',
      denom: USDC.denom,
      from: OWNER,
      hash: 'AB'.repeat(32),
      rows: [{ label: '=Ada', address: A, amountBase: '1500000' }, { address: B, amountBase: '1' }],
    }
    const lines = payrollRunCsv(run, 6, 'Paid on chain').trimEnd().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('Payroll,Paid (UTC),Label,Account,Amount,Token,Denom,Paid from,Checked against the chain,Transaction,Explorer')
    expect(lines[1]).toMatch(new RegExp(`^October team,2026-10-01T09:48:00.000Z,'=Ada,${A},1.5,USDC,${USDC.denom},${OWNER},Paid on chain,${'AB'.repeat(32)},https://`))
    expect(lines[2].split(',').slice(2, 5)).toEqual(['', B, '0.000001'])
  })
})

describe('receipts of authz sends', () => {
  it('reads the transfers inside a MsgExec as paid by the account that gave the approval', () => {
    const { transfers, otherActions } = cosmosTransfers([
      {
        '@type': '/cosmos.authz.v1beta1.MsgExec',
        grantee: OPERATOR,
        msgs: [{ '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: OWNER, to_address: A, amount: [{ denom: USDC.denom, amount: '7' }] }],
      },
    ])
    expect(otherActions).toBe(0)
    expect(transfers).toMatchObject([{ from: OWNER, to: A, coin: { token: 'USDC', amountBase: '7' } }])
  })
})

describe('payroll budgets', () => {
  const budget: PayrollBudget = {
    owner: OWNER,
    operator: OPERATOR,
    remaining: [{ denom: USDC.denom, amount: BigInt(3_000_000) }],
    allowList: [A],
    expiresAt: new Date('2026-10-31T12:00:00Z'),
  }

  it('caps the approval at the budget, lists who it may pay, and expires in whole seconds', () => {
    const msg = buildBudgetGrant(OWNER, OPERATOR, { denom: USDC.denom, totalBase: BigInt(3_000_000), expiresAt: budgetExpiry(30, NOW), allowList: [A, A, B] })
    const proto = msg.toProto()
    expect(proto).toMatchObject({ granter: OWNER, grantee: OPERATOR })
    expect(SendAuthorization.fromBinary(proto.grant!.authorization!.value)).toEqual({
      spendLimit: [{ denom: USDC.denom, amount: '3000000' }],
      allowList: [A, B],
    })
    expect(new Date(Number(proto.grant!.expiration!.seconds) * 1000).toISOString()).toBe('2026-10-31T12:00:00.000Z')
    // What an EVM wallet signs carries the list too.
    expect(JSON.stringify(msg.toEip712V2())).toContain(`"allow_list":["${A}","${B}"]`)
  })

  it("says why the chain would refuse a run, before it's signed", () => {
    const row = (address: string, amountBase: string) => ({ address, amountBase })
    expect(budgetProblem(budget, USDC.denom.toLowerCase(), [row(A, '3000000')], NOW)).toBeNull()
    expect(budgetProblem(budget, USDC.denom, [row(A, '3000001')], NOW)).toBe('The total is more than this payroll budget has left.')
    expect(budgetProblem(budget, 'inj', [row(A, '1')], NOW)).toBe('The total is more than this payroll budget has left.')
    expect(budgetProblem(budget, USDC.denom, [row(A, '1'), row(B, '1')], NOW)).toBe("Row 2 isn't on the list of accounts this budget may pay.")
    expect(budgetProblem(budget, USDC.denom, [row(A, '1')], new Date('2026-11-01T00:00:00Z'))).toBe('This payroll budget has ended.')
  })

  it('pays a run as one MsgExec of one MsgSend per row, from the owner', () => {
    const msg = buildBudgetPayroll(budget, USDC.denom, [{ address: A, amountBase: '5' }, { address: B, amountBase: '6' }])
    expect(msg.toEip712V2()).toMatchObject({
      '@type': '/cosmos.authz.v1beta1.MsgExec',
      grantee: OPERATOR,
      msgs: [
        { '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: OWNER, to_address: A, amount: [{ denom: USDC.denom, amount: '5' }] },
        { '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: OWNER, to_address: B, amount: [{ denom: USDC.denom, amount: '6' }] },
      ],
    })
  })

  it('reads open send approvals given to the operator, leaving out other kinds, expired and spent ones', async () => {
    const send = (granter: string, amount: string, expiration: string | null, allow_list: string[] = []) => ({
      granter,
      grantee: OPERATOR,
      authorization: { '@type': '/cosmos.bank.v1beta1.SendAuthorization', spend_limit: [{ denom: USDC.denom, amount }], allow_list },
      expiration,
    })
    const grants = [
      send(OWNER, '3000000', '2026-10-31T12:00:00Z', [A]),
      send(A, '5', '2026-09-30T00:00:00Z'),
      send(B, '0', null),
      { granter: B, grantee: OPERATOR, authorization: { '@type': '/cosmos.authz.v1beta1.GenericAuthorization', msg: '/cosmos.bank.v1beta1.MsgSend' }, expiration: null },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ grants, pagination: {} }))))
    expect(await fetchBudgets(OPERATOR, NOW)).toEqual([budget])
  })
})
