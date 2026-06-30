import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { loadCarGltf, colorCarModel, scaleAndGroundCar } from '../carModel.js'

export default function CarSchematic({ color, mirrored = false, scale = 1 }) {
  const canvasRef = useRef(null)
  const w = Math.round(220 * scale)
  const h = Math.round(110 * scale)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setSize(w, h, false)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2

    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100)
    const side = mirrored ? -1 : 1
    cam.position.set(side * 5, 3.5, 6)
    cam.lookAt(0, 0.8, 0)

    const hemi = new THREE.HemisphereLight(0xccddff, 0x222233, 0.9)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 2.0)
    key.position.set(side * 4, 6, 5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x8899ff, 0.6)
    fill.position.set(-side * 5, 2, -4)
    scene.add(fill)

    let disposed = false

    loadCarGltf().then(gltf => {
      if (disposed) return
      const root = colorCarModel(gltf, color)
      scaleAndGroundCar(root, 5.5)
      scene.add(root)
      renderer.render(scene, cam)
    })

    return () => {
      disposed = true
      renderer.dispose()
    }
  }, [color, mirrored, w, h])

  return <canvas ref={canvasRef} width={w} height={h} style={{ display: 'block' }} />
}
