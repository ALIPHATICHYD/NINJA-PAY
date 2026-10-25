'use client'

/**
 * Keplr and Leap as RainbowKit wallets, through each wallet's own Ethereum provider.
 *
 * RainbowKit has no Keplr or Leap entry, and on a phone its connect modal lists only its own
 * wallets (it leaves out the EIP-6963 ones), so inside Keplr's or Leap's browser the wallet
 * hosting the page was never offered and every option tried to open another app. These
 * entries connect to the host wallet directly. See lib/wallet-browser.ts.
 */

import type { Wallet, WalletList } from '@rainbow-me/rainbowkit'
import { numberToHex } from 'viem'
import { createConnector } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { hostWallet, isMobileDevice, keplrBrowserLink, walletEvmProvider, type HostWallet } from '@/lib/wallet-browser'

type CreateWalletFn = WalletList[number]['wallets'][number]

// The wallets' own app icons (Keplr's from @web3icons/core, Leap's from @cosmos-kit/leap-extension).
const ICONS: Record<HostWallet, string> = {
  keplr: '/wallets/keplr.svg',
  leap: '/wallets/leap.svg',
}

/** How long a wallet has to answer a connection request before NinjaPay says so. */
const CONNECT_TIMEOUT_MS = 90_000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** How long a wallet has to answer a quick question (its chain) before NinjaPay says so. */
const ANSWER_TIMEOUT_MS = 15_000

/** RainbowKit's phone modal swallows connection errors, so say on a phone what went wrong. */
function report(name: string, error: unknown) {
  if (rejected(error) || !isMobileDevice()) return
  const e = error as { shortMessage?: string; message?: string } | undefined
  window.alert(`${name} couldn't connect: ${e?.shortMessage || e?.message || String(error)}`)
}

/** Whether the user turned the request down in the wallet (EIP-1193 code 4001), however wagmi wrapped it. */
function rejected(error: unknown): boolean {
  for (let e = error as { code?: number; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (e.code === 4001) return true
  }
  return false
}

const DETAILS: Record<HostWallet, Pick<Wallet, 'name' | 'iconBackground' | 'downloadUrls'>> = {
  keplr: {
    name: 'Keplr',
    iconBackground: '#14afeb',
    downloadUrls: {
      android: 'https://play.google.com/store/apps/details?id=com.chainapsis.keplr',
      ios: 'https://apps.apple.com/app/keplr-wallet/id1567851089',
      mobile: 'https://www.keplr.app/get',
      chrome: 'https://chromewebstore.google.com/detail/keplr/dmkamcknogkgcdfhhbddcghachkejeap',
      browserExtension: 'https://www.keplr.app/get',
    },
  },
  leap: {
    name: 'Leap',
    iconBackground: '#c5ffce',
    downloadUrls: {
      mobile: 'https://www.leapwallet.io/download',
      chrome: 'https://chromewebstore.google.com/detail/leap-cosmos-wallet/fcfcfllfndlomdhbehjjcoimbgofdncg',
      browserExtension: 'https://www.leapwallet.io/download',
    },
  },
}

function cosmosEvmWallet(id: HostWallet): CreateWalletFn {
  return () => {
    const { name } = DETAILS[id]
    const provider = walletEvmProvider(id)
    // On a phone outside Keplr's browser, Keplr's entry opens this page in Keplr's browser.
    // Leap publishes no such link, so on a phone Leap is listed only inside Leap.
    const opensInKeplr = id === 'keplr' && isMobileDevice() && !hostWallet()
    return {
      id,
      ...DETAILS[id],
      iconUrl: ICONS[id],
      // A wallet that isn't here isn't listed on a phone. Inside Leap's browser Leap also answers
      // to window.keplr, so Keplr is left out there. (A `hidden` check would move these entries
      // to the end of RainbowKit's list.)
      installed: (!!provider && hostWallet() !== (id === 'keplr' ? 'leap' : 'keplr')) || opensInKeplr,
      createConnector: (walletDetails) => createConnector((config) => {
        const base = injected({
          // wagmi's disconnect shim asks for wallet_requestPermissions on every connect. A wallet
          // browser that never answers it (Leap's, on the user's phone) left the button doing
          // nothing, so connect with eth_requestAccounts alone.
          shimDisconnect: false,
          target: () => ({ id, name, provider: () => walletEvmProvider(id) as never }),
        })(config)
        return {
          ...base,
          ...walletDetails,
          // RainbowKit reads the chain before connecting; without a provider that would throw
          // before connect() could open Keplr or explain what's missing.
          // A wallet that never answers would leave the button doing nothing, so give up and say so.
          getChainId: async function (this: unknown) {
            if (!walletEvmProvider(id)) return config.chains[0].id
            return withTimeout(base.getChainId.call(this), ANSWER_TIMEOUT_MS, `${name} didn't answer. Open ${name}, unlock it, and try again.`)
              .catch(error => { report(name, error); throw error })
          },
          // wagmi adds a chain only when the wallet answers code 4902, which Keplr doesn't, so the
          // account stayed on Keplr's own network ("Wrong Network"). Add Injective's EVM on any
          // refusal other than the user's, then switch again.
          switchChain: async function (this: unknown, params) {
            try {
              return await base.switchChain!.call(this, params)
            } catch (error) {
              const provider = walletEvmProvider(id)
              const chain = config.chains.find(c => c.id === params.chainId)
              if (rejected(error) || !provider || !chain) throw error
              await provider.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: numberToHex(chain.id),
                  chainName: chain.name,
                  nativeCurrency: chain.nativeCurrency,
                  rpcUrls: [chain.rpcUrls.default.http[0]],
                  blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
                }],
              })
              return base.switchChain!.call(this, params)
            }
          } as NonNullable<typeof base.switchChain>,
          connect: async function (this: unknown, params) {
            if (!walletEvmProvider(id)) {
              if (id === 'keplr' && isMobileDevice() && !hostWallet()) {
                window.location.href = keplrBrowserLink(window.location.href)
              } else if (hostWallet() === id) {
                // RainbowKit's phone modal shows no connection errors, so say it here.
                window.alert(`${name} didn't share an Ethereum account with this page. Update ${name}, or open NinjaPay in your phone's browser and connect another wallet.`)
              }
              throw new Error(`${name} isn't available in this browser.`)
            }
            try {
              return await withTimeout(
                base.connect.call(this, params),
                CONNECT_TIMEOUT_MS,
                `${name} didn't answer. Open ${name}, unlock it, and try again.`,
              )
            } catch (error) {
              report(name, error)
              throw error
            }
          } as typeof base.connect,
        }
      }),
    }
  }
}

export const keplrWallet = cosmosEvmWallet('keplr')
export const leapWallet = cosmosEvmWallet('leap')
