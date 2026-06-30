import React, { useRef, useState, useEffect } from 'react'

const FINISH_PAUSE = 2.5
const N_PTS = 600  // path sample resolution — higher = smoother heading

// ─── One-time path sampling ───────────────────────────────────────────────────
// Samples N_PTS+1 evenly-spaced points from the SVG path. Used instead of
// getPointAtLength() in the RAF loop so car positioning is pure array math.

function samplePathPoints(pathEl, totalLen, N) {
  const pts = new Array(N + 1)
  for (let i = 0; i <= N; i++) {
    const d = Math.min((i / N) * totalLen, totalLen - 0.001)
    const p = pathEl.getPointAtLength(d)
    pts[i] = { x: p.x, y: p.y }
  }
  return pts
}

function posFromSample(pts, frac) {
  const N = pts.length - 1
  const idx = ((frac % 1) + 1) % 1 * N
  const i  = Math.floor(idx)
  const i2 = (i + 1) % N
  const f  = idx - i
  const x  = pts[i].x + (pts[i2].x - pts[i].x) * f
  const y  = pts[i].y + (pts[i2].y - pts[i].y) * f
  // Heading: look a few samples ahead for a stable angle
  const ih = (i + 4) % N
  const angle = Math.atan2(pts[ih].y - pts[i].y, pts[ih].x - pts[i].x) * 180 / Math.PI
  return { x, y, angle }
}

// ─── Curvature-based fallback timing ─────────────────────────────────────────

function buildDriverTiming(pts, totalLen, sectorTimes, sectorBreaks) {
  const N = pts.length - 1
  const k = new Array(N)
  for (let i = 0; i < N; i++) {
    const a = pts[Math.max(0, i - 4)]
    const b = pts[i]
    const c = pts[Math.min(N, i + 4)]
    const v1x = b.x - a.x, v1y = b.y - a.y
    const v2x = c.x - b.x, v2y = c.y - b.y
    const cross = v1x * v2y - v1y * v2x
    const dot   = v1x * v2x + v1y * v2y
    const angle  = Math.atan2(Math.abs(cross), dot)
    const arc    = Math.hypot(v1x, v1y) + Math.hypot(v2x, v2y)
    k[i] = arc > 0 ? angle / arc * 2 : 0
  }

  let speeds = k.map(kv => Math.max(0.05, Math.pow(1 - Math.min(1, kv * 18), 1.8)))
  const dLen = totalLen / N

  if (sectorTimes?.length === 3 && sectorTimes.every(s => s > 0)) {
    const [b1, b2] = sectorBreaks
    const sIdx = [Math.floor(b1 * N), Math.floor(b2 * N), N]
    for (let iter = 0; iter < 4; iter++) {
      let start = 0
      for (let s = 0; s < 3; s++) {
        const end = sIdx[s]
        let secTime = 0
        for (let i = start; i < end; i++) secTime += dLen / speeds[i]
        if (secTime > 0) {
          const factor = secTime / sectorTimes[s]
          for (let i = start; i < end; i++) speeds[i] *= factor
        }
        start = end
      }
    }
  }

  const times = new Array(N + 1)
  times[0] = 0
  for (let i = 0; i < N; i++) times[i + 1] = times[i] + dLen / speeds[i]
  return { times, lapTime: times[N] }
}

function fracFromCurvature(timing, t) {
  if (!timing) return 0
  const { times, lapTime } = timing
  const tt = Math.min(t, lapTime - 1e-6)
  const N = times.length - 1
  let lo = 0, hi = N
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] < tt) lo = mid + 1; else hi = mid
  }
  const i = Math.max(0, lo - 1)
  return (i + (tt - times[i]) / Math.max(1e-6, times[i + 1] - times[i])) / N
}

// ─── Telemetry interpolation ──────────────────────────────────────────────────

function interpTel(tel, t) {
  if (!tel || !tel.length) return null
  const N = tel.length
  if (t >= tel[N - 1].t) return tel[N - 1]
  if (t <= tel[0].t)     return tel[0]
  let lo = 0, hi = N - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tel[mid].t <= t) lo = mid; else hi = mid - 1
  }
  const a = tel[lo], b = tel[lo + 1]
  const f = (t - a.t) / Math.max(0.001, b.t - a.t)

  const result = {
    speed:    Math.round(a.speed    + (b.speed    - a.speed)    * f),
    gear:     a.gear,
    throttle: a.throttle + (b.throttle - a.throttle) * f,
    brake:    a.brake    + (b.brake    - a.brake)    * f,
    drs:      a.drs,
  }

  if (a.svg_x != null) {
    // Direct GPS→SVG positioning: interpolate position and heading via direction vector
    result.svg_x = a.svg_x + (b.svg_x - a.svg_x) * f
    result.svg_y = a.svg_y + (b.svg_y - a.svg_y) * f
    const haA = (a.heading ?? 0) * Math.PI / 180
    const haB = (b.heading ?? 0) * Math.PI / 180
    const dx = Math.cos(haA) + (Math.cos(haB) - Math.cos(haA)) * f
    const dy = Math.sin(haA) + (Math.sin(haB) - Math.sin(haA)) * f
    result.heading = Math.atan2(dy, dx) * 180 / Math.PI
  } else if (a.frac != null) {
    // Arc-length fallback for circuits without warehouse normalization
    result.frac = a.frac + (b.frac - a.frac) * f
  }

  return result
}

// ─── F1 car top-down silhouette ───────────────────────────────────────────────
// Nose points +x. Scale: ~26 units long, ~18 units wide. Centered at origin.

function F1CarShape({ color, leader }) {
  const outline = leader ? "#fff" : "#111"
  const outlineW = leader ? "0.7" : "0.4"
  return (
    <g>
      {/* Rear wing */}
      <rect x="-13" y="-9" width="3.5" height="18" rx="1.5"
        fill={color} stroke={outline} strokeWidth={outlineW} opacity="0.88"/>
      {/* Main body — tapered nose */}
      <path d="M-9,-5.5 L-4,-6.5 L2,-6.5 L6,-5 L9,-2.5 L11.5,0 L9,2.5 L6,5 L2,6.5 L-4,6.5 L-9,5.5 Z"
        fill={color} stroke={outline} strokeWidth={outlineW}/>
      {/* Nose cone */}
      <path d="M9,-2.5 L13.5,0 L9,2.5 Z"
        fill={color} stroke={outline} strokeWidth={outlineW}/>
      {/* Front wing */}
      <rect x="12" y="-8" width="3" height="16" rx="1.5"
        fill={color} stroke={outline} strokeWidth={outlineW} opacity="0.88"/>
      {/* Cockpit */}
      <ellipse cx="1" cy="0" rx="3.5" ry="2.5" fill="#090910" opacity="0.8"/>
      {/* Rear wheels */}
      <rect x="-11" y="-9.5" width="5" height="4" rx="1.3" fill="#0a0a0c" stroke="#2a2a30" strokeWidth="0.4"/>
      <rect x="-11" y="5.5"  width="5" height="4" rx="1.3" fill="#0a0a0c" stroke="#2a2a30" strokeWidth="0.4"/>
      {/* Front wheels */}
      <rect x="5" y="-8.5" width="4.5" height="3.5" rx="1.3" fill="#0a0a0c" stroke="#2a2a30" strokeWidth="0.4"/>
      <rect x="5" y="5"    width="4.5" height="3.5" rx="1.3" fill="#0a0a0c" stroke="#2a2a30" strokeWidth="0.4"/>
    </g>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrackRibbon({
  circuit, animateKey,
  leaderColor, chaserColor, leaderName, chaserName,
  leaderLapMs, chaserLapMs, leaderSectors, chaserSectors,
  sectorWinner, showCars = true,
  telemetryA, telemetryB, telLoading,
}) {
  const pathRef      = useRef(null)
  const leaderCarRef = useRef(null)
  const chaserCarRef = useRef(null)
  const ptsRef       = useRef(null)   // pre-sampled path points
  const timingRef    = useRef({ leader: null, chaser: null })
  const lenRef       = useRef(0)

  // Telemetry in refs so the RAF loop reads the latest without restarting
  const telARef = useRef(telemetryA)
  const telBRef = useRef(telemetryB)
  useEffect(() => { telARef.current = telemetryA }, [telemetryA])
  useEffect(() => { telBRef.current = telemetryB }, [telemetryB])

  // HUD DOM refs — updated directly in RAF, no React re-render
  const aSpeedRef = useRef(null), bSpeedRef = useRef(null)
  const aGearRef  = useRef(null), bGearRef  = useRef(null)
  const aThrRef   = useRef(null), bThrRef   = useRef(null)
  const aBrkRef   = useRef(null), bBrkRef   = useRef(null)
  const aDrsRef   = useRef(null), bDrsRef   = useRef(null)

  const [len, setLen] = useState(0)

  // Build path sample table + curvature timing (one-time per circuit/sectors)
  useEffect(() => {
    if (!pathRef.current) return
    const pathEl = pathRef.current
    const total  = pathEl.getTotalLength()
    lenRef.current = total
    const pts    = samplePathPoints(pathEl, total, N_PTS)
    ptsRef.current = pts
    const breaks = circuit?.sector_breaks ?? [0.33, 0.67]
    timingRef.current = {
      leader: buildDriverTiming(pts, total, leaderSectors, breaks),
      chaser: buildDriverTiming(pts, total, chaserSectors, breaks),
    }
    setLen(total)  // triggers re-render only for static SVG decorations
  }, [
    circuit?.circuit_id,
    leaderSectors?.[0], leaderSectors?.[1], leaderSectors?.[2],
    chaserSectors?.[0], chaserSectors?.[1], chaserSectors?.[2],
  ])

  // RAF loop — zero React state updates, pure DOM mutations
  useEffect(() => {
    const leaderLapS = (leaderLapMs || 90000) / 1000
    const chaserLapS = (chaserLapMs || 90000) / 1000
    const CYCLE = Math.max(leaderLapS, chaserLapS) + FINISH_PAUSE

    let raf
    const start = performance.now()

    const frame = (now) => {
      raf = requestAnimationFrame(frame)

      const pts = ptsRef.current
      if (!pts) return

      const t = ((now - start) / 1000) % CYCLE

      const liveA = interpTel(telARef.current, t)
      const liveB = interpTel(telBRef.current, t)

      // Move cars via direct attribute mutation
      if (showCars) {
        const moveCar = (ref, live, fallbackFrac) => {
          if (!ref.current) return
          if (live?.svg_x != null) {
            // Direct GPS projection: car is at the actual GPS position in SVG space
            ref.current.setAttribute('transform',
              `translate(${live.svg_x.toFixed(1)},${live.svg_y.toFixed(1)}) rotate(${(live.heading ?? 0).toFixed(1)})`)
          } else {
            // Arc-length fallback for circuits without warehouse normalization
            const frac = live?.frac != null
              ? Math.min(1, live.frac)
              : Math.min(1, fallbackFrac)
            const { x, y, angle } = posFromSample(pts, frac)
            ref.current.setAttribute('transform',
              `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${angle.toFixed(1)})`)
          }
        }
        moveCar(leaderCarRef, liveA, fracFromCurvature(timingRef.current.leader, t))
        moveCar(chaserCarRef, liveB, fracFromCurvature(timingRef.current.chaser, t))
      }

      // Update HUD values via direct DOM mutation
      const updateHud = (speedRef, gearRef, thrRef, brkRef, drsRef, live) => {
        if (!speedRef.current || !live) return
        speedRef.current.textContent = live.speed
        gearRef.current.textContent  = live.gear
        thrRef.current.style.width   = `${Math.min(100, live.throttle).toFixed(1)}%`
        brkRef.current.style.width   = `${Math.min(100, live.brake).toFixed(1)}%`
        if (drsRef.current) {
          const on = live.drs >= 10
          drsRef.current.classList.toggle('tel-drs-on', on)
        }
      }
      updateHud(aSpeedRef, aGearRef, aThrRef, aBrkRef, aDrsRef, liveA)
      updateHud(bSpeedRef, bGearRef, bThrRef, bBrkRef, bDrsRef, liveB)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [leaderLapMs, chaserLapMs, showCars, animateKey])

  if (!circuit) return null

  const [b1, b2] = circuit.sector_breaks
  const segs = [
    { from: 0,  to: b1 },
    { from: b1, to: b2 },
    { from: b2, to: 1  },
  ]

  const hasTel = !!(telemetryA || telemetryB)
  const rotation = circuit.rotation ?? 0

  // Sector divider positions — computed once when len is known
  const sectorDividers = len > 0 ? circuit.sector_breaks.map((b, i) => {
    const p  = pathRef.current.getPointAtLength(b * len)
    const p2 = pathRef.current.getPointAtLength(Math.min(b * len + 1, len - 0.001))
    const angle = Math.atan2(p2.y - p.y, p2.x - p.x) + Math.PI / 2
    const dx = Math.cos(angle) * 16, dy = Math.sin(angle) * 16
    return { p, dx, dy, label: `S${i + 2}` }
  }) : []

  const startLine = len > 0 ? (() => {
    const p  = pathRef.current.getPointAtLength(0.001)
    const p2 = pathRef.current.getPointAtLength(8)
    const angle = Math.atan2(p2.y - p.y, p2.x - p.x) + Math.PI / 2
    const dx = Math.cos(angle) * 18, dy = Math.sin(angle) * 18
    return { p, dx, dy }
  })() : null

  return (
    <>
      <svg viewBox="0 0 1000 600" className="track-svg" preserveAspectRatio="xMidYMid meet">
        {/* Grid stays fixed — outside the rotation group */}
        <g opacity="0.06" stroke="#fff" strokeWidth="0.5">
          {Array.from({length: 20}).map((_,i) =>
            <line key={"v"+i} x1={i*50} y1="0" x2={i*50} y2="600"/>)}
          {Array.from({length: 12}).map((_,i) =>
            <line key={"h"+i} x1="0" y1={i*50} x2="1000" y2={i*50}/>)}
        </g>

        {/* All track + car elements are rotated together around the SVG centre.
            rotation is a clockwise angle in degrees read from CIRCUIT_ROTATIONS. */}
        <g transform={rotation ? `rotate(${rotation}, 500, 300)` : undefined}>

          {/* track shadow + asphalt */}
          <path ref={pathRef} d={circuit.path}
            fill="none" stroke="#000" strokeWidth="32"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
          <path d={circuit.path}
            fill="none" stroke="#1a1a1f" strokeWidth="26"
            strokeLinecap="round" strokeLinejoin="round"/>

          {/* sector overlays */}
          {len > 0 && segs.map((s, i) => {
            const segLen = (s.to - s.from) * len
            const winnerColor = sectorWinner?.[i] === "leader" ? leaderColor
                              : sectorWinner?.[i] === "chaser" ? chaserColor
                              : "#3a3a42"
            return (
              <path key={i} d={circuit.path}
                fill="none" stroke={winnerColor} strokeWidth="6" strokeLinecap="butt"
                strokeDasharray={`${segLen} ${len - segLen}`}
                strokeDashoffset={-(s.from * len)}
                opacity="0.95" style={{transition:"stroke 0.5s"}}/>
            )
          })}

          {/* centerline */}
          <path d={circuit.path} fill="none" stroke="#fff" strokeWidth="0.6"
            strokeDasharray="4 10" opacity="0.35"/>

          {/* sector dividers */}
          {sectorDividers.map(({ p, dx, dy, label }, i) => {
            const tx = p.x+dx*1.6, ty = p.y+dy*1.6
            return (
              <g key={i}>
                <line x1={p.x-dx} y1={p.y-dy} x2={p.x+dx} y2={p.y+dy}
                  stroke="#fff" strokeWidth="2" opacity="0.85"/>
                <text x={tx} y={ty} fill="#fff" fontSize="14"
                  fontFamily="var(--mono)" textAnchor="middle"
                  dominantBaseline="middle" opacity="0.8"
                  transform={rotation ? `rotate(${-rotation}, ${tx}, ${ty})` : undefined}>{label}</text>
              </g>
            )
          })}

          {/* start/finish */}
          {startLine && (() => {
            const tx = startLine.p.x-startLine.dx*2, ty = startLine.p.y-startLine.dy*2+4
            return (
              <g>
                <line x1={startLine.p.x-startLine.dx} y1={startLine.p.y-startLine.dy}
                      x2={startLine.p.x+startLine.dx} y2={startLine.p.y+startLine.dy}
                  stroke="var(--accent)" strokeWidth="3"/>
                <text x={tx} y={ty}
                  fill="var(--accent)" fontSize="13"
                  fontFamily="var(--mono)" textAnchor="middle"
                  transform={rotation ? `rotate(${-rotation}, ${tx}, ${ty})` : undefined}>START</text>
              </g>
            )
          })()}

          {/* cars — shape is static, transform is mutated by RAF */}
          {showCars && (
            <g style={{filter:"drop-shadow(0 0 5px rgba(0,0,0,0.7))"}}>
              <g ref={chaserCarRef}>
                <F1CarShape color={chaserColor} leader={false}/>
              </g>
              <g ref={leaderCarRef}>
                <F1CarShape color={leaderColor} leader={true}/>
              </g>
            </g>
          )}
        </g>

        {/* Static labels — outside the rotation group so they stay upright */}
        <text x="20" y="40" fill="#fff" opacity="0.5" fontSize="11"
          fontFamily="var(--mono)" letterSpacing="2">
          CIRCUIT MAP // {circuit.circuit_id.toUpperCase()}
          {hasTel && <tspan fill="var(--good)" opacity="0.9"> · LIVE TELEMETRY</tspan>}
        </text>
        <text x="20" y="565" fill="#fff" opacity="0.4" fontSize="10"
          fontFamily="var(--mono)" letterSpacing="1.5">
          LENGTH {circuit.length_km.toFixed(3)} KM · CORNERS {circuit.corners} · {circuit.country.toUpperCase()}
        </text>
      </svg>

      {/* Telemetry HUD — DOM structure is static, values written by RAF */}
      {hasTel && (
        <div className="tel-hud">
          {/* Leader (A) */}
          <div className="tel-row tel-row-left">
            <span className="tel-code" style={{ color: leaderColor }}>{leaderName}</span>
            <span className="tel-speed">
              <span ref={aSpeedRef} className="tel-speed-val">—</span>
              <span className="tel-speed-unit"> KM/H</span>
            </span>
            <span ref={aGearRef} className="tel-gear" style={{ color: leaderColor }}>—</span>
            <div className="tel-gauges">
              <div className="tel-gauge-row">
                <span className="tel-gauge-lbl">THR</span>
                <div className="tel-gauge-track">
                  <div ref={aThrRef} className="tel-gauge-fill"
                    style={{ width: '0%', background: 'var(--good)' }}/>
                </div>
              </div>
              <div className="tel-gauge-row">
                <span className="tel-gauge-lbl">BRK</span>
                <div className="tel-gauge-track">
                  <div ref={aBrkRef} className="tel-gauge-fill"
                    style={{ width: '0%', background: 'var(--accent)' }}/>
                </div>
              </div>
            </div>
            <span ref={aDrsRef} className="tel-drs">DRS</span>
          </div>

          <div className="tel-hud-sep"/>

          {/* Chaser (B) */}
          <div className="tel-row tel-row-right">
            <span className="tel-code" style={{ color: chaserColor }}>{chaserName}</span>
            <span className="tel-speed">
              <span ref={bSpeedRef} className="tel-speed-val">—</span>
              <span className="tel-speed-unit"> KM/H</span>
            </span>
            <span ref={bGearRef} className="tel-gear" style={{ color: chaserColor }}>—</span>
            <div className="tel-gauges">
              <div className="tel-gauge-row">
                <span className="tel-gauge-lbl">THR</span>
                <div className="tel-gauge-track">
                  <div ref={bThrRef} className="tel-gauge-fill"
                    style={{ width: '0%', background: 'var(--good)' }}/>
                </div>
              </div>
              <div className="tel-gauge-row">
                <span className="tel-gauge-lbl">BRK</span>
                <div className="tel-gauge-track">
                  <div ref={bBrkRef} className="tel-gauge-fill"
                    style={{ width: '0%', background: 'var(--accent)' }}/>
                </div>
              </div>
            </div>
            <span ref={bDrsRef} className="tel-drs">DRS</span>
          </div>
        </div>
      )}
      {telLoading && !hasTel && (
        <div className="tel-loading">LOADING TELEMETRY…</div>
      )}
    </>
  )
}
