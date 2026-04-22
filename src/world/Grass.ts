import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import Terrain, { LAKE_INNER_RADIUS, getTerrainHeight } from './Terrain'

const COUNT_PER_VARIANT = 3_500
const BLADE_HEIGHT = 1.2

const UV_OFFSETS: [number, number][] = [
  [0.0, 0.5],
  [0.5, 0.5],
  [0.0, 0.0],
  [0.5, 0.0],
]

function buildCrossGeometry(): THREE.BufferGeometry {
  const W = 0.9, H = BLADE_HEIGHT
  const g1 = new THREE.PlaneGeometry(W, H)
  const g2 = new THREE.PlaneGeometry(W, H)
  g2.rotateY(Math.PI / 2)
  g1.translate(0, H / 2, 0)
  g2.translate(0, H / 2, 0)
  return mergeGeometries([g1, g2])!
}

export default class Grass {
  private meshes: THREE.InstancedMesh[] = []
  private windUniform = { value: 0 }

  constructor(scene: THREE.Scene, terrain: Terrain) {
    const geo = buildCrossGeometry()
    terrain.mesh.updateWorldMatrix(true, false)
    const sampler = new MeshSurfaceSampler(terrain.mesh).build()

    const loader = new THREE.TextureLoader()
    const baseTex = loader.load('/textures/herbe/color.png')
    baseTex.colorSpace = THREE.SRGBColorSpace

    // Shared onBeforeCompile — same compiled program reused for all 4 variants
    const windUniform = this.windUniform
    const onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uTime = windUniform

      // Prepend custom uniform declaration
      shader.vertexShader = /* glsl */`uniform float uTime;\n` + shader.vertexShader

      // Inject wind displacement right after 'transformed' is initialised
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */`
        #include <begin_vertex>
        float heightFactor = clamp(transformed.y / ${BLADE_HEIGHT.toFixed(1)}, 0.0, 1.0);
        // Use instance world-position for unique phase per blade
        #ifdef USE_INSTANCING
          float phase = instanceMatrix[3][0] * 0.31 + instanceMatrix[3][2] * 0.19;
        #else
          float phase = 0.0;
        #endif
        transformed.x += sin(uTime * 2.1 + phase) * 0.18 * heightFactor;
        transformed.z += cos(uTime * 1.8 + phase) * 0.10 * heightFactor;
        `
      )
    }

    const dummy   = new THREE.Object3D()
    const localPos = new THREE.Vector3()

    for (let v = 0; v < UV_OFFSETS.length; v++) {
      const tex = baseTex.clone()
      tex.repeat.set(0.5, 0.5)
      tex.offset.set(UV_OFFSETS[v][0], UV_OFFSETS[v][1])
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
      tex.needsUpdate = true

      const material = new THREE.MeshStandardMaterial({
        map: tex,
        alphaTest: 0.2,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0,
        depthWrite: true,
      })
      material.onBeforeCompile  = onBeforeCompile
      material.customProgramCacheKey = () => 'grass-wind'

      const mesh = new THREE.InstancedMesh(geo, material, COUNT_PER_VARIANT)
      mesh.castShadow   = false
      mesh.receiveShadow = true

      let placed = 0
      let attempts = 0

      while (placed < COUNT_PER_VARIANT && attempts < COUNT_PER_VARIANT * 8) {
        attempts++
        sampler.sample(localPos)

        // Local plane: x→worldX, y→-worldZ (rotation.x = -PI/2)
        const wx = localPos.x
        const wz = -localPos.y

        const d = Math.sqrt(wx * wx + wz * wz)
        if (d < LAKE_INNER_RADIUS + 5) continue

        // Exact height from terrain function — no sampler world-transform drift
        const wy = getTerrainHeight(wx, wz) - 0.1

        dummy.position.set(wx, wy, wz)
        dummy.rotation.y = Math.random() * Math.PI * 2
        const s = 0.7 + Math.random() * 1.0
        dummy.scale.set(s, s, s)
        dummy.updateMatrix()

        mesh.setMatrixAt(placed, dummy.matrix)
        placed++
      }

      mesh.instanceMatrix.needsUpdate = true
      scene.add(mesh)
      this.meshes.push(mesh)
    }
  }

  update(time: number) {
    this.windUniform.value = time
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.MeshStandardMaterial).dispose()
    }
  }
}
