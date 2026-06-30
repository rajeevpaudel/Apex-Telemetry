import React, { useState, useEffect } from 'react'

function LdBanner({ a, b, circuit }) {
  return (
    <div className="ld-banner">
      <div className="ld-meta">
        <span className="ld-vs" style={{ color: a?.team_colour }}>{a?.driver?.driver_code ?? '—'}</span>
        <span className="ld-x">×</span>
        <span className="ld-vs" style={{ color: b?.team_colour }}>{b?.driver?.driver_code ?? '—'}</span>
      </div>
      <div className="ld-meta-sub">
        {circuit?.circuit_name} · {circuit?.locality}, {circuit?.country}
      </div>
    </div>
  )
}

export function LoadingLights({ a, b, circuit }) {
  const [lit, setLit] = useState(0)
  const [go, setGo] = useState(false)
  useEffect(() => {
    let alive = true
    const timers = []
    const run = () => {
      setGo(false); setLit(0)
      for (let i = 1; i <= 5; i++) timers.push(setTimeout(() => alive && setLit(i), 360 * i))
      timers.push(setTimeout(() => alive && setGo(true), 360 * 5 + 650))
      timers.push(setTimeout(() => alive && run(), 360 * 5 + 650 + 1500))
    }
    run()
    return () => { alive = false; timers.forEach(clearTimeout) }
  }, [])

  const pods = [0, 1, 2, 3, 4]
  const revHot = go ? 14 : Math.round((lit / 5) * 14)
  return (
    <section className="ld-wrap">
      <LdBanner a={a} b={b} circuit={circuit} />
      <div className="lights-stage">
        <div className="gantry">
          {pods.map((p) => {
            const cls = go ? 'glamp go' : 'glamp' + (p < lit ? ' on' : '')
            return (
              <div className="gpod" key={p}>
                <div className={cls} />
                <div className={cls} />
              </div>
            )
          })}
        </div>
        <div className="rev-bar">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i}
              className={'rev-seg' + (i < revHot ? (go ? ' redline' : i >= 11 ? ' redline' : ' hot') : '')} />
          ))}
        </div>
        <div className={'lights-cap ' + (go ? 'go' : 'wait')}>
          {go ? 'GO' : '● '.repeat(lit).trim() || '—'}
        </div>
      </div>
      <div className="ld-status">
        {go ? 'LIGHTS OUT — STREAMING LAP DATA' : 'STAGING GRID — BUFFERING QUALIFYING LAPS'}
      </div>
    </section>
  )
}

export function LoadingTrace({ a, b, circuit }) {
  const pid = 'trace-path-' + (circuit?.circuit_id || 'x')
  const [feed, setFeed] = useState({ spd: 312, gear: 7, thr: 100, brk: 0, drs: 1 })
  useEffect(() => {
    const t = setInterval(() => {
      const spd = 90 + Math.round(Math.random() * 250)
      setFeed({
        spd,
        gear: Math.max(1, Math.min(8, Math.round(spd / 42))),
        thr: Math.random() > 0.35 ? 60 + Math.round(Math.random() * 40) : Math.round(Math.random() * 30),
        brk: Math.random() > 0.7 ? 40 + Math.round(Math.random() * 60) : 0,
        drs: spd > 250 ? 1 : 0,
      })
    }, 110)
    return () => clearInterval(t)
  }, [])

  const rows = [
    { lbl: 'SPEED', val: feed.spd, unit: 'KM/H' },
    { lbl: 'GEAR', val: feed.gear, unit: '' },
    { lbl: 'THROTTLE', val: feed.thr, unit: '%' },
    { lbl: 'BRAKE', val: feed.brk, unit: '%' },
    { lbl: 'DRS', val: feed.drs ? 'OPEN' : 'CLOSED', unit: '' },
  ]

  return (
    <section className="ld-wrap">
      <LdBanner a={a} b={b} circuit={circuit} />
      <div className="trace-grid">
        <div className="trace-stage">
          <div className="trace-rings r1" />
          <div className="trace-rings r2" />
          <div className="trace-cross h" />
          <div className="trace-cross v" />
          <div className="trace-radar" />
          <svg className="trace-svg" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet">
            <path id={pid} className="trace-base" d={circuit?.path} pathLength="1000" />
            <path className="trace-draw" d={circuit?.path} pathLength="1000" />
            <circle r="6" className="trace-head">
              <animateMotion dur="2.6s" repeatCount="indefinite" rotate="auto" calcMode="linear">
                <mpath href={'#' + pid} />
              </animateMotion>
            </circle>
          </svg>
        </div>
        <div className="trace-feed">
          <div className="tf-head">LIVE TELEMETRY STREAM</div>
          {rows.map((r) => (
            <div className="tf-row" key={r.lbl}>
              <span className="tf-lbl">{r.lbl}</span>
              <span><span className="tf-val">{r.val}</span>{r.unit && <span className="tf-unit"> {r.unit}</span>}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="ld-status">TRACING RACING LINE — DECODING SECTOR SEGMENTS</div>
    </section>
  )
}

export function LoadingPipeline({ a, b, circuit }) {
  const steps = [
    'QUERY  f1_mart.mart_qualifying_summary',
    'FILTER season / round / driver_id',
    'READ   best_lap_duration  best_s1..s3',
    'READ   i1_speed  i2_speed  st_speed',
    'DECODE segments_s1..s3   → mini-sector strip',
    'RENDER comparison frame',
  ]
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(x => Math.min(steps.length, x + 1)), 220)
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
          <div key={idx} className={'ld-line ' + (idx < i ? 'done' : idx === i ? 'live' : 'wait')}>
            <span className="ld-tag">{idx < i ? '✓' : idx === i ? '▶' : ' '}</span>
            <span>{s}</span>
            {idx === i && <span className="ld-spin" />}
          </div>
        ))}
      </div>
      <div className="loading-bar"><div className="lb-fill" /></div>
    </section>
  )
}

const VARIANTS = ['lights', 'trace', 'pipeline']
export function pickLoadingVariant() {
  return VARIANTS[Math.floor(Math.random() * VARIANTS.length)]
}

export default function LoadingScreens({ a, b, circuit, variant }) {
  if (variant === 'trace') return <LoadingTrace a={a} b={b} circuit={circuit} />
  if (variant === 'pipeline') return <LoadingPipeline a={a} b={b} circuit={circuit} />
  return <LoadingLights a={a} b={b} circuit={circuit} />
}
