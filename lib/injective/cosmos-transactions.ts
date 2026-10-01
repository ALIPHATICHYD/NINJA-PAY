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
import { getStdFee, DEFAULT_BLOCK_TIMEOUT_HEIGHT } from '@injectivelabs/utils'
import { CHAIN_ID } from './constants'
import { ENDPOINTS, FAUCETS, NETWORK_LABEL } from './network'
import { TOKENS } from './tokens'
import { balanceOf, buildPayrollMultiSend, fetchAllBalances, resolveHeldDenom } from './bank'
import { checkFee, feeShortfallMessage, injSpentBy, networkFee } from './fees'
import { HOOK_RESTRICTION_MESSAGE, describeTransferError, errorMessage, isHookOutOfGas, isHookRestriction } from './transfer-errors'
import { toInjectiveAddress } from './address'
import { toChainAmount } from '../money'

const endpoints = ENDPOINTS

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
// Gas multiplier for the one retry after USDC's compliance hook runs out of gas.
const HOOK_RETRY_FACTOR = 2

/**
 * Build, sign (SIGN_MODE_DIRECT via Keplr/Leap), simulate, and broadcast a
 * Cosmos transaction on Injective. Resolves with the tx hash once the tx is
 * included in a block; rejects if the wallet refuses or the chain rejects it.
 *
 * Before the wallet's signing window opens, it checks that the account holds
 * enough INJ for the simulated fee plus any INJ the messages send, and
 * rejects with a plain explanation if not.
 *
 * USDC transfers run Circle's compliance hook. If the hook runs out of gas
 * (not a real restriction, per Injective's docs), the transaction is rebuilt
 * once with twice the gas and the wallet asks the user to sign again. A real
 * restriction is reported neutrally, without retrying.
 */
export async function signAndBroadcast(
  msgs: Msgs | Msgs[],
  chainId: string = CHAIN_ID,
  memo = '',
): Promise<string> {
  try {
    return await signAndBroadcastOnce(msgs, chainId, memo, GAS_BUFFER)
  } catch (error) {
    if (!isHookOutOfGas(errorMessage(error))) throw readable(error)
  }
  try {
    return await signAndBroadcastOnce(msgs, chainId, memo, GAS_BUFFER * HOOK_RETRY_FACTOR)
  } catch (error) {
    throw readable(error)
  }
}

function readable(error: unknown): Error {
  const message = errorMessage(error)
  const described = describeTransferError(message)
  return described === message && error instanceof Error ? error : new Error(described)
}

async function signAndBroadcastOnce(
  msgs: Msgs | Msgs[],
  chainId: string,
  memo: string,
  gasBuffer: number,
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
          `Your ${wallet.name} account ${address} has no INJ on ${NETWORK_LABEL} yet. ` +
            (FAUCETS ? `Get some from ${FAUCETS.inj} and try again.` : 'Fund it with INJ and try again.')
        )
      }
      throw error
    }),
    new ChainRestTendermintApi(endpoints.rest).fetchLatestBlock(),
  ])
  const account = BaseAccount.fromRestApi(accountResponse).toAccountDetails()
  const timeoutHeight = Number(latestBlock.header.height) + DEFAULT_BLOCK_TIMEOUT_HEIGHT
  // A MsgMultiSend pays every output, so the fallback counts those.
  const msgCount = (Array.isArray(msgs) ? msgs : [msgs]).reduce((count, msg) => {
    const data = msg.toData() as { '@type'?: string; outputs?: unknown[] }
    return count + (data['@type'] === '/cosmos.bank.v1beta1.MsgMultiSend' ? Math.max(data.outputs?.length ?? 1, 1) : 1)
  }, 0)
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
  const fallbackGas = FALLBACK_GAS.base + FALLBACK_GAS.perMsg * msgCount
  let gas = Math.ceil(fallbackGas * (gasBuffer / GAS_BUFFER))
  try {
    const { txRaw } = build(fallbackGas)
    txRaw.signatures = [new Uint8Array(0)]
    const { gasInfo } = await txApi.simulate(txRaw)
    gas = Math.ceil(Number(gasInfo.gasUsed) * gasBuffer)
  } catch (error) {
    // A real restriction shows up in simulation: stop before the wallet opens.
    if (isHookRestriction(errorMessage(error))) throw new Error(HOOK_RESTRICTION_MESSAGE)
    console.warn('Gas simulation failed, using fallback gas limit:', error)
  }

  // Fees are paid in INJ, even for USDC. Check now rather than let the chain reject it.
  const injBalance = await fetchAllBalances(address)
    .then(balances => BigInt(balanceOf(balances, 'inj')))
    .catch(() => null) // If the balance can't be read, let the chain decide.
  if (injBalance !== null) {
    const injSpend = injSpentBy(msgs, address)
    const check = checkFee(injBalance, networkFee(BigInt(gas)), injSpend)
    if (!check.ok) throw new Error(feeShortfallMessage(check, injSpend > BigInt(0)))
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
 * @param recipientAddress inj1 or 0x form of the recipient; both are the same account.
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
    const recipient = toInjectiveAddress(recipientAddress)
    if (!recipient) {
      throw new Error('Invalid recipient. Use an inj1… or 0x… address.')
    }

    const chainAmount = toChainAmount(amount, TOKENS[token].decimals)
    if (chainAmount === '0') {
      throw new Error('Amount must be greater than zero')
    }

    const sender = await getUserAddress(chainId)
    const msgSend = MsgSend.fromJSON({
      srcInjectiveAddress: sender,
      dstInjectiveAddress: recipient,
      amount: {
        denom: await resolveHeldDenom(sender, TOKENS[token]),
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
 * Pay several recipients in one MsgMultiSend signed with Keplr or Leap: one
 * signature, one fee, and either every recipient is paid or none is.
 *
 * @param recipients inj1 or 0x addresses with human-readable amounts, each
 *                   converted to base units here exactly once
 */
export async function sendPayroll(
  recipients: { address: string; amount: string }[],
  token: 'INJ' | 'USDC',
  memo = '',
  chainId: string = CHAIN_ID,
): Promise<string> {
  const outputs = recipients.map(({ address, amount }, i) => {
    const recipient = toInjectiveAddress(address)
    if (!recipient) throw new Error(`Recipient ${i + 1} isn't a valid inj1… or 0x… address.`)
    return { address: recipient, amount: toChainAmount(amount, TOKENS[token].decimals) }
  })
  const sender = await getUserAddress(chainId)
  const msg = buildPayrollMultiSend(sender, await resolveHeldDenom(sender, TOKENS[token]), outputs)
  return signAndBroadcast(msg, chainId, memo)
}

/**
 * Check if the connected Keplr or Leap account is a Ledger. Asks only the
 * wallet that signs (Keplr first, like signAndBroadcast), so a second
 * installed wallet never opens its own approval window.
 */
export async function isUserUsingLedger(chainId: string = CHAIN_ID): Promise<boolean> {
  try {
    const { provider } = getCosmosWallet()
    await provider.enable(chainId)
    const key = await provider.getKey(chainId)
    return !!key.isNanoLedger
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
