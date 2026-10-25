import { afterEach, describe, expect, it, vi } from 'vitest'
import { hostWallet, keplrBrowserLink, walletEvmProvider } from '@/lib/wallet-browser'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36'

const provider = () => ({ request: vi.fn() })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('wallet in-app browsers', () => {
  it("knows it's inside Keplr or Leap on a phone, and Leap wins when both answer", () => {
    expect(hostWallet({ navigator: { userAgent: ANDROID }, keplr: {} })).toBe('keplr')
    expect(hostWallet({ navigator: { userAgent: IPHONE }, leap: {} })).toBe('leap')
    expect(hostWallet({ navigator: { userAgent: ANDROID }, leap: {}, keplr: {} })).toBe('leap')
  })

  it('is not inside a wallet in an ordinary phone browser or with desktop extensions', () => {
    expect(hostWallet({ navigator: { userAgent: ANDROID } })).toBeNull()
    expect(hostWallet({ navigator: { userAgent: ANDROID }, ethereum: provider() })).toBeNull()
    expect(hostWallet({ navigator: { userAgent: DESKTOP }, keplr: {}, leap: {} })).toBeNull()
    expect(hostWallet(undefined)).toBeNull()
  })

  it("uses the wallet's own Ethereum provider first", () => {
    const keplrEth = provider()
    const ethereum = provider()
    const w = { navigator: { userAgent: DESKTOP }, keplr: { ethereum: keplrEth }, ethereum }
    expect(walletEvmProvider('keplr', w)).toBe(keplrEth)
    expect(walletEvmProvider('leap', w)).toBeUndefined()
  })

  it("uses window.ethereum only inside that wallet's browser or when it names the wallet", () => {
    const ethereum = provider()
    expect(walletEvmProvider('keplr', { navigator: { userAgent: ANDROID }, keplr: {}, ethereum })).toBe(ethereum)
    expect(walletEvmProvider('leap', { navigator: { userAgent: ANDROID }, keplr: {}, ethereum })).toBeUndefined()
    // MetaMask on a desktop is not Keplr.
    expect(walletEvmProvider('keplr', { navigator: { userAgent: DESKTOP }, keplr: {}, ethereum })).toBeUndefined()
    const leapEth = { ...provider(), isLeap: true }
    expect(walletEvmProvider('leap', { navigator: { userAgent: DESKTOP }, ethereum: leapEth })).toBe(leapEth)
  })

  it("opens the current page in Keplr's browser through Keplr's https link", () => {
    expect(keplrBrowserLink('https://ninja-pay-ten.vercel.app/send?to=inj1x'))
      .toBe('https://deeplink.keplr.app/web-browser?url=https%3A%2F%2Fninja-pay-ten.vercel.app%2Fsend%3Fto%3Dinj1x')
  })

  it("lists only the host wallet inside Keplr's browser", async () => {
    vi.stubGlobal('window', { navigator: { userAgent: ANDROID }, keplr: { ethereum: provider() } })
    vi.stubGlobal('navigator', { userAgent: ANDROID })
    const { hiddenInWalletBrowsers, keplrWallet, leapWallet, outsideWalletBrowsers } = await import('@/lib/cosmos-evm-wallets')
    const params = { projectId: 'test', appName: 'test' } as never
    const keplr = keplrWallet(params)
    expect(keplr.installed).toBe(true)
    expect(keplr.hidden?.()).toBe(false)
    expect(leapWallet(params).hidden?.()).toBe(true)
    const walletConnectOnly = outsideWalletBrowsers(() => ({ ...keplr, id: 'metaMask', installed: undefined }))(params)
    expect(walletConnectOnly.hidden?.()).toBe(true)
    const injectedHere = outsideWalletBrowsers(() => ({ ...keplr, id: 'phantom', installed: true, hidden: undefined }))(params)
    expect(injectedHere.hidden?.()).toBe(false)
    const popupWallet = hiddenInWalletBrowsers(() => ({ ...keplr, id: 'baseAccount', installed: true, hidden: undefined }))(params)
    expect(popupWallet.hidden?.()).toBe(true)
  })
})
