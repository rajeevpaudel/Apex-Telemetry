<div align="center">

![logo](https://i.imgur.com/Fm4mlAY.png)

# APEX TELEMETRY

**A Formula 1 qualifying lap comparator — head-to-head sector deltas, speed traps, mini-sector strips, and animated track maps, all live from a ClickHouse warehouse.**

[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite)](https://vite.dev)
[![Three.js](https://img.shields.io/badge/Three.js-WIP-white?style=flat-square&logo=three.js)](https://threejs.org)
[![ClickHouse](https://img.shields.io/badge/ClickHouse-warehouse-FFCC01?style=flat-square&logo=clickhouse)](https://clickhouse.com)

</div>

---

> **Data pipeline:** Raw F1 telemetry → ClickHouse warehouse → this UI.
> The ETL layer lives in [Monocoque](https://github.com/rajeevpaudel/Monocoque) — run that first to populate the `f1_mart` schema before launching Apex.

---

## What it looks like

![loading_screen](https://i.imgur.com/nwd8Bpy.png)
---

### Driver selection

Pick a season, round, and qualifying session — the grid sorts by fastest time and shows each driver's team colour, headshot, and Q1/Q2/Q3 split.


![driver_selection](https://i.imgur.com/ys5WFrF.png)

---

### Comparison view — 2D telemetry

The main event. Once you click **RUN COMPARISON** the app queries the warehouse and builds the side-by-side breakdown:

| Panel | What it shows |
|---|---|
| **Driver cards** | Qualifying position, team colour, animated lap time count-up, Q1/Q2/Q3 splits |
| **Head-to-head delta** | Gap in seconds with animated ring gauge, coloured by the faster driver's team |
| **Circuit map** | SVG track with sector dominance coloured by team; animated car positions (2023+) |
| **Sector bars** | S1/S2/S3 delta — lower bar wins |
| **Speed traps** | i1 / i2 / finish-line trap speeds side by side |
| **Mini-sector strip** | Per-mini-sector colour coding: purple = session best, green = personal best, yellow = no improvement |

![max_vs_ham](https://i.imgur.com/PEeOB4M.png)

![Demo video](https://github.com/user-attachments/assets/b255d104-f739-441e-9744-80c4f40d7fd1
)

---

### 3D simulation *(work in progress)*

A Three.js replay mode that puts both cars on an extruded 3D circuit and scrubs through the lap with per-driver HUDs. Available for 2023+ races where full GPS telemetry is in the warehouse.

> Currently marked **Work In Progress** in the UI. The tab is visible but disabled for pre-2023 races where telemetry isn't available.

> **Screenshot tip:** once the 3D view is further along, record a short rotating camera clip of both cars on the circuit with the HUD overlays — that will be the most visually striking asset in this README.

---

## Features

- **Animated boot sequence** — warehouse connection status with retries and typed error diagnosis
- **Season / round / session selector** — All (best lap), Q1, Q2, Q3 filtering
- **Driver picker** — grid sorted by lap time, team-coloured headshots
- **Animated delta count-up** — lap gap animates to final value on load
- **Ring gauge** — proportional gap visualised as a circular progress arc
- **SVG circuit map** — sector dominance, animated car dot positions, sector break markers
- **Sector bar chart** — S1/S2/S3 breakdown with winner highlight
- **Speed trap comparison** — three trap speeds with directional bar
- **Mini-sector strip** — per-mini-sector segment colour (purple / green / yellow)
- **Tweaks panel** — toggle scanlines, compact density, accent colour, animated cars
- **3D lap replay** *(WIP)* — Three.js extruded circuit with telemetry HUD and scrubbable timeline
- **Graceful degradation** — pre-2023 races show lap totals and the track map; hatched panels replace missing data with a clear explanation

---

## Stack

```
Frontend         React 18 + Vite
3D engine        Three.js  (WIP)
Data warehouse   ClickHouse (HTTP API)
Data modelling   dbt  (mart tables in Monocoque)
Fonts            Oswald · JetBrains Mono · Geist
```

---

## Prerequisites

1. **Node.js 18+**
2. A running **ClickHouse** instance (local or Cloud) with the `f1_mart` schema populated
   → See [Monocoque](https://github.com/rajeevpaudel/Monocoque) for the ETL pipeline

---

## Setup

```bash
git clone https://github.com/rajeevpaudel/f1-viz.git
cd f1-viz
npm install
```

Copy the environment template and fill in your ClickHouse credentials:

```bash
cp .env.example .env.local
```

```env
CLICKHOUSE_URL=https://your-host.clickhouse.cloud
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your-password
CLICKHOUSE_DATABASE=f1_mart
```

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — the boot screen will connect to the warehouse automatically.

---

## Data availability

| Feature | Seasons |
|---|---|
| Qualifying results — positions, Q1/Q2/Q3 times | All |
| Sector times, speed traps | 2023+ |
| Mini-sector segments | 2023+ |
| Telemetry — animated cars, 3D simulation | 2023+ |

Pre-2023 rounds show lap totals and the static track outline. The UI handles missing data gracefully with labelled fallback panels rather than blank spaces.

---

## Track geometry

Track SVG paths and sector breakpoints are stored in `src/data/trackPaths.json`. To regenerate or extend for a new circuit:

```bash
# Pull from the warehouse (recommended)
node scripts/fetch-tracks-warehouse.mjs

# Pull via FastF1 (requires Python + fastf1)
python scripts/fetch-tracks-fastf1.py
```

---

## Project structure

```
src/
  App.jsx                    root component — view/mode state machine
  main.jsx                   React entry point
  styles/index.css           all styles; design tokens as CSS custom properties

  components/
    DriverCard.jsx            qualifying position, team colour, lap time
    DriverPicker.jsx          grid picker sorted by session time
    TrackRibbon.jsx           SVG circuit map with animated cars
    MiniSectorStrip.jsx       per-mini-sector colour strip
    SectorBars.jsx            S1/S2/S3 delta bars
    SpeedTraps.jsx            i1 / i2 / finish trap speeds
    TweaksPanel.jsx           scanlines / compact / accent controls
    CarSchematic.jsx          tyre/setup schematic overlay
    LoadingScreens.jsx        animated loading variants
    Select.jsx                styled dropdown

  simulation/
    SimulationView.jsx        Three.js 3D lap replay  (WIP)

  data/
    clickhouse.js             all warehouse queries
    circuits.js               circuit metadata and SVG path helpers
    trackPaths.json           pre-generated SVG paths + sector breaks
    teamColours.js            fallback team colour hex codes
    driverHeadshots.js        headshot URL helpers

  hooks/
    useCountUp.js             animated number hook

  carModel.js                 3D car model loader

public/
  f1_car.glb                  3D car model (GLB)
  favicon.svg
  icons.svg

scripts/
  fetch-tracks-warehouse.mjs  pull track geometry from warehouse
  fetch-tracks-fastf1.py      pull track geometry via FastF1
```

---

## UI notes

- **Minimum viewport: 1480px** — this is a desktop broadcast/analysis tool, not a mobile-responsive app
- The **tweaks panel** (bottom-right corner) lets you switch accent colours, toggle the CRT scanline overlay, switch to compact density, and toggle animated cars on the track map
- The **3D simulation tab** is visible but marked WIP; it requires 2023+ telemetry and is disabled for older races

---

## Related

- [Monocoque](https://github.com/rajeevpaudel/Monocoque) — the ETL pipeline that ingests raw F1 data, transforms it with dbt, and loads it into the ClickHouse warehouse that powers this UI

---

## License

[MIT](LICENSE)
