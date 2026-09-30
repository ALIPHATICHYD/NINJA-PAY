'use client'

import { useMemo } from 'react'
import { encodeQR } from 'qr'

/**
 * A QR code drawn as one SVG path. It is always dark on white, whatever the
 * theme, because that is what phone cameras read most reliably.
 */
export function QrCode({ value, label, size = 176 }: { value: string; label: string; size?: number }) {
  const { cells, path } = useMemo(() => {
    const grid = encodeQR(value, 'raw', { ecc: 'medium', border: 2 })
    let d = ''
    grid.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x} ${y}h1v1h-1z` }))
    return { cells: grid.length, path: d }
  }, [value])

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${cells} ${cells}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      style={{ display: 'block', maxWidth: '100%', height: 'auto', background: '#fff', borderRadius: '8px' }}
    >
      <rect width={cells} height={cells} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}
