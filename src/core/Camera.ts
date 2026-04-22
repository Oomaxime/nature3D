import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export default class Camera {
  instance: THREE.PerspectiveCamera
  controls: OrbitControls

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.5,
      2000
    )
    this.instance.position.set(40, 22, 70)

    this.controls = new OrbitControls(this.instance, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.target.set(0, 2, 0)
    this.controls.maxPolarAngle = Math.PI / 2.1
    this.controls.minDistance   = 5
    this.controls.maxDistance   = 180
  }

  resize() {
    this.instance.aspect = window.innerWidth / window.innerHeight
    this.instance.updateProjectionMatrix()
  }

  update() {
    this.controls.update()
  }

  destroy() {
    this.controls.dispose()
  }
}
