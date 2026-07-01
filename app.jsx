/* eslint-disable */
const { useState, useEffect, useRef, useMemo } = React;
const D = window.F1Data;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#FF1801",
  "showCarsOnTrack": true,
  "scanlines": true,
  "compact": false
}/*EDITMODE-END*/;

const useLive = !!window.F1ClickHouseConfig;

function App() {
  const useTweaksHook = window.useTweaks || (() => [TWEAK_DEFAULTS, () => {}]);
  const [tweaks, setTweak] = useTweaksHook(TWEAK_DEFAULTS);

  const [season, setSeason] = useState(2024);
  const [round, setRound] = useState(16); // Monza 2024 — Norris pole over Verstappen
  const [driverA, setDriverA] = useState("norris");
  const [driverB, setDriverB] = useState("max_verstappen");
  const [view, setView] = useState("setup"); // setup | loading | compare | sim
  const [animKey, setAnimKey] = useState(0);
  const [mode, setMode] = useState("2d");      // 2d | 3d

  const [races, setRaces] = useState(() => D.listRaces(season));
  const [candidates, setCandidates] = useState(() => D.listDriversForRace(season, round));
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);
  const circuit = D.getCircuitForRace(season, round);

  // Load races when season changes
  useEffect(() => {
    if (useLive) {
      D.listRacesAsync(season).then(r => {
        setRaces(r);
        if (!r.find(x => x.round === round)) setRound(r[0]?.round);
      });
    } else {
      const r = D.listRaces(season);
      setRaces(r);
      if (!r.find(x => x.round === round)) setRound(r[0]?.round);
    }
  }, [season]); // eslint-disable-line

  // Load drivers when race changes
  useEffect(() => {
    const load = async () => {
      const c = useLive
        ? await D.listDriversForRaceAsync(season, round)
        : D.listDriversForRace(season, round);
      setCandidates(c);
      const ids = c.map(x => x.driver_id);
      if (!ids.includes(driverA)) setDriverA(ids[0]);
      if (!ids.includes(driverB)) setDriverB(ids[1] || ids[0]);
    };
    load();
  }, [season, round]); // eslint-disable-line

  // Load comparison data when view changes to compare
  useEffect(() => {
    if (view !== "compare") return;
    const load = async () => {
      const [a, b] = await Promise.all([
        useLive ? D.getComparisonAsync(season, round, driverA) : Promise.resolve(D.getComparison(season, round, driverA)),
        useLive ? D.getComparisonAsync(season, round, driverB) : Promise.resolve(D.getComparison(season, round, driverB)),
      ]);
      setCompareA(a);
      setCompareB(b);
    };
    load();
  }, [view, season, round, driverA, driverB]); // eslint-disable-line

  const onCompare = () => {
    setView("loading");
    setTimeout(() => { setView("compare"); setAnimKey(k => k+1); }, 1400);
  };
  const onReset = () => { setView("setup"); };

  const sectorWinner = useMemo(() => {
    if (!compareA?.lap || !compareB?.lap) return null;
    return [1,2,3].map(i =>
      compareA.lap["duration_sector_"+i] < compareB.lap["duration_sector_"+i] ? "leader" : "chaser"
    );
  }, [compareA, compareB]);

  return (
    <div className={"app" + (tweaks.scanlines ? " scan" : "") + (tweaks.compact ? " compact" : "")}
      style={{ "--accent": tweaks.accent }}>
      <TopBar />
      <SetupBar
        season={season} setSeason={setSeason}
        round={round} setRound={setRound}
        races={races}
        circuit={circuit}
        view={view}
      />

      {view === "setup" && (
        <SetupView
          candidates={candidates}
          driverA={driverA} setDriverA={setDriverA}
          driverB={driverB} setDriverB={setDriverB}
          onCompare={onCompare}
          circuit={circuit}
          accent={tweaks.accent}
        />
      )}

      {view === "loading" && (
        <LoadingView a={compareA} b={compareB} circuit={circuit} />
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
        />
      )}

      {view === "compare" && compareA && compareB && mode === "3d" && window.SimulationView && (
        <window.SimulationView
          a={compareA} b={compareB}
          circuit={circuit}
          onBack={() => setMode("2d")}
        />
      )}

      <Footer/>

      {window.TweaksPanel && (
        <window.TweaksPanel title="Tweaks">
          <window.TweakSection label="Look"/>
          <window.TweakColor label="Accent" value={tweaks.accent}
            options={["#FF1801","#27F4D2","#FFB400","#E80020","#3671C6"]}
            onChange={v => setTweak("accent", v)}/>
          <window.TweakToggle label="Scanline overlay" value={tweaks.scanlines}
            onChange={v => setTweak("scanlines", v)}/>
          <window.TweakToggle label="Compact density" value={tweaks.compact}
            onChange={v => setTweak("compact", v)}/>
          <window.TweakSection label="Track map"/>
          <window.TweakToggle label="Animated cars" value={tweaks.showCarsOnTrack}
            onChange={v => setTweak("showCarsOnTrack", v)}/>
        </window.TweaksPanel>
      )}
    </div>
  );
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
        <Ticker label="REC">OPENF1 · JOLPICA</Ticker>
        <Clock/>
      </div>
    </header>
  );
}
function Ticker({label, children}) {
  return (
    <span className="ticker">
      <span className="ticker-dot"/>{label} <em>{children}</em>
    </span>
  );
}
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(()=>setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const pad = n => String(n).padStart(2,"0");
  return <span className="clock">{pad(now.getUTCHours())}:{pad(now.getUTCMinutes())}:{pad(now.getUTCSeconds())} UTC</span>;
}

function SetupBar({season, setSeason, round, setRound, races, circuit, view}) {
  return (
    <div className="setupbar">
      <div className="sb-block">
        <div className="sb-lbl">SEASON</div>
        <select className="sb-select" value={season} onChange={e=>setSeason(+e.target.value)}>
          {D.listSeasons().map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="sb-block sb-block-wide">
        <div className="sb-lbl">ROUND</div>
        <select className="sb-select" value={round} onChange={e=>setRound(+e.target.value)}>
          {races.map(r => <option key={r.round} value={r.round}>R{String(r.round).padStart(2,"0")} · {r.race_name}</option>)}
        </select>
      </div>
      <div className="sb-block">
        <div className="sb-lbl">CIRCUIT</div>
        <div className="sb-val">{circuit?.circuit_name ?? "—"}</div>
      </div>
      <div className="sb-block">
        <div className="sb-lbl">SESSION</div>
        <div className="sb-val mono">QUALIFYING / Q1+Q2+Q3</div>
      </div>
      <div className="sb-block sb-status">
        <div className="sb-lbl">STATUS</div>
        <div className="sb-val">
          <span className={"status-dot " + (view==="compare"?"on":view==="loading"?"warn":"idle")}/>
          {view === "compare" ? "COMPARING" : view === "loading" ? "LOADING TELEMETRY" : "AWAITING SELECTION"}
        </div>
      </div>
    </div>
  );
}

function SetupView({candidates, driverA, setDriverA, driverB, setDriverB, onCompare, circuit, accent}) {
  const aOk = driverA && driverB && driverA !== driverB;
  return (
    <section className="setup">
      <div className="setup-grid">
        <DriverPicker
          candidates={candidates}
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
          value={driverB} onChange={setDriverB}
          label="DRIVER B" side="right" accent={accent}
        />
      </div>
    </section>
  );
}

function LoadingView({a, b, circuit}) {
  const steps = [
    "QUERY  marts_fact_qualifying",
    "JOIN   raw_openf1.laps  ON session_key",
    "JOIN   raw_openf1.drivers ON driver_number",
    "PARSE  q3 || q2 || q1   → best_lap_ms",
    "DECODE segments_sector_[1..3]",
    "RENDER comparison frame",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(x => Math.min(steps.length, x+1)), 220);
    return () => clearInterval(t);
  }, []);
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
  );
}

function CompareView({a, b, circuit, sectorWinner, animKey, onReset, showCarsOnTrack, mode, setMode}) {
  const deltaMs = (b.best_time_ms ?? 0) - (a.best_time_ms ?? 0);
  const fasterIsA = deltaMs > 0;
  const fasterDriver = fasterIsA ? a : b;
  const slowerDriver = fasterIsA ? b : a;

  const has3d = a.has_telemetry && b.has_telemetry;

  return (
    <section className="compare" key={animKey}>
      {/* Mode toggle ribbon */}
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
              <span className="mr-glyph">◉</span> 3D SIMULATION
              {!has3d && <span className="mr-disabled">PRE-2023 · UNAVAILABLE</span>}
            </button>
          </div>
        </div>
        <div className="mr-r">
          <span className="mr-info">Static panel comparison</span>
        </div>
      </div>
      {/* Driver cards row */}
      <div className="compare-cards">
        <DriverCard d={a} side="left" animKey={animKey}/>
        <DeltaCore a={a} b={b} deltaMs={deltaMs}/>
        <DriverCard d={b} side="right" animKey={animKey}/>
      </div>

      {/* Track + telemetry */}
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
            sectorWinner={sectorWinner}
            showCars={showCarsOnTrack}
          />
          <TrackLegend a={a} b={b} sectorWinner={sectorWinner}/>
        </div>

        <div className="panel-stack">
          <div className="panel">
            <PanelHead title="SECTOR DELTA" right="LOWER = FASTER"/>
            {a.has_telemetry && b.has_telemetry
              ? <SectorBars a={a} b={b}/>
              : <Unavailable note="Sector breakdown is only available for races from 2023 onward (OpenF1 coverage). Showing lap totals only."/>}
          </div>
          <div className="panel">
            <PanelHead title="SPEED TRAPS" right="i1 / i2 / FINISH"/>
            {a.has_telemetry && b.has_telemetry
              ? <SpeedTraps a={a} b={b}/>
              : <Unavailable note="Speed trap data unavailable for this era."/>}
          </div>
        </div>
      </div>

      <div className="panel panel-mini">
        <PanelHead title="MINI-SECTOR STRIP"
          right={<MiniLegend/>}/>
        {a.has_telemetry && b.has_telemetry ? (
          <div className="mini-cmp">
            <div className="mini-row">
              <div className="mini-name" style={{color: a.team_colour}}>{a.driver.driver_code}</div>
              <MiniSectorStrip lap={a.lap}/>
            </div>
            <div className="mini-row">
              <div className="mini-name" style={{color: b.team_colour}}>{b.driver.driver_code}</div>
              <MiniSectorStrip lap={b.lap}/>
            </div>
          </div>
        ) : (
          <Unavailable note="Mini-sector segment data unavailable for pre-2023 races."/>
        )}
      </div>

      <div className="compare-footer">
        <button className="ghost-btn" onClick={onReset}>
          <span>◀</span> RESELECT DRIVERS
        </button>
        {/* <div className="cf-note">
          Best-lap logic: <code>COALESCE(q3, q2, q1)</code>. Times parsed from <code>m:ss.mmm</code> strings to milliseconds.
        </div> */}
      </div>
    </section>
  );
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
  );
}

function DeltaCore({a, b, deltaMs}) {
  const abs = Math.abs(deltaMs);
  const sign = deltaMs > 0 ? "−" : "+";
  const fasterCode = deltaMs > 0 ? a.driver.driver_code : b.driver.driver_code;
  const fasterColor = deltaMs > 0 ? a.team_colour : b.team_colour;
  const animMs = useCountUp(abs, 1000, "delta-" + a.driver_id + b.driver_id);
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
  );
}

function RingGauge({frac, color}) {
  const r = 44, c = 2 * Math.PI * r;
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now-start)/800);
      setV(frac * (1 - Math.pow(1-t,3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frac]);
  return (
    <svg viewBox="0 0 110 110" width="100" height="100">
      <circle cx="55" cy="55" r={r} stroke="#2a2a32" strokeWidth="6" fill="none"/>
      <circle cx="55" cy="55" r={r} stroke={color} strokeWidth="6" fill="none"
        strokeDasharray={c} strokeDashoffset={c*(1-v)}
        transform="rotate(-90 55 55)" strokeLinecap="round"/>
      <text x="55" y="60" fill="#fff" fontSize="14" fontFamily="var(--mono)" textAnchor="middle" opacity="0.6">DELTA</text>
    </svg>
  );
}

function TrackLegend({a, b, sectorWinner}) {
  return (
    <div className="tlegend">
      <div className="tl-item"><span className="tl-sw" style={{background: a.team_colour}}/>{a.driver.driver_code}</div>
      <div className="tl-item"><span className="tl-sw" style={{background: b.team_colour}}/>{b.driver.driver_code}</div>
      <div className="tl-sep"/>
      {sectorWinner?.map((w, i) => (
        <div key={i} className="tl-item">
          <span className="tl-sec">S{i+1}</span>
          <span className="tl-sw" style={{background: w === "leader" ? a.team_colour : b.team_colour}}/>
          {w === "leader" ? a.driver.driver_code : b.driver.driver_code}
        </div>
      ))}
    </div>
  );
}

function MiniLegend() {
  return (
    <div className="ml">
      <span><span className="ml-sw" style={{background:"var(--seg-purple)"}}/>SECTOR PURPLE</span>
      <span><span className="ml-sw" style={{background:"var(--seg-green)"}}/>FASTEST OVERALL</span>
      <span><span className="ml-sw" style={{background:"var(--seg-yellow)"}}/>PERSONAL BEST</span>
    </div>
  );
}

function Unavailable({note}) {
  return (
    <div className="unavail">
      <div className="ua-glyph">/// NO DATA</div>
      <div className="ua-note">{note}</div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div>FACT_QUALIFYING · RAW_OPENF1.LAPS · DIM_DRIVERS · DIM_CIRCUITS</div>
      <div className="f-r">QUERY ENGINE · CLICKHOUSE-LIKE · LOCAL MOCK</div>
    </footer>
  );
}

window.App = App;
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
