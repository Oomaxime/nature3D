import * as THREE from 'three'
import Camera from './Camera'
import Renderer from './Renderer'
import Debug from '../debug/Debug'
import Terrain from '../world/Terrain'
import Lighting from '../world/Lighting'
import SkyEnvironment from '../world/SkyEnvironment'

export default class Experience {
  canvas: HTMLCanvasElement
  scene: THREE.Scene
  camera: Camera
  renderer: Renderer
  debug: Debug

  private terrain: Terrain
  private lighting: Lighting
  private sky: SkyEnvironment

  constructor(canvas: HTMLCanvasElement) {
    this.canvas   = canvas
    this.scene    = new THREE.Scene()
    this.debug    = new Debug()
    this.camera   = new Camera(this.canvas)
    this.renderer = new Renderer(this.canvas)

    this.lighting = new Lighting(this.scene)
    this.sky      = new SkyEnvironment(this.scene, this.renderer.instance)
    this.terrain  = new Terrain(this.scene)

    window.addEventListener('resize', () => this.onResize())
    this.tick()
  }

  private onResize() {
    this.camera.resize()
    this.renderer.resize()
  }

  private tick() {
    this.debug.begin()
    this.camera.update()
    this.renderer.render(this.scene, this.camera.instance)
    this.debug.end()
    requestAnimationFrame(() => this.tick())
  }

  destroy() {
    window.removeEventListener('resize', () => this.onResize())
    this.terrain.dispose()
    this.lighting.dispose()
    this.sky.dispose()
    this.debug.destroy()
    this.camera.destroy()
    this.renderer.destroy()
  }
}
