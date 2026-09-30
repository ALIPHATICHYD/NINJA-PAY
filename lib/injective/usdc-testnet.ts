/**
 * USDC Testnet Utilities
 * 
 * Handles USDC testnet token conversions, pricing, and transactions
 * Adapted from Neptune Service pattern for USDC on Injective testnet
 */

import { ENDPOINTS } from './network'
import { USDC } from './tokens'
import { getPrices } from '../prices'

const endpoints = ENDPOINTS

/**
 * Convert amount to chain format (multiply by 10^decimals)
 */
function toChainFormat(amount: number | string, decimals: number): string {
  const bnAmount = (typeof amount === 'string' ? parseFloat(amount) : amount)
  const multiplier = Math.pow(10, decimals)
  return Math.floor(bnAmount * multiplier).toString()
}

/**
 * Convert chain format to human readable (divide by 10^decimals)
 */
function fromChainFormat(chainAmount: string | number, decimals: number): string {
  const divisor = Math.pow(10, decimals)
  return (Number(chainAmount) / divisor).toString()
}

/**
 * USDC price in USD (shared, cached feed). Falls back to $1.
 */
export async function getUSDCPrice(): Promise<string> {
  const { usdcUsd } = await getPrices()
  return String(usdcUsd ?? 1)
}

/**
 * INJ price in USD, used as the INJ/USDC rate (shared, cached feed). "0" if unknown.
 */
export async function getINJUSDCPriceFromOrderbook(): Promise<string> {
  const { injUsd } = await getPrices()
  return String(injUsd ?? 0)
}

/** Same as getINJUSDCPriceFromOrderbook; kept for existing callers. */
export async function getINJUSDCPriceFromCoinGecko(): Promise<string> {
  return getINJUSDCPriceFromOrderbook()
}

/**
 * Convert Bank USDC amount to Wrapped USDC (nUSDC) equivalent
 */
export function convertBankUSDCToWrapped(
  bankAmount: string,
  conversionRatio: number = 1.0
): string {
  try {
    const amount = parseFloat(bankAmount)
    const wrapped = amount * conversionRatio
    return wrapped.toString()
  } catch (error) {
    console.error('Failed to convert bank USDC to wrapped:', error)
    return '0'
  }
}

/**
 * Convert Wrapped USDC (nUSDC) amount to Bank USDC equivalent
 */
export function convertWrappedUSDCToBank(
  wrappedAmount: string,
  conversionRatio: number = 1.0
): string {
  try {
    const amount = parseFloat(wrappedAmount)
    const bank = amount / conversionRatio
    return bank.toString()
  } catch (error) {
    console.error('Failed to convert wrapped to bank USDC:', error)
    return '0'
  }
}

/**
 * Convert USDC to NGN (Nigerian Naira)
 */
export function convertUSDCToNGN(
  usdcAmount: string,
  exchangeRate: number
): string {
  try {
    const amount = parseFloat(usdcAmount)
    const ngn = amount * exchangeRate
    return ngn.toFixed(2)
  } catch (error) {
    console.error('Failed to convert USDC to NGN:', error)
    return '0'
  }
}

/**
 * Convert NGN to USDC
 */
export function convertNGNToUSDC(
  ngnAmount: string,
  exchangeRate: number
): string {
  try {
    const amount = parseFloat(ngnAmount)
    const usdc = amount / exchangeRate
    return usdc.toFixed(USDC.decimals)
  } catch (error) {
    console.error('Failed to convert NGN to USDC:', error)
    return '0'
  }
}

/**
 * Convert INJ to USDC
 */
export async function convertINJToUSDC(injAmount: string): Promise<string> {
  try {
    const price = await getINJUSDCPriceFromOrderbook()
    const inj = parseFloat(injAmount)
    const rate = parseFloat(price)
    const usdc = (inj * rate).toFixed(USDC.decimals)
    return usdc
  } catch (error) {
    console.error('Failed to convert INJ to USDC:', error)
    return '0'
  }
}

/**
 * Convert USDC to INJ
 */
export async function convertUSDCToINJ(usdcAmount: string): Promise<string> {
  try {
    const price = await getINJUSDCPriceFromOrderbook()
    const usdc = parseFloat(usdcAmount)
    const rate = parseFloat(price)
    const inj = (usdc / rate).toFixed(18) // INJ has 18 decimals
    return inj
  } catch (error) {
    console.error('Failed to convert USDC to INJ:', error)
    return '0'
  }
}

/**
 * Format amount to appropriate decimal places for USDC
 * USDC has 6 decimals
 */
export function formatUSDC(amount: string | number, decimals: number = 6): string {
  try {
    const value = parseFloat(amount.toString())
    return value.toFixed(decimals)
  } catch (error) {
    console.error('Failed to format USDC amount:', error)
    return '0'
  }
}

/**
 * Convert human-readable USDC amount to chain format (smallest unit)
 * USDC has 6 decimals
 */
export function toUSDCChainFormat(amount: string): string {
  try {
    const value = parseFloat(amount)
    const factor = Math.pow(10, USDC.decimals)
    const result = value * factor
    return Math.floor(result).toString()
  } catch (error) {
    console.error('Failed to convert to chain format:', error)
    return '0'
  }
}

/**
 * Convert chain format USDC amount to human-readable
 */
export function fromUSDCChainFormat(chainAmount: string): string {
  try {
    const value = parseFloat(chainAmount)
    const factor = Math.pow(10, USDC.decimals)
    const result = value / factor
    return result.toFixed(USDC.decimals)
  } catch (error) {
    console.error('Failed to convert from chain format:', error)
    return '0'
  }
}

/**
 * Validate USDC amount
 */
export function isValidUSDCAmount(amount: string | number): boolean {
  try {
    const value = parseFloat(amount.toString())
    return !isNaN(value) && isFinite(value) && value > 0
  } catch {
    return false
  }
}

/**
 * Get redemption ratio for USDC conversions
 * For CCTP bridged USDC, this should be 1:1
 * But in case there are wrapped tokens, this can vary
 */
export async function getUSDCRedemptionRatio(): Promise<number> {
  // For now, assuming 1:1 ratio for CCTP USDC
  // This can be updated to fetch from chain if needed
  return 1.0
}
