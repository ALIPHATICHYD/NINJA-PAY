import { beforeAll, describe, expect, it } from 'vitest'
import { sendPayroll, signAndBroadcast } from '@/lib/injective/cosmos-transactions'
import { buildPayrollMultiSend } from '@/lib/injective/bank'
import { fetchReceipt } from '@/lib/injective/receipt'
import { TEST_DENOM } from './local-chain-config'
import { INJ, balance, feeOf, fund, getTx, newAccount, useKeplr, type TestAccount } from './helpers'

describe('payroll on a local chain', () => {
  let employer: TestAccount
  beforeAll(async () => {
    employer = newAccount()
    await fund([employer], BigInt(100) * INJ)
    await fund([employer], BigInt(1_000_000), TEST_DENOM)
  })

  it('pays every recipient exactly, in one transaction with one signature and one fee', async () => {
    const staff = [newAccount(), newAccount(), newAccount()]
    const keplr = await useKeplr(employer)
    const before = await balance(employer.inj)

    const hash = await sendPayroll(
      [
        { address: staff[0].inj, amount: '1.5' },
        // A 0x address is the same account as its inj1 form.
        { address: staff[1].evm, amount: '2' },
        { address: staff[2].inj, amount: '0.000000000000000001' },
      ],
      'INJ',
      'October salaries',
    )

    expect(keplr.signatures()).toBe(1)
    expect(await balance(staff[0].inj)).toBe(BigInt('1500000000000000000'))
    expect(await balance(staff[1].inj)).toBe(BigInt(2) * INJ)
    expect(await balance(staff[2].inj)).toBe(BigInt(1))

    const tx = await getTx(hash)
    expect(tx.tx_response.code).toBe(0)
    expect(tx.tx.body.messages.map(m => m['@type'])).toEqual(['/cosmos.bank.v1beta1.MsgMultiSend'])
    expect(tx.tx.body.memo).toBe('October salaries')
    const total = BigInt('3500000000000000001')
    expect(await balance(employer.inj)).toBe(before - total - feeOf(tx))

    const receipt = await fetchReceipt(hash)
    expect(receipt).toMatchObject({ status: 'confirmed', memo: 'October salaries' })
    expect(receipt?.transfers.map(t => [t.from, t.to, t.coin.amountBase])).toEqual([
      [employer.inj, staff[0].inj, '1500000000000000000'],
      [employer.inj, staff[1].inj, '2000000000000000000'],
      [employer.inj, staff[2].inj, '1'],
    ])
    expect(receipt?.fee?.amountBase).toBe(feeOf(tx).toString())
  })

  it('stops before the wallet opens when the account lacks INJ for the fee', async () => {
    const broke = newAccount()
    await fund([broke], BigInt(1_000))
    const keplr = await useKeplr(broke)

    await expect(sendPayroll([{ address: newAccount().inj, amount: '0.0000000000000001' }], 'INJ')).rejects.toThrow(
      /plus the network fee, but this account has/,
    )
    expect(keplr.signatures()).toBe(0)
  })

  it('stops before the wallet opens when the run adds up to more than the employer holds', async () => {
    // A token other than INJ, so NinjaPay's own fee check passes and the chain's simulation decides.
    const staff = [newAccount(), newAccount()]
    const keplr = await useKeplr(employer)
    const held = await balance(employer.inj, TEST_DENOM)
    const injBefore = await balance(employer.inj)

    const msg = buildPayrollMultiSend(employer.inj, TEST_DENOM, [
      { address: staff[0].inj, amount: held.toString() },
      { address: staff[1].inj, amount: '1' },
    ])
    await expect(signAndBroadcast(msg)).rejects.toThrow("This account doesn't hold enough of that token")

    // Never signed, so no fee: a failed transaction on chain would still have paid one.
    expect(keplr.signatures()).toBe(0)
    expect(await balance(employer.inj)).toBe(injBefore)
    expect(await balance(staff[0].inj, TEST_DENOM)).toBe(BigInt(0))
    expect(await balance(staff[1].inj, TEST_DENOM)).toBe(BigInt(0))
    expect(await balance(employer.inj, TEST_DENOM)).toBe(held)
  })
})
