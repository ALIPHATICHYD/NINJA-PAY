/**
 * Cosmos Transactions Manager
 *
 * Handles transaction preparation, signing, and broadcasting on Injective.
 * Keplr and Leap sign natively (SIGN_MODE_DIRECT). An EVM wallet such as
 * MetaMask signs the same messages as EIP-712 typed data
 * (SIGN_MODE_EIP712_V2), which injective-core verifies against its own
 * rendering of the transaction.
 *
 * Sources for the EIP-712 path (checked 2026-10-01):
 * - https://docs.injective.network/developers-native/transactions/ethereum
 *   (eth_signTypedData_v4, recovering the public key from the signature)
 * - injective-core v1.20.3: injective-chain/app/ante/eip712.go and
 *   eip712_cosmos.go (WrapTxToEIP712V2), ante.go (the Web3 extension route)
 */

import {
  MsgSend,
  BaseAccount,
  ChainRestAuthApi,
  ChainRestTendermintApi,
  TxRestApi,
  PublicKey,
  SIGN_EIP712_V2,
  createTransaction,
  createTxRawEIP712,
  createWeb3Extension,
  getEip712TypedDataV2,
  getTxRawFromTxRawOrDirectSignResponse,
  hexToBase64,
  hexToUint8Array,
  recoverTypedSignaturePubKey,
  type Msgs,
} from '@injectivelabs/sdk-ts'
import type { EvmChainId } from '@injectivelabs/ts-types'
import { getStdFee } from '@injectivelabs/utils'
import { CHAIN_ID } from './constants'
import { ENDPOINTS, FAUCETS, INJECTIVE_EVM, NETWORK_LABEL } from './network'
import { TOKENS } from './tokens'
import { balanceOf, buildPayrollMultiSend, fetchAllBalances, resolveHeldDenom } from './bank'
import { checkFee, feeShortfallMessage, injSpentBy, networkFee } from './fees'
import { gasPriceFor, readFeeMarket } from './gas-price'
import {
  HOOK_RESTRICTION_MESSAGE,
  describeExecutionFailure,
  describeTransferError,
  errorMessage,
  isExecutionFailure,
  isHookOutOfGas,
  isHookRestriction,
} from './transfer-errors'
import { shortAddress, toInjectiveAddress } from './address'
import { toChainAmount } from '../money'

const endpoints = ENDPOINTS

/**
 * Who signs a Cosmos transaction.
 * - keplr: Keplr or Leap, whichever is installed (Keplr first).
 * - evm: an EVM wallet such as MetaMask. `signTypedData` gets the typed data
 *   as JSON, the way eth_signTypedData_v4 takes it, and returns the 65-byte
 *   signature as hex. The wallet must be on Injective's EVM network, since
 *   wallets refuse typed data for another chain id.
 */
export type EvmCosmosSigner = { kind: 'evm'; address: string; signTypedData: (typedDataJson: string) => Promise<string> }
export type CosmosSigner = { kind: 'keplr' } | EvmCosmosSigner

export const KEPLR: CosmosSigner = { kind: 'keplr' }

/** The inj1 account a signer signs for. Asks Keplr or Leap to connect if needed. */
export async function signerAddress(signer: CosmosSigner, chainId: string = CHAIN_ID): Promise<string> {
  if (signer.kind === 'keplr') return getUserAddress(chainId)
  const address = toInjectiveAddress(signer.address)
  if (!address) throw new Error("Your EVM wallet gave an address NinjaPay can't read.")
  return address
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
// Gas multiplier for the one retry after USDC's compliance hook runs out of gas.
const HOOK_RETRY_FACTOR = 2
// Blocks the transaction stays valid for while the wallet is open. sdk-ts 1.20
// lowered its default from 120 to 60 blocks, under a minute on Injective,
// which is short for someone checking a payroll in Keplr. Keep 120.
const SIGNING_TIMEOUT_BLOCKS = 120

// Stands in for the account's public key while simulating, when neither the
// chain nor the wallet has revealed it yet (an EVM wallet that has never signed
// a Cosmos transaction). Simulation doesn't check it against the account, and
// the simulated transaction is never signed or broadcast. It is secp256k1's
// generator point, a valid key chosen only because it's well known.
const SIMULATION_PUBKEY = 'Anm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeY'

/**
 * Build, simulate, sign and broadcast a Cosmos transaction on Injective.
 * Keplr or Leap sign SIGN_MODE_DIRECT; an EVM wallet signs EIP-712 typed
 * data. Resolves with the tx hash once the tx is included in a block; rejects
 * if the wallet refuses or the chain rejects it.
 *
 * The fee uses the gas price Injective requires at that moment (see
 * gas-price.ts). Before the wallet's signing window opens, it checks that the
 * account holds enough INJ for the simulated fee plus any INJ the messages
 * send, and rejects with a plain explanation if not.
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
  signer: CosmosSigner = KEPLR,
): Promise<string> {
  try {
    return await signAndBroadcastOnce(msgs, chainId, memo, GAS_BUFFER, signer)
  } catch (error) {
    if (!isHookOutOfGas(errorMessage(error))) throw readable(error)
  }
  try {
    return await signAndBroadcastOnce(msgs, chainId, memo, GAS_BUFFER * HOOK_RETRY_FACTOR, signer)
  } catch (error) {
    throw readable(error)
  }
}

function readable(error: unknown): Error {
  const message = errorMessage(error)
  const described = describeTransferError(message)
  return described === message && error instanceof Error ? error : new Error(described)
}

type Signing = {
  /** How errors name the wallet's account. */
  name: string
  address: string
  /** The account's public key as base64, or null until a signature reveals it. */
  pubKey: string | null
}

async function connectSigner(
  signer: CosmosSigner,
  chainId: string,
): Promise<Signing & { provider?: ReturnType<typeof getCosmosWallet>['provider'] }> {
  if (signer.kind === 'evm') return { name: 'EVM wallet', address: await signerAddress(signer, chainId), pubKey: null }

  const wallet = getCosmosWallet()
  const { provider } = wallet
  await provider.enable(chainId)
  const key = await provider.getKey(chainId)
  if (key.isNanoLedger) {
    // Injective + Ledger in Keplr needs Keplr's own EIP-712 flow (experimentalSignEIP712CosmosTx_v0,
    // per Injective's "Ledger through Keplr" guide), which this path doesn't implement.
    throw new Error(
      `Ledger accounts in ${wallet.name} are not supported yet. Use a software account, or connect the Ledger through an EVM wallet such as MetaMask.`,
    )
  }
  return { name: wallet.name, address: key.bech32Address, pubKey: toBase64(key.pubKey), provider }
}

async function signAndBroadcastOnce(
  msgs: Msgs | Msgs[],
  chainId: string,
  memo: string,
  gasBuffer: number,
  signer: CosmosSigner,
): Promise<string> {
  const wallet = await connectSigner(signer, chainId)
  const { address } = wallet
  const eip712 = signer.kind === 'evm'

  const [accountResponse, latestBlock, feeMarket] = await Promise.all([
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
    // Read fresh for every transaction: the price can rise while blocks are busy.
    readFeeMarket(),
  ])
  const account = BaseAccount.fromRestApi(accountResponse).toAccountDetails()
  // Keplr reports the key itself. An EVM wallet doesn't, so use the one the
  // chain stored at the account's first Cosmos transaction, if any.
  const knownPubKey = wallet.pubKey ?? (account.pubKey.key || null)
  const timeoutHeight = Number(latestBlock.header.height) + SIGNING_TIMEOUT_BLOCKS
  // A MsgMultiSend pays every output, so the fallback counts those.
  const msgCount = (Array.isArray(msgs) ? msgs : [msgs]).reduce((count, msg) => {
    const data = msg.toData() as { '@type'?: string; outputs?: unknown[] }
    return count + (data['@type'] === '/cosmos.bank.v1beta1.MsgMultiSend' ? Math.max(data.outputs?.length ?? 1, 1) : 1)
  }, 0)
  const txApi = new TxRestApi(endpoints.rest)
  const evmChainId = INJECTIVE_EVM.id as EvmChainId
  const feeFor = (gas: number) => getStdFee({ gas: gas.toString(), gasPrice: gasPriceFor(feeMarket, BigInt(gas)).toString() })

  const build = (gas: number, pubKey: string) => {
    const tx = createTransaction({
      message: msgs,
      memo,
      fee: feeFor(gas),
      pubKey,
      sequence: account.sequence,
      accountNumber: account.accountNumber,
      chainId,
      timeoutHeight,
      ...(eip712 && { signMode: SIGN_EIP712_V2 }),
    })
    // The Web3 extension routes the transaction to the chain's EIP-712 check.
    if (eip712) createTxRawEIP712(tx.txRaw, createWeb3Extension({ evmChainId }))
    return tx
  }

  // Simulate with an empty signature to size the gas limit.
  const fallbackGas = FALLBACK_GAS.base + FALLBACK_GAS.perMsg * msgCount
  let gas = Math.ceil(fallbackGas * (gasBuffer / GAS_BUFFER))
  try {
    const { txRaw } = build(fallbackGas, knownPubKey ?? SIMULATION_PUBKEY)
    txRaw.signatures = [new Uint8Array(0)]
    const { gasInfo } = await txApi.simulate(txRaw)
    gas = Math.ceil(Number(gasInfo.gasUsed) * gasBuffer)
  } catch (error) {
    // A real restriction shows up in simulation: stop before the wallet opens.
    if (isHookRestriction(errorMessage(error))) throw new Error(HOOK_RESTRICTION_MESSAGE)
    // So does any other refusal of the messages. Signing it anyway would only cost the fee.
    if (isExecutionFailure(errorMessage(error))) throw new Error(describeExecutionFailure(errorMessage(error)))
    console.warn('Gas simulation failed, using fallback gas limit:', error)
  }

  // Fees are paid in INJ, even for USDC. Check now rather than let the chain reject it.
  const injBalance = await fetchAllBalances(address)
    .then(balances => BigInt(balanceOf(balances, 'inj')))
    .catch(() => null) // If the balance can't be read, let the chain decide.
  if (injBalance !== null) {
    const injSpend = injSpentBy(msgs, address)
    const check = checkFee(injBalance, networkFee(BigInt(gas), gasPriceFor(feeMarket, BigInt(gas))), injSpend)
    if (!check.ok) throw new Error(feeShortfallMessage(check, injSpend > BigInt(0)))
  }

  let txRaw
  if (signer.kind === 'evm') {
    // What the wallet shows and signs. injective-core renders the same
    // transaction the same way and checks the signature against it.
    const typedData = getEip712TypedDataV2({
      msgs,
      tx: {
        accountNumber: account.accountNumber.toString(),
        sequence: account.sequence.toString(),
        timeoutHeight: timeoutHeight.toString(),
        chainId,
        memo,
      },
      fee: feeFor(gas),
      evmChainId,
    })
    const signature = await signer.signTypedData(JSON.stringify(typedData))
    // Recover the key that signed: it proves which account signed, and an
    // account's first Cosmos transaction must carry its key.
    // (sdk-ts builds the domain's chain id as hex, where its own type wants a number.)
    const signedBy = hexToBase64(
      await recoverTypedSignaturePubKey(typedData as unknown as Parameters<typeof recoverTypedSignaturePubKey>[0], signature),
    )
    if (PublicKey.fromBase64(signedBy).toAddress().toBech32() !== address) {
      throw new Error(
        `Your wallet signed with a different account than ${shortAddress(signer.address)}. Switch back to that account and try again.`,
      )
    }
    txRaw = build(gas, signedBy).txRaw
    txRaw.signatures = [hexToUint8Array(signature)]
  } else {
    const { signDoc } = build(gas, knownPubKey!)
    const signResponse = await wallet.provider.getOfflineSigner(chainId).signDirect(address, signDoc)
    txRaw = getTxRawFromTxRawOrDirectSignResponse(signResponse)
  }

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
 * Pay several recipients in one MsgMultiSend: one signature, one fee, and
 * either every recipient is paid or none is. Signed with Keplr or Leap, or
 * with an EVM wallet when `signer` is one.
 *
 * @param recipients inj1 or 0x addresses with human-readable amounts, each
 *                   converted to base units here exactly once
 */
export async function sendPayroll(
  recipients: { address: string; amount: string }[],
  token: 'INJ' | 'USDC',
  memo = '',
  chainId: string = CHAIN_ID,
  signer: CosmosSigner = KEPLR,
): Promise<string> {
  const outputs = recipients.map(({ address, amount }, i) => {
    const recipient = toInjectiveAddress(address)
    if (!recipient) throw new Error(`Recipient ${i + 1} isn't a valid inj1… or 0x… address.`)
    return { address: recipient, amount: toChainAmount(amount, TOKENS[token].decimals) }
  })
  const sender = await signerAddress(signer, chainId)
  const msg = buildPayrollMultiSend(sender, await resolveHeldDenom(sender, TOKENS[token]), outputs)
  return signAndBroadcast(msg, chainId, memo, signer)
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
