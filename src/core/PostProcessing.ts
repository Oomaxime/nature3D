import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import type GUI from 'lil-gui'

// Clamps scene values before bloom so HDR sky (~5–20 linear near sun)
// cannot overflow float16 in the mip-chain and produce black rectangles.
const ClampShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() { vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(min(c.rgb, vec3(100.0)), c.a); }`,
}

export default class PostProcessing {
  composer: EffectComposer
  private bloom: UnrealBloomPass
  private gui?: GUI

  constructor(
    renderer: THREE.WebGLRenderer,
    scene:    THREE.Scene,
    camera:   THREE.PerspectiveCamera,
  ) {
    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(scene, camera))
    this.composer.addPass(new ShaderPass(ClampShader))

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.7,   // strength
      0.6,   // radius
      1.5,   // threshold — above stump emissive map (~1.0-1.4), below fireflies (2.5+)
    )
    this.bloom.enabled = false
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
  }

  update(_camera: THREE.PerspectiveCamera) {}

  render() {
    this.composer.render()
  }

  resize() {
    this.composer.setSize(window.innerWidth, window.innerHeight)
    this.bloom.setSize(window.innerWidth, window.innerHeight)
  }

  setupGui(gui: GUI) {
    this.gui = gui
    const folder = gui.addFolder('Bloom').close()
    folder.add(this.bloom, 'strength',  0, 3,    0.05).name('Strength')
    folder.add(this.bloom, 'radius',    0, 1,    0.05).name('Radius')
    folder.add(this.bloom, 'threshold', 0, 1,    0.01).name('Threshold')
  }

  dispose() {
    this.composer.dispose()
  }
}
