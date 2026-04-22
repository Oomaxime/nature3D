import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { SUN_POSITION } from './Lighting'

export default class SkyEnvironment {
  private sky: Sky

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.sky = new Sky()
    this.sky.scale.setScalar(450_000)
    scene.add(this.sky)

    // Sunset atmosphere parameters
    const u = this.sky.material.uniforms
    u['turbidity'].value      = 10
    u['rayleigh'].value       = 3
    u['mieCoefficient'].value = 0.005
    u['mieDirectionalG'].value = 0.92
    u['sunPosition'].value.copy(SUN_POSITION)

    // Tone mapping that makes the sky shader colours look cinematic
    renderer.toneMapping         = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.42
  }

  dispose() {
    this.sky.geometry.dispose()
    this.sky.material.dispose()
  }
}
