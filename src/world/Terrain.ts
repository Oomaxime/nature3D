import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

const TERRAIN_SIZE = 200
const TERRAIN_SEGMENTS = 200

// Lake parameters (world-space, in local plane coordinates)
export const LAKE_INNER_RADIUS = 18
const LAKE_OUTER_RADIUS = 32
const LAKE_FLOOR_Y = -1.8

export const LAKE_SURFACE_Y = -0.5 // water plane sits here

export function getTerrainHeight(worldX: number, worldZ: number): number {
  return computeHeight(worldX, -worldZ)
}


function computeHeight(x: number, y: number): number {
  // Layered sine waves – FBM-like hills
  let h = 0
  h += Math.sin(x * 0.04 + 0.5)  * Math.cos(y * 0.035 + 1.1) * 10
  h += Math.sin(x * 0.08 + 2.3)  * Math.cos(y * 0.09  + 0.4) *  5
  h += Math.sin(x * 0.15 + 1.7)  * Math.cos(y * 0.13  + 2.8) *  2.5
  h += Math.sin(x * 0.30 + 3.1)  * Math.cos(y * 0.28  + 1.5) *  1.2
  h += Math.sin((x + y) * 0.06 + 0.9) * 3
  h += Math.sin((x - y) * 0.05 + 1.4) * 2

  // Ring of hills surrounding the lake for drama
  const dist = Math.sqrt(x * x + y * y)
  h += Math.exp(-Math.pow((dist - 50) / 22, 2)) * 6

  // Smooth lake basin
  if (dist < LAKE_OUTER_RADIUS) {
    const t = Math.max(0, (dist - LAKE_INNER_RADIUS) / (LAKE_OUTER_RADIUS - LAKE_INNER_RADIUS))
    const smooth = t * t * (3 - 2 * t)
    h = h * smooth + LAKE_FLOOR_Y * (1 - smooth)
  }

  return h
}

export default class Terrain {
  mesh: THREE.Mesh
  sampler!: MeshSurfaceSampler

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS
    )

    const positions = geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const y = positions.getY(i) // local Y → world Z after rotation
      positions.setZ(i, computeHeight(x, y))
    }
    geometry.computeVertexNormals()

    const BASE = '/textures/floor/Poliigon_GrassPatchyGround_4585(1)/1K/Poliigon_GrassPatchyGround_4585_'
    const loader = new THREE.TextureLoader()
    const colorMap    = loader.load(`${BASE}BaseColor.jpg`)
    const normalMap   = loader.load(`${BASE}Normal.png`)
    const roughMap    = loader.load(`${BASE}Roughness.jpg`)
    const metalMap    = loader.load(`${BASE}Metallic.jpg`)

    for (const tex of [colorMap, normalMap, roughMap, metalMap]) {
      tex.repeat.set(20, 20)
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    }

    const material = new THREE.MeshStandardMaterial({
      map: colorMap,
      normalMap,
      roughnessMap: roughMap,
      metalnessMap: metalMap,
      metalness: 1, // driven entirely by the (near-black) metallic map
    })

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.receiveShadow = true
    scene.add(this.mesh)

    // Built once, shared by all vegetation/props classes
    this.mesh.updateWorldMatrix(true, false)
    this.sampler = new MeshSurfaceSampler(this.mesh).build()
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.MeshStandardMaterial).dispose()
  }
}
