import { getCircuitPath, getCircuitNormalization, CIRCUIT_LENGTHS, CIRCUIT_CORNERS, CIRCUIT_ROTATIONS } from './circuits.js'
import { getTeamColour, getTeamColourByDriverId } from './teamColours.js'
import { getDriverHeadshot } from './driverHeadshots.js'

function getConfig() {
  return {
    url: import.meta.env.CLICKHOUSE_URL || '',
    username: import.meta.env.CLICKHOUSE_USER || 'default',
    password: import.meta.env.CLICKHOUSE_PASSWORD || '',
    database: import.meta.env.CLICKHOUSE_DATABASE || 'f1_mart',
  }
}

export async function chQuery(sql, timeoutMs = 5000) {
  const cfg = getConfig()
  const base = import.meta.env.DEV ? '/ch' : cfg.url
  if (!base) throw new Error('CLICKHOUSE_URL is not configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}/?query=${encodeURIComponent(sql + ' FORMAT JSON')}`, {
      signal: controller.signal,
      headers: {
        'X-ClickHouse-User': cfg.username,
        'X-ClickHouse-Key': cfg.password,
        'X-ClickHouse-Database': cfg.database,
      },
    })
    if (!res.ok) {
      const body = (await res.text()).trim()
      // Vite dev proxy returns 502/503/504 when ClickHouse is unreachable; body may be empty HTML
      if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(`PROXY_${res.status}: Site   could not reach ClickHouse at ${cfg.url} — is it running on port 8123?`)
      }
      throw new Error(`ClickHouse HTTP ${res.status}: ${body || '(empty response)'}`)
    }
    const json = await res.json()
    return json.data
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`ECONNREFUSED: ClickHouse at ${cfg.url} did not respond within ${timeoutMs / 1000}s — is it running?`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export async function listSeasonsAsync() {
  const rows = await chQuery(`
    SELECT DISTINCT season
    FROM f1_mart.dim_sessions
    WHERE session_type = 'Qualifying'
    ORDER BY season DESC
  `)
  return rows.map(r => +r.season)
}

// Round-number → known fallback data for rounds missing from dim_sessions
const ROUND_FALLBACKS = {
  2024: { 22: { race_name: 'Las Vegas Grand Prix', circuit_id: 'las_vegas' } },
}

export async function listRacesAsync(season) {
  // Primary: get all rounds that have qualifying data in the mart (includes Las Vegas)
  const martRows = await chQuery(`
    SELECT round, any(race_name) as race_name
    FROM f1_mart.mart_qualifying_summary
    WHERE season = ${season} AND round > 0
    GROUP BY round
    ORDER BY round
  `)

  // Secondary: get circuit_id from dim_sessions (only populated rounds)
  const sessionRows = await chQuery(`
    SELECT round, circuit_id
    FROM f1_mart.dim_sessions
    WHERE session_type = 'Qualifying' AND session_name = 'Qualifying' AND season = ${season}
  `)
  const circuitById = new Map(sessionRows.map(r => [+r.round, r['circuit_id'] ?? null]))

  const fallbacks = ROUND_FALLBACKS[season] ?? {}

  return martRows.map(r => {
    const round = +r.round
    const fb = fallbacks[round] ?? {}
    return {
      round,
      race_name: r.race_name || fb.race_name || `Round ${round}`,
      circuit_id: circuitById.get(round) ?? fb.circuit_id ?? null,
    }
  })
}

export async function listDriversForRaceAsync(season, round) {
  const rows = await chQuery(`
    SELECT
      qualifying_position,
      driver_id,
      driver_name,
      name_acronym,
      team_name,
      team_colour,
      best_time,
      best_lap_duration,
      openf1_driver_number,
      headshot_url,
      q1, q2, q3
    FROM f1_mart.mart_qualifying_summary
    WHERE season = ${season} AND round = ${round}
    ORDER BY session_key ASC, qualifying_position ASC
  `)

  const seen = new Set()
  return rows
    .filter(r => {
      if (seen.has(r.driver_id)) return false
      seen.add(r.driver_id)
      return true
    })
    .map(r => {
      const colour = normaliseColour(r.team_colour, r.team_name, r.driver_id)
      const code = r.name_acronym || r.driver_id.toUpperCase().slice(0, 3)
      const driverNum = +r.openf1_driver_number
      const bestTimeMs = r.best_lap_duration
        ? Math.round(parseFloat(r.best_lap_duration) * 1000)
        : parseTimeToMs(r.best_time)
      return {
        driver_id: r.driver_id,
        constructor_id: r.team_name,
        qualifying_position: +r.qualifying_position,
        openf1_driver_number: driverNum,
        team_colour: colour,
        driver: {
          driver_id: r.driver_id,
          full_name: r.driver_name,
          driver_code: code,
          permanent_number: driverNum || null,
          team_name: r.team_name,
          team_colour: colour.replace('#', ''),
          headshot_initials: code.slice(0, 2),
          headshot_url: r['headshot_url'] || getDriverHeadshot(r.driver_id) || null,
        },
        q1: r.q1 || null,
        q2: r.q2 || null,
        q3: r.q3 || null,
        q1_ms: parseTimeToMs(r.q1),
        q2_ms: parseTimeToMs(r.q2),
        q3_ms: parseTimeToMs(r.q3),
        best_time: r.best_time,
        best_time_ms: bestTimeMs,
      }
    })
}

export async function getComparisonAsync(season, round, driverId, session = 'all') {
  const rows = await chQuery(`
    SELECT
      qualifying_position,
      driver_id,
      driver_name,
      name_acronym,
      team_name,
      team_colour,
      best_time,
      best_lap_duration,
      best_lap_number,
      best_s1,
      best_s2,
      best_s3,
      i1_speed,
      i2_speed,
      st_speed,
      segments_s1,
      segments_s2,
      segments_s3,
      q1, q2, q3,
      openf1_driver_number,
      \`headshot_url\`,
      session_key
    FROM f1_mart.mart_qualifying_summary
    WHERE season = ${season} AND round = ${round} AND driver_id = '${driverId}'
    ORDER BY session_key ASC
    LIMIT 1
  `)

  if (!rows.length) return null

  const r = rows[0]
  const colour = normaliseColour(r.team_colour, r.team_name, r.driver_id)
  const code = r.name_acronym || driverId.toUpperCase().slice(0, 3)
  const hasTelemetry = !!r.best_lap_duration
  const seg1 = parseSegments(r.segments_s1)
  const seg2 = parseSegments(r.segments_s2)
  const seg3 = parseSegments(r.segments_s3)
  const hasSegments = !!(seg1?.length || seg2?.length || seg3?.length)
  const s1 = parseFloat(r.best_s1) || null
  const s2 = parseFloat(r.best_s2) || null
  const s3 = parseFloat(r.best_s3) || null
  const hasSectors = !!(s1 || s2 || s3)

  let lap = null
  if (hasTelemetry || hasSegments || hasSectors) {
    lap = {
      lap_duration:      hasTelemetry ? parseFloat(r.best_lap_duration) : null,
      duration_sector_1: s1,
      duration_sector_2: s2,
      duration_sector_3: s3,
      i1_speed: r.i1_speed ? +r.i1_speed : null,
      i2_speed: r.i2_speed ? +r.i2_speed : null,
      st_speed: r.st_speed ? +r.st_speed : null,
      segments_sector_1: seg1 || (s1 ? generateSegments(s1, 7) : []),
      segments_sector_2: seg2 || (s2 ? generateSegments(s2, 8) : []),
      segments_sector_3: seg3 || (s3 ? generateSegments(s3, 6) : []),
    }
  }

  const bestTimeMs = r.best_lap_duration
    ? Math.round(parseFloat(r.best_lap_duration) * 1000)
    : parseTimeToMs(r.best_time)

  // Override with session-specific time when user has selected Q1/Q2/Q3
  const sessionTimeMs = session === 'q1' && r.q1 ? parseTimeToMs(r.q1)
                      : session === 'q2' && r.q2 ? parseTimeToMs(r.q2)
                      : session === 'q3' && r.q3 ? parseTimeToMs(r.q3)
                      : null
  const displayTimeMs = sessionTimeMs ?? bestTimeMs
  const displaySession = session === 'q1' && r.q1 ? 'Q1'
                       : session === 'q2' && r.q2 ? 'Q2'
                       : session === 'q3' && r.q3 ? 'Q3'
                       : (r.q3 ? 'Q3' : r.q2 ? 'Q2' : 'Q1')

  const pos = +r.qualifying_position
  const bestSession = displaySession

  const driverNum = +r.openf1_driver_number
  const driver = {
    driver_id: driverId,
    full_name: r.driver_name,
    driver_code: code,
    permanent_number: driverNum || null,
    team_name: r.team_name,
    team_colour: colour.replace('#', ''),
    headshot_initials: code.slice(0, 2),
    headshot_url: r['od.headshot_url'] || getDriverHeadshot(r.driver_id) || null,
  }

  return {
    season, round,
    qualifying_position: pos,
    q1: r.q1 || null,
    q2: r.q2 || null,
    q3: r.q3 || null,
    best_time: r.best_time,
    best_time_ms: displayTimeMs,
    best_session: bestSession,
    driver_id: driverId,
    driver,
    team_name: r.team_name,
    team_colour: colour,
    headshot_initials: driver.headshot_initials,
    has_telemetry: hasTelemetry,
    has_segments: hasSegments,
    lap,
  }
}

export async function getCircuitForRaceAsync(season, round) {
  const sessionRows = await chQuery(`
    SELECT circuit_id
    FROM f1_mart.dim_sessions
    WHERE session_type = 'Qualifying' AND session_name = 'Qualifying' AND season = ${season} AND round = ${round}
    LIMIT 1
  `)

  // Fall back to hardcoded data for rounds missing from dim_sessions (e.g. Las Vegas 2024)
  const fallbackCircuitId = (ROUND_FALLBACKS[season]?.[round])?.circuit_id ?? null
  if (!sessionRows.length && !fallbackCircuitId) return null

  const circuitId = sessionRows[0]?.['circuit_id'] || fallbackCircuitId
  const rows = await chQuery(`
    SELECT circuit_id, circuit_name, locality, country
    FROM f1_mart.dim_circuits
    WHERE circuit_id = '${circuitId}'
    LIMIT 1
  `)

  const trackData = getCircuitPath(circuitId)

  const rotation = CIRCUIT_ROTATIONS[circuitId] ?? 0
  if (!rows.length) {
    return {
      circuit_id: circuitId,
      circuit_name: circuitId,
      locality: '',
      country: '',
      length_km: CIRCUIT_LENGTHS[circuitId] ?? 5.0,
      corners: CIRCUIT_CORNERS[circuitId] ?? 16,
      path: trackData?.path ?? ovalPath(),
      sector_breaks: trackData?.sector_breaks ?? [0.33, 0.67],
      rotation,
    }
  }

  const r = rows[0]
  return {
    circuit_id: circuitId,
    circuit_name: r.circuit_name,
    locality: r.locality,
    country: r.country,
    length_km: CIRCUIT_LENGTHS[circuitId] ?? 5.0,
    corners: CIRCUIT_CORNERS[circuitId] ?? 16,
    path: trackData?.path ?? ovalPath(),
    sector_breaks: trackData?.sector_breaks ?? [0.33, 0.67],
    rotation,
  }
}

export function parseTimeToMs(t) {
  if (!t) return null
  const [m, rest] = t.split(':')
  return +m * 60000 + Math.round(+rest * 1000)
}

export function formatMs(ms) {
  if (ms == null || !isFinite(ms)) return '—'
  const m = Math.floor(ms / 60000)
  const s = ((ms - m * 60000) / 1000).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}

function normaliseColour(raw, teamName, driverId) {
  if (raw) return raw.startsWith('#') ? raw : '#' + raw
  const byTeam = getTeamColour(teamName)
  if (byTeam !== '#888888') return byTeam
  return getTeamColourByDriverId(driverId)
}

function ovalPath(cx = 500, cy = 300, rx = 350, ry = 200) {
  return `M ${cx - rx},${cy} Q ${cx - rx},${cy - ry} ${cx},${cy - ry} Q ${cx + rx},${cy - ry} ${cx + rx},${cy} Q ${cx + rx},${cy + ry} ${cx},${cy + ry} Q ${cx - rx},${cy + ry} ${cx - rx},${cy} Z`
}

function parseSegments(val) {
  if (!val) return null
  if (Array.isArray(val)) return val.map(Number)
  if (typeof val === 'string') {
    try { return JSON.parse(val).map(Number) } catch { return null }
  }
  return null
}

function generateSegments(sectorTime, count) {
  return Array.from({ length: count }, (_, i) => {
    const seed = Math.round((sectorTime * 13 + i * 7)) % 3
    return seed === 0 ? 2051 : seed === 1 ? 2049 : 2048
  })
}

// Fetch per-sample telemetry for a driver's best qualifying lap.
// Returns an array ordered by time. Each sample includes:
//   - speed, rpm, gear, throttle, brake, drs, x, y  (raw warehouse values)
//   - svg_x, svg_y  — GPS projected into the SVG viewport using the circuit's
//     stored normalization transform (requires warehouse-generated trackPaths.json)
//   - heading       — direction of travel in SVG degrees (for car rotation)
// Falls back to arc-length `frac` for circuits without normalization data.
export async function fetchLapTelemetryAsync(season, round, driverId, circuitId = null, session = 'all') {
  const meta = await chQuery(`
    SELECT session_key, best_lap_number, openf1_driver_number, q1, q2, q3
    FROM f1_mart.mart_qualifying_summary
    WHERE season = ${season} AND round = ${round} AND driver_id = '${driverId}'
    ORDER BY session_key ASC
    LIMIT 1
  `)
  if (!meta.length) return null
  const { session_key, best_lap_number, openf1_driver_number } = meta[0]
  if (!session_key || !best_lap_number || !openf1_driver_number) return null

  // When a specific qualifying session is requested, find the lap whose recorded
  // duration is closest to that session's time (within 3 s tolerance).
  let lap_number = +best_lap_number
  if (session !== 'all') {
    const qTime = meta[0][session]  // e.g. meta[0].q2 = "1:28.345"
    if (qTime) {
      const targetSecs = parseTimeToMs(qTime) / 1000
      const lapRows = await chQuery(`
        SELECT
          lap_number,
          (toUnixTimestamp64Milli(max(date)) - toUnixTimestamp64Milli(min(date))) / 1000.0 AS dur
        FROM f1_mart.mart_lap_telemetry
        WHERE session_key = ${session_key}
          AND driver_number = ${openf1_driver_number}
          AND is_pit_out_lap = 0
        GROUP BY lap_number
        HAVING ABS(dur - ${targetSecs}) < 3.0
        ORDER BY ABS(dur - ${targetSecs}) ASC
        LIMIT 1
      `, 20000)
      if (lapRows.length) lap_number = +lapRows[0].lap_number
    }
  }

  const rows = await chQuery(`
    SELECT
      toUnixTimestamp64Milli(date) AS ts,
      speed, rpm, n_gear, throttle, brake, drs, x, y
    FROM f1_mart.mart_lap_telemetry
    WHERE session_key = ${session_key}
      AND driver_number = ${openf1_driver_number}
      AND lap_number    = ${lap_number}
      AND is_pit_out_lap = 0
    ORDER BY date ASC
    LIMIT 4000
  `, 20000)

  if (rows.length < 10) return null

  const t0 = +rows[0].ts
  const pts = rows.map(r => ({
    t:        (+r.ts - t0) / 1000,
    speed:    +r.speed,
    rpm:      +r.rpm,
    gear:     +r.n_gear,
    throttle: +r.throttle,
    brake:    +r.brake,
    drs:      +r.drs,
    x:        +r.x,
    y:        +r.y,
  }))

  const norm = circuitId ? getCircuitNormalization(circuitId) : null

  if (norm) {
    // Project GPS → SVG using the circuit's stored normalization transform.
    // This ensures car positions align with the SVG path (both derived from the
    // same warehouse GPS coordinate system).
    for (const p of pts) {
      p.svg_x = norm.offset_x + (p.x - norm.min_x) * norm.scale
      // GPS y increases upward (north); SVG y increases downward.
      // span_y flips the axis so north appears at the top of the SVG.
      const spanY = norm.span_y ?? (norm.offset_y > 0 ? (600 - 2 * norm.offset_y) / norm.scale : 1)
      p.svg_y = norm.offset_y + (spanY - (p.y - norm.min_y)) * norm.scale
    }

    // Heading: look ahead up to 8 samples for a stable non-zero displacement.
    // Falls back to backward displacement, then inherits the previous heading.
    // This prevents atan2(0,0)=0° from GPS duplicates and the last-sample snap.
    for (let i = 0; i < pts.length; i++) {
      let dx = 0, dy = 0
      // Forward search
      for (let k = 1; k <= 8 && i + k < pts.length; k++) {
        dx = pts[i + k].svg_x - pts[i].svg_x
        dy = pts[i + k].svg_y - pts[i].svg_y
        if (dx * dx + dy * dy > 0.25) break
        dx = 0; dy = 0
      }
      // Backward fallback (end-of-lap: no forward samples with movement)
      if (dx === 0 && dy === 0 && i >= 3) {
        dx = pts[i].svg_x - pts[i - 3].svg_x
        dy = pts[i].svg_y - pts[i - 3].svg_y
      }
      pts[i].heading = (dx !== 0 || dy !== 0)
        ? Math.atan2(dy, dx) * 180 / Math.PI
        : (i > 0 ? pts[i - 1].heading : 0)
    }

    return pts
  }

  // Fallback for circuits without warehouse normalization (FastF1-based SVG).
  // Uses GPS arc-length fraction — may not be spatially accurate for those circuits.
  let totalDist = 0
  const arcDists = [0]
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x
    const dy = pts[i].y - pts[i - 1].y
    totalDist += Math.hypot(dx, dy)
    arcDists.push(totalDist)
  }
  if (totalDist === 0) return null

  return pts.map((p, i) => ({ ...p, frac: arcDists[i] / totalDist }))
}
