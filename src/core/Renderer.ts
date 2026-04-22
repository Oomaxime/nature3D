import * as THREE from 'three'

export default class Renderer {
  instance: THREE.WebGLRenderer

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    })
    this.instance.setSize(window.innerWidth, window.innerHeight)
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap
  }

  resize() {
    this.instance.setSize(window.innerWidth, window.innerHeight)
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.instance.render(scene, camera)
  }

  destroy() {
    this.instance.dispose()
  }
}
