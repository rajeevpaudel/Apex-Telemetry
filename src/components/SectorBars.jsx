import React from 'react'

export default function SectorBars({ a, b }) {
  const sectors = [
    { i: 1, aTime: a.lap?.duration_sector_1 ?? null, bTime: b.lap?.duration_sector_1 ?? null },
    { i: 2, aTime: a.lap?.duration_sector_2 ?? null, bTime: b.lap?.duration_sector_2 ?? null },
    { i: 3, aTime: a.lap?.duration_sector_3 ?? null, bTime: b.lap?.duration_sector_3 ?? null },
  ]
  const hasAny = sectors.some(s => s.aTime != null || s.bTime != null)
  if (!hasAny) return null

  return (
    <div className="sec-bars">
      {sectors.map(({ i, aTime, bTime }) => {
        const bothPresent = aTime != null && bTime != null
        const max = bothPresent ? Math.max(aTime, bTime) : (aTime ?? bTime)
        const aWin = bothPresent ? aTime < bTime : aTime != null
        const delta = bothPresent ? bTime - aTime : null
        return (
          <div key={i} className="sec-row">
            <div className="sec-label">S{i}</div>
            <div className="sec-times">
              <div className={"sec-bar-wrap left" + (aWin ? " win" : "")}>
                {aTime != null
                  ? <div className="sec-time-val" style={{ color: aWin ? "var(--accent)" : "var(--ink-3)" }}>{aTime.toFixed(3)}</div>
                  : <div className="sec-time-val" style={{ color: "var(--ink-3)" }}>—</div>}
                <div className="sec-bar" style={{
                  width: aTime != null ? `${(aTime / max) * 100}%` : '0%',
                  background: aWin ? a.team_colour : "#2a2a30",
                  borderColor: aWin ? a.team_colour : "#3a3a40",
                }} />
              </div>
              <div className="sec-delta">
                {delta != null ? (aWin ? "−" : "+") + Math.abs(delta).toFixed(3) : "—"}
              </div>
              <div className={"sec-bar-wrap right" + (!aWin ? " win" : "")}>
                <div className="sec-bar" style={{
                  width: bTime != null ? `${(bTime / max) * 100}%` : '0%',
                  background: !aWin ? b.team_colour : "#2a2a30",
                  borderColor: !aWin ? b.team_colour : "#3a3a40",
                }} />
                {bTime != null
                  ? <div className="sec-time-val" style={{ color: !aWin ? "var(--accent)" : "var(--ink-3)" }}>{bTime.toFixed(3)}</div>
                  : <div className="sec-time-val" style={{ color: "var(--ink-3)" }}>—</div>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
