import React, { useState, useEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { loadCarGltf, colorCarModel, scaleAndGroundCar } from '../carModel.js'

// ─── Telemetry synthesis ─────────────────────────────────────────────────

function samplePath(d, N = 360) {
  const svgNS = "http://www.w3.org/2000/svg"
  const tmp = document.createElementNS(svgNS, "svg")
  const path = document.createElementNS(svgNS, "path")
  path.setAttribute("d", d)
  tmp.appendChild(path)
  document.body.appendChild(tmp)
  const total = path.getTotalLength()
  const pts = []
  for (let i = 0; i < N; i++) {
    const p = path.getPointAtLength((i / N) * total)
    pts.push({ x: p.x, y: p.y, s: (i / N) * total })
  }
  document.body.removeChild(tmp)
  return { pts, total }
}

function computeCurvature(pts) {
  const N = pts.length
  const k = new Array(N)
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 4 + N) % N]
    const b = pts[i]
    const c = pts[(i + 4) % N]
    const v1x = b.x - a.x, v1y = b.y - a.y
    const v2x = c.x - b.x, v2y = c.y - b.y
    const cross = v1x * v2y - v1y * v2x
    const dot = v1x * v2x + v1y * v2y
    const angle = Math.atan2(Math.abs(cross), dot)
    const len = Math.hypot(v1x, v1y) + Math.hypot(v2x, v2y)
    k[i] = len > 0 ? angle / len * 2 : 0
  }
  const sm = new Array(N)
  for (let i = 0; i < N; i++) {
    let acc = 0, w = 0
    for (let j = -3; j <= 3; j++) {
      const idx = (i + j + N) % N
      const wt = 1 - Math.abs(j) / 4
      acc += k[idx] * wt; w += wt
    }
    sm[i] = acc / w
  }
  return sm
}

function curvatureToSpeed(k, opts = {}) {
  const { vMin = 75, vMax = 340 } = opts
  const t = Math.min(1, k * 18)
  return vMin + (vMax - vMin) * Math.pow(1 - t, 1.8)
}

function synthesizeTelemetry(circuit, driver) {
  const { pts, total } = samplePath(circuit.path, 480)
  const k = computeCurvature(pts)
  const N = pts.length

  const svgUnitsPerMeter = total / (circuit.length_km * 1000)

  let speeds = k.map(kv => curvatureToSpeed(kv))

  const bestMs = driver.best_time_ms
  const lapSeconds = bestMs / 1000

  const dMeters = new Array(N)
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N
    const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y
    dMeters[i] = Math.hypot(dx, dy) / svgUnitsPerMeter
  }

  const [b1, b2] = circuit.sector_breaks
  const sIdxBreaks = [Math.floor(b1 * N), Math.floor(b2 * N), N]
  const sectorTargets = driver.lap ? [
    driver.lap.duration_sector_1,
    driver.lap.duration_sector_2,
    driver.lap.duration_sector_3,
  ] : null

  for (let iter = 0; iter < 4; iter++) {
    let secStart = 0
    for (let s = 0; s < 3; s++) {
      const secEnd = sIdxBreaks[s]
      let secTime = 0
      for (let i = secStart; i < secEnd; i++) {
        const v = speeds[i] / 3.6
        secTime += dMeters[i] / Math.max(v, 1)
      }
      const target = sectorTargets ? sectorTargets[s] : lapSeconds / 3
      const factor = secTime / target
      for (let i = secStart; i < secEnd; i++) {
        speeds[i] *= factor
      }
      secStart = secEnd
    }
  }

  const times = new Array(N + 1)
  times[0] = 0
  for (let i = 0; i < N; i++) {
    const v = speeds[i] / 3.6
    times[i + 1] = times[i] + dMeters[i] / Math.max(v, 1)
  }
  const lapTimeS = times[N]

  const throttle = new Array(N)
  const brake = new Array(N)
  const gear = new Array(N)
  for (let i = 0; i < N; i++) {
    const prev = speeds[(i - 1 + N) % N]
    const next = speeds[(i + 1) % N]
    const dv = next - prev
    if (dv > 4) { throttle[i] = Math.min(100, 60 + dv * 2); brake[i] = 0 }
    else if (dv < -6) { brake[i] = Math.min(100, -dv * 1.8); throttle[i] = 0 }
    else { throttle[i] = 100; brake[i] = 0 }
    if (speeds[i] < 100) gear[i] = 2
    else if (speeds[i] < 150) gear[i] = 3
    else if (speeds[i] < 200) gear[i] = 4
    else if (speeds[i] < 240) gear[i] = 5
    else if (speeds[i] < 280) gear[i] = 6
    else if (speeds[i] < 320) gear[i] = 7
    else gear[i] = 8
  }

  return { pts, speeds, throttle, brake, gear, times, lapTimeS, dMeters, total }
}

// ─── Track ribbon geometry (3D extrude) ──────────────────────────────────
const TRACK_WIDTH = 16

function makeTrackMesh(pts, width = TRACK_WIDTH) {
  const N = pts.length
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const span = Math.max(maxX - minX, maxY - minY)
  const worldSize = 400
  const scale = worldSize / span

  const pts3 = pts.map(p => ({
    x: (p.x - cx) * scale,
    z: (p.y - cy) * scale,
  }))

  const positions = []
  const indices = []
  const uvs = []
  for (let i = 0; i < N; i++) {
    const a = pts3[(i - 1 + N) % N]
    const b = pts3[i]
    const c = pts3[(i + 1) % N]
    const tx = c.x - a.x, tz = c.z - a.z
    const tl = Math.hypot(tx, tz)
    const nx = -tz / tl, nz = tx / tl
    positions.push(b.x + nx * width / 2, 0, b.z + nz * width / 2)
    positions.push(b.x - nx * width / 2, 0, b.z - nz * width / 2)
    uvs.push(0, i / N * 40)
    uvs.push(1, i / N * 40)
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = i * 2 + 1
    const c = ((i + 1) % N) * 2, d = ((i + 1) % N) * 2 + 1
    indices.push(a, b, c, b, d, c)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()

  return { geo, pts3, scale, cx, cy }
}

function makeSideBandMesh(pts3, halfWidth, bandWidth, yOffset = 0.01, colorFn) {
  const N = pts3.length
  const positions = [], indices = [], colors = []
  for (let i = 0; i < N; i++) {
    const a = pts3[(i - 1 + N) % N], b = pts3[i], c = pts3[(i + 1) % N]
    const tx = c.x - a.x, tz = c.z - a.z, tl = Math.hypot(tx, tz)
    const nx = -tz / tl, nz = tx / tl
    // both sides
    for (const side of [1, -1]) {
      const inner = side * halfWidth
      const outer = side * (halfWidth + bandWidth)
      positions.push(b.x + nx * inner, yOffset, b.z + nz * inner)
      positions.push(b.x + nx * outer, yOffset, b.z + nz * outer)
      const [r, g, bv] = colorFn(i, side)
      colors.push(r, g, bv, r, g, bv)
    }
  }
  // 4 vertices per point (2 sides × 2 edges), build quads per side separately
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < N; i++) {
      const base = i * 4 + side * 2
      const next = ((i + 1) % N) * 4 + side * 2
      indices.push(base, base + 1, next, base + 1, next + 1, next)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function makeBarrierMesh(pts3, halfWidth, side = 1) {
  const N = pts3.length
  const h = 1.2, thick = 0.4
  const positions = [], indices = [], normals = []
  for (let i = 0; i < N; i++) {
    const a = pts3[(i - 1 + N) % N], b = pts3[i], c = pts3[(i + 1) % N]
    const tx = c.x - a.x, tz = c.z - a.z, tl = Math.hypot(tx, tz)
    const nx = -tz / tl, nz = tx / tl
    const ox = b.x + nx * halfWidth * side
    const oz = b.z + nz * halfWidth * side
    // 4 vertices per segment: bottom inner, top inner, top outer, bottom outer (facing outward)
    positions.push(ox, 0, oz, ox, h, oz, ox + nx * thick * side, h, oz + nz * thick * side, ox + nx * thick * side, 0, oz + nz * thick * side)
    normals.push(nx * side, 0, nz * side, nx * side, 0, nz * side, nx * side, 0, nz * side, nx * side, 0, nz * side)
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4, b = ((i + 1) % N) * 4
    indices.push(a, a + 1, b + 1, a, b + 1, b)
    indices.push(a + 1, a + 2, b + 2, a + 1, b + 2, b + 1)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3))
  geo.setIndex(indices)
  return geo
}

// ─── Main Sim component ──────────────────────────────────────────────────
export default function SimulationView({ a, b, circuit, onBack }) {
  const mountRef = useRef(null)
  const stateRef = useRef({})
  const [tNow, setTNow] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1.0)
  const [camera, setCamera] = useState("orbit")
  const cockpitOffRef = useRef({ x: 0.6, y: 0.4, z: 2.2 })
  const [ready, setReady] = useState(false)

  const telA = useMemo(() => a?.lap ? synthesizeTelemetry(circuit, a) : null, [a, circuit])
  const telB = useMemo(() => b?.lap ? synthesizeTelemetry(circuit, b) : null, [b, circuit])

  const lapMax = useMemo(() => Math.max(telA?.lapTimeS || 90, telB?.lapTimeS || 90), [telA, telB])


  useEffect(() => {
    if (!mountRef.current) return
    const mount = mountRef.current
    const w = mount.clientWidth, h = mount.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d1117)
    scene.fog = new THREE.Fog(0x0d1117, 300, 900)

    const cam = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000)
    cam.position.set(0, 80, 200)
    cam.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const hemi = new THREE.HemisphereLight(0xb0ccff, 0x203a10, 1.0)
    scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xfff8f0, 1.8)
    dir.position.set(140, 260, 80)
    dir.castShadow = true
    dir.shadow.mapSize.width = 2048; dir.shadow.mapSize.height = 2048
    dir.shadow.camera.left = -280; dir.shadow.camera.right = 280
    dir.shadow.camera.top = 280;   dir.shadow.camera.bottom = -280
    dir.shadow.camera.near = 1;    dir.shadow.camera.far = 800
    scene.add(dir)
    const fill = new THREE.DirectionalLight(0x4466aa, 0.4)
    fill.position.set(-100, 80, -100)
    scene.add(fill)

    // Green grass ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshStandardMaterial({ color: 0x1e3a14, roughness: 0.95, metalness: 0 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.05
    ground.receiveShadow = true
    scene.add(ground)

    const { pts, total } = samplePath(circuit.path, 480)
    const { geo: trackGeo, pts3, scale, cx, cy } = makeTrackMesh(pts, TRACK_WIDTH)

    // Run-off area (light gray/green between kerb and barrier)
    const runoffMat = new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.9 })
    scene.add(new THREE.Mesh(
      (() => {
        const g = new THREE.BufferGeometry()
        const N = pts3.length
        const halfW = TRACK_WIDTH / 2
        const runW = 5
        const pos = [], idx = []
        for (let i = 0; i < N; i++) {
          const a = pts3[(i - 1 + N) % N], b = pts3[i], c = pts3[(i + 1) % N]
          const tx = c.x - a.x, tz = c.z - a.z, tl = Math.hypot(tx, tz)
          const nx = -tz / tl, nz = tx / tl
          for (const side of [1, -1]) {
            pos.push(b.x + nx * halfW * side, -0.01, b.z + nz * halfW * side)
            pos.push(b.x + nx * (halfW + runW) * side, -0.01, b.z + nz * (halfW + runW) * side)
          }
        }
        for (let i = 0; i < N; i++) {
          for (const s of [0, 1]) {
            const base = i * 4 + s * 2, next = ((i + 1) % N) * 4 + s * 2
            idx.push(base, base + 1, next, base + 1, next + 1, next)
          }
        }
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
        g.setIndex(idx)
        g.computeVertexNormals()
        return g
      })(),
      runoffMat
    ))

    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x28282e, roughness: 0.88, metalness: 0.05 })
    const trackMesh = new THREE.Mesh(trackGeo, asphaltMat)
    trackMesh.receiveShadow = true
    scene.add(trackMesh)

    // Kerbs — both sides, red/white alternating stripes
    const kerbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 })
    const kerbGeo = makeSideBandMesh(pts3, TRACK_WIDTH / 2, 3, 0.01, (i) => {
      return (i % 6) < 3 ? [0.85, 0.1, 0.05] : [1, 1, 1]
    })
    scene.add(new THREE.Mesh(kerbGeo, kerbMat))

    // Armco barriers on both sides
    const armcoMat = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.5, metalness: 0.3 })
    for (const side of [1, -1]) {
      scene.add(new THREE.Mesh(makeBarrierMesh(pts3, TRACK_WIDTH / 2 + 3.4, side), armcoMat))
    }

    // White dashed center line
    const cline = new THREE.Group()
    for (let i = 0; i < pts3.length; i += 5) {
      const pa = pts3[i], pb = pts3[(i + 1) % pts3.length]
      const len = Math.hypot(pb.x - pa.x, pb.z - pa.z)
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.02, len * 1.8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      )
      seg.position.set((pa.x + pb.x) / 2, 0.03, (pa.z + pb.z) / 2)
      seg.rotation.y = Math.atan2(pb.x - pa.x, pb.z - pa.z)
      cline.add(seg)
    }
    scene.add(cline)

    // Sector boundary posts
    const sectorColors = [0xff1801, 0xffd700, 0x00d2be]
    const sIdx = [Math.floor(circuit.sector_breaks[0] * pts3.length), Math.floor(circuit.sector_breaks[1] * pts3.length), 0]
    sIdx.forEach((idx, k) => {
      const p = pts3[idx], p2 = pts3[(idx + 1) % pts3.length]
      const ang = Math.atan2(p2.z - p.z, p2.x - p.x)
      const perp = ang + Math.PI / 2
      const postMat = new THREE.MeshStandardMaterial({ color: sectorColors[k], emissive: sectorColors[k], emissiveIntensity: 0.7 })
      for (const sign of [1, -1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), postMat)
        post.position.set(p.x + Math.cos(perp) * sign * (TRACK_WIDTH / 2 + 4.5), 3.5, p.z + Math.sin(perp) * sign * (TRACK_WIDTH / 2 + 4.5))
        scene.add(post)
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.8), postMat)
        beam.position.set(p.x + Math.cos(perp) * sign * (TRACK_WIDTH / 2 + 4.5), 6.5, p.z + Math.sin(perp) * sign * (TRACK_WIDTH / 2 + 4.5))
        scene.add(beam)
      }
    })

    // Proper start/finish: checkered 3×8 grid + gantry pylons
    {
      const p0 = pts3[0], p1 = pts3[1]
      const ang = Math.atan2(p1.z - p0.z, p1.x - p0.x)
      // tangent and perpendicular direction vectors
      const tx = Math.cos(ang), tz = Math.sin(ang)
      const px = -tz, pz = tx  // perpendicular (left)

      const nCols = 8, nRows = 3
      const sqW = TRACK_WIDTH / nCols   // width across track
      const sqD = 1.8                    // depth along track

      for (let row = 0; row < nRows; row++) {
        for (let col = 0; col < nCols; col++) {
          const isWhite = (row + col) % 2 === 0
          const latOff = (col - (nCols / 2 - 0.5)) * sqW
          const lonOff = (row - (nRows / 2 - 0.5)) * sqD
          const sq = new THREE.Mesh(
            new THREE.PlaneGeometry(sqW * 0.97, sqD * 0.97),
            new THREE.MeshStandardMaterial({ color: isWhite ? 0xffffff : 0x111111, roughness: 0.4 })
          )
          sq.rotation.x = -Math.PI / 2
          sq.position.set(
            p0.x + px * latOff + tx * lonOff,
            0.04 + row * 0.002,
            p0.z + pz * latOff + tz * lonOff
          )
          scene.add(sq)
        }
      }

      // Timing gantry pylons
      const pylonH = 14, pylonW = 0.8
      const pylonMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.4 })
      const halfTW = TRACK_WIDTH / 2 + 4
      for (const sign of [1, -1]) {
        const px2 = p0.x + px * halfTW * sign
        const pz2 = p0.z + pz * halfTW * sign
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(pylonW, pylonH, pylonW), pylonMat)
        pylon.position.set(px2, pylonH / 2, pz2)
        scene.add(pylon)
        // Red/white stripe on pylon
        for (let s = 0; s < 5; s++) {
          const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(pylonW + 0.1, 1.0, pylonW + 0.1),
            new THREE.MeshStandardMaterial({ color: s % 2 === 0 ? 0xdd0000 : 0xffffff })
          )
          stripe.position.set(px2, 2 + s * 2.0, pz2)
          scene.add(stripe)
        }
      }
      // Horizontal crossbar
      const crossBar = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_WIDTH + 8 * 2 + 0.8, 0.6, 0.6),
        pylonMat
      )
      crossBar.position.set(p0.x, pylonH, p0.z)
      crossBar.rotation.y = -ang
      scene.add(crossBar)
    }

    let unmounted = false
    loadCarGltf().then(gltf => {
      if (unmounted || !stateRef.current.scene) return
      const rootA = colorCarModel(gltf, a.team_colour)
      const rootB = colorCarModel(gltf, b.team_colour)
      scaleAndGroundCar(rootA)
      scaleAndGroundCar(rootB)
      stateRef.current.scene.add(rootA)
      stateRef.current.scene.add(rootB)
      stateRef.current.carA = rootA
      stateRef.current.carB = rootB
    })

    const posAt = (tel, t) => {
      const N = tel.pts.length
      const lap = tel.lapTimeS
      // Clamp to one lap — car stops at the finish line rather than repeating
      const tt = Math.min(t, lap * (1 - 1e-6))
      let lo = 0, hi = N
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (tel.times[mid] < tt) lo = mid + 1; else hi = mid
      }
      const i = Math.max(0, lo - 1)
      const i2 = (i + 1) % N
      const f = (tt - tel.times[i]) / Math.max(0.001, tel.times[i + 1] - tel.times[i])
      const pa = pts3[i], pb = pts3[i2]
      const x = pa.x + (pb.x - pa.x) * f
      const z = pa.z + (pb.z - pa.z) * f
      const heading = Math.atan2(pb.x - pa.x, pb.z - pa.z)
      return { x, z, heading, idx: i, frac: f }
    }

    stateRef.current = {
      scene, cam, renderer, mount,
      carA: null, carB: null, pts3, total, scale,
      telA, telB, posAt,
      raf: null,
    }

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight
      renderer.setSize(w, h)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    }
    window.addEventListener("resize", onResize)

    setReady(true)

    return () => {
      unmounted = true
      window.removeEventListener("resize", onResize)
      if (stateRef.current.raf) cancelAnimationFrame(stateRef.current.raf)
      stateRef.current.scene = null
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [circuit?.circuit_id, a?.driver_id, b?.driver_id])

  useEffect(() => {
    const st = stateRef.current
    if (!ready || !st.scene) return

    let last = performance.now()
    let tCurrent = tNow

    let orbitAngle = 0

    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      if (playing) {
        tCurrent += dt * speed
        if (tCurrent >= lapMax) {
          tCurrent = tCurrent % lapMax
        }
        setTNow(tCurrent)
      }

      if (st.carA && st.telA) {
        const p = st.posAt(st.telA, tCurrent)
        st.carA.position.set(p.x, 0, p.z)
        st.carA.rotation.y = p.heading
      }
      if (st.carB && st.telB) {
        const p = st.posAt(st.telB, tCurrent)
        st.carB.position.set(p.x, 0, p.z)
        st.carB.rotation.y = p.heading
      }

      const isCockpitA = camera === "cockpit-a"
      const isCockpitB = camera === "cockpit-b"
      const isChaseA   = camera === "chase-a"
      const isChaseB   = camera === "chase-b"

      const setCarOpacity = (car, opacity) => {
        if (!car) return
        car.traverse(obj => {
          if (obj.isMesh && obj.material) {
            obj.material.transparent = opacity < 1
            obj.material.opacity = opacity
          }
        })
      }
      if (isCockpitA) { setCarOpacity(st.carA, 1); setCarOpacity(st.carB, 0.2) }
      else if (isCockpitB) { setCarOpacity(st.carB, 1); setCarOpacity(st.carA, 0.2) }
      else { setCarOpacity(st.carA, 1); setCarOpacity(st.carB, 1) }

      const targetCar = (isChaseB || isCockpitB) ? st.carB : st.carA

      // FOV: cockpit needs a wide field of view for immersion
      const targetFov = (isCockpitA || isCockpitB) ? 90 : 55
      if (Math.abs(st.cam.fov - targetFov) > 0.5) {
        st.cam.fov = targetFov
        st.cam.updateProjectionMatrix()
      }

      if (isCockpitA || isCockpitB) {
        // Cockpit POV — derive position from telemetry so the hidden car's
        // transform is still available even though its mesh is invisible
        const cockpitTel = isCockpitB ? st.telB : st.telA
        if (cockpitTel) {
          const p = st.posAt(cockpitTel, tCurrent)
          const h = p.heading
          const { x: ox, y: oy, z: oz } = cockpitOffRef.current
          // oz is forward offset along heading; ox is lateral (right = positive)
          const cosH = Math.cos(h), sinH = Math.sin(h)
          st.cam.up.set(0, 1, 0)
          st.cam.position.set(
            p.x + sinH * oz + cosH * ox,
            oy,
            p.z + cosH * oz - sinH * ox,
          )
          st.cam.lookAt(
            p.x + sinH * 80,
            oy * 0.5,
            p.z + cosH * 80,
          )
        }
      } else if (isChaseA || isChaseB) {
        if (targetCar) {
          const c = targetCar.position
          const h = targetCar.rotation.y
          const back = 18, up = 7
          const desiredX = c.x - Math.sin(h) * back
          const desiredZ = c.z - Math.cos(h) * back
          st.cam.up.set(0, 1, 0)
          st.cam.position.x += (desiredX - st.cam.position.x) * 0.18
          st.cam.position.y += (up - st.cam.position.y) * 0.18
          st.cam.position.z += (desiredZ - st.cam.position.z) * 0.18
          st.cam.lookAt(c.x + Math.sin(h) * 8, 1.5, c.z + Math.cos(h) * 8)
        }
      } else if (camera === "overhead") {
        st.cam.position.set(0, 480, 0.01)
        st.cam.up.set(0, 0, -1)
        st.cam.lookAt(0, 0, 0)
      } else if (camera === "orbit") {
        orbitAngle += dt * 0.15
        const r = 320
        st.cam.up.set(0, 1, 0)
        st.cam.position.set(Math.cos(orbitAngle) * r, 170, Math.sin(orbitAngle) * r)
        st.cam.lookAt(0, 0, 0)
      }

      st.renderer.render(st.scene, st.cam)
      st.raf = requestAnimationFrame(tick)
    }
    st.raf = requestAnimationFrame(tick)
    return () => { if (st.raf) cancelAnimationFrame(st.raf) }
  }, [ready, playing, speed, camera, lapMax])

  const liveA = sampleTelemetry(telA, tNow)
  const liveB = sampleTelemetry(telB, tNow)

  const gapAtNow = useMemo(() => {
    if (!telA || !telB) return 0
    const N = telA.pts.length
    const tt = ((tNow % telA.lapTimeS) + telA.lapTimeS) % telA.lapTimeS
    let i = 0
    while (i < N && telA.times[i + 1] < tt) i++
    const fracDist = (i + (tt - telA.times[i]) / Math.max(0.001, telA.times[i+1] - telA.times[i])) / N
    const targetIdx = Math.min(N - 1, Math.floor(fracDist * N))
    const bTime = telB.times[targetIdx]
    return bTime - tt
  }, [tNow, telA, telB])

  return (
    <section className="sim-view">
      <div className="sim-stage" ref={mountRef}>
        {!ready && <div className="sim-loading">INITIALIZING 3D SCENE…</div>}

        <div className="sim-hud hud-a" style={{borderColor: a.team_colour}}>
          <DriverHud driver={a} live={liveA} side="left"/>
        </div>
        <div className="sim-hud hud-b" style={{borderColor: b.team_colour}}>
          <DriverHud driver={b} live={liveB} side="right"/>
        </div>

        <div className="sim-gap-pill">
          <div className="sgp-lbl">GAP {a.driver.driver_code} → {b.driver.driver_code}</div>
          <div className="sgp-val" style={{color: gapAtNow > 0 ? a.team_colour : b.team_colour}}>
            {gapAtNow > 0 ? "−" : "+"}{Math.abs(gapAtNow).toFixed(3)}s
          </div>
        </div>

        <div className="sim-cam-pick">
          {[
            {k:"cockpit-a", l:`COCKPIT ${a.driver.driver_code}`, c: a.team_colour},
            {k:"cockpit-b", l:`COCKPIT ${b.driver.driver_code}`, c: b.team_colour},
            {k:"chase-a",   l:`CHASE ${a.driver.driver_code}`,   c: a.team_colour},
            {k:"chase-b",   l:`CHASE ${b.driver.driver_code}`,   c: b.team_colour},
            {k:"overhead",  l:"OVERHEAD",  c:"#fff"},
            {k:"orbit",     l:"ORBIT",     c:"#fff"},
          ].map(o => (
            <button key={o.k}
              className={"cam-btn" + (camera === o.k ? " on" : "")}
              style={camera === o.k ? {borderColor: o.c, color: o.c} : {}}
              onClick={() => setCamera(o.k)}>
              {o.l}
            </button>
          ))}
        </div>


        <div className="sim-sectors">
          {[1,2,3].map(s => {
            const aSec = a.lap ? a.lap["duration_sector_"+s] : null
            const bSec = b.lap ? b.lap["duration_sector_"+s] : null
            const winA = aSec != null && bSec != null && aSec < bSec
            return (
              <div key={s} className="sim-sec-card">
                <div className="ssc-lbl">SECTOR {s}</div>
                <div className="ssc-row">
                  <span style={{color: winA ? a.team_colour : "var(--ink-3)"}}>{aSec?.toFixed(3) ?? "—"}</span>
                  <span style={{color: !winA ? b.team_colour : "var(--ink-3)"}}>{bSec?.toFixed(3) ?? "—"}</span>
                </div>
                <div className="ssc-bar">
                  <div style={{
                    width: winA ? "100%" : `${(aSec/bSec)*100}%`,
                    background: a.team_colour
                  }}/>
                  <div style={{
                    width: !winA ? "100%" : `${(bSec/aSec)*100}%`,
                    background: b.team_colour
                  }}/>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <SimTimeline
        tNow={tNow} setTNow={setTNow}
        playing={playing} setPlaying={setPlaying}
        speed={speed} setSpeed={setSpeed}
        lapMax={lapMax}
        a={a} b={b}
        telA={telA} telB={telB}
        onBack={onBack}
      />
    </section>
  )
}

function sampleTelemetry(tel, t) {
  if (!tel) return null
  const N = tel.pts.length
  const lap = tel.lapTimeS
  const tt = ((t % lap) + lap) % lap
  let i = 0
  while (i < N && tel.times[i + 1] < tt) i++
  return {
    speed: tel.speeds[i],
    throttle: tel.throttle[i],
    brake: tel.brake[i],
    gear: tel.gear[i],
    distance: (i / N) * 100,
    elapsed: tt,
  }
}

function DriverHud({ driver, live, side }) {
  if (!live) return null
  const tk = live.throttle, br = live.brake
  return (
    <div className={"dh side-" + side}>
      <div className="dh-top">
        <div className="dh-code" style={{color: driver.team_colour}}>{driver.driver.driver_code}</div>
        <div className="dh-name">{driver.driver.full_name}</div>
      </div>
      <div className="dh-speed">
        <div className="dh-speed-val">{Math.round(live.speed)}</div>
        <div className="dh-speed-unit">KM/H</div>
      </div>
      <div className="dh-gear">
        <div className="dh-gear-lbl">GEAR</div>
        <div className="dh-gear-val" style={{color: driver.team_colour}}>{live.gear}</div>
      </div>
      <div className="dh-bars">
        <div className="dh-bar-row">
          <span>THR</span>
          <div className="dh-bar"><div style={{width: `${tk}%`, background: "var(--good)"}}/></div>
          <span>{Math.round(tk)}</span>
        </div>
        <div className="dh-bar-row">
          <span>BRK</span>
          <div className="dh-bar"><div style={{width: `${br}%`, background: "var(--accent)"}}/></div>
          <span>{Math.round(br)}</span>
        </div>
      </div>
      <div className="dh-rpm">
        {Array.from({length: 14}).map((_, i) => (
          <span key={i} className="rpm-dot" style={{
            background: (live.throttle/100 * 14) > i
              ? (i < 9 ? driver.team_colour : i < 12 ? "var(--warn)" : "var(--accent)")
              : "#1a1a1f"
          }}/>
        ))}
      </div>
    </div>
  )
}

function buildSpark(tel) {
  if (!tel) return ""
  const N = tel.speeds.length
  const min = 60, max = 360
  let d = ""
  for (let i = 0; i < N; i += 2) {
    const x = (i / N) * 1000
    const y = 80 - ((tel.speeds[i] - min) / (max - min)) * 80
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + Math.max(0, Math.min(80, y)).toFixed(1) + " "
  }
  return d
}

function SimTimeline({ tNow, setTNow, playing, setPlaying, speed, setSpeed, lapMax, a, b, telA, telB, onBack }) {
  const trackRef = useRef(null)

  const onScrub = (e) => {
    const r = trackRef.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    setTNow(Math.max(0, Math.min(lapMax, x * lapMax)))
  }

  const sparkA = useMemo(() => buildSpark(telA), [telA])
  const sparkB = useMemo(() => buildSpark(telB), [telB])

  const progressA = telA ? Math.min(1, (tNow / telA.lapTimeS) % 1) : 0
  const progressB = telB ? Math.min(1, (tNow / telB.lapTimeS) % 1) : 0

  return (
    <div className="sim-tl">
      <div className="sim-tl-controls">
        <button className="ghost-btn" onClick={onBack}>◀ EXIT 3D</button>
        <button className="play-btn" onClick={() => setPlaying(p => !p)}>
          {playing ? "❚❚ PAUSE" : "▶ PLAY"}
        </button>
        <div className="speed-pick">
          {[0.25, 0.5, 1, 2].map(s => (
            <button key={s}
              className={"sp-btn" + (Math.abs(speed - s) < 0.01 ? " on" : "")}
              onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <div className="tl-clock">
          T+ {tNow.toFixed(3)}<span> / {lapMax.toFixed(3)}s</span>
        </div>
      </div>

      <div className="sim-tl-track" ref={trackRef} onClick={onScrub}>
        <svg viewBox="0 0 1000 80" preserveAspectRatio="none" className="tl-spark">
          <path d={sparkA} fill="none" stroke={a.team_colour} strokeWidth="2" opacity="0.85"/>
          <path d={sparkB} fill="none" stroke={b.team_colour} strokeWidth="2" opacity="0.85"/>
        </svg>
        {[0.33, 0.66].map((f, i) => (
          <div key={i} className="tl-sec" style={{left: `${f*100}%`}}>
            <span>S{i+2}</span>
          </div>
        ))}
        <div className="tl-progA" style={{ width: `${progressA*100}%`, background: a.team_colour }}/>
        <div className="tl-progB" style={{ width: `${progressB*100}%`, background: b.team_colour }}/>
        <div className="tl-head" style={{ left: `${(tNow/lapMax)*100}%` }}/>
      </div>

      <div className="sim-tl-foot">
        <div>SPEED TRACE — {a.driver.driver_code} <span style={{color: a.team_colour}}>━</span> · {b.driver.driver_code} <span style={{color: b.team_colour}}>━</span></div>
      </div>
    </div>
  )
}
