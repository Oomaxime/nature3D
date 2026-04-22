import * as THREE from 'three'
import type GUI from 'lil-gui'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import Terrain, { LAKE_INNER_RADIUS, getTerrainHeight } from './Terrain'

const COUNT     = 500
const PLANE_W   = 0.45
const PLANE_H   = 1.20
const WIND_AMP  = 0.14

/** alpha1: green stem → warm-white flower head */
function makeColorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 512
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 512, 0, 0)
  g.addColorStop(0.00, '#1e4d0f')   // dark green root
  g.addColorStop(0.42, '#3a8020')   // bright green stem / leaves
  g.addColorStop(0.54, '#c8a060')   // collar transition
  g.addColorStop(0.65, '#fff0d8')   // warm off-white petal base
  g.addColorStop(1.00, '#ffffff')   // pure white tip
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 512)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function buildCross(): THREE.BufferGeometry {
  const g1 = new THREE.PlaneGeometry(PLANE_W, PLANE_H)
  const g2 = new THREE.PlaneGeometry(PLANE_W, PLANE_H)
  g2.rotateY(Math.PI / 2)
  g1.translate(0, PLANE_H / 2, 0)
  g2.translate(0, PLANE_H / 2, 0)
  return mergeGeometries([g1, g2])!
}

export default class Flowers {
  private mesh: THREE.InstancedMesh
  private windUniform = { value: 0 }
  private maxCount = COUNT

  constructor(scene: THREE.Scene, terrain: Terrain) {
    const geo      = buildCross()
    const alphaTex = new THREE.TextureLoader().load('/textures/fleur/alpha1.png')
    const windU    = this.windUniform

    const material = new THREE.MeshStandardMaterial({
      map:        makeColorTexture(),
      alphaMap:   alphaTex,
      alphaTest:  0.45,
      side:       THREE.DoubleSide,
      roughness:  0.8,
      metalness:  0,
      depthWrite: true,
    })

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windU
      shader.vertexShader = /* glsl */`uniform float uTime;\n` + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */`
        #include <begin_vertex>
        float hf = clamp(transformed.y / ${PLANE_H.toFixed(2)}, 0.0, 1.0);
        #ifdef USE_INSTANCING
          float phase = instanceMatrix[3][0] * 0.41 + instanceMatrix[3][2] * 0.29;
        #else
          float phase = 0.0;
        #endif
        transformed.x += sin(uTime * 1.6 + phase) * ${WIND_AMP.toFixed(2)} * hf;
        transformed.z += cos(uTime * 1.3 + phase) * ${(WIND_AMP * 0.6).toFixed(2)} * hf;
        `
      )
    }
    material.customProgramCacheKey = () => 'flower-wind'

    this.mesh = new THREE.InstancedMesh(geo, material, COUNT)
    this.mesh.castShadow   = false
    this.mesh.receiveShadow = true

    const sampler = terrain.sampler
    const localPos = new THREE.Vector3()
    const dummy    = new THREE.Object3D()
    let placed = 0, attempts = 0

    while (placed < COUNT && attempts < COUNT * 10) {
      attempts++
      sampler.sample(localPos)
      const wx = localPos.x
      const wz = -localPos.y
      if (Math.sqrt(wx * wx + wz * wz) < LAKE_INNER_RADIUS + 3) continue
      dummy.position.set(wx, getTerrainHeight(wx, wz) - 0.08, wz)
      dummy.rotation.y = Math.random() * Math.PI * 2
      const s = 0.65 + Math.random() * 0.8
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(placed++, dummy.matrix)
    }

    this.mesh.instanceMatrix.needsUpdate = true
    scene.add(this.mesh)
  }

  setupGui(gui: GUI) {
    const folder = gui.addFolder('Flowers')
    const params = { count: this.maxCount }
    folder.add(params, 'count', 0, this.maxCount, 1).name('Count')
      .onChange((v: number) => { this.mesh.count = Math.round(v) })
  }

  update(time: number) { this.windUniform.value = time }

  dispose() {
    this.mesh.geometry.dispose()
    const mat = this.mesh.material as THREE.MeshStandardMaterial
    mat.map?.dispose(); mat.alphaMap?.dispose(); mat.dispose()
  }
}
