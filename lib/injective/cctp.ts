/**
 * Circle CCTP V2 on Injective: the route that would carry USDC from a
 * NinjaPay user to a licensed payout partner on another chain.
 *
 * Not wired to any page. Paying out naira is the partner's business alone,
 * and there is no partner yet. When there is one, the user signs an ERC-20
 * approve for TokenMessengerV2 and then `depositForBurn` toward the
 * partner's address, and the app must describe it as "you send USDC to the
 * partner", never as a NinjaPay settlement.
 *
 * Injective is CCTP domain 29 on both networks. It supports only standard
 * messages (a finality threshold above 1000), which attest in about a second
 * because Injective blocks are final at once.
 *
 * Sources (checked 2026-10-01):
 * - Domain and contract addresses: https://docs.injective.network/developers-defi/usdc-stablecoin
 * - depositForBurn arguments and finality: https://docs.injective.network/developers-defi/usdc-cctp-tutorial
 * - Signature: circlefin/evm-cctp-contracts, src/v2/TokenMessengerV2.sol
 */

import { padHex, parseAbi, type Address } from 'viem'
import { IS_MAINNET } from './network'
import { USDC } from './tokens'

/** Injective's CCTP domain, the same on mainnet and testnet. */
export const INJECTIVE_CCTP_DOMAIN = 29

const CONTRACTS = {
  mainnet: {
    tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
    tokenMinter: '0xfd78EE919681417d192449715b2594ab58f5D002',
    message: '0xec546b6B005471ECf012e5aF77FBeC07e0FD8f78',
  },
  testnet: {
    tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    tokenMinter: '0xb43db544E2c27092c107639Ad201b3dEfAbcF192',
    message: '0xbaC0179bB358A8936169a63408C8481D582390C4',
  },
} as const satisfies Record<'mainnet' | 'testnet', Record<string, Address>>

/** CCTP V2 contracts on the network NinjaPay runs on. */
export const CCTP = CONTRACTS[IS_MAINNET ? 'mainnet' : 'testnet']

/** The only kind of message Injective supports: standard, final at once. */
export const STANDARD_FINALITY = 2000

export const TOKEN_MESSENGER_ABI = parseAbi([
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)',
])

const ANY_CALLER = padHex('0x', { size: 32 })

/**
 * The contract call that burns `amountBase` USDC on Injective so it can be
 * minted to `recipient` on `destinationDomain`. `recipient` is an EVM address;
 * CCTP takes it as 32 bytes. `maxFee` is the most USDC (base units) the user
 * agrees to pay Circle for relaying; the partner's flow decides it.
 */
export function depositForBurnCall({
  amountBase,
  destinationDomain,
  recipient,
  maxFee,
}: {
  amountBase: bigint
  destinationDomain: number
  recipient: Address
  maxFee: bigint
}) {
  if (amountBase <= BigInt(0)) throw new Error('Amount must be greater than zero.')
  if (destinationDomain === INJECTIVE_CCTP_DOMAIN) throw new Error('The destination must be another chain.')
  if (maxFee < BigInt(0) || maxFee >= amountBase) throw new Error('The relay fee must be less than the amount.')
  return {
    address: CCTP.tokenMessenger,
    abi: TOKEN_MESSENGER_ABI,
    functionName: 'depositForBurn' as const,
    args: [
      amountBase,
      destinationDomain,
      padHex(recipient, { size: 32 }),
      USDC.evmAddress!,
      ANY_CALLER,
      maxFee,
      STANDARD_FINALITY,
    ] as const,
  }
}
