import { ImageResponse } from 'next/og'

// The picture shown when a NinjaPay link is shared on X, WhatsApp, Telegram
// and the like. Built at deploy time, so it costs nothing per request.
export const alt = 'NinjaPay: payments and payroll in USDC and INJ on Injective'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// public/brand/ninja-mark.svg, inlined so the build needs no network.
const MARK = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4IiB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCI+PHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHJ4PSIyOC44IiBmaWxsPSIjNEQzREZGIi8+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTEgMTQpIj48cGF0aCBmaWxsPSIjRUVFRkZGIiBkPSJNNzQgMzNDODIgMzAgODYgMjIgOTIgMTZDOTUgMTMgOTggMTIgOTkgMTJDOTYgMjAgOTIgMzAgODQgMzZDODEgMzggNzggMzkgNzYgNDBaTTc3IDQxQzg1IDQwIDkwIDQ0IDk0IDUwQzk1LjUgNTIgOTcgNTMgOTkgNTRDOTMgNTUgODggNTMgODQgNTBDODEgNDggNzkgNDYgNzYgNDVaIi8+PGNpcmNsZSBmaWxsPSIjRUVFRkZGIiBjeD0iNDQiIGN5PSI1NiIgcj0iMzYiLz48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTIuNSA1M0MyNiA0NSA2MiA0NSA3NS41IDUzQzc0LjUgNjAgNzIgNjUgNjkgNjdDNTQgNjEgMzQgNjEgMTkgNjdDMTYgNjUgMTMuNSA2MCAxMi41IDUzWiIvPjxwYXRoIGZpbGw9IiNFRUVGRkYiIGQ9Ik0yMSA1My41TDM4IDU3LjVDMzYuNSA2MS41IDMzIDYyLjUgMjkgNjJDMjQuNSA2MSAyMiA1OCAyMSA1My41Wk02NyA1My41TDUwIDU3LjVDNTEuNSA2MS41IDU1IDYyLjUgNTkgNjJDNjMuNSA2MSA2NiA1OCA2NyA1My41WiIvPjwvZz48L3N2Zz4='

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          background: '#08080A',
          color: '#EDEBE6',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <img src={MARK} width={96} height={96} alt="" />
          <div style={{ fontSize: 48, fontWeight: 600 }}>NinjaPay</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 500, lineHeight: 1.02, letterSpacing: -3, maxWidth: 1000 }}>
            Payments and payroll in USDC and INJ
          </div>
          <div style={{ fontSize: 34, color: '#A3A1A8' }}>On Injective. Non-custodial: you keep your keys.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: 24 }, (_, i) => (
            // A dithered bar: squares thin out to the right, echoing the site's 1-bit texture.
            <div key={i} style={{ width: 12, height: 12, background: '#5B4BFF', opacity: i % 2 === 0 || i < 10 ? 1 - i / 30 : 0 }} />
          ))}
        </div>
      </div>
    ),
    size,
  )
}
