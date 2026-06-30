#!/usr/bin/env node
/**
 * fetch-tracks-warehouse.mjs
 *
 * Generates trackPaths.json entirely from warehouse GPS data (mart_lap_telemetry).
 * Replaces the FastF1-based approach so the SVG coordinate system matches the
 * OpenF1 GPS coordinates used for real-time car positioning.
 *
 * Usage: node scripts/fetch-tracks-warehouse.mjs
 * Requires ClickHouse running on localhost:8123.
 */
import { writeFileSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '../src/data/trackPaths.json')

// ── ClickHouse HTTP client ────────────────────────────────────────────────────
async function chQuery(sql) {
  const url = `http://localhost:8123/?query=${encodeURIComponent(sql + ' FORMAT JSON')}`
  const res = await fetch(url, {
    headers: { 'X-ClickHouse-Database': 'f1_mart' },
  })
  if (!res.ok) throw new Error(`ClickHouse error: ${await res.text()}`)
  return (await res.json()).data
}

// ── Douglas-Peucker simplification ───────────────────────────────────────────
function douglasPeucker(pts, eps) {
  if (pts.length < 3) return pts
  const [p0, pe] = [pts[0], pts[pts.length - 1]]
  const [lx, ly] = [pe[0] - p0[0], pe[1] - p0[1]]
  const len = Math.hypot(lx, ly)
  let maxDist = 0, maxIdx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const dist = len === 0
      ? Math.hypot(pts[i][0] - p0[0], pts[i][1] - p0[1])
      : Math.abs(lx * (p0[1] - pts[i][1]) - (p0[0] - pts[i][0]) * ly) / len
    if (dist > maxDist) { maxDist = dist; maxIdx = i }
  }
  if (maxDist > eps) {
    const l = douglasPeucker(pts.slice(0, maxIdx + 1), eps)
    const r = douglasPeucker(pts.slice(maxIdx), eps)
    return [...l.slice(0, -1), ...r]
  }
  return [pts[0], pts[pts.length - 1]]
}

function simplifyToTarget(pts, minN = 50, maxN = 100) {
  let lo = 1, hi = 1e6, best = pts
  for (let iter = 0; iter < 30; iter++) {
    const mid = (lo + hi) / 2
    const s = douglasPeucker(pts, mid)
    if (s.length > maxN) lo = mid
    else if (s.length < minN) hi = mid
    else { best = s; break }
    best = s
  }
  return best
}

// ── Normalization: GPS → SVG viewport ────────────────────────────────────────
// Uses the FULL deduplicated GPS set (not simplified) for the bounding box so all
// GPS samples are within the viewport.
function computeNormalization(pts, w = 1000, h = 600, margin = 60) {
  const xs = pts.map(p => p[0])
  const ys = pts.map(p => p[1])
  const min_x = Math.min(...xs), max_x = Math.max(...xs)
  const min_y = Math.min(...ys), max_y = Math.max(...ys)
  const spanX = max_x - min_x || 1
  const spanY = max_y - min_y || 1
  const scale = Math.min((w - 2 * margin) / spanX, (h - 2 * margin) / spanY)
  const offset_x = (w - spanX * scale) / 2
  const offset_y = (h - spanY * scale) / 2
  // span_y is stored so the Y-axis can be flipped at render time:
  // GPS y increases upward (north) but SVG y increases downward, so without
  // flipping the maps appear south-up. Using (span_y - (y - min_y)) * scale
  // maps max_y (north) to the top of the SVG.
  return { min_x, min_y, span_y: spanY, scale, offset_x, offset_y }
}

function applyNorm(norm, x, y) {
  return [
    norm.offset_x + (x - norm.min_x) * norm.scale,
    norm.offset_y + (norm.span_y - (y - norm.min_y)) * norm.scale,
  ]
}

// ── Catmull-Rom → closed SVG cubic Bézier ────────────────────────────────────
function catmullRomPath(pts) {
  const n = pts.length
  const cmds = []
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const cp1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const cp2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    if (i === 0) cmds.push(`M ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`)
    cmds.push(`C ${cp1[0].toFixed(1)},${cp1[1].toFixed(1)} ${cp2[0].toFixed(1)},${cp2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`)
  }
  cmds.push('Z')
  return cmds.join(' ')
}

// ── Sector break fractions from GPS arc-length + sector times ─────────────────
function sectorBreaks(rows, s1, s2) {
  try {
    if (!s1 || !s2) return [0.33, 0.67]
    let total = 0
    const arcDists = [0]
    for (let i = 1; i < rows.length; i++) {
      total += Math.hypot(rows[i].x - rows[i-1].x, rows[i].y - rows[i-1].y)
      arcDists.push(total)
    }
    if (total === 0) return [0.33, 0.67]
    const t0 = rows[0].ts
    const s1End = s1, s2End = s1 + s2
    let i1 = rows.findIndex(r => (r.ts - t0) / 1000 >= s1End)
    let i2 = rows.findIndex(r => (r.ts - t0) / 1000 >= s2End)
    if (i1 <= 0) i1 = Math.floor(rows.length * 0.33)
    if (i2 <= 0) i2 = Math.floor(rows.length * 0.67)
    const b1 = Math.round(arcDists[i1] / total * 1000) / 1000
    const b2 = Math.round(arcDists[i2] / total * 1000) / 1000
    if (b1 > 0.1 && b1 < 0.5 && b2 > b1 && b2 < 0.9) return [b1, b2]
  } catch { /* fall through */ }
  return [0.33, 0.67]
}

// ── Per-circuit processing ────────────────────────────────────────────────────
async function processCircuit(circuitId, season, round) {
  process.stdout.write(`\n[${circuitId}] ${season} R${round} ... `)
  try {
    const meta = await chQuery(`
      SELECT session_key, openf1_driver_number, best_lap_number,
             best_s1, best_s2, best_lap_duration
      FROM f1_mart.mart_qualifying_summary
      WHERE season = ${season} AND round = ${round}
        AND best_lap_duration IS NOT NULL
      ORDER BY best_lap_duration ASC
      LIMIT 1
    `)
    if (!meta.length) { console.log('no fastest lap'); return null }

    const { session_key, openf1_driver_number, best_lap_number, best_s1, best_s2, best_lap_duration } = meta[0]

    const rows = await chQuery(`
      SELECT toUnixTimestamp64Milli(date) AS ts, x, y
      FROM f1_mart.mart_lap_telemetry
      WHERE session_key = ${session_key}
        AND driver_number = ${openf1_driver_number}
        AND lap_number    = ${best_lap_number}
        AND is_pit_out_lap = 0
        AND x != 0 AND y != 0
      ORDER BY date ASC
    `)
    if (rows.length < 50) { console.log(`only ${rows.length} GPS rows`); return null }

    // Parse + deduplicate consecutive identical GPS points
    const pts = rows.map(r => ({ ts: +r.ts, x: +r.x, y: +r.y }))
    const deduped = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].x !== pts[i-1].x || pts[i].y !== pts[i-1].y) deduped.push(pts[i])
    }

    const rawPts = deduped.map(p => [p.x, p.y])

    // Normalization uses the full deduplicated GPS range so all samples fit
    const norm = computeNormalization(rawPts)

    // SVG path from simplified + normalized GPS
    const simplified = simplifyToTarget(rawPts)
    const normSimplified = simplified.map(([x, y]) => applyNorm(norm, x, y))
    const svgPath = catmullRomPath(normSimplified)

    const breaks = sectorBreaks(deduped, +best_s1 || null, +best_s2 || null)

    console.log(`${deduped.length} pts → ${simplified.length} simplified, breaks ${breaks}`)
    return {
      path: svgPath,
      sector_breaks: breaks,
      normalization: { min_x: norm.min_x, min_y: norm.min_y, span_y: norm.span_y, scale: norm.scale, offset_x: norm.offset_x, offset_y: norm.offset_y },
      source: 'warehouse',
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`)
    return null
  }
}

// ── Circuit → (season, round) ──────────────────────────────────────────────────
const CIRCUIT_ROUNDS = {
  bahrain:       [2024,  1],
  jeddah:        [2024,  2],
  albert_park:   [2024,  3],
  suzuka:        [2024,  4],
  shanghai:      [2024,  5],
  miami:         [2024,  6],
  imola:         [2024,  7],
  monaco:        [2024,  8],
  villeneuve:    [2024,  9],
  catalunya:     [2024, 10],
  red_bull_ring: [2024, 11],
  silverstone:   [2024, 12],
  hungaroring:   [2024, 13],
  spa:           [2024, 14],
  zandvoort:     [2024, 15],
  monza:         [2024, 16],
  baku:          [2024, 17],
  marina_bay:    [2024, 18],
  americas:      [2024, 19],
  rodriguez:     [2024, 20],
  interlagos:    [2024, 21],
  vegas:         [2024, 22],
  losail:        [2024, 23],
  yas_marina:    [2024, 24],
}

async function main() {
  const existing = JSON.parse(readFileSync(OUT_PATH, 'utf-8'))
  console.log(`Loaded ${Object.keys(existing).length} existing circuits`)

  const results = {}
  const failed = []

  for (const [id, [season, round]] of Object.entries(CIRCUIT_ROUNDS)) {
    const r = await processCircuit(id, season, round)
    if (r) {
      results[id] = r
    } else {
      failed.push(id)
      // Keep existing entry as fallback (it won't have normalization)
      if (existing[id]) results[id] = existing[id]
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2))
  console.log(`\n=== Done — wrote ${Object.keys(results).length} circuits ===`)
  if (failed.length) console.log(`Failed / fell back: ${failed.join(', ')}`)
}

main().catch(e => { console.error(e); process.exit(1) })
