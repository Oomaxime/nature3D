import * as THREE from 'three'
import Camera from './Camera'
import Renderer from './Renderer'
import Debug from '../debug/Debug'

export default class Experience {
  canvas: HTMLCanvasElement
  scene: THREE.Scene
  camera: Camera
  renderer: Renderer
  debug: Debug

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.debug = new Debug()
    this.camera = new Camera(this.canvas)
    this.renderer = new Renderer(this.canvas)

    this.logPolygonCount()

    window.addEventListener('resize', () => this.onResize())
    this.tick()
  }

  private logPolygonCount() {
    // Logs total triangle/polygon count of the scene after each frame
    const info = this.renderer.instance.info
    console.log(
      `[Polygons] triangles: ${info.render.triangles} | calls: ${info.render.calls} | geometries: ${info.memory.geometries}`
    )
  }

  private onResize() {
    this.camera.resize()
    this.renderer.resize()
  }

  private tick() {
    this.debug.begin()

    this.camera.update()
    this.renderer.render(this.scene, this.camera.instance)

    // Log polygon count every frame (visible in devtools console)
    const info = this.renderer.instance.info
    console.debug(
      `[Polygons] triangles: ${info.render.triangles} | geometries: ${info.memory.geometries} | textures: ${info.memory.textures}`
    )

    this.debug.end()
    requestAnimationFrame(() => this.tick())
  }

  destroy() {
    window.removeEventListener('resize', () => this.onResize())
    this.debug.destroy()
    this.camera.destroy()
    this.renderer.destroy()
  }
}
