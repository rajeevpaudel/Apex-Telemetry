/**
 * fetch-tracks.mjs
 * Fetches OpenF1 GPS location data for 8 major circuits and generates
 * SVG track paths. Falls back to mock paths for remaining circuits.
 *
 * Usage: node scripts/fetch-tracks.mjs
 */

import { writeFileSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_PATH = path.join(__dirname, '../src/data/trackPaths.json')
const CACHE_PATH = path.join(__dirname, '../.track-cache.json')

const BASE = 'https://api.openf1.org/v1'

// All 24 circuits with their OpenF1 qualifying session keys
const FETCH_CIRCUITS = [
  { id: 'bahrain',      session_key: 9468 },
  { id: 'jeddah',       session_key: 9476 },
  { id: 'albert_park',  session_key: 9484 },
  { id: 'suzuka',       session_key: 9492 },
  { id: 'shanghai',     session_key: 9664 },
  { id: 'miami',        session_key: 9498 },
  { id: 'imola',        session_key: 9511 },
  { id: 'monaco',       session_key: 9519 },
  { id: 'villeneuve',   session_key: 9527 },
  { id: 'catalunya',    session_key: 9535 },
  { id: 'red_bull_ring',session_key: 9541 },
  { id: 'silverstone',  session_key: 9554 },
  { id: 'hungaroring',  session_key: 9562 },
  { id: 'spa',          session_key: 9570 },
  { id: 'zandvoort',    session_key: 9578 },
  { id: 'monza',        session_key: 9586 },
  { id: 'baku',         session_key: 9594 },
  { id: 'marina_bay',   session_key: 9602 },
  { id: 'americas',     session_key: 9608 },
  { id: 'rodriguez',    session_key: 9621 },
  { id: 'interlagos',   session_key: 9627 },
  { id: 'vegas',        session_key: 9640 },
  { id: 'losail',       session_key: 9646 },
  { id: 'yas_marina',   session_key: 9658 },
]

// Mock SVG paths for all circuits (from existing src/data/mock.js)
const MOCK_PATHS = {
  monza: {
    path: "M 120,420 L 760,420 Q 880,420 880,340 Q 880,260 760,260 L 460,260 Q 360,260 340,200 L 280,90 Q 240,40 180,80 L 100,150 Q 60,210 100,260 Q 130,300 180,300 Q 230,300 230,360 Q 230,420 180,420 Z",
    sector_breaks: [0.34, 0.66],
  },
  monaco: {
    path: "M 140,440 Q 100,440 100,400 L 100,280 Q 100,220 160,210 L 320,180 Q 380,170 410,210 L 470,290 Q 490,320 530,310 L 660,280 Q 720,265 720,210 Q 720,160 670,150 L 540,120 Q 480,108 480,150 Q 480,200 540,210 L 700,240 Q 820,260 820,330 Q 820,410 740,420 L 320,440 Z",
    sector_breaks: [0.32, 0.70],
  },
  silverstone: {
    path: "M 120,400 Q 90,400 90,360 L 90,250 Q 90,200 140,190 L 280,160 Q 360,145 400,190 L 470,260 Q 500,290 540,280 L 700,240 Q 800,215 820,160 Q 830,110 780,100 L 600,80 Q 540,75 540,120 Q 540,170 600,180 L 760,210 Q 880,235 880,310 Q 880,400 800,410 L 320,420 Q 220,425 180,415 Z",
    sector_breaks: [0.30, 0.64],
  },
  suzuka: {
    path: "M 140,440 Q 90,440 90,390 L 90,260 Q 90,210 150,200 L 280,180 Q 350,170 380,210 L 430,270 Q 460,310 430,340 L 360,400 Q 320,430 360,460 L 460,510 Q 540,540 600,510 L 760,440 Q 840,400 820,330 Q 800,260 720,250 L 580,230 Q 520,222 540,180 L 620,90 Q 660,50 720,80 L 820,140 Q 870,180 850,240 Q 840,280 810,300 Q 760,330 760,370 Q 760,430 700,440 L 320,450 Z",
    sector_breaks: [0.36, 0.70],
  },
  albert_park: {
    path: "M 130,420 Q 90,420 90,380 L 90,260 Q 90,210 145,200 L 320,170 Q 410,155 450,200 L 530,290 Q 560,320 600,310 L 760,270 Q 840,250 840,190 Q 840,140 780,140 L 620,140 Q 560,140 570,180 L 600,260 Q 620,310 680,310 L 820,330 Q 880,345 880,400 Q 880,440 820,440 L 320,440 Z",
    sector_breaks: [0.33, 0.68],
  },
  imola: {
    path: "M 150,430 Q 100,430 100,390 L 100,290 Q 100,240 160,230 L 320,200 Q 400,185 430,230 L 490,310 Q 520,340 560,330 L 700,290 Q 800,265 810,210 Q 820,150 760,140 L 600,130 Q 530,125 540,170 L 580,260 Q 600,320 670,330 L 820,360 Q 880,375 880,420 Q 880,450 820,450 L 320,450 Z",
    sector_breaks: [0.34, 0.66],
  },
  cota: {
    path: "M 130,440 Q 90,440 90,400 L 90,300 Q 90,250 130,200 L 200,110 Q 240,60 290,90 L 380,150 Q 420,180 400,220 L 360,290 Q 340,330 380,350 L 520,400 Q 570,420 610,390 L 760,290 Q 820,250 820,190 Q 820,140 760,140 L 620,160 Q 560,170 580,210 L 640,290 Q 680,340 760,340 L 830,355 Q 880,370 880,420 Q 880,450 820,450 L 320,450 Z",
    sector_breaks: [0.32, 0.66],
  },
  jeddah: {
    path: "M 120,430 L 760,430 Q 860,430 860,380 L 860,290 Q 860,240 800,230 L 620,200 Q 560,190 580,150 L 640,90 Q 680,55 730,80 L 820,130 Q 860,160 840,210 Q 820,250 780,255 L 600,275 Q 540,285 560,330 L 600,400 Q 620,440 560,440 L 320,440 Q 200,440 160,420 Z",
    sector_breaks: [0.33, 0.66],
  },
}

// Simple oval placeholder for circuits without real or mock path data
function ovalPath(cx = 500, cy = 300, rx = 350, ry = 200) {
  return `M ${cx - rx},${cy} Q ${cx - rx},${cy - ry} ${cx},${cy - ry} Q ${cx + rx},${cy - ry} ${cx + rx},${cy} Q ${cx + rx},${cy + ry} ${cx},${cy + ry} Q ${cx - rx},${cy + ry} ${cx - rx},${cy} Z`
}

// All 24 circuit IDs we need to produce entries for
const ALL_CIRCUITS = [
  'bahrain', 'jeddah', 'albert_park', 'suzuka', 'shanghai', 'miami',
  'imola', 'monaco', 'villeneuve', 'catalunya', 'red_bull_ring', 'silverstone',
  'hungaroring', 'spa', 'zandvoort', 'monza', 'baku', 'marina_bay',
  'americas', 'rodriguez', 'interlagos', 'vegas', 'losail', 'yas_marina',
]

// ── Douglas-Peucker simplification ───────────────────────────────────────────

function perpendicularDist(pt, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) {
    return Math.sqrt((pt.x - lineStart.x) ** 2 + (pt.y - lineStart.y) ** 2)
  }
  return Math.abs(dy * pt.x - dx * pt.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / len
}

function douglasPeucker(points, epsilon) {
  if (points.length < 3) return points
  let maxDist = 0
  let maxIdx = 0
  const end = points.length - 1
  for (let i = 1; i < end; i++) {
    const d = perpendicularDist(points[i], points[0], points[end])
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon)
    const right = douglasPeucker(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [points[0], points[end]]
}

// ── Catmull-Rom → cubic Bézier conversion ────────────────────────────────────

function catmullRomToBezier(points, closed = true) {
  const pts = closed ? [...points, points[0], points[1]] : points
  const cmds = []

  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % pts.length]
    const p3 = pts[(i + 2) % pts.length]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    if (i === 0) {
      cmds.push(`M ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`)
    }
    cmds.push(`C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`)
  }

  if (closed) cmds.push('Z')
  return cmds.join(' ')
}

// ── Normalize points to 1000×600 viewbox ─────────────────────────────────────

function normalizePoints(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const scale = Math.min(880 / rangeX, 520 / rangeY)  // leave 60px margin each side
  const offsetX = (1000 - rangeX * scale) / 2
  const offsetY = (600 - rangeY * scale) / 2

  return points.map(p => ({
    x: offsetX + (p.x - minX) * scale,
    y: offsetY + (p.y - minY) * scale,
  }))
}

// ── Detect one clean lap from GPS data ───────────────────────────────────────

function extractOneLap(rawPoints) {
  if (rawPoints.length < 50) return rawPoints

  // Find start region (first 20 points centroid)
  const seedLen = Math.min(20, Math.floor(rawPoints.length * 0.05))
  const seed = rawPoints.slice(0, seedLen)
  const sx = seed.reduce((s, p) => s + p.x, 0) / seed.length
  const sy = seed.reduce((s, p) => s + p.y, 0) / seed.length

  // Track range to set proximity threshold
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of rawPoints) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const range = Math.max(maxX - minX, maxY - minY)
  const threshold = range * 0.04  // 4% of track span

  // Scan from ~30% of points for return to start
  const searchStart = Math.floor(rawPoints.length * 0.3)
  for (let i = searchStart; i < rawPoints.length; i++) {
    const p = rawPoints[i]
    const dist = Math.sqrt((p.x - sx) ** 2 + (p.y - sy) ** 2)
    if (dist < threshold) {
      return rawPoints.slice(0, i)
    }
  }

  // Fallback: return all points
  return rawPoints
}

// ── Fetch GPS data from OpenF1 ────────────────────────────────────────────────

async function fetchLocation(sessionKey, driverNumber = 1) {
  const url = `${BASE}/location?session_key=${sessionKey}&driver_number=${driverNumber}`
  console.log(`  Fetching: ${url}`)
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== fetch-tracks.mjs ===')

  // Load cache if it exists
  let cache = {}
  if (existsSync(CACHE_PATH)) {
    try {
      cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
      console.log(`Loaded cache with ${Object.keys(cache).length} entries`)
    } catch {}
  }

  const results = {}

  // Fetch the 8 major circuits
  for (const circuit of FETCH_CIRCUITS) {
    const { id, session_key } = circuit
    console.log(`\n[${id}] session_key=${session_key}`)

    // Check cache first
    if (cache[id]) {
      console.log(`  Using cached data (${cache[id].length} raw points)`)
      try {
        const path = processPoints(cache[id], id)
        if (path) {
          results[id] = { path, sector_breaks: [0.33, 0.67], source: 'openf1' }
          console.log(`  OK (from cache)`)
          continue
        }
      } catch (e) {
        console.log(`  Cache processing failed: ${e.message}, will re-fetch`)
      }
    }

    try {
      const raw = await fetchLocation(session_key, 1)
      console.log(`  Got ${raw.length} raw points`)

      if (!raw.length) throw new Error('No points returned')

      // Save to cache
      cache[id] = raw

      const svgPath = processPoints(raw, id)
      if (svgPath) {
        results[id] = { path: svgPath, sector_breaks: [0.33, 0.67], source: 'openf1' }
        console.log(`  OK - generated SVG path`)
      } else {
        throw new Error('processPoints returned null')
      }
    } catch (e) {
      console.log(`  FAILED: ${e.message} - using mock fallback`)
      const mock = MOCK_PATHS[id]
      if (mock) {
        results[id] = { ...mock, source: 'mock' }
      } else {
        results[id] = { path: ovalPath(), sector_breaks: [0.33, 0.67], source: 'placeholder' }
      }
    }

    await sleep(500)
  }

  // Save updated cache
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
  console.log('\nCache saved.')

  // Fill in the rest of the circuits from mock or placeholder
  const fetchedIds = new Set(FETCH_CIRCUITS.map(c => c.id))
  for (const circuitId of ALL_CIRCUITS) {
    if (fetchedIds.has(circuitId)) continue  // already handled above

    if (MOCK_PATHS[circuitId]) {
      results[circuitId] = { ...MOCK_PATHS[circuitId], source: 'mock' }
      console.log(`[${circuitId}] Using mock path`)
    } else {
      // Generate a placeholder oval for circuits we don't have a mock for
      results[circuitId] = {
        path: ovalPath(),
        sector_breaks: [0.33, 0.67],
        source: 'placeholder',
      }
      console.log(`[${circuitId}] Using placeholder oval`)
    }
  }

  // Write output
  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2))
  console.log(`\nWrote ${Object.keys(results).length} circuits to ${OUT_PATH}`)

  // Summary
  const bySource = {}
  for (const v of Object.values(results)) {
    bySource[v.source] = (bySource[v.source] || 0) + 1
  }
  console.log('Sources:', bySource)
}

function processPoints(raw, id) {
  // Filter out invalid/zero points
  const valid = raw.filter(p =>
    p.x != null && p.y != null &&
    !(p.x === 0 && p.y === 0) &&
    isFinite(p.x) && isFinite(p.y)
  ).map(p => ({ x: p.x, y: p.y }))

  if (valid.length < 20) {
    console.log(`  Only ${valid.length} valid points, skipping`)
    return null
  }

  // Extract one lap
  const lapPoints = extractOneLap(valid)
  console.log(`  Lap points: ${lapPoints.length}`)

  if (lapPoints.length < 20) return null

  // Downsample first if too large (to make DP faster)
  let pts = lapPoints
  if (pts.length > 2000) {
    const step = Math.ceil(pts.length / 2000)
    pts = pts.filter((_, i) => i % step === 0)
  }

  // Douglas-Peucker: binary search epsilon to land at ≤100 points
  // GPS coords are raw meters
  let simplified = pts
  let lo = 5, hi = 2000
  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2
    const s = douglasPeucker(pts, mid)
    if (s.length > 100) lo = mid
    else if (s.length < 50) hi = mid
    else { simplified = s; break }
    simplified = s
  }
  // If still over 100, keep increasing epsilon
  if (simplified.length > 100) {
    for (const epsilon of [500, 1000, 2000, 5000]) {
      simplified = douglasPeucker(pts, epsilon)
      if (simplified.length <= 100) break
    }
  }

  console.log(`  Simplified to ${simplified.length} points`)

  // Normalize to 1000x600 viewbox
  const normalized = normalizePoints(simplified)

  // Generate smooth SVG path using Catmull-Rom → Bézier
  const svgPath = catmullRomToBezier(normalized, true)
  return svgPath
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
