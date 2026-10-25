/**
 * Keplr's and Leap's in-app browsers.
 *
 * A page opened inside Keplr or Leap on a phone runs in the wallet's own web view. The wallet
 * is already there (window.keplr, window.leap, and their Ethereum providers), but the web view
 * can't open another app's link: WalletConnect and MetaMask links such as keplrwallet://wcV2/…
 * fail with net::ERR_UNKNOWN_URL_SCHEME. So inside those browsers NinjaPay connects to the
 * wallet that hosts the page and hides the wallets that would have to leave it.
 */

export type HostWallet = 'keplr' | 'leap'

export type Eip1193Provider = { request: (args: { method: string; params?: unknown }) => Promise<unknown> }

type WalletWindow = {
  keplr?: { ethereum?: Eip1193Provider }
  leap?: { ethereum?: Eip1193Provider }
  ethereum?: Eip1193Provider & { isLeap?: boolean; isKeplr?: boolean }
  navigator?: { userAgent?: string }
}

function browserWindow(): WalletWindow | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as WalletWindow)
}

/** Same test as RainbowKit's, which decides when its connect modal shows the phone layout. */
export function isMobileDevice(w: WalletWindow | undefined = browserWindow()): boolean {
  const ua = w?.navigator?.userAgent ?? ''
  return /android|iPhone|iPod|iPad/i.test(ua)
}

/**
 * The wallet whose in-app browser this page is running in, or null. Phone browsers have no
 * extensions, so window.leap or window.keplr on a phone means the page is inside that wallet.
 * Leap also answers to window.keplr for Keplr-only sites, so window.leap is checked first.
 */
export function hostWallet(w: WalletWindow | undefined = browserWindow()): HostWallet | null {
  if (!w || !isMobileDevice(w)) return null
  if (w.leap) return 'leap'
  if (w.keplr) return 'keplr'
  return null
}

/**
 * The wallet's Ethereum provider: its own namespace (window.keplr.ethereum, window.leap.ethereum),
 * or window.ethereum when the page is inside that wallet's browser or the provider says it is
 * that wallet. Undefined when the wallet isn't here.
 */
export function walletEvmProvider(wallet: HostWallet, w: WalletWindow | undefined = browserWindow()): Eip1193Provider | undefined {
  if (!w) return undefined
  const own = w[wallet]?.ethereum
  if (own && typeof own.request === 'function') return own
  const ethereum = w.ethereum
  if (!ethereum || typeof ethereum.request !== 'function') return undefined
  if (hostWallet(w) === wallet) return ethereum
  if (wallet === 'leap' && ethereum.isLeap) return ethereum
  if (wallet === 'keplr' && ethereum.isKeplr) return ethereum
  return undefined
}

/**
 * Keplr's link that opens a page in Keplr Mobile's browser (docs.keplr.app/api/mobile/deeplink).
 * It's an https link, so it works from any phone browser, and the App Store or Play Store opens
 * when Keplr isn't installed.
 */
export function keplrBrowserLink(pageUrl: string): string {
  return `https://deeplink.keplr.app/web-browser?url=${encodeURIComponent(pageUrl)}`
}
