import React, { useState } from 'react'
import CarSchematic from './CarSchematic.jsx'
import { useCountUp } from '../hooks/useCountUp.js'
import { formatMs } from '../data/index.js'

function Portrait({ url, initials }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return <img src={url} alt={initials} className="dc-headshot" onError={() => setFailed(true)} />
  }
  return <div className="dc-initials">{initials}</div>
}

export default function DriverCard({ d, side, animKey }) {
  if (!d) return null
  const animMs = useCountUp(d.best_time_ms, 1100, animKey + side)
  return (
    <div className={"driver-card side-" + side}
      style={{
        "--team": d.team_colour,
        background: `linear-gradient(${side==="left"?"110deg":"250deg"}, ${d.team_colour}33 0%, transparent 55%), #0c0c10`,
        borderColor: d.team_colour + "55",
      }}>
      <div className="dc-watermark">{d.driver.driver_code}</div>
      <div className="dc-top">
        <div className="dc-pos">
          <div className="dc-pos-num">P{d.qualifying_position}</div>
          <div className="dc-pos-lbl">QUAL</div>
        </div>
        <div className="dc-name">
          <div className="dc-fn">{d.driver.full_name.split(" ")[0]}</div>
          <div className="dc-ln">{d.driver.full_name.split(" ").slice(1).join(" ")}</div>
          <div className="dc-team" style={{color: d.team_colour}}>
            <span className="dc-team-bar" style={{background: d.team_colour}}/>
            {d.team_name.toUpperCase()}
          </div>
        </div>
        <div className="dc-portrait">
          <Portrait url={d.driver.headshot_url} initials={d.headshot_initials} />
          <div className="dc-number" style={{color: d.team_colour}}>
            #{d.driver.permanent_number ?? "—"}
          </div>
        </div>
      </div>

      <div className="dc-car" style={{justifyContent: side==="left" ? "flex-start" : "flex-end"}}>
        <CarSchematic color={d.team_colour} mirrored={side==="right"} scale={1.05}/>
      </div>

      <div className="dc-lap">
        <div className="dc-lap-lbl">BEST QUALIFYING LAP · {d.best_session}</div>
        <div className="dc-lap-time">{formatMs(animMs)}</div>
      </div>

      <div className="dc-mini">
        <div className="dc-mini-row"><span>Q1</span><b>{d.q1 ?? "—"}</b></div>
        <div className="dc-mini-row"><span>Q2</span><b>{d.q2 ?? "—"}</b></div>
        <div className="dc-mini-row"><span>Q3</span><b>{d.q3 ?? "—"}</b></div>
      </div>
    </div>
  )
}
