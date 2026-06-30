import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

let cachedGltf = null
let loadPromise = null

export function loadCarGltf() {
  if (cachedGltf) return Promise.resolve(cachedGltf)
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    new GLTFLoader().load('/f1_car.glb', gltf => { cachedGltf = gltf; resolve(gltf) }, undefined, reject)
  })
  return loadPromise
}

// Clone the loaded GLTF scene and apply team colour to body/rim parts.
// Materials named 'coler' and 'chassis' become the team colour;
// everything else keeps its original material.
export function colorCarModel(gltf, teamColorHex) {
  const root = gltf.scene.clone(true)
  const col = new THREE.Color(teamColorHex)
  root.traverse(child => {
    if (!child.isMesh) return
    child.castShadow = true
    const recolor = mat => {
      if (mat.name === 'coler' || mat.name === 'chassis') {
        const m = mat.clone()
        m.color.set(col)
        m.metalness = 0.55
        m.roughness = 0.25
        m.needsUpdate = true
        return m
      }
      if (mat.name === 'tier') {
        const m = mat.clone()
        m.color.set(0x111111)
        m.roughness = 0.9
        m.metalness = 0
        m.needsUpdate = true
        return m
      }
      return mat
    }
    child.material = Array.isArray(child.material)
      ? child.material.map(recolor)
      : recolor(child.material)
  })
  return root
}

// Center on XZ plane and scale so the car's longest horizontal axis
// fits targetLength Three.js units. Positions the bottom of the car at y=0.
export function scaleAndGroundCar(root, targetLength = 5.5) {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const s = targetLength / Math.max(size.x, size.z)
  root.scale.setScalar(s)
  const b2 = new THREE.Box3().setFromObject(root)
  const c = b2.getCenter(new THREE.Vector3())
  root.position.set(-c.x, -b2.min.y, -c.z)
}
