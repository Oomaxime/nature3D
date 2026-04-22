import * as THREE from 'three'

// Sun direction shared with Sky shader
export const SUN_POSITION = new THREE.Vector3()

// Sunset: sun just above the western horizon
const ELEVATION_DEG = 4
const AZIMUTH_DEG   = 200

const phi   = THREE.MathUtils.degToRad(90 - ELEVATION_DEG)
const theta = THREE.MathUtils.degToRad(AZIMUTH_DEG)
SUN_POSITION.setFromSphericalCoords(1, phi, theta)

export default class Lighting {
  hemisphere: THREE.HemisphereLight
  sun: THREE.DirectionalLight

  constructor(scene: THREE.Scene) {
    // Soft ambient fill – warm sky above, dark earth below
    this.hemisphere = new THREE.HemisphereLight(0xffc878, 0x3d1e08, 0.9)
    scene.add(this.hemisphere)

    // Single directional "sun" – warm orange, casts shadows
    this.sun = new THREE.DirectionalLight(0xff8c42, 2.0)
    this.sun.position.copy(SUN_POSITION).multiplyScalar(100)
    this.sun.castShadow = true

    // Shadow map – 1024 is a good balance of quality / perf
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.camera.near   = 0.5
    this.sun.shadow.camera.far    = 250
    this.sun.shadow.camera.left   = -80
    this.sun.shadow.camera.right  =  80
    this.sun.shadow.camera.top    =  80
    this.sun.shadow.camera.bottom = -80
    this.sun.shadow.bias          = -0.001

    scene.add(this.sun)
    scene.add(this.sun.target)

    // Warm exponential fog that thickens towards the horizon
    scene.fog = new THREE.FogExp2(0xd4703a, 0.007)
  }

  dispose() {
    this.hemisphere.dispose()
    this.sun.dispose()
  }
}
