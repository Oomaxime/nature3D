import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export default class Camera {
  instance: THREE.PerspectiveCamera;
  controls: OrbitControls;

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.5,
      2000,
    );
    this.instance.position.set(-51.3, 15.9, 3.3);

    this.controls = new OrbitControls(this.instance, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.04;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.7;
    this.controls.target.set(0, 2, 0);
    this.controls.minPolarAngle = Math.PI / 10;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 140;
  }

  resize() {
    this.instance.aspect = window.innerWidth / window.innerHeight;
    this.instance.updateProjectionMatrix();
  }

  update() {
    this.controls.update();
  }

  destroy() {
    this.controls.dispose();
  }
}
