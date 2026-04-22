import * as THREE from 'three'
import type GUI from 'lil-gui'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import Terrain, { LAKE_INNER_RADIUS, getTerrainHeight } from './Terrain'

const BUSH_COUNT  = 400
const BUSH_W      = 2.6
const BUSH_H      = 2.0
const PLANES      = 3   // star pattern: 0° / 60° / 120°

/** 3 planes evenly spread over 180° — DoubleSide fills the other 180° */
function buildBushGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < PLANES; i++) {
    const g = new THREE.PlaneGeometry(BUSH_W, BUSH_H)
    g.translate(0, BUSH_H / 2, 0)                 // pivot at base
    g.rotateY((i / PLANES) * Math.PI)              // 0°, 60°, 120°
    parts.push(g)
  }
  return mergeGeometries(parts)!
}

export default class Bushes {
  private mesh: THREE.InstancedMesh
  private windUniform = { value: 0 }

  constructor(scene: THREE.Scene, terrain: Terrain) {
    const geo = buildBushGeometry()

    const loader   = new THREE.TextureLoader()
    const colorMap = loader.load('/textures/buisson/BaseColor.png')
    const normMap  = loader.load('/textures/buisson/Normal.png')
    const ormMap   = loader.load('/textures/buisson/OcclusionRoughnessMetallic.png')
    colorMap.colorSpace = THREE.SRGBColorSpace

    const windUniform = this.windUniform

    const material = new THREE.MeshStandardMaterial({
      map:          colorMap,
      normalMap:    normMap,
      roughnessMap: ormMap,   // G channel = roughness
      metalnessMap: ormMap,   // B channel = metalness (~0 for foliage)
      metalness:    1,        // driven entirely by near-black metallic map
      alphaTest:    0.25,
      side:         THREE.DoubleSide,
      depthWrite:   true,
    })

    // Gentle sway — bushes are stiffer than grass
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniform
      shader.vertexShader = /* glsl */`uniform float uTime;\n` + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */`
        #include <begin_vertex>
        float hf = clamp(transformed.y / ${BUSH_H.toFixed(1)}, 0.0, 1.0);
        #ifdef USE_INSTANCING
          float phase = instanceMatrix[3][0] * 0.27 + instanceMatrix[3][2] * 0.17;
        #else
          float phase = 0.0;
        #endif
        transformed.x += sin(uTime * 1.2 + phase) * 0.06 * hf;
        transformed.z += cos(uTime * 0.9 + phase) * 0.04 * hf;
        `
      )
    }
    material.customProgramCacheKey = () => 'bush-wind'

    this.mesh = new THREE.InstancedMesh(geo, material, BUSH_COUNT)
    this.mesh.castShadow   = true
    this.mesh.receiveShadow = true

    // Scatter
    const sampler = terrain.sampler
    const localPos = new THREE.Vector3()
    const dummy    = new THREE.Object3D()

    let placed = 0, attempts = 0

    while (placed < BUSH_COUNT && attempts < BUSH_COUNT * 10) {
      attempts++
      sampler.sample(localPos)

      const wx = localPos.x
      const wz = -localPos.y

      const d = Math.sqrt(wx * wx + wz * wz)
      if (d < LAKE_INNER_RADIUS + 4) continue

      const wy = getTerrainHeight(wx, wz) - 0.15

      dummy.position.set(wx, wy, wz)
      dummy.rotation.y = Math.random() * Math.PI * 2
      const s = 0.7 + Math.random() * 1.1
      dummy.scale.set(s, s * (0.85 + Math.random() * 0.3), s) // slight Y variety
      dummy.updateMatrix()

      this.mesh.setMatrixAt(placed, dummy.matrix)
      placed++
    }

    this.mesh.instanceMatrix.needsUpdate = true
    scene.add(this.mesh)
  }

  setupGui(gui: GUI) {
    const folder = gui.addFolder('Bushes')
    const params = { count: BUSH_COUNT }
    folder.add(params, 'count', 0, BUSH_COUNT, 1).name('Count')
      .onChange((v: number) => { this.mesh.count = Math.round(v) })
  }

  update(time: number) {
    this.windUniform.value = time
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.MeshStandardMaterial).dispose()
  }
}
