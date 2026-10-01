import { describe, expect, it } from 'vitest'
import { MAX_PAYROLL_RECIPIENTS, buildPayrollMultiSend } from '@/lib/injective/bank'
import { COSMOS_SEND_GAS, PAYROLL_OUTPUT_GAS, injSpentBy, payrollGas } from '@/lib/injective/fees'
import { DENOMS } from '@/lib/injective/tokens'

const EMPLOYER = 'inj15qx9nl66pqxjh92dp367gm3z5rphzg669sh88w'
const ADA = 'inj1psuzu6zmhmh7t57ec20znc6plm5wsnza0wew7l'
const BAYO = 'inj1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyf9qgq'

type MultiSendData = { inputs: { address: string; coins: { denom: string; amount: string }[] }[]; outputs: { address: string; coins: { denom: string; amount: string }[] }[] }

describe('payroll MsgMultiSend', () => {
  it('has one input carrying the total and one output per recipient', () => {
    const msg = buildPayrollMultiSend(EMPLOYER, DENOMS.USDC, [
      { address: ADA, amount: '1500000' },
      { address: BAYO, amount: '250000' },
    ])
    const data = msg.toData() as unknown as MultiSendData & { '@type': string }
    expect(data['@type']).toBe('/cosmos.bank.v1beta1.MsgMultiSend')
    expect(data.inputs).toEqual([{ address: EMPLOYER, coins: [{ denom: DENOMS.USDC, amount: '1750000' }] }])
    expect(data.outputs).toEqual([
      { address: ADA, coins: [{ denom: DENOMS.USDC, amount: '1500000' }] },
      { address: BAYO, coins: [{ denom: DENOMS.USDC, amount: '250000' }] },
    ])
  })

  it('counts the INJ it spends, so the fee check sees the whole batch', () => {
    const msg = buildPayrollMultiSend(EMPLOYER, DENOMS.INJ, [{ address: ADA, amount: '7' }, { address: BAYO, amount: '10' }])
    expect(injSpentBy(msg, EMPLOYER)).toBe(BigInt(17))
  })

  it('refuses an empty run, a zero amount and more recipients than the cap', () => {
    expect(() => buildPayrollMultiSend(EMPLOYER, DENOMS.INJ, [])).toThrow(/at least one/)
    expect(() => buildPayrollMultiSend(EMPLOYER, DENOMS.INJ, [{ address: ADA, amount: '0' }])).toThrow(/greater than zero/)
    const many = Array.from({ length: MAX_PAYROLL_RECIPIENTS + 1 }, () => ({ address: ADA, amount: '1' }))
    expect(() => buildPayrollMultiSend(EMPLOYER, DENOMS.INJ, many)).toThrow(/up to 50/)
  })

  it('estimates gas for the batch before it is simulated', () => {
    expect(payrollGas(1)).toBe(COSMOS_SEND_GAS)
    expect(payrollGas(3)).toBe(COSMOS_SEND_GAS + PAYROLL_OUTPUT_GAS * BigInt(2))
  })
})
