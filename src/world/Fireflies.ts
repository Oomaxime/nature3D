import * as THREE from "three";
import type GUI from "lil-gui";
import { LAKE_INNER_RADIUS } from "./Terrain";

const COUNT = 70;

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, "rgba(220,255,140,1)");
  g.addColorStop(0.4, "rgba(140,255,60,0.5)");
  g.addColorStop(1.0, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export default class Fireflies {
  private points: THREE.Points;
  private uTime = { value: 0 };
  private uSize = { value: 3.0 };

  constructor(scene: THREE.Scene) {
    const rng = makeRng(77);

    const positions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT * 3);
    const flicker = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      const angle = rng() * Math.PI * 2;
      const r = LAKE_INNER_RADIUS + 2 + rng() * 60;
      positions[i * 3 + 0] = Math.cos(angle) * r;
      positions[i * 3 + 1] = 1.0 + rng() * 3.0;
      positions[i * 3 + 2] = Math.sin(angle) * r;

      phases[i * 3 + 0] = rng() * Math.PI * 2;
      phases[i * 3 + 1] = rng() * Math.PI * 2;
      phases[i * 3 + 2] = rng() * Math.PI * 2;
      flicker[i] = rng() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 3));
    geo.setAttribute("aFlicker", new THREE.BufferAttribute(flicker, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.uTime,
        uSize: this.uSize,
        uTexture: { value: makeGlowTexture() },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aPhase;
        attribute float aFlicker;
        uniform float uTime;
        uniform float uSize;
        varying float vBright;

        void main() {
          vec3 pos = position;
          pos.x += sin(uTime * 0.65 + aPhase.x) * 1.1;
          pos.y += sin(uTime * 1.05 + aPhase.y) * 0.45;
          pos.z += cos(uTime * 0.55 + aPhase.z) * 1.1;

          vBright = 0.35 + 0.65 * abs(sin(uTime * 2.8 + aFlicker));

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = min(uSize * (300.0 / -mvPos.z) * (0.6 + 0.4 * vBright), 28.0);
          gl_Position  = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTexture;
        varying float vBright;

        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          if (tex.a < 0.01) discard;
          gl_FragColor = vec4(2.5, 3.5, 1.2, tex.a * vBright);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(geo, mat);
    scene.add(this.points);
  }

  setupGui(gui: GUI) {
    const folder = gui.addFolder("Fireflies");
    folder.add(this.uSize, "value", 2, 60, 1).name("Size");
    folder.close();
  }

  update(time: number) {
    this.uTime.value = time;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.ShaderMaterial).dispose();
  }
}
