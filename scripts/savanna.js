// Engraved savanna for the NinjaPay footer: Ocean ink on Snow paper, sky left transparent.
// `node scripts/savanna.js > savanna.svg` writes it at 1440x380; public/brand/savanna.webp is that
// SVG rendered at 2x. The same function also runs inside Figma, so the design file matches.
// Layers back to front: far ridge, a rock group, a Zuma-like monolith, mid hills, the plain,
// two acacias, grass and stipple, and a ninja walking right. No clip paths: every hatch line
// is cut to its shape while it is drawn, so Figma's SVG import draws it the same way.
function savannaSvg({ top = 160, height = 380 } = {}) {
  const W = 1440, H = 540, HORIZON = 352
  const INK = '#4D3DFF', PAPER = '#EEEFFF'
  const out = []

  const prng = seed => {
    let a = seed >>> 0
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    return {
      random: next,
      uniform: (lo, hi) => lo + (hi - lo) * next(),
      randint: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      gauss: (mu, sd) => mu + sd * Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
    }
  }
  const noise = seed => {
    const r = prng(seed)
    const p = Array.from({ length: 4096 }, () => r.random())
    const v = i => p[((i % 4096) + 4096) % 4096]
    const sm = f => f * f * (3 - 2 * f)
    const n1 = x => { const i = Math.floor(x), f = sm(x - i); return v(i) * (1 - f) + v(i + 1) * f }
    const n2 = (x, y) => {
      const i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j)
      const h = (a, b) => v(a * 73 + b * 1931 + 17)
      const a = h(i, j) * (1 - fx) + h(i + 1, j) * fx
      const b = h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx
      return a * (1 - fy) + b * fy
    }
    const fbm1 = x => { let s = 0, a = 1, t = 0; for (let o = 0; o < 4; o++) { s += a * n1(x); t += a; x *= 2.03; a *= 0.5 } return s / t }
    const fbm2 = (x, y) => { let s = 0, a = 1, t = 0; for (let o = 0; o < 4; o++) { s += a * n2(x, y); t += a; x *= 2.01; y *= 2.01; a *= 0.5 } return s / t }
    return { n1, n2, fbm1, fbm2 }
  }
  const N = noise(7)
  const f = v => (Math.round(v * 10) / 10).toString()
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

  // Variable-width strokes: one filled polygon per run where the width is at least minW.
  const ribbon = (pts, ws, minW = 0.18) => {
    const runs = []
    let cur = []
    pts.forEach(([x, y], i) => {
      if (ws[i] >= minW) cur.push([x, y, ws[i]])
      else if (cur.length) { runs.push(cur); cur = [] }
    })
    if (cur.length) runs.push(cur)
    return runs.filter(r => r.length > 1).map(r => {
      const topEdge = r.map(([x, y, w]) => `${f(x)} ${f(y - w / 2)}`)
      const botEdge = r.slice().reverse().map(([x, y, w]) => `${f(x)} ${f(y + w / 2)}`)
      return 'M' + topEdge.concat(botEdge).join('L') + 'Z'
    })
  }
  const polyD = pts => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z'

  // Paper between ridge(x) and baseY, with hatch lines draped over it: they follow the ridge near
  // the top and flatten towards the base. Faces turned away from the light (upper left) and the
  // streak noise make them thicker.
  function mass(ridge, baseY, x0, x1, spacing, wmax, { streak = 0, seed = 0, fade = 1 } = {}) {
    const xs = []
    for (let x = x0; x <= x1; x += 1.5) xs.push(x)
    const topPts = xs.map(x => [x, ridge(x)])
    out.push(`<path fill="${PAPER}" d="${polyD(topPts.concat([[x1, baseY + 2], [x0, baseY + 2]]))}"/>`)
    const rmin = Math.min(...topPts.map(p => p[1]))
    const n = Math.max(3, Math.floor((baseY - rmin) / spacing))
    const nz = noise(seed + 100)
    const paths = []
    for (let k = 0; k < n + 2; k++) {
      const t = Math.min(1, (k + 0.3) / (n + 1))
      const pts = [], ws = []
      for (const x of xs) {
        const r = ridge(x)
        const y = r + t * (baseY - r) + (nz.n2(x * 0.03, k * 0.7) - 0.5) * 1.6
        const dr = (ridge(x + 2) - ridge(x - 2)) / 4
        const face = clamp(dr * 1.6, -1, 1)
        const nearTop = Math.pow(1 - t, 0.6)
        let shade = 0.36 + 0.55 * face * (0.35 + 0.65 * nearTop)
        shade += (nz.fbm2(x * 0.06, t * 1.4) - 0.5) * 1.1 * streak
        shade += (nz.n2(x * 0.11, k * 0.9) - 0.5) * 0.35
        shade += 0.25 * t
        shade = clamp(shade, 0, 1) * fade
        let w = wmax * Math.pow(shade, 1.25)
        if (y - w / 2 < r) w = Math.max(0, 2 * (y - r))
        pts.push([x, y])
        ws.push(w)
      }
      paths.push(...ribbon(pts, ws))
    }
    out.push(`<path fill="${INK}" d="${paths.join('')}"/>`)
    const pts = [], ws = []
    for (const x of xs) {
      const dr = (ridge(x + 2) - ridge(x - 2)) / 4
      pts.push([x, ridge(x) + 0.4])
      ws.push((dr < 0 ? 0.9 : 1.5) * fade * (0.6 + 0.8 * N.n1(x * 0.07 + seed)))
    }
    out.push(`<path fill="${INK}" d="${ribbon(pts, ws, 0.5).join('')}"/>`)
  }

  const farRidge = x => 318 - 26 * N.fbm1(x * 0.004 + 3.1) - 10 * N.fbm1(x * 0.013 + 9) + 6
  const monolith = x => {
    const u = (x - 1100) / 150
    if (Math.abs(u) >= 1) return HORIZON + 40
    const a = Math.abs(u + 0.08)
    const dome = Math.pow(Math.max(0, 1 - Math.pow(a, 2.2)), 0.72)
    const crown = 0.05 * Math.sin(u * 7.5 + 1.2) * dome
    const shoulder = 0.16 * Math.exp(-(((u - 0.62) / 0.16) ** 2))
    return 336 - 158 * (dome + crown + shoulder) + 5 * (N.fbm1(x * 0.06) - 0.5)
  }
  const rockGroup = x => {
    let best = HORIZON + 40
    for (const [c, half, hgt] of [[205, 70, 68], [300, 55, 50], [128, 40, 34]]) {
      const u = (x - c) / half
      if (Math.abs(u) < 1) best = Math.min(best, 334 - hgt * Math.pow(1 - u * u, 0.7) + 3 * (N.fbm1(x * 0.06 + c) - 0.5))
    }
    return best
  }
  const midHills = x => 343 - 12 * N.fbm1(x * 0.006 + 20) - 5 * N.fbm1(x * 0.02 + 4) + 2

  function plain() {
    out.push(`<path fill="${PAPER}" d="M0 ${HORIZON - 4}H${W}V${H}H0Z"/>`)
    const nz = noise(55)
    const paths = []
    const n = 78
    for (let j = 0; j < n; j++) {
      const t = (j + 1) / n
      const y0 = HORIZON + (H - HORIZON) * Math.pow(t, 1.45)
      const pts = [], ws = []
      for (let x = -4; x < W + 4; x += 2) {
        const y = y0 + (nz.n2(x * 0.012, j * 0.5) - 0.5) * (2 + 6 * t)
        let s = nz.fbm2((x * 0.006) / (0.4 + t), j * 0.16) - 0.36
        s += (nz.n2(x * 0.06, j * 1.3) - 0.5) * 0.55
        pts.push([x, y])
        ws.push(Math.max(0, s) * (1.1 + 2.6 * t))
      }
      paths.push(...ribbon(pts, ws, 0.22))
    }
    out.push(`<path fill="${INK}" d="${paths.join('')}"/>`)
  }

  function tuft(cx, cy, size, r) {
    const d = []
    const nb = r.randint(7, 15)
    for (let b = 0; b < nb; b++) {
      const ang = (r.gauss(0, 26) * Math.PI) / 180
      const ln = size * r.uniform(0.45, 1.2)
      const bend = r.uniform(-0.45, 0.45) + (ang < 0 ? -0.25 : 0.25)
      const bx = cx + r.uniform(-size * 0.25, size * 0.25)
      const tipx = bx + Math.sin(ang) * ln, tipy = cy - Math.cos(ang) * ln
      const mx = bx + Math.sin(ang + bend) * ln * 0.55, my = cy - Math.cos(ang + bend) * ln * 0.55
      const bw = Math.max(0.45, size * 0.045)
      d.push(`M${f(bx - bw)} ${f(cy)}Q${f(mx)} ${f(my)} ${f(tipx)} ${f(tipy)}Q${f(mx + bw * 0.3)} ${f(my)} ${f(bx + bw)} ${f(cy)}Z`)
    }
    d.push(`M${f(cx - size * 0.7)} ${f(cy)}Q${f(cx)} ${f(cy + size * 0.12)} ${f(cx + size * 0.8)} ${f(cy)}Q${f(cx)} ${f(cy + size * 0.05)} ${f(cx - size * 0.7)} ${f(cy)}Z`)
    return d
  }

  function grass() {
    const r = prng(11)
    const d = []
    for (let i = 0; i < 760; i++) {
      const t = Math.pow(r.random(), 0.8)
      const y = HORIZON + 6 + (H - HORIZON - 6) * Math.pow(t, 1.4)
      const x = r.uniform(-20, W + 20)
      const size = 3 + 34 * Math.pow(t, 1.7) * r.uniform(0.55, 1.25)
      if (x > 640 && x < 840 && y > 410 && y < 480) continue // the walker's ground stays clear
      d.push(...tuft(x, y, size, r))
    }
    out.push(`<path fill="${INK}" d="${d.join('')}"/>`)
    const dots = []
    for (let i = 0; i < 4200; i++) {
      const t = r.random()
      const y = HORIZON + (H - HORIZON) * Math.pow(t, 1.3)
      const x = r.uniform(0, W)
      const rr = 0.35 + 0.9 * t * r.random()
      dots.push(`M${f(x - rr)} ${f(y)}a${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0Z`)
    }
    out.push(`<path fill="${INK}" d="${dots.join('')}"/>`)
  }

  function acacia(bx, by, s, seed) {
    const r = prng(seed)
    const forkY = by - 26 * s
    const trunk = [`M${f(bx - 2.6 * s)} ${f(by)}C${f(bx - 1.5 * s)} ${f(by - 12 * s)} ${f(bx - 1.2 * s)} ${f(forkY + 4 * s)} ${f(bx - 0.6 * s)} ${f(forkY)}L${f(bx + 1.2 * s)} ${f(forkY)}C${f(bx + 1.4 * s)} ${f(forkY + 6 * s)} ${f(bx + 1.6 * s)} ${f(by - 10 * s)} ${f(bx + 2.8 * s)} ${f(by)}Z`]
    for (const [dx, h] of [[-0.9, 1.0], [0.15, 1.12], [1.0, 0.95]]) {
      const tx = bx + dx * 30 * s, ty = by - 52 * s * h
      trunk.push(`M${f(bx - s)} ${f(forkY + 1)}Q${f(bx + dx * 8 * s)} ${f(forkY - 14 * s)} ${f(tx - 0.8 * s)} ${f(ty)}L${f(tx + 0.8 * s)} ${f(ty)}Q${f(bx + dx * 8 * s + 2 * s)} ${f(forkY - 12 * s)} ${f(bx + s)} ${f(forkY + 1)}Z`)
    }
    out.push(`<path fill="${INK}" d="${trunk.join('')}"/>`)
    const cy = by - 56 * s
    const lumps = []
    for (let i = 0; i < 9; i++) {
      lumps.push({
        x: bx + (i - 4) * 9.5 * s + r.uniform(-3, 3) * s,
        y: cy + r.uniform(-4, 3) * s - (1 - Math.abs(i - 4) / 4) * 5 * s,
        rx: r.uniform(10, 14) * s,
        ry: r.uniform(5, 7.5) * s,
      })
    }
    out.push(`<path fill="${PAPER}" d="${lumps.map(l => `M${f(l.x - l.rx)} ${f(l.y)}a${f(l.rx)} ${f(l.ry)} 0 1 0 ${f(2 * l.rx)} 0a${f(l.rx)} ${f(l.ry)} 0 1 0 ${f(-2 * l.rx)} 0Z`).join('')}"/>`)
    // Half the line's height inside the canopy at x, or 0 outside it.
    const room = (x, y) => {
      let best = 0
      for (const l of lumps) {
        const u = (x - l.x) / l.rx
        if (Math.abs(u) >= 1) continue
        const half = l.ry * Math.sqrt(1 - u * u)
        if (Math.abs(y - l.y) < half) best = Math.max(best, half - Math.abs(y - l.y))
      }
      return best
    }
    const hatch = []
    let k = 0
    for (let y = cy - 22 * s; y < cy + 14 * s; y += 2.3 * s, k++) {
      const pts = [], ws = []
      for (let x = bx - 60 * s; x < bx + 60 * s; x += 1.2) {
        const yy = y + (N.n2(x * 0.08, k) - 0.5) * 1.5 * s
        const depth = (y - (cy - 14 * s)) / (26 * s)
        const w = (0.5 + 2.6 * Math.max(0, depth)) * s * (0.55 + 0.9 * N.n2((x * 0.15) / s, k * 0.8))
        pts.push([x, yy])
        ws.push(Math.min(w, 2 * room(x, yy)))
      }
      hatch.push(...ribbon(pts, ws, 0.35))
    }
    out.push(`<path fill="${INK}" d="${hatch.join('')}"/>`)
    out.push(`<ellipse cx="${f(bx + 6 * s)}" cy="${f(by + 1)}" rx="${f(26 * s)}" ry="${f(2.2 * s)}" fill="${INK}" opacity="0.9"/>`)
  }

  // Drawn in a 100-unit box with the feet on y=97 around x=55, then placed at (x, y), scaled by s.
  function ninja(x, y, s) {
    const tr = `translate(${f(x - 55 * s)} ${f(y - 97 * s)}) scale(${s})`
    out.push(`<g transform="${tr}" fill="${INK}" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">`)
    out.push('<path stroke="none" d="M50 10C42 8 35 12 24 7C31 15 40 16 50 14.5Z"/>')
    out.push('<path stroke="none" d="M50 13C43 16 37 22 28 23C36 26 44 21 51 16.5Z"/>')
    out.push('<path stroke-width="3" fill="none" d="M47 26L39 7"/>')
    out.push('<path stroke-width="4.6" fill="none" d="M39.6 8.5L36.4 1.5"/>')
    out.push('<path stroke-width="7" fill="none" d="M48 29C43 35 40 41 37 47"/>')
    out.push('<path stroke="none" d="M46 55L57 58C53 68 47 76 43 84L40 91L40 96.5L27 96.5L28.5 93L34 90C36 80 39 69 46 55Z"/>')
    out.push('<path stroke="none" d="M45 26C50 22.5 60 22.5 67 27C68.5 36 66.5 46 64.5 55L45.5 57C43.5 46 42.5 36 45 26Z"/>')
    out.push('<path stroke="none" d="M46 51C38 52 32 56 24 57C31 59.5 39 58.5 47 55.5Z"/>')
    out.push('<path stroke="none" d="M51 55L65 54C71 63 75 72 77 83L78 91L85.5 93.5L85.5 96.5L70.5 96.5L69.5 91.5C67.5 82 62 74 51 64Z"/>')
    out.push('<circle stroke="none" cx="57" cy="14" r="8.6"/>')
    out.push('<path stroke="none" d="M52 20L62 20L63.5 27L51 27Z"/>')
    out.push('<path stroke-width="7" fill="none" d="M63.5 29.5C69 35 72 41 74.5 47.5"/>')
    out.push('</g>')
    out.push(`<g transform="${tr}" fill="${PAPER}">`)
    out.push('<path d="M56 11.6Q61 10.6 65.6 12L65.6 14.6Q61 13.6 56.4 14.8Z"/>')
    for (const d of [
      'M46.6 30C45.4 38 45.4 46 46.8 54L47.8 54C46.6 46 46.6 38 47.8 30Z',
      'M53.4 60C50 68 45.6 77 42.4 86L43.4 86.4C46.6 77 51 68.4 54.4 60.6Z',
      'M66 57C70.4 64 73 71 74.6 80L73.6 80.2C72 71.4 69.4 64.4 65 57.6Z',
    ]) out.push(`<path d="${d}" opacity="0.9"/>`)
    out.push('</g>')
    out.push(`<path fill="${INK}" opacity="0.9" d="M${f(x - 40 * s)} ${f(y + 0.4)}Q${f(x - 8 * s)} ${f(y + 4.5 * s)} ${f(x + 36 * s)} ${f(y + 0.8)}Q${f(x - 8 * s)} ${f(y + 2.2 * s)} ${f(x - 40 * s)} ${f(y + 0.4)}Z"/>`)
  }

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${top} ${W} ${height}" width="${W}" height="${height}">`)
  mass(farRidge, HORIZON + 6, -10, W + 10, 3.4, 1.2, { streak: 0.3, seed: 1, fade: 0.75 })
  mass(rockGroup, HORIZON + 10, 40, 380, 2.5, 2.2, { streak: 1.2, seed: 2 })
  mass(monolith, HORIZON + 12, 945, 1255, 2.3, 2.6, { streak: 1.7, seed: 3 })
  mass(midHills, HORIZON + 4, -10, W + 10, 3.0, 1.5, { streak: 0.4, seed: 4, fade: 0.9 })
  plain()
  acacia(300, 396, 1.35, 5)
  acacia(1330, 374, 0.8, 6)
  grass()
  ninja(738, 458, 0.78)
  out.push('</svg>')
  return out.join('\n')
}

if (typeof module !== 'undefined' && require.main === module) {
  process.stdout.write(savannaSvg())
}
if (typeof module !== 'undefined') module.exports = { savannaSvg }
