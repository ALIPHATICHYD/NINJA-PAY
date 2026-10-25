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
import { createConnector } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { hostWallet, isMobileDevice, keplrBrowserLink, walletEvmProvider, type HostWallet } from '@/lib/wallet-browser'

type CreateWalletFn = WalletList[number]['wallets'][number]

const svg = (body: string) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`,
)}`

const ICONS: Record<HostWallet, string> = {
  keplr: svg(
    '<defs><linearGradient id="k" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1fd1ff"/><stop offset="1" stop-color="#7a2bf9"/></linearGradient></defs>'
      + '<rect width="64" height="64" rx="14" fill="url(#k)"/>'
      + '<path d="M22 16h7v14l12-14h9L36 31.5 51 48h-9.5L29 33.5V48h-7z" fill="#fff"/>',
  ),
  leap: svg(
    '<rect width="64" height="64" rx="14" fill="#32da6d"/>'
      + '<circle cx="22" cy="24" r="8" fill="#fff"/><circle cx="42" cy="24" r="8" fill="#fff"/>'
      + '<circle cx="22" cy="24" r="3.5" fill="#0f2316"/><circle cx="42" cy="24" r="3.5" fill="#0f2316"/>'
      + '<path d="M14 38c5 8 31 8 36 0" stroke="#0f2316" stroke-width="4" fill="none" stroke-linecap="round"/>',
  ),
}

const DETAILS: Record<HostWallet, Pick<Wallet, 'name' | 'iconBackground' | 'downloadUrls'>> = {
  keplr: {
    name: 'Keplr',
    iconBackground: '#3b82f6',
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
    iconBackground: '#32da6d',
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
      installed: !!provider || opensInKeplr,
      // Inside one wallet's browser, the other can't be reached.
      hidden: () => {
        const host = hostWallet()
        return host !== null && host !== id
      },
      createConnector: (walletDetails) => createConnector((config) => {
        const base = injected({
          target: () => ({ id, name, provider: () => walletEvmProvider(id) as never }),
        })(config)
        return {
          ...base,
          ...walletDetails,
          // RainbowKit reads the chain before connecting; without a provider that would throw
          // before connect() could open Keplr or explain what's missing.
          getChainId: async function (this: unknown) {
            return walletEvmProvider(id) ? base.getChainId.call(this) : config.chains[0].id
          },
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
            return base.connect.call(this, params)
          } as typeof base.connect,
        }
      }),
    }
  }
}

export const keplrWallet = cosmosEvmWallet('keplr')
export const leapWallet = cosmosEvmWallet('leap')

/**
 * Hides a wallet inside Keplr's or Leap's browser unless it is injected there too (MetaMask,
 * Phantom). Otherwise it would be reached through a WalletConnect or app link, which those
 * browsers can't open.
 */
export function outsideWalletBrowsers(wallet: CreateWalletFn): CreateWalletFn {
  return (params) => {
    const created = wallet(params)
    return {
      ...created,
      hidden: () => (created.hidden?.() ?? false) || (hostWallet() !== null && created.installed !== true),
    }
  }
}

/** Hides a wallet inside Keplr's or Leap's browser: it is never injected there (Base Account, Safe, WalletConnect). */
export function hiddenInWalletBrowsers(wallet: CreateWalletFn): CreateWalletFn {
  return (params) => {
    const created = wallet(params)
    return { ...created, hidden: () => (created.hidden?.() ?? false) || hostWallet() !== null }
  }
}
