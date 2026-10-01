/**
 * Starts a throwaway single-validator Injective chain for the end-to-end
 * tests, and stops and deletes it when they finish.
 *
 * Needs an `injectived` binary built from Injective's chain source: set
 * INJECTIVED to its path, or put it on PATH. See "End-to-end tests" in the
 * README.
 *
 * Keys: the funding key is made fresh in memory for each run and reaches the
 * tests through Vitest's provide/inject. The validator's key sits in the
 * chain's temporary home, which is deleted with it. Nothing is written to the
 * repo, and no key is printed.
 *
 * The node's REST server answers a failed query with the gRPC error details
 * in a binary HTTP trailer. Browsers ignore trailers, but Node's fetch and
 * http refuse the whole response, so the tests would never see the chain's
 * error. A small proxy in front of the node passes responses through without
 * trailers, as a browser reads them.
 *
 * Genesis follows Injective's own local setup (setup.sh in
 * InjectiveFoundation/injective-core): INJ as the staking, mint, crisis and
 * gov denom. Gas prices are left at injectived's defaults, which match the
 * 160,000,000inj NinjaPay pays.
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { openSync, closeSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { TestProject } from 'vitest/node'
import { PrivateKey } from '@injectivelabs/sdk-ts'
import { LOCAL_CHAIN, TEST_DENOM } from './local-chain-config'

declare module 'vitest' {
  export interface ProvidedContext {
    /** Hex private key of the account that funds each test's accounts. */
    funderKey: string
  }
}

const run = promisify(execFile)
const INJ = BigInt(10) ** BigInt(18)
const START_TIMEOUT_MS = 90_000

const host = (url: string) => url.replace(/^https?:\/\//, '')

async function waitUntil(what: string, check: () => Promise<boolean>, node: ChildProcess, log: string) {
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (node.exitCode !== null) throw new Error(`injectived exited with code ${node.exitCode}. Its log:\n${await tail(log)}`)
    if (await check().catch(() => false)) return
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  throw new Error(`The local chain's ${what} didn't come up within ${START_TIMEOUT_MS / 1000}s. Its log:\n${await tail(log)}`)
}

/** Forwards every request to the node's API server and returns the response without HTTP trailers. */
function trailerFreeProxy(listen: string, upstream: string): Promise<Server> {
  const target = new URL(upstream)
  const server = createServer((incoming, outgoing) => {
    const forward = request(
      { host: target.hostname, port: target.port, path: incoming.url, method: incoming.method, headers: incoming.headers, insecureHTTPParser: true },
      response => {
        const chunks: Buffer[] = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => {
          const body = Buffer.concat(chunks)
          const headers = { ...response.headers }
          delete headers.trailer
          delete headers['transfer-encoding']
          outgoing.writeHead(response.statusCode ?? 502, { ...headers, 'content-length': body.length })
          outgoing.end(body)
        })
      },
    )
    forward.on('error', error => {
      outgoing.writeHead(502)
      outgoing.end(String(error))
    })
    incoming.pipe(forward)
  })
  const { hostname, port } = new URL(listen)
  return new Promise((resolve, reject) => server.once('error', reject).listen(Number(port), hostname, () => resolve(server)))
}

async function tail(file: string) {
  return (await readFile(file, 'utf8').catch(() => '')).split('\n').slice(-30).join('\n')
}

/** The parts of genesis.json the setup changes. */
type Genesis = {
  app_state: {
    staking: { params: { bond_denom: string } }
    mint: { params: { mint_denom: string } }
    crisis: { constant_fee: { denom: string } }
    gov: { params: Record<string, { denom: string }[]> }
    evm: { params: { chain_config: { eip155_chain_id: string } } }
  }
}

async function editGenesis(file: string, edit: (genesis: Genesis) => void) {
  const genesis = JSON.parse(await readFile(file, 'utf8')) as Genesis
  edit(genesis)
  await writeFile(file, JSON.stringify(genesis))
}

export default async function setup(project: TestProject) {
  const bin = process.env.INJECTIVED?.trim() || 'injectived'
  try {
    await run(bin, ['version'])
  } catch {
    throw new Error(
      `Couldn't run "${bin}". The end-to-end tests need injectived, built from Injective's chain source. ` +
        'Set INJECTIVED to its path; see "End-to-end tests" in the README.',
    )
  }

  const home = await mkdtemp(join(tmpdir(), 'ninjapay-e2e-'))
  const cli = (...args: string[]) => run(bin, [...args, '--home', home], { maxBuffer: 16 * 1024 * 1024 })
  const keyring = ['--keyring-backend', 'test']
  const chainId = ['--chain-id', LOCAL_CHAIN.chainId]

  await cli('init', 'ninjapay-e2e', ...chainId)
  await editGenesis(join(home, 'config', 'genesis.json'), genesis => {
    const state = genesis.app_state
    state.staking.params.bond_denom = 'inj'
    state.mint.params.mint_denom = 'inj'
    state.crisis.constant_fee.denom = 'inj'
    for (const key of ['min_deposit', 'expedited_min_deposit']) {
      for (const coin of state.gov.params[key]) coin.denom = 'inj'
    }
    state.evm.params.chain_config.eip155_chain_id = LOCAL_CHAIN.evmChainId
  })
  const config = join(home, 'config', 'config.toml')
  await writeFile(config, (await readFile(config, 'utf8')).replace(/^timeout_commit = ".*"$/m, 'timeout_commit = "1s"'))

  // The validator's key goes in the temporary home's test keyring; its output (with the mnemonic) is discarded.
  await cli('keys', 'add', 'validator', ...keyring, '--output', 'json')
  const validator = (await cli('keys', 'show', 'validator', '-a', ...keyring)).stdout.trim()
  const funderKey = randomBytes(32).toString('hex')
  const funder = PrivateKey.fromHex(funderKey)

  await cli('add-genesis-account', validator, `${BigInt(10_000) * INJ}inj`, ...chainId, ...keyring)
  await cli('add-genesis-account', funder.toBech32(), `${BigInt(1_000_000) * INJ}inj,${BigInt(10) ** BigInt(24)}${TEST_DENOM}`, ...chainId, ...keyring)
  await cli('genesis', 'gentx', 'validator', `${BigInt(1_000) * INJ}inj`, ...chainId, ...keyring)
  await cli('genesis', 'collect-gentxs')
  await cli('genesis', 'validate')

  const log = join(home, 'node.log')
  const out = openSync(log, 'a')
  const node = spawn(
    bin,
    [
      'start',
      '--home', home,
      '--api.enable', '--api.address', `tcp://${host(LOCAL_CHAIN.nodeApi)}`, '--api.enabled-unsafe-cors',
      '--grpc.enable', '--grpc.address', LOCAL_CHAIN.grpc, '--grpc-web.enable',
      '--rpc.laddr', LOCAL_CHAIN.cometRpc, '--p2p.laddr', LOCAL_CHAIN.p2p,
      '--json-rpc.enable', '--json-rpc.address', host(LOCAL_CHAIN.evmRpc),
      '--json-rpc.ws-address', LOCAL_CHAIN.evmWs.replace(/^ws:\/\//, ''), '--json-rpc.api', 'eth,net,web3',
    ],
    { stdio: ['ignore', out, out] },
  )
  closeSync(out)
  const proxy = await trailerFreeProxy(LOCAL_CHAIN.api, LOCAL_CHAIN.nodeApi)

  const stop = async () => {
    await new Promise(resolve => proxy.close(resolve))
    if (node.exitCode === null) {
      const exited = new Promise(resolve => node.once('exit', resolve))
      node.kill('SIGTERM')
      const timer = setTimeout(() => node.kill('SIGKILL'), 10_000)
      await exited
      clearTimeout(timer)
    }
    await rm(home, { recursive: true, force: true })
  }

  try {
    await waitUntil('REST API', async () => {
      const response = await fetch(`${LOCAL_CHAIN.api}/cosmos/base/tendermint/v1beta1/blocks/latest`)
      const block = (await response.json()) as { block?: { header?: { height?: string } } }
      return Number(block.block?.header?.height ?? 0) >= 2
    }, node, log)
    await waitUntil('EVM JSON-RPC', async () => {
      const response = await fetch(LOCAL_CHAIN.evmRpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      })
      return Number((await response.json()).result) === Number(LOCAL_CHAIN.evmChainId)
    }, node, log)
  } catch (error) {
    await stop()
    throw error
  }

  project.provide('funderKey', funderKey)
  return stop
}
