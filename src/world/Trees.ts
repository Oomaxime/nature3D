import * as THREE from 'three'
import type GUI from 'lil-gui'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { LAKE_INNER_RADIUS, getTerrainHeight } from './Terrain'
import type { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

const TREE_COUNT = 120
const MIN_DIST   = LAKE_INNER_RADIUS + 12

interface TreeInstancer {
  im:       THREE.InstancedMesh
  maxCount: number
}

export default class Trees {
  private instancer?: TreeInstancer

  constructor(scene: THREE.Scene, sampler: MeshSurfaceSampler, renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    // Pre-sample placements so they're ready when GLB finishes
    const placements = samplePlacements(sampler, TREE_COUNT)

    const draco = new DRACOLoader()
    draco.setDecoderPath('/draco/')

    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)

    loader.load('/models/tree.glb', (gltf) => {
      let srcMesh: THREE.Mesh | undefined
      gltf.scene.traverse(c => { if (!srcMesh && c instanceof THREE.Mesh) srcMesh = c })
      if (!srcMesh) return

      const texLoader = new THREE.TextureLoader()
      const BASE = '/textures/arbre/'
      const colorMap  = texLoader.load(`${BASE}color-512_1.jpg`)
      const normalMap = texLoader.load(`${BASE}normal-512.jpg`)
      const rmaoMap   = texLoader.load(`${BASE}rmao-512.jpg`)
      colorMap.colorSpace = THREE.SRGBColorSpace

      const mat = new THREE.MeshStandardMaterial({
        map:          colorMap,
        normalMap:    normalMap,
        roughnessMap: rmaoMap,   // G channel → roughness
        aoMap:        rmaoMap,   // R channel → AO
        metalness:    0,
        roughness:    1,
        side:         THREE.FrontSide,
      })

      const im = new THREE.InstancedMesh(srcMesh.geometry, mat, TREE_COUNT)
      im.castShadow    = true
      im.receiveShadow = true
      im.count = TREE_COUNT

      const dummy = new THREE.Object3D()
      for (let i = 0; i < placements.length; i++) {
        const p = placements[i]
        const wy = getTerrainHeight(p.wx, p.wz)
        dummy.position.set(p.wx, wy, p.wz)
        dummy.rotation.set(0, p.rotY, 0)
        dummy.scale.setScalar(p.scale)
        dummy.updateMatrix()
        im.setMatrixAt(i, dummy.matrix)
      }
      im.instanceMatrix.needsUpdate = true

      scene.add(im)
      this.instancer = { im, maxCount: TREE_COUNT }

      renderer.compile(scene, camera)
      draco.dispose()
    })
  }

  setupGui(gui: GUI) {
    const folder = gui.addFolder('Trees')
    const params = { count: TREE_COUNT }
    folder.add(params, 'count', 0, TREE_COUNT, 1).name('Count')
      .onChange((v: number) => {
        if (this.instancer) this.instancer.im.count = Math.round(v)
      })
    folder.close()
  }

  dispose() {
    if (!this.instancer) return
    this.instancer.im.geometry.dispose()
    ;(this.instancer.im.material as THREE.Material).dispose()
  }
}

interface Placement { wx: number; wz: number; rotY: number; scale: number }

function samplePlacements(sampler: MeshSurfaceSampler, count: number): Placement[] {
  const out: Placement[] = []
  const local = new THREE.Vector3()
  let attempts = 0
  while (out.length < count && attempts < count * 30) {
    attempts++
    sampler.sample(local)
    const wx = local.x
    const wz = -local.y
    const d = Math.sqrt(wx * wx + wz * wz)
    if (d < MIN_DIST) continue
    out.push({
      wx,
      wz,
      rotY: Math.random() * Math.PI * 2,
      scale: 0.8 + Math.random() * 0.6,
    })
  }
  return out
}
