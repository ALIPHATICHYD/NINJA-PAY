import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { LOCAL_CHAIN } from './tests/e2e/local-chain-config'

/**
 * End-to-end tests against a local Injective chain: `npm run test:e2e`.
 * tests/e2e/local-chain.ts starts the chain before the tests and stops it after.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    globalSetup: ['tests/e2e/local-chain.ts'],
    // One funding account signs for every file, so files run one at a time.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    env: {
      NEXT_PUBLIC_INJECTIVE_NETWORK: 'testnet',
      NEXT_PUBLIC_INJECTIVE_REST: LOCAL_CHAIN.api,
      NEXT_PUBLIC_INJECTIVE_GRPC: LOCAL_CHAIN.api,
      NEXT_PUBLIC_INJECTIVE_EVM_RPC: LOCAL_CHAIN.evmRpc,
      NEXT_PUBLIC_INJECTIVE_EVM_WS: LOCAL_CHAIN.evmWs,
      // A local chain has no indexer or explorer. Point them somewhere that refuses at once.
      NEXT_PUBLIC_INJECTIVE_INDEXER: 'http://127.0.0.1:9',
      NEXT_PUBLIC_INJECTIVE_EXPLORER: 'http://127.0.0.1:9',
    },
  },
})
