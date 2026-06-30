import React, { useState } from 'react'

function MiniAvatar({ url, initials, colour }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return <img src={url} alt={initials} className="pr-avatar pr-avatar-img" onError={() => setFailed(true)} />
  }
  return (
    <span className="pr-avatar pr-avatar-init" style={{ background: colour + '22', color: colour }}>
      {initials}
    </span>
  )
}

export default function DriverPicker({ candidates, session, value, onChange, label, side, accent }) {
  return (
    <div className="picker-card" data-side={side}>
      <div className="picker-head">
        <span className="picker-tag" style={{borderColor: accent, color: accent}}>{label}</span>
        <span className="picker-hint">SELECT DRIVER</span>
      </div>
      <div className="picker-list">
        {candidates.length === 0 && (
          <div className="picker-empty">No qualifying data for this race</div>
        )}
        {candidates.filter(c => c.driver).map(c => {
          const colour = c.team_colour || ('#' + (c.driver.team_colour || '888888'))
          const hex = colour.startsWith('#') ? colour : '#' + colour
          const time = c.display_time || (session === 'q1' ? c.q1 : session === 'q2' ? c.q2 : session === 'q3' ? c.q3 : c.best_time)
          return (
            <button
              key={c.driver_id}
              className={"picker-row" + (value === c.driver_id ? " on" : "")}
              onClick={() => onChange(c.driver_id)}
              style={value === c.driver_id ? {
                borderColor: hex,
                background: `linear-gradient(90deg, ${hex}22 0%, transparent 80%)`
              } : {}}
            >
              <span className="pr-pos">P{c.qualifying_position}</span>
              <span className="pr-bar" style={{background: hex}}/>
              <MiniAvatar
                url={c.driver.headshot_url}
                initials={c.driver.headshot_initials}
                colour={hex}
              />
              <span className="pr-code">{c.driver.driver_code}</span>
              <span className="pr-name">{c.driver.full_name}</span>
              <span className="pr-time">{time}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
