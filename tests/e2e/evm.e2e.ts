import { describe, expect, it } from 'vitest'
import { createPublicClient, createWalletClient, getAddress, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ENDPOINTS, INJECTIVE_EVM } from '@/lib/injective/network'
import { EVM_TRANSFER_GAS, GAS_PRICE, networkFee } from '@/lib/injective/fees'
import { fetchReceipt } from '@/lib/injective/receipt'
import { INJ, balance, fund, newAccount, type TestAccount } from './helpers'

const transport = http(ENDPOINTS.evmRpc)
const chain = createPublicClient({ chain: INJECTIVE_EVM, transport })
const walletOf = (account: TestAccount) =>
  createWalletClient({ account: privateKeyToAccount(`0x${account.key}`), chain: INJECTIVE_EVM, transport })

describe('sending INJ from an EVM wallet on a local chain', () => {
  it('charges exactly the fee Send quotes, and lands in the same account on the Cosmos side', async () => {
    const sender = newAccount()
    await fund([sender], BigInt(10) * INJ)
    const recipient = newAccount()
    const value = BigInt('1250000000000000000')

    // What Send quotes and then asks the wallet for.
    const gas = await chain.estimateGas({ account: sender.evm, to: recipient.evm, value: BigInt(0) })
    const gasPrice = await chain.getGasPrice()
    const quoted = networkFee(gas, gasPrice)
    expect([gas, gasPrice]).toEqual([EVM_TRANSFER_GAS, GAS_PRICE])

    // Send passes the quoted price as the cap and leaves the gas limit to the wallet.
    const hash = await walletOf(sender).sendTransaction({ to: recipient.evm, value, maxFeePerGas: gasPrice, maxPriorityFeePerGas: BigInt(0) })
    const receipt = await chain.waitForTransactionReceipt({ hash })

    expect(receipt.status).toBe('success')
    // One account, two address forms: the bank module sees the transfer under inj1.
    expect(await balance(recipient.inj)).toBe(value)
    expect(await balance(sender.inj)).toBe(BigInt(10) * INJ - value - quoted)

    const read = await fetchReceipt(hash)
    expect(read).toMatchObject({ status: 'confirmed', block: receipt.blockNumber.toString() })
    expect(read?.transfers.map(t => [getAddress(t.from), getAddress(t.to), t.coin.denom, t.coin.amountBase])).toEqual([
      [getAddress(sender.evm), getAddress(recipient.evm), 'inj', value.toString()],
    ])
    expect(read?.fee?.amountBase).toBe(quoted.toString())
  })

  it('charges a higher fee cap in full, and the receipt shows what was charged', async () => {
    const sender = newAccount()
    await fund([sender], BigInt(10) * INJ)

    // Left to itself, viem sets the cap at 1.2x the price. Injective charges the cap and refunds nothing.
    const hash = await walletOf(sender).sendTransaction({ to: newAccount().evm, value: BigInt(1) })
    const [sent, receipt] = await Promise.all([chain.getTransaction({ hash }), chain.waitForTransactionReceipt({ hash })])
    const charged = BigInt(10) * INJ - BigInt(1) - (await balance(sender.inj))

    expect(sent.maxFeePerGas).toBeGreaterThan(receipt.effectiveGasPrice)
    expect(charged).toBe(sent.gas * sent.maxFeePerGas!)
    expect(charged).toBeGreaterThan(receipt.gasUsed * receipt.effectiveGasPrice)
    expect((await fetchReceipt(hash))?.fee?.amountBase).toBe(charged.toString())
  })
})
