/**
 * Network fees, which are always paid in INJ, even when the transfer is USDC.
 *
 * fee = gas × gas price. Validators' minimum gas price is 160,000,000inj per
 * unit of gas (0.16 nINJ), and the EVM uses the same price. A plain INJ
 * transfer on the EVM costs 21,000 gas.
 *
 * Sources (checked 2026-09-30):
 * - https://docs.injective.network/defi/transaction-fees
 * - https://docs.injective.network/developers-evm/evm-equivalence
 */

import { DEFAULT_GAS_PRICE } from '@injectivelabs/utils'
import type { Msgs } from '@injectivelabs/sdk-ts'
import { formatBaseUnits } from '../money'
import { FAUCETS } from './network'
import { INJ } from './tokens'

/** Minimum gas price in inj base units per unit of gas. */
export const GAS_PRICE = BigInt(DEFAULT_GAS_PRICE)

/** Gas for a plain INJ transfer on Injective's EVM. */
export const EVM_TRANSFER_GAS = BigInt(21_000)

/**
 * Gas assumed for a USDC transfer on the EVM until the wallet's estimate
 * arrives. Every USDC transfer also runs Circle's compliance hook, so it
 * costs well over a plain transfer.
 */
export const EVM_TOKEN_TRANSFER_GAS = BigInt(200_000)

/**
 * Gas limit sent with a USDC transfer: the estimate plus 30%, the same
 * margin signAndBroadcast adds. If the compliance hook runs out of gas the
 * transfer fails, and the docs' fix is a higher limit.
 */
export function withGasHeadroom(gas: bigint): bigint {
  return (gas * BigInt(13)) / BigInt(10)
}

/**
 * Gas assumed for one Cosmos bank transfer before the wallet is connected and
 * the transaction can be simulated. Matches signAndBroadcast's fallback.
 */
export const COSMOS_SEND_GAS = BigInt(200_000)

/** "Max" keeps back this many times the estimated fee, so a small change in gas still fits. */
const FEE_HEADROOM = BigInt(2)

export function networkFee(gas: bigint, gasPrice: bigint = GAS_PRICE): bigint {
  return gas * gasPrice
}

export type FeeCheck =
  | { ok: true }
  | { ok: false; needed: bigint; available: bigint }

/** Whether `injBalance` covers the fee plus any INJ the transaction sends. */
export function checkFee(injBalance: bigint, fee: bigint, injSpend: bigint = BigInt(0)): FeeCheck {
  const needed = fee + injSpend
  return injBalance >= needed ? { ok: true } : { ok: false, needed, available: injBalance }
}

/** The most INJ that can be sent while leaving room for the fee. */
export function maxInjAfterFee(injBalance: bigint, fee: bigint): bigint {
  const max = injBalance - fee * FEE_HEADROOM
  return max > BigInt(0) ? max : BigInt(0)
}

/** A fee in INJ for display, e.g. "0.0000336". Cut, never rounded, past 8 decimals. */
export function formatFee(fee: bigint): string {
  const text = formatBaseUnits(fee, INJ.decimals, 8)
  return text === '0' && fee > BigInt(0) ? '< 0.00000001' : text
}

/** Plain-language explanation for a failed fee check. */
export function feeShortfallMessage(check: Extract<FeeCheck, { ok: false }>, sendingInj: boolean): string {
  const needed = formatFee(check.needed)
  const available = formatFee(check.available)
  const first = sendingInj
    ? `You need about ${needed} INJ for this amount plus the network fee, but this account has ${available} INJ.`
    : `Network fees are paid in INJ, even for USDC. You need about ${needed} INJ, but this account has ${available} INJ.`
  return FAUCETS ? `${first} Get test INJ at ${FAUCETS.inj}` : first
}

type CoinData = { denom: string; amount: string }
type BankMsgData = {
  '@type'?: string
  fromAddress?: string
  amount?: CoinData[]
  inputs?: { address: string; coins: CoinData[] }[]
}

/**
 * INJ that bank messages move out of `sender` (not counting the fee). Only
 * MsgSend and MsgMultiSend are counted; other messages add nothing.
 */
export function injSpentBy(msgs: Msgs | Msgs[], sender: string): bigint {
  const list = Array.isArray(msgs) ? msgs : [msgs]
  const sumInj = (coins: CoinData[] = []) =>
    coins.filter(c => c.denom === INJ.denom).reduce((total, c) => total + BigInt(c.amount), BigInt(0))

  return list.reduce((total, msg) => {
    const data = msg.toData() as BankMsgData
    if (data['@type'] === '/cosmos.bank.v1beta1.MsgSend' && data.fromAddress === sender) {
      return total + sumInj(data.amount)
    }
    if (data['@type'] === '/cosmos.bank.v1beta1.MsgMultiSend') {
      return total + (data.inputs ?? []).filter(i => i.address === sender).reduce((t, i) => t + sumInj(i.coins), BigInt(0))
    }
    return total
  }, BigInt(0))
}
