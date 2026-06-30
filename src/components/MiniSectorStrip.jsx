import React from 'react'
import { SECTOR_PURPLE, SECTOR_GREEN, SECTOR_YELLOW, SECTOR_NONE } from '../data/index.js'

const SEG_COLOR = {
  [SECTOR_PURPLE]: "var(--seg-purple)",
  [SECTOR_GREEN]:  "var(--seg-green)",
  [SECTOR_YELLOW]: "var(--seg-yellow)",
  [SECTOR_NONE]:   "var(--seg-none)",
}

export default function MiniSectorStrip({ lap, animate=true }) {
  if (!lap) return null
  const blocks = [
    ...lap.segments_sector_1.map(c => ({ c, s:1 })),
    "GAP",
    ...lap.segments_sector_2.map(c => ({ c, s:2 })),
    "GAP",
    ...lap.segments_sector_3.map(c => ({ c, s:3 })),
  ]
  return (
    <div className="mini-strip">
      {blocks.map((b, i) =>
        b === "GAP"
          ? <div key={i} className="mini-gap" />
          : <div key={i}
              className="mini-cell"
              style={{
                background: SEG_COLOR[b.c],
                animationDelay: animate ? `${i * 22}ms` : "0ms",
              }}
            />
      )}
    </div>
  )
}
