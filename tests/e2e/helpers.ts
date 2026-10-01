/**
 * Accounts, funding and chain reads for the end-to-end tests.
 *
 * Assertions read the chain's REST API directly rather than through
 * NinjaPay's own reading code, so a bug there can't hide a wrong result.
 */

import { randomBytes } from 'node:crypto'
import { afterEach, inject } from 'vitest'
import { MsgBroadcasterWithPk, MsgMultiSend, PrivateKey } from '@injectivelabs/sdk-ts'
import { InjectiveDirectEthSecp256k1Wallet } from '@injectivelabs/sdk-ts/cosmjs'
import { privateKeyToAccount } from 'viem/accounts'
import type { CosmosSigner } from '@/lib/injective/cosmos-transactions'
import { NETWORK } from '@/lib/injective/network'
import { LOCAL_CHAIN } from './local-chain-config'

export const INJ = BigInt(10) ** BigInt(18)

export type TestAccount = { key: string; inj: string; evm: `0x${string}` }

/** A fresh account that has never been used on the chain. */
export function newAccount(): TestAccount {
  const key = randomBytes(32).toString('hex')
  const privateKey = PrivateKey.fromHex(key)
  return { key, inj: privateKey.toBech32(), evm: privateKey.toAddress().toHex() as `0x${string}` }
}

/** Sends each account `amount` of `denom` from the funding account, in one transaction. */
export async function fund(accounts: TestAccount[], amount: bigint, denom = 'inj'): Promise<void> {
  const funder = PrivateKey.fromHex(inject('funderKey'))
  const broadcaster = new MsgBroadcasterWithPk({
    network: NETWORK,
    endpoints: { grpc: LOCAL_CHAIN.api, rest: LOCAL_CHAIN.api, indexer: LOCAL_CHAIN.api },
    privateKey: funder,
    simulateTx: true,
  })
  const coins = [{ denom, amount: amount.toString() }]
  await broadcaster.broadcast({
    msgs: MsgMultiSend.fromJSON({
      inputs: [{ address: funder.toBech32(), coins: [{ denom, amount: (amount * BigInt(accounts.length)).toString() }] }],
      outputs: accounts.map(account => ({ address: account.inj, coins })),
    }),
  })
}

async function rest<T>(path: string): Promise<T> {
  const response = await fetch(`${LOCAL_CHAIN.api}${path}`)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`)
  return response.json() as Promise<T>
}

/** The bank balance of `denom` for an inj1 address, in base units. */
export async function balance(address: string, denom = 'inj'): Promise<bigint> {
  const { balance } = await rest<{ balance?: { amount: string } }>(
    `/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${encodeURIComponent(denom)}`,
  )
  return BigInt(balance?.amount ?? '0')
}

export type ChainTx = {
  tx: { body: { memo: string; messages: Record<string, unknown>[] }; auth_info: { fee: { amount: { denom: string; amount: string }[]; gas_limit: string } } }
  tx_response: { code: number; gas_used: string; gas_wanted: string }
}

/** A Cosmos transaction as the chain stored it. */
export const getTx = (hash: string) => rest<ChainTx>(`/cosmos/tx/v1beta1/txs/${hash}`)

/** The INJ fee a Cosmos transaction paid. */
export const feeOf = (tx: ChainTx) =>
  tx.tx.auth_info.fee.amount.filter(c => c.denom === 'inj').reduce((sum, c) => sum + BigInt(c.amount), BigInt(0))

/**
 * Puts a stand-in for Keplr on `window` that signs with `account`'s key, the
 * way Keplr signs SIGN_MODE_DIRECT for an Injective account. NinjaPay's own
 * signing code then runs unchanged. Removed after each test.
 */
export async function useKeplr(account: TestAccount): Promise<{ signatures: () => number }> {
  const signer = await InjectiveDirectEthSecp256k1Wallet.fromKey(Buffer.from(account.key, 'hex'))
  const [{ address, pubkey }] = await signer.getAccounts()
  let signatures = 0
  const keplr = {
    enable: async () => {},
    getKey: async () => ({ bech32Address: address, pubKey: pubkey, isNanoLedger: false }),
    getOfflineSigner: () => ({
      signDirect: (signerAddress: string, signDoc: Parameters<typeof signer.signDirect>[1]) => {
        signatures++
        return signer.signDirect(signerAddress, signDoc)
      },
    }),
  }
  ;(globalThis as { window?: unknown }).window = { keplr }
  return { signatures: () => signatures }
}

/**
 * An EVM wallet such as MetaMask, holding `account`: it signs typed data with
 * the account's key the way a wallet answers eth_signTypedData_v4.
 * `signWith` signs with another key instead, like a wallet switched to a
 * different account after connecting.
 */
export function useEvmWallet(account: TestAccount, signWith: TestAccount = account) {
  const key = privateKeyToAccount(`0x${signWith.key}`)
  const signed: { domain: { chainId: string }; message: { context: string; msgs: string } }[] = []
  const signer: CosmosSigner = {
    kind: 'evm',
    address: account.evm,
    signTypedData: async json => {
      const typedData = JSON.parse(json)
      signed.push(typedData)
      return key.signTypedData(typedData)
    },
  }
  return { signer, signed }
}

/** An account as the chain stores it, with its public key once it has signed. */
export const getAccount = (address: string) =>
  rest<{ account: { base_account?: { pub_key: { '@type': string; key: string } | null } } }>(
    `/cosmos/auth/v1beta1/accounts/${address}`,
  ).then(({ account }) => account.base_account ?? (account as { pub_key: { '@type': string; key: string } | null }))

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})
