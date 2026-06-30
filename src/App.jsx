import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  listSeasonsAsync, listRacesAsync, listDriversForRaceAsync,
  getComparisonAsync, getCircuitForRaceAsync, fetchLapTelemetryAsync,
  formatMs,
} from './data/index.js'
import SimulationView from './simulation/SimulationView.jsx'
import {
  DriverCard, DriverPicker, Select, TrackRibbon, MiniSectorStrip, SectorBars, SpeedTraps,
  TweaksPanel, useTweaks, TweakSection, TweakColor, TweakToggle,
} from './components/index.js'
import LoadingScreens, { pickLoadingVariant } from './components/LoadingScreens.jsx'
import { useCountUp } from './hooks/useCountUp.js'

const dismissBoot = () => document.getElementById('boot')?.classList.add('gone')

function categoriseError(e) {
  const msg = (e.message || String(e) || 'Unknown error').trim()
  if (!msg || msg === 'Error') {
    return { type: 'network', raw: 'No error message — likely a network failure or CORS block. Check the browser console (F12).' }
  }
  if (/failed to fetch|networkerror|err_connection_refused|econnrefused|err_network|aborted|did not respond/i.test(msg))
    return { type: 'network', raw: msg }
  if (/proxy_50[234]|502|503|504|bad gateway|service unavailable|vite proxy/i.test(msg))
    return { type: 'network', raw: msg }
  if (/authentication|password|403|401|access denied|wrong password/i.test(msg))
    return { type: 'auth', raw: msg }
  if (/unknown database|no database|404|f1_mart/i.test(msg))
    return { type: 'db', raw: msg }
  return { type: 'unknown', raw: msg }
}

const ERROR_META = {
  network: { label: 'WAREHOUSE UNREACHABLE', hint: 'ClickHouse is not running or the site cannot reach it.', action: 'Start ClickHouse on port 8123 and retry.' },
  auth:    { label: 'AUTHENTICATION FAILED', hint: 'The username or password is incorrect.',                      action: 'Check CLICKHOUSE_USER / CLICKHOUSE_PASSWORD in .env' },
  db:      { label: 'DATABASE NOT FOUND',    hint: '"f1_mart" database does not exist or migrations have not run.', action: 'Run the dbt migrations first.' },
  unknown: { label: 'QUERY FAILED',          hint: 'An unexpected error was returned by the warehouse.',           action: 'Check the error details below.' },
}

function DbConnecting({ endpoint }) {
  const [dots, setDots] = useState('')
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="app dbc-screen">
      <div className="dbc-pulse" />
      <div className="dbc-label">CONNECTING TO WAREHOUSE{dots}</div>
      <div className="dbc-endpoint">{endpoint}</div>
    </div>
  )
}

function DbError({ error, endpoint, onRetry }) {
  const meta = ERROR_META[error.type] || ERROR_META.unknown
  return (
    <div className="app dbe-screen">
      <div className="dbe-card">
        <div className="dbe-stripe"/>
        <div className="dbe-head">
          <span className="dbe-sigil">///</span>
          <span className="dbe-label">{meta.label}</span>
        </div>
        <div className="dbe-body">
          <div className="dbe-hint">{meta.hint}</div>
          <div className="dbe-action">{meta.action}</div>
          <div className="dbe-endpoint-row">
            <span className="dbe-ep-lbl">ENDPOINT</span>
            <code className="dbe-ep-val">{endpoint}</code>
          </div>
          <div className="dbe-raw-label">ERROR DETAIL</div>
          <pre className="dbe-raw">{error.raw}</pre>
        </div>
        <div className="dbe-footer">
          <button className="dbe-retry" onClick={onRetry}>↺ RETRY CONNECTION</button>
        </div>
      </div>
    </div>
  )
}

const TWEAK_DEFAULTS = {
  "accent": "#FF1801",
  "showCarsOnTrack": true,
  "scanlines": true,
  "compact": false
}

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS)

  const [seasons, setSeasons] = useState([])
  const [season, setSeason] = useState(null)
  const [round, setRound] = useState(null)
  const [session, setSession] = useState("all")
  const [driverA, setDriverA] = useState(null)
  const [driverB, setDriverB] = useState(null)
  const [view, setView] = useState("setup")
  const [animKey, setAnimKey] = useState(0)
  const [mode, setMode] = useState("2d")
  const [dbError, setDbError] = useState(null)
  const [connecting, setConnecting] = useState(true)
  const [retryKey, setRetryKey] = useState(0)

  const [races, setRaces] = useState([])
  const [candidates, setCandidates] = useState([])
  const [compareA, setCompareA] = useState(null)
  const [compareB, setCompareB] = useState(null)
  const [circuit, setCircuit] = useState(null)
  const [telemetryA, setTelemetryA] = useState(null)
  const [telemetryB, setTelemetryB] = useState(null)
  const [telLoading, setTelLoading] = useState(false)
  const [loadingVariant, setLoadingVariant] = useState('lights')
  const loadingStartRef = useRef(0)

  useEffect(() => {
    setConnecting(true)
    setDbError(null)
    listSeasonsAsync()
      .then(s => {
        setSeasons(s)
        setSeason(s[0] ?? null)
        setConnecting(false)
        dismissBoot()
      })
      .catch(e => {
        console.error('[ClickHouse] connection failed:', e)
        setDbError(categoriseError(e))
        setConnecting(false)
        dismissBoot()
      })
  }, [retryKey])

  useEffect(() => {
    if (!season) return
    listRacesAsync(season)
      .then(r => {
        setRaces(r)
        setRound(prev => r.find(x => x.round === prev) ? prev : r[0]?.round ?? null)
      })
      .catch(e => setDbError(categoriseError(e)))
  }, [season])

  // When the race selection changes, wipe stale results and return to the
  // loading screen so the old circuit/telemetry never drives the new animation.
  // Circuit is also cleared so the auto-transition below won't fire until the
  // new round's path has arrived — preventing cars from being positioned on the
  // wrong track.
  useEffect(() => {
    setCompareA(null)
    setCompareB(null)
    setTelemetryA(null)
    setTelemetryB(null)
    setCircuit(null)
    setView(v => {
      if (v === "compare") {
        setLoadingVariant(pickLoadingVariant())
        loadingStartRef.current = Date.now()
        return "loading"
      }
      return v
    })
  }, [season, round])

  // When session changes while comparing, show the loading screen for the new fetch.
  useEffect(() => {
    setView(v => {
      if (v !== "compare") return v
      setCompareA(null)
      setCompareB(null)
      setTelemetryA(null)
      setTelemetryB(null)
      setLoadingVariant(pickLoadingVariant())
      loadingStartRef.current = Date.now()
      return "loading"
    })
  }, [session])

  useEffect(() => {
    if (!season || !round) return
    getCircuitForRaceAsync(season, round)
      .then(c => { if (c) setCircuit(c) })
      .catch(e => setDbError(categoriseError(e)))
    listDriversForRaceAsync(season, round)
      .then(c => {
        setCandidates(c)
        const ids = c.map(x => x.driver_id)
        setDriverA(prev => ids.includes(prev) ? prev : ids[0] ?? null)
        setDriverB(prev => ids.includes(prev) ? prev : ids[1] ?? null)
      })
      .catch(e => setDbError(categoriseError(e)))
  }, [season, round])

  // Fires during both "loading" and "compare" so that a round change (which sets
  // view back to "loading") immediately kicks off a fresh fetch.  A cancel flag
  // on the cleanup ensures stale results from intermediate driver-list updates
  // are ignored — only the last settled fetch wins.
  useEffect(() => {
    if (view !== "compare" && view !== "loading") return
    if (!season || !round || !driverA || !driverB) return
    let cancelled = false

    setCompareA(null); setCompareB(null)
    Promise.all([
      getComparisonAsync(season, round, driverA, session),
      getComparisonAsync(season, round, driverB, session),
    ])
      .then(([a, b]) => { if (!cancelled) { setCompareA(a); setCompareB(b) } })
      .catch(e => { if (!cancelled) setDbError(categoriseError(e)) })

    setTelemetryA(null); setTelemetryB(null); setTelLoading(true)
    const cid = circuit?.circuit_id ?? null
    Promise.all([
      fetchLapTelemetryAsync(season, round, driverA, cid, session),
      fetchLapTelemetryAsync(season, round, driverB, cid, session),
    ])
      .then(([ta, tb]) => { if (!cancelled) { setTelemetryA(ta); setTelemetryB(tb) } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTelLoading(false) })

    return () => { cancelled = true }
  }, [view, season, round, driverA, driverB, session]) // eslint-disable-line

  // Once comparison results AND the new circuit are all ready, switch to compare.
  // Enforces a minimum 4 s loading screen so the animation is actually visible.
  const MIN_LOADING_MS = 4000
  useEffect(() => {
    if (view !== "loading" || !compareA || !compareB || !circuit) return
    const elapsed = Date.now() - loadingStartRef.current
    const delay = Math.max(0, MIN_LOADING_MS - elapsed)
    const t = setTimeout(() => { setView("compare"); setAnimKey(k => k + 1) }, delay)
    return () => clearTimeout(t)
  }, [view, compareA, compareB, circuit])

  const onCompare = () => { setLoadingVariant(pickLoadingVariant()); loadingStartRef.current = Date.now(); setView("loading") }
  const onReset = () => { setView("setup") }

  const sessionCandidates = useMemo(() => {
    if (session === 'all') return candidates
    const timeKey = session        // 'q1' | 'q2' | 'q3'
    const msKey   = session + '_ms'
    return candidates
      .filter(c => c[timeKey])
      .sort((a, b) => a[msKey] - b[msKey])
      .map((c, i) => ({ ...c, qualifying_position: i + 1, display_time: c[timeKey] }))
  }, [candidates, session])

  // Keep driver selections valid when session changes
  useEffect(() => {
    const ids = sessionCandidates.map(x => x.driver_id)
    if (ids.length === 0) return
    if (!ids.includes(driverA)) setDriverA(ids[0])
    if (!ids.includes(driverB)) setDriverB(ids[1] || ids[0])
  }, [sessionCandidates]) // eslint-disable-line

  const sectorWinner = useMemo(() => {
    if (!compareA?.lap || !compareB?.lap) return null
    // "leader" must mean the faster overall driver, not necessarily compareA
    const fasterIsA = (compareB.best_time_ms ?? 0) - (compareA.best_time_ms ?? 0) > 0
    return [1,2,3].map(i => {
      const aWinsSector = compareA.lap["duration_sector_"+i] < compareB.lap["duration_sector_"+i]
      return (fasterIsA ? aWinsSector : !aWinsSector) ? "leader" : "chaser"
    })
  }, [compareA, compareB])

  if (connecting) return <DbConnecting endpoint={import.meta.env.CLICKHOUSE_URL || 'http://localhost:8123'} />

  if (dbError) return <DbError error={dbError}
    endpoint={import.meta.env.CLICKHOUSE_URL || 'http://localhost:8123'}
    onRetry={() => setRetryKey(k => k + 1)} />

  return (
    <div className={"app" + (tweaks.scanlines ? " scan" : "") + (tweaks.compact ? " compact" : "")}
      style={{ "--accent": tweaks.accent }}>
      <TopBar />
      <SetupBar
        seasons={seasons}
        season={season} setSeason={setSeason}
        round={round} setRound={setRound}
        session={session} setSession={setSession}
        races={races}
        circuit={circuit}
        view={view}
      />

      {view === "setup" && (
        <SetupView
          candidates={sessionCandidates}
          session={session}
          driverA={driverA} setDriverA={setDriverA}
          driverB={driverB} setDriverB={setDriverB}
          onCompare={onCompare}
          circuit={circuit}
          accent={tweaks.accent}
        />
      )}

      {view === "loading" && (
        <LoadingScreens a={compareA} b={compareB} circuit={circuit} variant={loadingVariant} />
      )}

      {view === "compare" && compareA && compareB && mode === "2d" && (
        <CompareView
          a={compareA} b={compareB}
          circuit={circuit}
          sectorWinner={sectorWinner}
          animKey={animKey}
          onReset={onReset}
          showCarsOnTrack={tweaks.showCarsOnTrack}
          mode={mode} setMode={setMode}
          telemetryA={telemetryA} telemetryB={telemetryB} telLoading={telLoading}
        />
      )}

      {view === "compare" && compareA && compareB && mode === "3d" && (
        <SimulationView
          a={compareA} b={compareB}
          circuit={circuit}
          onBack={() => setMode("2d")}
        />
      )}

      <Footer/>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Look"/>
        <TweakColor label="Accent" value={tweaks.accent}
          options={["#FF1801","#27F4D2","#FFB400","#E80020","#3671C6"]}
          onChange={v => setTweak("accent", v)}/>
        <TweakToggle label="Scanline overlay" value={tweaks.scanlines}
          onChange={v => setTweak("scanlines", v)}/>
        <TweakToggle label="Compact density" value={tweaks.compact}
          onChange={v => setTweak("compact", v)}/>
        <TweakSection label="Track map"/>
        <TweakToggle label="Animated cars" value={tweaks.showCarsOnTrack}
          onChange={v => setTweak("showCarsOnTrack", v)}/>
      </TweaksPanel>
    </div>
  )
}

function TopBar() {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-bar"/>
        <span className="brand-name">APEX/<i>TELEMETRY</i></span>
        <span className="brand-sub">QUALIFYING LAP COMPARATOR · v0.3</span>
      </div>
      <div className="tickers">
        <Ticker label="LIVE">SECTOR DELTA ENGINE</Ticker>
        {/* <Ticker label="REC">OPENF1 · JOLPICA</Ticker> */}
        <Clock/>
      </div>
    </header>
  )
}

function Ticker({label, children}) {
  return (
    <span className="ticker">
      <span className="ticker-dot"/>{label} <em>{children}</em>
    </span>
  )
}

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(()=>setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const pad = n => String(n).padStart(2,"0")
  return <span className="clock">{pad(now.getUTCHours())}:{pad(now.getUTCMinutes())}:{pad(now.getUTCSeconds())} UTC</span>
}

function SetupBar({seasons, season, setSeason, round, setRound, session, setSession, races, circuit, view}) {
  return (
    <div className="setupbar">
      <div className="sb-block">
        <div className="sb-lbl">SEASON</div>
        <Select
          value={season}
          onChange={v => setSeason(+v)}
          options={seasons.map(s => ({ value: s, label: String(s) }))}
        />
      </div>
      <div className="sb-block sb-block-wide">
        <div className="sb-lbl">ROUND</div>
        <Select
          value={round}
          onChange={v => setRound(+v)}
          options={races.map(r => ({ value: r.round, label: `R${String(r.round).padStart(2,"0")} · ${r.race_name}` }))}
        />
      </div>
      <div className="sb-block">
        <div className="sb-lbl">SESSION</div>
        <Select
          value={session}
          onChange={setSession}
          options={[
            { value: 'all', label: 'All (Best)' },
            { value: 'q3',  label: 'Q3 Only' },
            { value: 'q2',  label: 'Q2 Only' },
            { value: 'q1',  label: 'Q1 Only' },
          ]}
        />
      </div>
      <div className="sb-block">
        <div className="sb-lbl">CIRCUIT</div>
        <div className="sb-val">{circuit?.circuit_name ?? "—"}</div>
      </div>
      <div className="sb-block sb-status">
        <div className="sb-lbl">STATUS</div>
        <div className="sb-val">
          <span className={"status-dot " + (view==="compare"?"on":view==="loading"?"warn":"idle")}/>
          {view === "compare" ? "COMPARING" : view === "loading" ? "LOADING TELEMETRY" : "AWAITING SELECTION"}
        </div>
      </div>
    </div>
  )
}

function SetupView({candidates, session, driverA, setDriverA, driverB, setDriverB, onCompare, circuit, accent}) {
  const aOk = driverA && driverB && driverA !== driverB
  return (
    <section className="setup">
      <div className="setup-grid">
        <DriverPicker
          candidates={candidates}
          session={session}
          value={driverA} onChange={setDriverA}
          label="DRIVER A" side="left" accent={accent}
        />
        <div className="setup-mid">
          <div className="setup-vs">
            <div className="vs-line"/>
            <div className="vs-box">VS</div>
            <div className="vs-line"/>
          </div>
          <div className="setup-circuit">
            <div className="sc-head">SELECTED CIRCUIT</div>
            <div className="sc-name">{circuit?.circuit_name}</div>
            <div className="sc-meta">
              <span>{circuit?.locality}, {circuit?.country}</span>
              <span>·</span>
              <span>{circuit?.length_km?.toFixed(3)} km</span>
              <span>·</span>
              <span>{circuit?.corners} corners</span>
            </div>
            <div className="sc-mini">
              <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet">
                <path d={circuit?.path} fill="none" stroke="#2a2a32" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round"/>
                <path d={circuit?.path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 8"/>
              </svg>
            </div>
          </div>
          <button className={"big-btn" + (aOk ? "" : " disabled")} onClick={aOk ? onCompare : undefined}>
            <span className="bb-arrow">▶</span>
            <span>RUN COMPARISON</span>
            <span className="bb-spec">[ENTER]</span>
          </button>
          {!aOk && <div className="setup-warn">Pick two different drivers to continue.</div>}
        </div>
        <DriverPicker
          candidates={candidates}
          session={session}
          value={driverB} onChange={setDriverB}
          label="DRIVER B" side="right" accent={accent}
        />
      </div>
    </section>
  )
}

function LoadingView({a, b, circuit}) {
  const steps = [
    "QUERY  f1_mart.mart_qualifying_summary",
    "FILTER season / round / driver_id",
    "READ   best_lap_duration  best_s1..s3",
    "READ   i1_speed  i2_speed  st_speed",
    "DECODE segments_s1..s3   → mini-sector strip",
    "RENDER comparison frame",
  ]
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(x => Math.min(steps.length, x+1)), 220)
    return () => clearInterval(t)
  }, [])
  return (
    <section className="loading">
      <div className="loading-head">
        <div className="ld-lbl">QUERYING TELEMETRY MART</div>
        <div className="ld-sub">{a?.driver?.full_name} ↔ {b?.driver?.full_name} · {circuit?.circuit_name}</div>
      </div>
      <div className="loading-log">
        {steps.map((s, idx) => (
          <div key={idx} className={"ld-line " + (idx < i ? "done" : idx === i ? "live" : "wait")}>
            <span className="ld-tag">{idx < i ? "✓" : idx === i ? "▶" : " "}</span>
            <span>{s}</span>
            {idx === i && <span className="ld-spin"/>}
          </div>
        ))}
      </div>
      <div className="loading-bar"><div className="lb-fill"/></div>
    </section>
  )
}

// Trim each sector's segments to the minimum count between both drivers so the strips align
function normalisedLap(lap, otherLap) {
  if (!lap || !otherLap) return lap
  return {
    ...lap,
    segments_sector_1: lap.segments_sector_1.slice(0, Math.min(lap.segments_sector_1.length, otherLap.segments_sector_1.length)),
    segments_sector_2: lap.segments_sector_2.slice(0, Math.min(lap.segments_sector_2.length, otherLap.segments_sector_2.length)),
    segments_sector_3: lap.segments_sector_3.slice(0, Math.min(lap.segments_sector_3.length, otherLap.segments_sector_3.length)),
  }
}

function CompareView({a, b, circuit, sectorWinner, animKey, onReset, showCarsOnTrack, mode, setMode, telemetryA, telemetryB, telLoading}) {
  const deltaMs = (b.best_time_ms ?? 0) - (a.best_time_ms ?? 0)
  const fasterIsA = deltaMs > 0
  const fasterDriver = fasterIsA ? a : b
  const slowerDriver = fasterIsA ? b : a

  const has3d = a.has_telemetry && b.has_telemetry

  return (
    <section className="compare" key={animKey}>
      <div className="mode-ribbon">
        <div className="mr-l">
          <div className="mr-tabs">
            <button className={"mr-tab" + (mode==="2d"?" on":"")} onClick={() => setMode("2d")}>
              <span className="mr-glyph">▤</span> 2D TELEMETRY
            </button>
            <button
              className={"mr-tab" + (mode==="3d"?" on":"") + (!has3d?" off":"")}
              onClick={() => has3d && setMode("3d")}
              title={has3d ? "" : "3D simulation requires telemetry (2023+ races)"}>
              <span className="mr-glyph">◉</span> 3D SIMULATION (Work In Progress)
              {!has3d && <span className="mr-disabled">PRE-2023 · UNAVAILABLE</span>}
            </button>
          </div>
        </div>
        <div className="mr-r">
          <span className="mr-info">Static panel comparison ↔ live driving simulation with full telemetry replay</span>
        </div>
      </div>

      <div className="compare-cards">
        <DriverCard d={a} side="left" animKey={animKey}/>
        <DeltaCore a={a} b={b} deltaMs={deltaMs}/>
        <DriverCard d={b} side="right" animKey={animKey}/>
      </div>

      <div className="compare-main">
        <div className="panel panel-track">
          <PanelHead title="CIRCUIT MAP / SECTOR DOMINANCE"
            right={a.has_telemetry ? "SECTOR LEADER COLORED BY TEAM" : "TELEMETRY UNAVAILABLE · PRE-2023"}/>
          <TrackRibbon
            circuit={circuit}
            animateKey={animKey}
            leaderColor={fasterDriver.team_colour}
            chaserColor={slowerDriver.team_colour}
            leaderName={fasterDriver.driver.driver_code}
            chaserName={slowerDriver.driver.driver_code}
            leaderLapMs={fasterDriver.best_time_ms}
            chaserLapMs={slowerDriver.best_time_ms}
            leaderSectors={fasterDriver.lap ? [fasterDriver.lap.duration_sector_1, fasterDriver.lap.duration_sector_2, fasterDriver.lap.duration_sector_3] : null}
            chaserSectors={slowerDriver.lap ? [slowerDriver.lap.duration_sector_1, slowerDriver.lap.duration_sector_2, slowerDriver.lap.duration_sector_3] : null}
            sectorWinner={sectorWinner}
            showCars={showCarsOnTrack}
            telemetryA={fasterIsA ? telemetryA : telemetryB}
            telemetryB={fasterIsA ? telemetryB : telemetryA}
            telLoading={telLoading}
          />
          <TrackLegend a={a} b={b}/>
        </div>

        <div className="panel-stack">
          <div className="panel">
            <PanelHead title="SECTOR DELTA" right="LOWER = FASTER"/>
            {(a.lap || b.lap)
              ? <SectorBars a={a} b={b}/>
              : <Unavailable note="Sector breakdown is only available for races from 2023 onward (OpenF1 coverage). Showing lap totals only."/>}
          </div>
          <div className="panel">
            <PanelHead title="SPEED TRAPS" right="i1 / i2 / FINISH"/>
            {(a.lap || b.lap)
              ? <SpeedTraps a={a} b={b}/>
              : <Unavailable note="Speed trap data unavailable for this era."/>}
          </div>
        </div>
      </div>

      <div className="panel panel-mini">
        <PanelHead title="MINI-SECTOR STRIP"
          right={<MiniLegend/>}/>
        {(a.has_segments || b.has_segments) ? (
          <div className="mini-cmp">
            {a.has_segments && (
              <div className="mini-row">
                <div className="mini-name" style={{color: a.team_colour}}>{a.driver.driver_code}</div>
                <MiniSectorStrip lap={normalisedLap(a.lap, b.lap)}/>
              </div>
            )}
            {b.has_segments && (
              <div className="mini-row">
                <div className="mini-name" style={{color: b.team_colour}}>{b.driver.driver_code}</div>
                <MiniSectorStrip lap={normalisedLap(b.lap, a.lap)}/>
              </div>
            )}
          </div>
        ) : (
          <Unavailable note="Mini-sector segment data unavailable for this race."/>
        )}
      </div>

      <div className="compare-footer">
        <button className="ghost-btn" onClick={onReset}>
          <span>◀</span> RESELECT DRIVERS
        </button>
        <div className="cf-note">
          Best-lap logic: <code>COALESCE(q3, q2, q1)</code>. Times parsed from <code>m:ss.mmm</code> strings to milliseconds.
        </div>
      </div>
    </section>
  )
}

function PanelHead({title, right}) {
  return (
    <div className="panel-head">
      <div className="ph-l">
        <span className="ph-tick"/>
        <span className="ph-title">{title}</span>
      </div>
      <div className="ph-r">{right}</div>
    </div>
  )
}

function DeltaCore({a, b, deltaMs}) {
  const abs = Math.abs(deltaMs)
  const sign = deltaMs > 0 ? "−" : "+"
  const fasterCode = deltaMs > 0 ? a.driver.driver_code : b.driver.driver_code
  const fasterColor = deltaMs > 0 ? a.team_colour : b.team_colour
  const animMs = useCountUp(abs, 1000, "delta-" + a.driver_id + b.driver_id)
  return (
    <div className="delta-core">
      <div className="dx-lbl">HEAD-TO-HEAD</div>
      <div className="dx-faster" style={{color: fasterColor}}>{fasterCode} FASTEST</div>
      <div className="dx-num">
        <span className="dx-sign">{sign}</span>
        <span className="dx-val">{(animMs/1000).toFixed(3)}</span>
        <span className="dx-unit">s</span>
      </div>
      <div className="dx-ring">
        <RingGauge frac={Math.min(1, abs/1500)} color={fasterColor}/>
      </div>
      <div className="dx-foot">{a.best_session} vs {b.best_session} · {a.q3 || a.q2 || a.q1} ↔ {b.q3 || b.q2 || b.q1}</div>
    </div>
  )
}

function RingGauge({frac, color}) {
  const r = 44, c = 2 * Math.PI * r
  const [v, setV] = useState(0)
  useEffect(() => {
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now-start)/800)
      setV(frac * (1 - Math.pow(1-t,3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [frac])
  return (
    <svg viewBox="0 0 110 110" width="100" height="100">
      <circle cx="55" cy="55" r={r} stroke="#2a2a32" strokeWidth="6" fill="none"/>
      <circle cx="55" cy="55" r={r} stroke={color} strokeWidth="6" fill="none"
        strokeDasharray={c} strokeDashoffset={c*(1-v)}
        transform="rotate(-90 55 55)" strokeLinecap="round"/>
      <text x="55" y="60" fill="#fff" fontSize="14" fontFamily="var(--mono)" textAnchor="middle" opacity="0.6">DELTA</text>
    </svg>
  )
}

function TrackLegend({a, b}) {
  return (
    <div className="tlegend">
      <div className="tl-item"><span className="tl-sw" style={{background: a.team_colour}}/>{a.driver.driver_code}</div>
      <div className="tl-item"><span className="tl-sw" style={{background: b.team_colour}}/>{b.driver.driver_code}</div>
    </div>
  )
}

function MiniLegend() {
  return (
    <div className="ml">
      <span><span className="ml-sw" style={{background:"var(--seg-purple)"}}/>SESSION BEST</span>
      <span><span className="ml-sw" style={{background:"var(--seg-green)"}}/>PERSONAL BEST</span>
      <span><span className="ml-sw" style={{background:"var(--seg-yellow)"}}/>NO IMPROVEMENT</span>
    </div>
  )
}

function Unavailable({note}) {
  return (
    <div className="unavail">
      <div className="ua-glyph">/// NO DATA</div>
      <div className="ua-note">{note}</div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div>MART_QUALIFYING_SUMMARY · MART_LAP_TELEMETRY · DIM_SESSIONS · DIM_CIRCUITS</div>
      <div className="f-r">QUERY ENGINE · CLICKHOUSE · {import.meta.env.CLICKHOUSE_URL || 'localhost:8123'}</div>
    </footer>
  )
}

export default App
