import { describe, expect, it } from 'vitest'
import { MsgSend } from '@injectivelabs/sdk-ts'
import { sendPayroll, signAndBroadcast } from '@/lib/injective/cosmos-transactions'
import { buildPayrollMultiSend } from '@/lib/injective/bank'
import { createEscrowKey } from '@/lib/injective/claim-escrow'
import { LINK_CANCELLED_MESSAGE, buildGrantMsgs, cancelMessages, payShareFromGrant, planGrant } from '@/lib/injective/claim-grant'
import { fetchApprovals } from '@/lib/injective/grants'
import { CHAIN_ID } from '@/lib/injective/network'
import { TEST_DENOM } from './local-chain-config'
import { INJ, balance, feeOf, fund, getAccount, getTx, newAccount, useEvmWallet } from './helpers'

type SignerInfo = { mode_info: { single: { mode: string } }; public_key: { '@type': string; key: string } }
const signerInfoOf = async (hash: string) =>
  ((await getTx(hash)).tx.auth_info as unknown as { signer_infos: SignerInfo[] }).signer_infos[0]

describe('Cosmos messages signed by an EVM wallet over EIP-712, on a local chain', () => {
  it("pays a payroll from an EVM wallet's first Cosmos transaction, then signs again with the key the chain now holds", async () => {
    const employer = newAccount()
    await fund([employer], BigInt(20) * INJ)
    // Funded, so the account exists, but it has never signed: the chain has no public key for it.
    expect((await getAccount(employer.inj)).pub_key).toBeNull()

    const wallet = useEvmWallet(employer)
    const staff = [newAccount(), newAccount()]
    const before = await balance(employer.inj)
    const hash = await sendPayroll(
      [
        { address: staff[0].inj, amount: '1.25' },
        { address: staff[1].evm, amount: '2' },
      ],
      'INJ',
      'October salaries',
      CHAIN_ID,
      wallet.signer,
    )

    expect(wallet.signed).toHaveLength(1)
    // The wallet is asked to sign for Injective's EVM chain id, and sees the payroll it signs.
    expect(wallet.signed[0].domain.chainId).toBe('0x59f')
    expect(JSON.parse(wallet.signed[0].message.msgs)[0]).toMatchObject({
      '@type': '/cosmos.bank.v1beta1.MsgMultiSend',
      outputs: [{ address: staff[0].inj }, { address: staff[1].inj }],
    })
    expect(JSON.parse(wallet.signed[0].message.context)).toMatchObject({ chain_id: CHAIN_ID, memo: 'October salaries' })

    expect(await balance(staff[0].inj)).toBe(BigInt('1250000000000000000'))
    expect(await balance(staff[1].inj)).toBe(BigInt(2) * INJ)
    const tx = await getTx(hash)
    expect(tx.tx_response.code).toBe(0)
    expect(tx.tx.body.memo).toBe('October salaries')
    expect(await balance(employer.inj)).toBe(before - BigInt('3250000000000000000') - feeOf(tx))

    const info = await signerInfoOf(hash)
    expect(info.mode_info.single.mode).toBe('SIGN_MODE_EIP712_V2')
    // The key recovered from the signature is now the account's key on chain.
    expect((await getAccount(employer.inj)).pub_key).toEqual(info.public_key)

    const second = await signAndBroadcast(
      MsgSend.fromJSON({ srcInjectiveAddress: employer.inj, dstInjectiveAddress: staff[0].inj, amount: { denom: 'inj', amount: '1' } }),
      CHAIN_ID,
      '',
      wallet.signer,
    )
    expect((await getTx(second)).tx_response.code).toBe(0)
    expect(await balance(staff[0].inj)).toBe(BigInt('1250000000000000001'))
  })

  it('opens and cancels a claim link from an EVM wallet, and the link pays out in between', async () => {
    const creator = newAccount()
    await fund([creator], BigInt(10) * INJ)
    const wallet = useEvmWallet(creator)
    const link = createEscrowKey()
    const plan = planGrant('INJ', '2', 2, 7)

    await signAndBroadcast(buildGrantMsgs(creator.inj, link.address, plan), CHAIN_ID, '', wallet.signer)
    const claimer = newAccount()
    await payShareFromGrant(link.privateKeyHex, creator.inj, claimer.inj, 'INJ', plan.shares[0].toString())
    expect(await balance(claimer.inj)).toBe(plan.shares[0])

    const cancel = cancelMessages((await fetchApprovals(creator.inj)).given, link.address)
    await signAndBroadcast(cancel, CHAIN_ID, '', wallet.signer)
    expect(wallet.signed).toHaveLength(2)
    expect(await fetchApprovals(creator.inj)).toEqual({ given: [], received: [] })
    await expect(
      payShareFromGrant(link.privateKeyHex, creator.inj, newAccount().inj, 'INJ', plan.shares[1].toString()),
    ).rejects.toThrow(LINK_CANCELLED_MESSAGE)
  })

  it('stops before the wallet opens when the chain would refuse the messages', async () => {
    const employer = newAccount()
    await fund([employer], BigInt(5) * INJ)
    await fund([employer], BigInt(100), TEST_DENOM)
    const wallet = useEvmWallet(employer)
    const injBefore = await balance(employer.inj)

    const msg = buildPayrollMultiSend(employer.inj, TEST_DENOM, [{ address: newAccount().inj, amount: '101' }])
    await expect(signAndBroadcast(msg, CHAIN_ID, '', wallet.signer)).rejects.toThrow("This account doesn't hold enough of that token")
    expect(wallet.signed).toHaveLength(0)
    expect(await balance(employer.inj)).toBe(injBefore)
  })

  it('refuses a signature from a different account than the one connected, before broadcasting', async () => {
    const connected = newAccount()
    const other = newAccount()
    await fund([connected, other], BigInt(5) * INJ)
    const wallet = useEvmWallet(connected, other)
    const before = await Promise.all([balance(connected.inj), balance(other.inj)])

    await expect(
      signAndBroadcast(
        MsgSend.fromJSON({ srcInjectiveAddress: connected.inj, dstInjectiveAddress: newAccount().inj, amount: { denom: 'inj', amount: '1' } }),
        CHAIN_ID,
        '',
        wallet.signer,
      ),
    ).rejects.toThrow(/Your wallet signed with a different account than 0x/)
    expect(wallet.signed).toHaveLength(1)
    expect(await Promise.all([balance(connected.inj), balance(other.inj)])).toEqual(before)
  })
})
