/**
 * The gas price Injective accepts right now, for Cosmos transactions: Keplr
 * and Leap, EVM wallets signing over EIP-712, payroll, and claim links.
 *
 * The txfees module sets it. Its min_gas_price parameter (160,000,000inj per
 * unit of gas at launch) is the floor, and governance can change it. Governance
 * can also turn on an EIP-1559-style base fee (mempool1559_enabled) that rises
 * by up to 6% a block while blocks are busy, up to 1,000 times the floor. A
 * transaction is then accepted only if it pays at least the higher of the two.
 * The EVM's eth_gasPrice follows the same rule, which is how MetaMask sends
 * already pay the live price.
 *
 * Sources:
 * - injective-core v1.20.3: injective-chain/modules/txfees/keeper/feedecorator.go
 *   (the fee check), keeper/mempool-1559/feestate.go (base fee limits) and
 *   modules/evm/rpc/backend/call_tx.go (eth_gasPrice)
 * - Injective's white paper (2026-10-07), section 4.3:
 *   https://injective.com/Injective-A-Finance-Native-Layer-1-Blockchain.pdf
 */

import { ENDPOINTS } from './network'
import { GAS_PRICE } from './fees'

/** What the txfees module says about fees, as integers in inj base units per unit of gas. */
export type FeeMarket = {
  minGasPrice: bigint
  /** Transactions asking for this much gas or more pay at least `minGasPriceForHighGas`. */
  highGasThreshold: bigint
  minGasPriceForHighGas: bigint
  /** The current base fee, or null while the adaptive fee market is off. */
  baseFee: bigint | null
}

/** Injective's launch values, for when the chain can't be read. The chain still decides. */
export const FLOOR_FEE_MARKET: FeeMarket = {
  minGasPrice: GAS_PRICE,
  highGasThreshold: BigInt(25_000_000),
  minGasPriceForHighGas: BigInt(0),
  baseFee: null,
}

/**
 * Margin on the base fee for the time between reading it and the chain
 * checking the transaction: 12.5% covers two blocks of its fastest rise.
 */
const BASE_FEE_HEADROOM = { numerator: BigInt(9), denominator: BigInt(8) }

/** A chain decimal such as "160000000.000000000000000000", rounded up to a whole number. */
export function decimalToBigIntCeil(value: string): bigint {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value.trim())
  if (!match) throw new Error(`Not a decimal: ${value}`)
  const whole = BigInt(match[1])
  return /[1-9]/.test(match[2] ?? '') ? whole + BigInt(1) : whole
}

const max = (a: bigint, b: bigint) => (a > b ? a : b)

/** The gas price to pay for a transaction asking for `gas`, given the fee market. */
export function gasPriceFor(market: FeeMarket, gas: bigint = BigInt(0)): bigint {
  let price = market.minGasPrice
  if (gas >= market.highGasThreshold) price = max(price, market.minGasPriceForHighGas)
  if (market.baseFee !== null) {
    const withHeadroom = (market.baseFee * BASE_FEE_HEADROOM.numerator + BASE_FEE_HEADROOM.denominator - BigInt(1)) / BASE_FEE_HEADROOM.denominator
    price = max(price, withHeadroom)
  }
  return price
}

type ParamsResponse = {
  params?: {
    mempool1559_enabled?: boolean
    min_gas_price?: string
    high_gas_tx_threshold?: string
    min_gas_price_for_high_gas_tx?: string
  }
}
type BaseFeeResponse = { base_fee?: { base_fee?: string } }

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return (await response.json()) as T
}

/** Read the fee market from Injective's REST API. Throws if it can't be read. */
export async function fetchFeeMarket(rest: string = ENDPOINTS.rest): Promise<FeeMarket> {
  const { params } = await getJson<ParamsResponse>(`${rest}/injective/txfees/v1beta1/params`)
  if (!params?.min_gas_price) throw new Error('The chain returned no txfees parameters.')
  let baseFee: bigint | null = null
  if (params.mempool1559_enabled) {
    const { base_fee: reply } = await getJson<BaseFeeResponse>(`${rest}/injective/txfees/v1beta1/cur_eip_base_fee`)
    if (!reply?.base_fee) throw new Error('The chain returned no base fee.')
    baseFee = decimalToBigIntCeil(reply.base_fee)
  }
  return {
    minGasPrice: decimalToBigIntCeil(params.min_gas_price),
    highGasThreshold: BigInt(params.high_gas_tx_threshold ?? FLOOR_FEE_MARKET.highGasThreshold),
    minGasPriceForHighGas: decimalToBigIntCeil(params.min_gas_price_for_high_gas_tx ?? '0'),
    baseFee,
  }
}

/** The fee market, or the launch values if the chain can't be read (the chain then decides). */
export async function readFeeMarket(): Promise<FeeMarket> {
  return fetchFeeMarket().catch(error => {
    console.warn('Could not read the gas price from Injective, using the minimum:', error)
    return FLOOR_FEE_MARKET
  })
}

/** The gas price to pay right now for a transaction asking for `gas`. */
export async function fetchGasPrice(gas: bigint | number = 0): Promise<bigint> {
  return gasPriceFor(await readFeeMarket(), BigInt(gas))
}
