import {
  ChainGrpcBankApi,
  MsgSend,
  MsgMultiSend,
} from '@injectivelabs/sdk-ts'
import { getNetworkEndpoints } from '@injectivelabs/networks'
import { BigNumberInBase } from '@injectivelabs/utils'
import { NETWORK, DENOMS } from './constants'
import { BalanceState, PayrollOutput } from './types'

const endpoints = getNetworkEndpoints(NETWORK)
const bankApi = new ChainGrpcBankApi(endpoints.grpc)

/**
 * Fetch INJ and USDT balances for an address
 */
export async function fetchBalance(address: string): Promise<BalanceState> {
  try {
    const balances = await bankApi.fetchBalances(address)

    const injBalance =
      balances.find((b) => b.denom === DENOMS.INJ)?.amount || '0'
    const usdtBalance =
      balances.find((b) => b.denom === DENOMS.USDT)?.amount || '0'

    return {
      inj: injBalance,
      usdt: usdtBalance,
      loading: false,
    }
  } catch (error) {
    console.error('Failed to fetch balance:', error)
    return {
      inj: '0',
      usdt: '0',
      loading: false,
      error: 'Failed to fetch balance',
    }
  }
}

/**
 * Create a MsgSend transaction to send INJ
 */
export function createMsgSendINJ(
  recipient: string,
  amountInWei: string
): MsgSend {
  return MsgSend.fromJSON({
    srcInjectiveAddress: '', // will be set by broadcaster
    dstInjectiveAddress: recipient,
    amount: {
      denom: DENOMS.INJ,
      amount: amountInWei,
    },
  })
}

/**
 * Create a MsgSend transaction to send USDT
 */
export function createMsgSendUSDT(
  recipient: string,
  amountInWei: string
): MsgSend {
  return MsgSend.fromJSON({
    srcInjectiveAddress: '', // will be set by broadcaster
    dstInjectiveAddress: recipient,
    amount: {
      denom: DENOMS.USDT,
      amount: amountInWei,
    },
  })
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

/**
 * Convert amount from human-readable format to Wei
 */
export function toWei(amount: string): string {
  return new BigNumberInBase(amount).toWei().toFixed()
}

/**
 * Convert amount from Wei to human-readable format
 */
export function fromWei(amountInWei: string): string {
  return new BigNumberInBase(amountInWei).toBase().toFixed()
}
