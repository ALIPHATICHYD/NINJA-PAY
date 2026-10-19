import type { AvatarComponent } from '@rainbow-me/rainbowkit'
import { identicon, IDENTICON_FOREGROUND } from '@/lib/identicon'

/**
 * The connected wallet's picture, in the wallet popup and the navigation bar,
 * in place of RainbowKit's random emoji. A profile image the wallet publishes
 * is shown when there is one; otherwise a pattern worked out from the address.
 */
export const WalletAvatar: AvatarComponent = ({ address, ensImage, size }) => {
  if (ensImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a remote profile image of unknown host
      <img src={ensImage} width={size} height={size} alt="" style={{ borderRadius: '50%', display: 'block' }} />
    )
  }
  const { background, cells } = identicon(address)
  // A 5×5 grid of 1.4-unit cells, centred in a 10-unit circle so no corner is
  // clipped. Each cell is drawn a hair wider so no seam shows between neighbours.
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" role="img" aria-label="Wallet picture" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="5" cy="5" r="5" fill={background} />
      {cells.flatMap((row, y) =>
        row.map((on, x) =>
          on ? <rect key={`${x}-${y}`} x={1.5 + x * 1.4} y={1.5 + y * 1.4} width="1.42" height="1.42" fill={IDENTICON_FOREGROUND} /> : null,
        ),
      )}
    </svg>
  )
}
