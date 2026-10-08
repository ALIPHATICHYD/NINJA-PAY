/**
 * Where the end-to-end tests' local Injective chain listens.
 *
 * The chain uses Injective testnet's identifiers (Cosmos chain id
 * injective-888, EVM chain id 1439), so NinjaPay's testnet configuration runs
 * unchanged and only the endpoints point at this machine. The ports are
 * offset from injectived's defaults so a node you already run isn't touched.
 */
export const LOCAL_CHAIN = {
  chainId: 'injective-888',
  evmChainId: '1439',
  /** REST, and gRPC-web on the same port, as the tests and the app see it. */
  api: 'http://127.0.0.1:21317',
  /** The node's own API server, behind the proxy in local-chain.ts. */
  nodeApi: 'http://127.0.0.1:21318',
  grpc: '127.0.0.1:29090',
  cometRpc: 'tcp://127.0.0.1:26757',
  p2p: 'tcp://127.0.0.1:26756',
  evmRpc: 'http://127.0.0.1:28545',
  evmWs: 'ws://127.0.0.1:28546',
}

/**
 * The chain's minimum gas price, in inj per unit of gas: twice injectived's
 * default of 160,000,000, with the adaptive base fee switched on. Governance
 * can do the same on mainnet, so any path that still paid the default price
 * would be turned away here.
 */
export const LOCAL_MIN_GAS_PRICE = BigInt(320_000_000)

/** A token besides INJ, held by the funding account, for tests where INJ would be caught by NinjaPay's own fee check first. */
export const TEST_DENOM = 'ninjapaytest'
