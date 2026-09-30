/**
 * Cosmos Transactions Manager
 *
 * Handles transaction preparation, signing, and broadcasting on Injective
 * Supports Keplr and Leap wallets with proper message encoding
 */

import {
  MsgSend,
  BaseAccount,
  ChainRestAuthApi,
  ChainRestTendermintApi,
  TxRestApi,
  createTransaction,
  getTxRawFromTxRawOrDirectSignResponse,
  type Msgs,
} from '@injectivelabs/sdk-ts'
import { getNetworkEndpoints } from '@injectivelabs/networks'
import { getStdFee, DEFAULT_BLOCK_TIMEOUT_HEIGHT } from '@injectivelabs/utils'
import { NETWORK, CHAIN_ID, DENOMS } from './constants'

const endpoints = getNetworkEndpoints(NETWORK)

/**
 * Convert a human-readable amount ("1.5") to base units ("1500000" for 6 decimals).
 * String-based, so there is no floating-point rounding. Throws instead of
 * silently truncating when the amount has more decimals than the token supports.
 */
export function toChainAmount(amount: string, decimals: number = 18): string {
  const trimmed = amount.trim()
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    throw new Error(`Invalid amount "${amount}"`)
  }
  const [wholePart = '', fracPart = ''] = trimmed.split('.')
  if (fracPart.length > decimals) {
    throw new Error(`Amount has more than ${decimals} decimal places`)
  }
  const result = (wholePart + fracPart.padEnd(decimals, '0')).replace(/^0+(?=\d)/, '')
  return result === '' ? '0' : result
}

interface TransactionOptions {
  memo?: string
}

/**
 * Check if Keplr is available
 */
export function isKeplrAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).keplr
}

/**
 * Check if Leap is available
 */
export function isLeapAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).leap
}

/**
 * Initialize Keplr wallet connection
 */
export async function initializeKeplr(chainId: string = CHAIN_ID): Promise<boolean> {
  try {
    if (!isKeplrAvailable()) {
      throw new Error('Keplr extension not installed')
    }

    await (window as any).keplr.enable(chainId)
    return true
  } catch (error) {
    console.error('Failed to initialize Keplr:', error)
    throw error
  }
}

/**
 * Initialize Leap wallet connection
 */
export async function initializeLeap(chainId: string = CHAIN_ID): Promise<boolean> {
  try {
    if (!isLeapAvailable()) {
      throw new Error('Leap extension not installed')
    }

    await (window as any).leap.enable(chainId)
    return true
  } catch (error) {
    console.error('Failed to initialize Leap:', error)
    throw error
  }
}

/**
 * Get user's Injective address from connected wallet (Keplr or Leap)
 */
export async function getUserAddress(chainId: string = CHAIN_ID): Promise<string> {
  try {
    // Try Keplr first
    if (isKeplrAvailable()) {
      try {
        await (window as any).keplr.enable(chainId)
        const key = await (window as any).keplr.getKey(chainId)
        return key.bech32Address
      } catch (err) {
        console.warn('Keplr failed:', err)
      }
    }

    // Fall back to Leap
    if (isLeapAvailable()) {
      await (window as any).leap.enable(chainId)
      const key = await (window as any).leap.getKey(chainId)
      return key.bech32Address
    }

    throw new Error('No Web3 wallet available. Please install Keplr or Leap.')
  } catch (error) {
    console.error('Failed to get user address:', error)
    throw error
  }
}

/** The injected Keplr or Leap provider (both expose the same Keplr API). */
function getCosmosWallet(): { name: 'Keplr' | 'Leap'; provider: any } {
  if (isKeplrAvailable()) return { name: 'Keplr', provider: (window as any).keplr }
  if (isLeapAvailable()) return { name: 'Leap', provider: (window as any).leap }
  throw new Error('No Web3 wallet available. Please install Keplr or Leap.')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary)
}

// Fallback gas limits if simulation is unavailable (e.g. first-ever tx from an account).
const FALLBACK_GAS = { base: 150_000, perMsg: 50_000 }
const GAS_BUFFER = 1.3

/**
 * Build, sign (SIGN_MODE_DIRECT via Keplr/Leap), simulate, and broadcast a
 * Cosmos transaction on Injective. Resolves with the tx hash once the tx is
 * included in a block; rejects if the wallet refuses or the chain rejects it.
 */
export async function signAndBroadcast(
  msgs: Msgs | Msgs[],
  chainId: string = CHAIN_ID,
  memo = '',
): Promise<string> {
  const wallet = getCosmosWallet()
  const { provider } = wallet
  await provider.enable(chainId)
  const key = await provider.getKey(chainId)

  if (key.isNanoLedger) {
    // Injective + Ledger needs EIP-712 (amino) signing, which this path does not implement yet.
    throw new Error(`Ledger accounts in ${wallet.name} are not supported yet. Use a software account.`)
  }

  const address = key.bech32Address
  const pubKey = toBase64(key.pubKey)

  const [accountResponse, latestBlock] = await Promise.all([
    new ChainRestAuthApi(endpoints.rest).fetchAccount(address).catch((error: unknown) => {
      // The chain only creates an account once it has received funds.
      if (String((error as Error)?.message ?? error).includes('not found')) {
        throw new Error(
          `Your ${wallet.name} account ${address} has no INJ on Injective testnet yet. ` +
            'Get some from https://testnet.faucet.injective.network/ and try again.'
        )
      }
      throw error
    }),
    new ChainRestTendermintApi(endpoints.rest).fetchLatestBlock(),
  ])
  const account = BaseAccount.fromRestApi(accountResponse).toAccountDetails()
  const timeoutHeight = Number(latestBlock.header.height) + DEFAULT_BLOCK_TIMEOUT_HEIGHT
  const msgCount = Array.isArray(msgs) ? msgs.length : 1
  const txApi = new TxRestApi(endpoints.rest)

  const build = (gas: number) =>
    createTransaction({
      message: msgs,
      memo,
      fee: getStdFee({ gas: gas.toString() }),
      pubKey,
      sequence: account.sequence,
      accountNumber: account.accountNumber,
      chainId,
      timeoutHeight,
    })

  // Simulate with an empty signature to size the gas limit.
  let gas = FALLBACK_GAS.base + FALLBACK_GAS.perMsg * msgCount
  try {
    const { txRaw } = build(gas)
    txRaw.signatures = [new Uint8Array(0)]
    const { gasInfo } = await txApi.simulate(txRaw)
    gas = Math.ceil(Number(gasInfo.gasUsed) * GAS_BUFFER)
  } catch (error) {
    console.warn('Gas simulation failed, using fallback gas limit:', error)
  }

  const { signDoc } = build(gas)
  const signResponse = await provider.getOfflineSigner(chainId).signDirect(address, signDoc)
  const txRaw = getTxRawFromTxRawOrDirectSignResponse(signResponse)

  const result = await txApi.broadcast(txRaw)
  if (result.code !== 0) {
    throw new Error(result.rawLog || `Transaction failed with code ${result.code}`)
  }
  return result.txHash
}

/**
 * Send INJ or USDC via Keplr or Leap.
 *
 * @param amount human-readable amount (e.g. "1.5"). Converted to base units
 *               here, exactly once. Do not pass base units.
 */
export async function sendToken(
  recipientAddress: string,
  amount: string,
  chainId: string = CHAIN_ID,
  token: 'INJ' | 'USDC' = 'INJ',
  options?: Partial<TransactionOptions>,
): Promise<string> {
  try {
    if (!recipientAddress.startsWith('inj1') || recipientAddress.length < 40) {
      throw new Error('Invalid Injective address. Must start with "inj1"')
    }

    const decimals = token === 'USDC' ? 6 : 18
    const chainAmount = toChainAmount(amount, decimals)
    if (chainAmount === '0') {
      throw new Error('Amount must be greater than zero')
    }

    const sender = await getUserAddress(chainId)
    const msgSend = MsgSend.fromJSON({
      srcInjectiveAddress: sender,
      dstInjectiveAddress: recipientAddress,
      amount: {
        denom: token === 'USDC' ? DENOMS.USDC : DENOMS.INJ,
        amount: chainAmount,
      },
    })

    return await signAndBroadcast(msgSend, chainId, options?.memo)
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to send token'
    console.error(`sendToken error for ${token}:`, error)
    throw new Error(`Failed to send ${token}: ${errorMessage}`)
  }
}


/**
 * Check if user is using Ledger with wallet (Keplr or Leap)
 */
export async function isUserUsingLedger(chainId: string = CHAIN_ID): Promise<boolean> {
  try {
    if (isKeplrAvailable()) {
      await (window as any).keplr.enable(chainId)
      const key = await (window as any).keplr.getKey(chainId)
      if ((key as any).isLedger) return true
    }

    if (isLeapAvailable()) {
      await (window as any).leap.enable(chainId)
      const key = await (window as any).leap.getKey(chainId)
      if ((key as any).isLedger) return true
    }

    return false
  } catch (error) {
    console.warn('Error checking Ledger status:', error)
    return false
  }
}

/**
 * Request account connection from wallet (Keplr preferred, Leap fallback)
 */
export async function requestConnection(chainId: string = CHAIN_ID): Promise<string> {
  try {
    // Try Keplr first
    if (isKeplrAvailable()) {
      try {
        await initializeKeplr(chainId)
        return await getUserAddress(chainId)
      } catch (err) {
        console.warn('Keplr connection failed, trying Leap:', err)
      }
    }

    // Try Leap
    if (isLeapAvailable()) {
      try {
        await initializeLeap(chainId)
        return await getUserAddress(chainId)
      } catch (err) {
        console.warn('Leap connection failed:', err)
      }
    }

    throw new Error('No Web3 wallet available. Please install Keplr or Leap.')
  } catch (error) {
    console.error('Failed to connect wallet:', error)
    throw error
  }
}
