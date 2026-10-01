import { ChainGrpcBankApi, MsgMultiSend } from '@injectivelabs/sdk-ts'
import { ENDPOINTS } from './network'
import { DENOMS, sameDenom, type TokenInfo } from './tokens'
import { BalanceState, PayrollOutput } from './types'

const endpoints = ENDPOINTS
const bankApi = new ChainGrpcBankApi(endpoints.grpc)

export type Coin = { denom: string; amount: string }

/** Every bank balance of an inj1 address, exactly as the chain returns them. */
export async function fetchAllBalances(address: string): Promise<Coin[]> {
  const response = await bankApi.fetchBalances(address)
  return (response.balances || []).map(b => ({ denom: b.denom, amount: b.amount }))
}

/** The balance of one denom in a list of coins, matched case-insensitively. */
export function balanceOf(balances: Coin[], denom: string): string {
  return balances.find(b => sameDenom(b.denom, denom))?.amount || '0'
}

/**
 * Fetch INJ and USDC balances (base units) for an inj1 address.
 * USDC is Circle's native MultiVM USDC, so this equals its ERC-20 balance.
 */
export async function fetchBalance(address: string): Promise<BalanceState> {
  try {
    const balances = await fetchAllBalances(address)
    return {
      inj: balanceOf(balances, DENOMS.INJ),
      usdc: balanceOf(balances, DENOMS.USDC),
      loading: false,
    }
  } catch (error) {
    console.error('Failed to fetch balance:', error)
    return {
      inj: '0',
      usdc: '0',
      loading: false,
      error: 'Failed to fetch balance',
    }
  }
}

/**
 * The exact denom string to put in a bank message sent by `address`.
 *
 * Bank denoms are case-sensitive on chain, but the native USDC denom is
 * written both checksummed and lowercase in Injective's own references. Using
 * the spelling the chain reports for the sender's own balance guarantees the
 * message moves the coins the sender actually holds.
 */
export async function resolveHeldDenom(address: string, token: TokenInfo): Promise<string> {
  try {
    const held = (await fetchAllBalances(address)).find(b => sameDenom(b.denom, token.denom))
    return held?.denom ?? token.denom
  } catch {
    return token.denom
  }
}

/** NinjaPay's own cap on recipients per payroll run, to keep one transaction's gas and review list manageable. */
export const MAX_PAYROLL_RECIPIENTS = 50

/**
 * One MsgMultiSend paying every recipient from `sender`: one input carrying
 * the total and one output per recipient, all in `denom`. The bank module
 * applies it all or not at all.
 *
 * @param outputs inj1 addresses and amounts in base units
 */
export function buildPayrollMultiSend(sender: string, denom: string, outputs: PayrollOutput[]): MsgMultiSend {
  if (outputs.length === 0) throw new Error('Add at least one recipient.')
  if (outputs.length > MAX_PAYROLL_RECIPIENTS) {
    throw new Error(`A payroll run can pay up to ${MAX_PAYROLL_RECIPIENTS} recipients. Split it into smaller runs.`)
  }
  const amounts = outputs.map(o => BigInt(o.amount))
  if (amounts.some(a => a <= BigInt(0))) throw new Error('Every amount must be greater than zero.')
  const total = amounts.reduce((sum, a) => sum + a, BigInt(0))
  return MsgMultiSend.fromJSON({
    inputs: [{ address: sender, coins: [{ denom, amount: total.toString() }] }],
    outputs: outputs.map((o, i) => ({ address: o.address, coins: [{ denom, amount: amounts[i].toString() }] })),
  })
}
