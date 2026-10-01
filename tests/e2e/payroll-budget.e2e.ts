import { describe, expect, it } from 'vitest'
import { signAndBroadcast } from '@/lib/injective/cosmos-transactions'
import { CHAIN_ID } from '@/lib/injective/network'
import { fetchApprovals, revokeMessage } from '@/lib/injective/grants'
import { fetchReceipt } from '@/lib/injective/receipt'
import { reconcileRun } from '@/lib/injective/payroll-reconcile'
import { budgetExpiry, budgetProblem, buildBudgetGrant, buildBudgetPayroll, fetchBudgets } from '@/lib/injective/payroll-budget'
import { INJ, balance, feeOf, fund, getTx, newAccount, useEvmWallet, useKeplr } from './helpers'

describe('payroll budgets on a local chain', () => {
  it("lets an operator pay a run from the owner's account, within the budget, and the run reconciles with the chain", async () => {
    const [owner, operator] = [newAccount(), newAccount()]
    await fund([owner], BigInt(10) * INJ)
    await fund([operator], INJ / BigInt(10))
    const staff = [newAccount(), newAccount()]

    // The owner signs with Keplr; the operator with an EVM wallet, so MsgExec goes over EIP-712.
    await useKeplr(owner)
    await signAndBroadcast(
      buildBudgetGrant(owner.inj, operator.inj, {
        denom: 'inj',
        totalBase: BigInt(3) * INJ,
        expiresAt: budgetExpiry(30),
        allowList: staff.map(s => s.inj),
      }),
    )

    const [budget] = await fetchBudgets(operator.inj)
    expect(budget).toMatchObject({ owner: owner.inj, operator: operator.inj, remaining: [{ denom: 'inj', amount: BigInt(3) * INJ }] })
    expect(budget.allowList.sort()).toEqual(staff.map(s => s.inj).sort())

    const rows = [
      { address: staff[0].inj, amountBase: (INJ + INJ / BigInt(2)).toString() },
      { address: staff[1].inj, amountBase: INJ.toString() },
    ]
    expect(budgetProblem(budget, 'inj', rows)).toBeNull()
    const [ownerBefore, operatorBefore] = [await balance(owner.inj), await balance(operator.inj)]
    const wallet = useEvmWallet(operator)
    const hash = await signAndBroadcast(buildBudgetPayroll(budget, 'inj', rows), CHAIN_ID, 'ninjapay:payroll', wallet.signer)

    expect(wallet.signed).toHaveLength(1)
    expect(await balance(staff[0].inj)).toBe(INJ + INJ / BigInt(2))
    expect(await balance(staff[1].inj)).toBe(INJ)
    // The owner pays the run and nothing else; the operator pays only the fee.
    expect(await balance(owner.inj)).toBe(ownerBefore - BigInt(5) * INJ / BigInt(2))
    expect(await balance(operator.inj)).toBe(operatorBefore - feeOf(await getTx(hash)))
    expect(budgetLeftAfter(await fetchBudgets(operator.inj))).toBe(INJ / BigInt(2))

    const receipt = await fetchReceipt(hash)
    expect(reconcileRun({ from: owner.inj, denom: 'inj', rows }, receipt)).toMatchObject({ status: 'paid' })
    // A saved run that says something else doesn't reconcile.
    expect(reconcileRun({ from: owner.inj, denom: 'inj', rows: [rows[0]] }, receipt)).toEqual({ status: 'mismatch', missingRows: [], extra: 1 })
  })

  it("refuses, before signing and without a fee, a run the chain wouldn't allow, and anything after the owner revokes", async () => {
    const [owner, operator, outsider] = [newAccount(), newAccount(), newAccount()]
    await fund([owner], BigInt(10) * INJ)
    await fund([operator], INJ / BigInt(10))
    const allowed = newAccount()
    await useKeplr(owner)
    await signAndBroadcast(buildBudgetGrant(owner.inj, operator.inj, { denom: 'inj', totalBase: INJ, expiresAt: budgetExpiry(7), allowList: [allowed.inj] }))
    const [budget] = await fetchBudgets(operator.inj)
    const wallet = useEvmWallet(operator)
    const operatorBefore = await balance(operator.inj)

    const over = [{ address: allowed.inj, amountBase: (INJ * BigInt(2)).toString() }]
    expect(budgetProblem(budget, 'inj', over)).toBe('The total is more than this payroll budget has left.')
    await expect(signAndBroadcast(buildBudgetPayroll(budget, 'inj', over), CHAIN_ID, '', wallet.signer)).rejects.toThrow(
      "The total is more than the approval it's sent under allows. Nothing was signed or sent, so no fee was charged.",
    )

    const offList = [{ address: outsider.inj, amountBase: '1' }]
    expect(budgetProblem(budget, 'inj', offList)).toBe("Row 1 isn't on the list of accounts this budget may pay.")
    await expect(signAndBroadcast(buildBudgetPayroll(budget, 'inj', offList), CHAIN_ID, '', wallet.signer)).rejects.toThrow(
      `The approval it's sent under doesn't allow paying ${outsider.inj}.`,
    )

    const [approval] = (await fetchApprovals(owner.inj)).given
    await signAndBroadcast(revokeMessage(approval)!)
    expect(await fetchBudgets(operator.inj)).toEqual([])
    await expect(
      signAndBroadcast(buildBudgetPayroll(budget, 'inj', [{ address: allowed.inj, amountBase: '1' }]), CHAIN_ID, '', wallet.signer),
    ).rejects.toThrow('The approval it\'s sent under no longer exists: it was revoked, used up or has expired.')

    expect(wallet.signed).toHaveLength(0)
    expect(await balance(operator.inj)).toBe(operatorBefore)
    expect(await balance(allowed.inj)).toBe(BigInt(0))
  })
})

const budgetLeftAfter = (budgets: Awaited<ReturnType<typeof fetchBudgets>>) => budgets[0]?.remaining[0]?.amount ?? BigInt(0)
