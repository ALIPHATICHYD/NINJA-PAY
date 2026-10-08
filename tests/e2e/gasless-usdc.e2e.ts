import { beforeAll, describe, expect, it } from 'vitest'
import { createPublicClient, createWalletClient, getAddress, http, type Abi, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ENDPOINTS, INJECTIVE_EVM } from '@/lib/injective/network'
import { fetchReceipt } from '@/lib/injective/receipt'
import { newTransferAuthorization, transferAuthorizationTypedDataJson } from '@/lib/injective/usdc-authorization'
import { RELAY_MESSAGES, relayTransfer, type RelayBackend } from '@/lib/injective/usdc-relay'
import { INJ, balance, fund, newAccount, type TestAccount } from './helpers'
import token from './fixtures/eip3009-test-token.json'

// Circle's USDC isn't on a local chain, so these tests deploy a stand-in with
// the same EIP-712 domain and EIP-3009 methods (fixtures/Eip3009TestToken.sol).
const transport = http(ENDPOINTS.evmRpc)
const chain = createPublicClient({ chain: INJECTIVE_EVM, transport })
const keyOf = (account: TestAccount) => privateKeyToAccount(`0x${account.key}`)
const abi = token.abi as Abi
const USDC_UNIT = BigInt(1_000_000)
// viem leaves gas to eth_fillTransaction, which Injective estimates against
// block 0, where the token doesn't exist yet: it returns 21,000-odd gas and
// the call runs out. So calls here, like the relay, set gas themselves.
// Source: injective-core v1.20.3, modules/evm/rpc/backend/call_tx.go (SetTxDefaults).
const MINT_GAS = BigInt(150_000)

let usdc: Address
let relayerAccount: TestAccount
let relayer: RelayBackend

const usdcBalance = (address: Address) => chain.readContract({ address: usdc, abi, functionName: 'balanceOf', args: [address] }) as Promise<bigint>

/** What Send asks the wallet to sign, signed the way MetaMask answers eth_signTypedData_v4. */
async function sign(payer: TestAccount, to: Address, value: bigint) {
  const auth = newTransferAuthorization(payer.evm, to, value)
  const signature = await keyOf(payer).signTypedData(JSON.parse(transferAuthorizationTypedDataJson(auth, INJECTIVE_EVM.id, usdc)))
  return { auth, signature: signature as Hex }
}

beforeAll(async () => {
  const deployer = newAccount()
  relayerAccount = newAccount()
  await fund([deployer, relayerAccount], BigInt(2) * INJ)
  relayer = { kind: 'relayer', privateKey: `0x${relayerAccount.key}` }

  const wallet = createWalletClient({ account: keyOf(deployer), chain: INJECTIVE_EVM, transport })
  const deployed = await chain.waitForTransactionReceipt({ hash: await wallet.deployContract({ abi, bytecode: token.bytecode as Hex }) })
  usdc = getAddress(deployed.contractAddress!)
})

describe('sending USDC without INJ on a local chain', () => {
  it("moves the signed USDC from the payer's wallet, with NinjaPay's wallet paying the gas", async () => {
    const payer = newAccount()
    const recipient = newAccount()
    const minter = createWalletClient({ account: keyOf(relayerAccount), chain: INJECTIVE_EVM, transport })
    await chain.waitForTransactionReceipt({
      hash: await minter.writeContract({ address: usdc, abi, functionName: 'mint', args: [payer.evm, BigInt(5) * USDC_UNIT], gas: MINT_GAS }),
    })
    const relayerInjBefore = await balance(relayerAccount.inj)

    const { auth, signature } = await sign(payer, recipient.evm, BigInt(2_500_000))
    const outcome = await relayTransfer(auth, signature, { backend: relayer, usdc })

    expect(outcome.status).toBe('CONFIRMED')
    const hash = (outcome as { hash: Hex }).hash
    expect([await usdcBalance(payer.evm), await usdcBalance(recipient.evm)]).toEqual([BigInt(2_500_000), BigInt(2_500_000)])
    // The payer never had INJ and still doesn't: the relayer paid the whole fee, gas limit times fee cap.
    expect(await balance(payer.inj)).toBe(BigInt(0))
    const sent = await chain.getTransaction({ hash })
    expect(getAddress(sent.from)).toBe(getAddress(relayerAccount.evm))
    expect(relayerInjBefore - (await balance(relayerAccount.inj))).toBe(sent.gas * sent.maxFeePerGas!)

    // The receipt shows the USDC moving from the payer, and who paid the fee.
    const read = await fetchReceipt(hash)
    expect(read?.transfers.map(t => [getAddress(t.from), getAddress(t.to), t.coin.amountBase])).toEqual([
      [getAddress(payer.evm), getAddress(recipient.evm), '2500000'],
    ])
    expect(getAddress(read!.feePayer!)).toBe(getAddress(relayerAccount.evm))

    // The same signature can't be used again, and trying costs NinjaPay nothing.
    const afterFirst = await balance(relayerAccount.inj)
    expect(await relayTransfer(auth, signature, { backend: relayer, usdc })).toEqual({ status: 'REFUSED', message: RELAY_MESSAGES.used })
    expect(await balance(relayerAccount.inj)).toBe(afterFirst)
  })

  it('turns down, before paying any gas, a transfer the chain would reject or a payer who has INJ', async () => {
    const payer = newAccount()

    // No USDC to send.
    const empty = await sign(payer, newAccount().evm, USDC_UNIT)
    expect(await relayTransfer(empty.auth, empty.signature, { backend: relayer, usdc })).toEqual({ status: 'REFUSED', message: RELAY_MESSAGES.balance })

    // Enough INJ to pay the fee itself.
    await fund([payer], INJ)
    const minter = createWalletClient({ account: keyOf(relayerAccount), chain: INJECTIVE_EVM, transport })
    await chain.waitForTransactionReceipt({ hash: await minter.writeContract({ address: usdc, abi, functionName: 'mint', args: [payer.evm, USDC_UNIT], gas: MINT_GAS }) })
    const afterMint = await balance(relayerAccount.inj)
    const funded = await sign(payer, newAccount().evm, USDC_UNIT)
    expect(await relayTransfer(funded.auth, funded.signature, { backend: relayer, usdc })).toEqual({ status: 'REFUSED', message: RELAY_MESSAGES.hasInj })

    // Signed for a different contract.
    const elsewhere = newTransferAuthorization(payer.evm, newAccount().evm, USDC_UNIT)
    const wrongDomain = await keyOf(payer).signTypedData(JSON.parse(transferAuthorizationTypedDataJson(elsewhere, INJECTIVE_EVM.id, relayerAccount.evm)))
    expect(await relayTransfer(elsewhere, wrongDomain as Hex, { backend: relayer, usdc })).toEqual({ status: 'REFUSED', message: RELAY_MESSAGES.badSignature })

    // Correctly signed, but the token reverts it: the dry run catches that.
    const zero = await sign(payer, '0x0000000000000000000000000000000000000000', USDC_UNIT)
    expect(await relayTransfer(zero.auth, zero.signature, { backend: relayer, usdc })).toMatchObject({
      status: 'REFUSED',
      message: expect.stringContaining('transfer to the zero address'),
    })

    expect(await balance(relayerAccount.inj)).toBe(afterMint)
  })
})
