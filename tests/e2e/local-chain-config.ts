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

/** A token besides INJ, held by the funding account, for tests where INJ would be caught by NinjaPay's own fee check first. */
export const TEST_DENOM = 'ninjapaytest'
