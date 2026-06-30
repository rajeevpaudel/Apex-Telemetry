# Apex Telemetry

A qualifying lap comparator for Formula 1. Pick a season, round, and two drivers — compare their fastest qualifying laps side by side with sector deltas, speed traps, mini-sector strips, and a live SVG track map.

Includes a 3D simulation mode (Three.js) that replays each driver's lap on an extruded circuit with per-driver HUDs. Available for 2023+ races where full telemetry is in the warehouse.

## Features

- **Driver cards** — qualifying position, team colour, best lap time with animated count-up, Q1/Q2/Q3 session times
- **Delta core** — head-to-head gap with animated ring gauge
- **Sector bars** — S1/S2/S3 delta breakdown
- **Speed traps** — i1 / i2 / finish-line speeds
- **Mini-sector strip** — per-mini-sector colour coding (purple / green / yellow)
- **SVG track map** — sector dominance coloured by team, animated car positions (2023+)
- **3D simulation** — Three.js lap replay with telemetry HUD and scrubbable timeline (2023+)

## Stack

- **React 18** + **Vite**
- **Three.js** for 3D simulation
- **ClickHouse** as the data warehouse (via HTTP API)
- Data modelled with dbt — mart tables exposed over ClickHouse Cloud or self-hosted

## Prerequisites

- Node.js 18+
- A ClickHouse instance with the F1 mart schema loaded

## Setup

```bash
npm install
```

Copy the environment template and fill in your ClickHouse credentials:

```bash
cp .env.example .env.local
```

```env
VITE_CLICKHOUSE_URL=https://your-host.clickhouse.cloud
VITE_CLICKHOUSE_USER=default
VITE_CLICKHOUSE_PASSWORD=your-password
VITE_CLICKHOUSE_DATABASE=f1_mart
```

```bash
npm run dev
```

## Track path data

Track SVG paths and sector break points are stored in `src/data/trackPaths.json`. To regenerate or extend:

```bash
# From the warehouse (recommended)
node scripts/fetch-tracks-warehouse.mjs

# From FastF1 (Python, requires fastf1 installed)
python scripts/fetch-tracks-fastf1.py
```

## Project structure

```
src/
  App.jsx                  — root component, view/mode state machine
  main.jsx                 — React entry point
  styles/index.css         — all styles, design tokens as CSS custom properties
  components/              — 2D view components
    DriverCard.jsx
    DriverPicker.jsx
    CarSchematic.jsx
    TrackRibbon.jsx
    MiniSectorStrip.jsx
    SectorBars.jsx
    SpeedTraps.jsx
    TweaksPanel.jsx
    Select.jsx
    LoadingScreens.jsx
  simulation/
    SimulationView.jsx     — Three.js 3D lap replay
  data/
    clickhouse.js          — all warehouse queries
    circuits.js            — circuit metadata and SVG path helpers
    trackPaths.json        — pre-generated SVG paths + sector breaks
    teamColours.js         — fallback team colour hex codes
    driverHeadshots.js     — headshot URL helpers
  hooks/
    useCountUp.js          — animated number hook
  carModel.js              — 3D car model loader

public/
  f1_car.glb               — 3D car model
  favicon.svg
  icons.svg

scripts/
  fetch-tracks-warehouse.mjs   — pull track geometry from warehouse
  fetch-tracks-fastf1.py       — pull track geometry via FastF1
  fetch-tracks.mjs             — generic track fetch helper
```

## Data availability

| Feature | Seasons |
|---|---|
| Qualifying results (positions, Q1/Q2/Q3 times) | All |
| Sector times, speed traps | 2023+ |
| Mini-sector segments | 2023+ |
| Telemetry (3D simulation, animated cars) | 2023+ |

Pre-2023 rounds show lap totals and the track map without live car animation. The UI handles missing data gracefully with hatched fallback panels.

## Notes

- Minimum viewport: **1480px** — this is a desktop broadcast tool, not responsive
- The tweaks panel (bottom-right ⚙) lets you toggle scanlines, compact density, accent colour, and animated cars on the track map
