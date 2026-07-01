import React, { useState } from 'react'
import CarSchematic from './CarSchematic.jsx'
import { useCountUp } from '../hooks/useCountUp.js'
import { formatMs } from '../data/index.js'
import { getDriverHeadshotHQ } from '../data/driverHeadshots.js'

function DriverSilhouette() {
  return (
    <svg viewBox="0 0 80 120" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{width:'100%',height:'100%',opacity:0.12}}>
      <ellipse cx="40" cy="28" rx="18" ry="22" fill="#f3f3f5"/>
      <path d="M22 28 Q22 50 40 50 Q58 50 58 28" fill="#f3f3f5"/>
      <rect x="32" y="38" width="16" height="10" rx="3" fill="#1a1a28"/>
      <path d="M10 120 C10 82 22 70 40 66 C58 70 70 82 70 120Z" fill="#f3f3f5"/>
    </svg>
  )
}

function Portrait({ hqUrl, warehouseUrl, initials }) {
  const startState = hqUrl ? 0 : warehouseUrl ? 1 : 2
  const [state, setState] = useState(startState)
  const imgStyle = { width:'100%', height:'100%', objectFit:'cover', objectPosition:'top center', display:'block' }

  if (state === 0 && hqUrl) {
    return <img src={hqUrl} alt={initials} style={imgStyle}
      onError={() => setState(warehouseUrl ? 1 : 2)} />
  }
  if (state <= 1 && warehouseUrl) {
    return <img src={warehouseUrl} alt={initials} style={imgStyle}
      onError={() => setState(2)} />
  }
  return <DriverSilhouette />
}

export default function DriverCard({ d, side, animKey }) {
  if (!d) return null
  const animMs = useCountUp(d.best_time_ms, 1100, animKey + side)
  const isLeft = side === 'left'
  const color = d.team_colour
  const hqUrl = getDriverHeadshotHQ(d.driver_id)
  const nameParts = d.driver.full_name.split(' ')
  const fn = nameParts[0]
  const ln = nameParts.slice(1).join(' ')

  return (
    <div className={"driver-card side-" + side}
      style={{
        "--team": color,
        background: `linear-gradient(${isLeft ? '118deg' : '248deg'}, ${color}26 0%, transparent 52%), #0c0c10`,
        borderColor: color + "55",
      }}>

      {/* Watermark */}
      <div className="dc-watermark" style={{
        color,
        [isLeft ? 'left' : 'right']: '-6px',
        [isLeft ? 'right' : 'left']: 'auto',
      }}>
        {d.driver.driver_code}
      </div>

      {/* Headshot — bleeds from outer edge, fades inward */}
      <div className={"dc-headshot-wrap dc-headshot-" + side}>
        <Portrait key={d.driver_id} hqUrl={hqUrl} warehouseUrl={d.driver.headshot_url} initials={d.headshot_initials} />
      </div>

      {/* 3D car — opposite side from headshot */}
      <div className={"dc-car-svg dc-car-svg-" + side}
        style={{filter: `drop-shadow(0 0 18px ${color}88)`}}>
        <CarSchematic color={color} mirrored={side === 'right'} scale={4}/>
      </div>

      {/* Position badge */}
      <div className={"dc-pos-badge dc-pos-badge-" + side}>
        <div className="dc-pos-num">P{d.qualifying_position}</div>
        <div className="dc-pos-lbl">QUAL</div>
      </div>

      {/* Driver name + team */}
      <div className={"dc-identity dc-identity-" + side}>
        <div className="dc-fn">{fn}</div>
        <div className="dc-ln">{ln}</div>
        <div className={"dc-team dc-team-" + side} style={{color}}>
          {isLeft
            ? <><span className="dc-team-bar" style={{background: color}}/>{d.team_name.toUpperCase()}</>
            : <>{d.team_name.toUpperCase()}<span className="dc-team-bar" style={{background: color}}/></>}
        </div>
      </div>

      {/* Lap time strip */}
      <div className="dc-lap-strip" style={{borderTopColor: color + "33"}}>
        <div>
          <div className="dc-lap-lbl">BEST LAP · {d.best_session}</div>
          <div className="dc-lap-time">{formatMs(animMs)}</div>
        </div>
        <div className="dc-lap-num" style={{color}}>
          #{d.driver.permanent_number ?? '—'}
        </div>
      </div>
    </div>
  )
}
