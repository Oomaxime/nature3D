import * as THREE from "three";
import type GUI from "lil-gui";

export const SUN_POSITION = new THREE.Vector3();

const ELEVATION_DEG = 4;
const AZIMUTH_DEG = 200;

const phi = THREE.MathUtils.degToRad(90 - ELEVATION_DEG);
const theta = THREE.MathUtils.degToRad(AZIMUTH_DEG);
SUN_POSITION.setFromSphericalCoords(1, phi, theta);

export default class Lighting {
  hemisphere: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  fog: THREE.FogExp2;

  constructor(scene: THREE.Scene) {
    this.hemisphere = new THREE.HemisphereLight(0xffc878, 0x3d1e08, 0.9);
    scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(0xff8c42, 2.0);
    this.sun.position.copy(SUN_POSITION).multiplyScalar(100);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 250;
    this.sun.shadow.camera.left = -80;
    this.sun.shadow.camera.right = 80;
    this.sun.shadow.camera.top = 80;
    this.sun.shadow.camera.bottom = -80;
    this.sun.shadow.bias = -0.001;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.fog = new THREE.FogExp2(0xd4703a, 0.007);
    scene.fog = this.fog;
  }

  setupGui(gui: GUI) {
    const folder = gui.addFolder("Lights");

    const sunFolder = folder.addFolder("Sun");
    const sunParams = { color: "#" + this.sun.color.getHexString() };
    sunFolder
      .addColor(sunParams, "color")
      .name("Color")
      .onChange((v: string) => this.sun.color.set(v));
    sunFolder.add(this.sun, "intensity", 0, 6, 0.05).name("Intensity");

    const hemiFolder = folder.addFolder("Hemisphere");
    const hemiParams = {
      skyColor: "#" + this.hemisphere.color.getHexString(),
      groundColor: "#" + this.hemisphere.groundColor.getHexString(),
    };
    hemiFolder
      .addColor(hemiParams, "skyColor")
      .name("Sky color")
      .onChange((v: string) => this.hemisphere.color.set(v));
    hemiFolder
      .addColor(hemiParams, "groundColor")
      .name("Ground color")
      .onChange((v: string) => this.hemisphere.groundColor.set(v));
    hemiFolder.add(this.hemisphere, "intensity", 0, 3, 0.05).name("Intensity");

    const fogFolder = folder.addFolder("Fog");
    const fogParams = { color: "#" + this.fog.color.getHexString() };
    fogFolder
      .addColor(fogParams, "color")
      .name("Color")
      .onChange((v: string) => this.fog.color.set(v));
    fogFolder.add(this.fog, "density", 0, 0.05, 0.0005).name("Density");
  }

  dispose() {
    this.hemisphere.dispose();
    this.sun.dispose();
  }
}
