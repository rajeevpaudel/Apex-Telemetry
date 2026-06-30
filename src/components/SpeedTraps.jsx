import React from 'react'

export default function SpeedTraps({ a, b }) {
  const traps = [
    { k: "i1_speed", lbl: "INTERMEDIATE 1" },
    { k: "i2_speed", lbl: "INTERMEDIATE 2" },
    { k: "st_speed", lbl: "SPEED TRAP" },
  ]
  const hasAny = traps.some(({ k }) => a.lap?.[k] != null || b.lap?.[k] != null)
  if (!hasAny) return null

  return (
    <div className="trap-grid">
      {traps.map(({ k, lbl }) => {
        const av = a.lap?.[k] ?? null
        const bv = b.lap?.[k] ?? null
        const bothPresent = av != null && bv != null
        const max = bothPresent ? Math.max(av, bv) : (av ?? bv ?? 1)
        const aWin = bothPresent ? av > bv : av != null
        return (
          <div key={k} className="trap-cell">
            <div className="trap-lbl">{lbl}</div>
            <div className="trap-row">
              <div className={"trap-val left" + (aWin ? " win" : "")}>
                {av != null
                  ? <><span className="trap-num">{av}</span><span className="trap-unit">KM/H</span></>
                  : <span className="trap-num">—</span>}
              </div>
              <div className="trap-bar">
                <div className="trap-fill left" style={{
                  width: av != null ? `${(av / max) * 50}%` : '0%',
                  background: aWin ? a.team_colour : "#2a2a30",
                }} />
                <div className="trap-fill right" style={{
                  width: bv != null ? `${(bv / max) * 50}%` : '0%',
                  background: !aWin ? b.team_colour : "#2a2a30",
                }} />
              </div>
              <div className={"trap-val right" + (!aWin ? " win" : "")}>
                {bv != null
                  ? <><span className="trap-num">{bv}</span><span className="trap-unit">KM/H</span></>
                  : <span className="trap-num">—</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
