import * as THREE from 'three'
import type GUI from 'lil-gui'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import Terrain, { LAKE_INNER_RADIUS, getTerrainHeight } from './Terrain'
import type Renderer from '../core/Renderer'

const STUMP_COUNT   = 60
const LOG_COUNT     = 40
const BOULDER_COUNT = 80

// ─── Instancer ────────────────────────────────────────────────────────────────
// One InstancedMesh per submesh of the GLTF — all share the same instance matrices.
// Submesh local transforms are baked into each geometry so a single world matrix
// per instance drives the whole model correctly.

interface Instancer {
  parts:    THREE.InstancedMesh[]
  maxCount: number
}

function buildInstancer(gltfScene: THREE.Object3D, maxCount: number, scene: THREE.Scene): Instancer {
  // Models are already joined + transforms applied in Blender — one mesh, identity transform
  let mesh: THREE.Mesh | undefined
  gltfScene.traverse(c => { if (!mesh && c instanceof THREE.Mesh) mesh = c })
  if (!mesh) throw new Error('No mesh found in GLTF scene')

  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  const im  = new THREE.InstancedMesh(mesh.geometry, mat, maxCount)
  im.castShadow    = true
  im.receiveShadow = true
  im.count = 0
  scene.add(im)

  return { parts: [im], maxCount }
}

function setInstanceMatrix(instancer: Instancer, index: number, matrix: THREE.Matrix4) {
  for (const im of instancer.parts) im.setMatrixAt(index, matrix)
}

function finalizeInstancer(instancer: Instancer, count: number) {
  for (const im of instancer.parts) {
    im.count = count
    im.instanceMatrix.needsUpdate = true
  }
}

function setInstancerCount(instancer: Instancer, count: number) {
  for (const im of instancer.parts) im.count = Math.min(count, instancer.maxCount)
}

// ─── Placement helpers ────────────────────────────────────────────────────────

interface Placement { wx: number; wz: number; rotY: number; scale: THREE.Vector3 }

function samplePlacements(sampler: MeshSurfaceSampler, count: number, lakeBuffer: number, scaleFn: () => THREE.Vector3): Placement[] {
  const out: Placement[] = []
  const local = new THREE.Vector3()
  let attempts = 0
  while (out.length < count && attempts < count * 20) {
    attempts++
    sampler.sample(local)
    const wx = local.x, wz = -local.y
    if (Math.sqrt(wx * wx + wz * wz) < lakeBuffer) continue
    out.push({ wx, wz, rotY: Math.random() * Math.PI * 2, scale: scaleFn() })
  }
  return out
}

function placementsToInstancer(instancer: Instancer, placements: Placement[], yFloor: number) {
  const dummy = new THREE.Object3D()
  for (let i = 0; i < placements.length; i++) {
    const p  = placements[i]
    const wy = getTerrainHeight(p.wx, p.wz) - yFloor * p.scale.y
    dummy.position.set(p.wx, wy, p.wz)
    dummy.rotation.set(0, p.rotY, 0)
    dummy.scale.copy(p.scale)
    dummy.updateMatrix()
    setInstanceMatrix(instancer, i, dummy.matrix)
  }
  finalizeInstancer(instancer, placements.length)
}

function getYFloor(obj: THREE.Object3D): number {
  return new THREE.Box3().setFromObject(obj).min.y
}

// ─── Class ────────────────────────────────────────────────────────────────────

export default class Props {
  private stumpInstancer?:   Instancer
  private logInstancer?:     Instancer
  private boulderInstancer?: Instancer

  constructor(scene: THREE.Scene, terrain: Terrain, renderer: Renderer, camera: THREE.Camera) {
    const loader = new GLTFLoader()
    const sampler = terrain.sampler

    const stumpP   = samplePlacements(sampler, STUMP_COUNT,   LAKE_INNER_RADIUS + 6, () => { const s = 0.8 + Math.random() * 0.5;  return new THREE.Vector3(s, s * (0.85 + Math.random() * 0.3), s) })
    const logP     = samplePlacements(sampler, LOG_COUNT,     LAKE_INNER_RADIUS + 6, () => { const s = 0.7 + Math.random() * 0.6;  return new THREE.Vector3(s, s, s) })
    const boulderP = samplePlacements(sampler, BOULDER_COUNT, LAKE_INNER_RADIUS + 4, () => { const s = 0.4 + Math.random() * 1.2;  return new THREE.Vector3(s, s * (0.7 + Math.random() * 0.5), s) })

    loader.load('/models/TreeStump024/TreeStump024_Blender_Cycles.glb', (gltf) => {
      this.stumpInstancer = buildInstancer(gltf.scene, STUMP_COUNT, scene)
      placementsToInstancer(this.stumpInstancer, stumpP, getYFloor(gltf.scene))
      setInstancerCount(this.stumpInstancer, 20)
      renderer.compile(scene, camera)
    })

    loader.load('/models/TreeLog008/TreeLog008_Blender_Cycles.glb', (gltf) => {
      this.logInstancer = buildInstancer(gltf.scene, LOG_COUNT, scene)
      placementsToInstancer(this.logInstancer, logP, getYFloor(gltf.scene))
      setInstancerCount(this.logInstancer, 20)
      renderer.compile(scene, camera)
    })

    loader.load('/models/RockBoulderLarge054/RockBoulderLarge054_Blender_Cycles.glb', (gltf) => {
      this.boulderInstancer = buildInstancer(gltf.scene, BOULDER_COUNT, scene)
      placementsToInstancer(this.boulderInstancer, boulderP, getYFloor(gltf.scene))
      setInstancerCount(this.boulderInstancer, 30)
      renderer.compile(scene, camera)
    })
  }

  setupGui(gui: GUI) {
    const folder = gui.addFolder('Props')
    const params = { stumps: 20, logs: 20, boulders: 30 }
    folder.add(params, 'stumps',   0, STUMP_COUNT,   1).name('Stumps')  .onChange((v: number) => this.stumpInstancer   && setInstancerCount(this.stumpInstancer,   v))
    folder.add(params, 'logs',     0, LOG_COUNT,     1).name('Logs')    .onChange((v: number) => this.logInstancer     && setInstancerCount(this.logInstancer,     v))
    folder.add(params, 'boulders', 0, BOULDER_COUNT, 1).name('Boulders').onChange((v: number) => this.boulderInstancer && setInstancerCount(this.boulderInstancer, v))
  }

  dispose() {
    for (const inst of [this.stumpInstancer, this.logInstancer, this.boulderInstancer]) {
      inst?.parts.forEach(im => { im.geometry.dispose(); (im.material as THREE.Material).dispose() })
    }
  }
}
