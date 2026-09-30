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

/**
 * Create a MsgMultiSend transaction for batch payroll
 */
export function createMsgMultiSendPayroll(
  totalAmount: string,
  outputs: PayrollOutput[]
): MsgMultiSend {
  return MsgMultiSend.fromJSON({
    inputs: [
      {
        address: '', // will be set by broadcaster
        coins: [
          {
            denom: DENOMS.INJ,
            amount: totalAmount,
          },
        ],
      },
    ],
    outputs: outputs.map((output) => ({
      address: output.address,
      coins: [
        {
          denom: DENOMS.INJ,
          amount: output.amount,
        },
      ],
    })),
  })
}
