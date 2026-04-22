import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export default class Camera {
  instance: THREE.PerspectiveCamera
  controls: OrbitControls

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    this.instance.position.set(0, 2, 5)

    this.controls = new OrbitControls(this.instance, canvas)
    this.controls.enableDamping = true
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
