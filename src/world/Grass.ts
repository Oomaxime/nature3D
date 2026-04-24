import * as THREE from "three";
import type GUI from "lil-gui";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import Terrain, { LAKE_INNER_RADIUS, getTerrainHeight } from "./Terrain";

const COUNT_PER_VARIANT = 125_000;
const BLADE_HEIGHT = 1.2;

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

interface GrassBlade {
  wx: number;
  wy: number;
  wz: number;
  rotY: number;
  s: number;
}

const UV_OFFSETS: [number, number][] = [
  [0.0, 0.5],
  [0.5, 0.5],
  [0.0, 0.0],
  [0.5, 0.0],
];

function buildCrossGeometry(): THREE.BufferGeometry {
  const W = 0.9,
    H = BLADE_HEIGHT;
  const g1 = new THREE.PlaneGeometry(W, H);
  const g2 = new THREE.PlaneGeometry(W, H);
  g2.rotateY(Math.PI / 2);
  g1.translate(0, H / 2, 0);
  g2.translate(0, H / 2, 0);
  return mergeGeometries([g1, g2])!;
}

export default class Grass {
  private meshes: THREE.InstancedMesh[] = [];
  private windUniform = { value: 0 };
  private pdata: GrassBlade[][] = [];
  private scaleMult = 1.0;
  private dummyG = new THREE.Object3D();

  constructor(scene: THREE.Scene, terrain: Terrain) {
    const geo = buildCrossGeometry();
    const sampler = terrain.sampler;

    const loader = new THREE.TextureLoader();
    const baseTex = loader.load("/textures/herbe/color.png");
    baseTex.colorSpace = THREE.SRGBColorSpace;

    const windUniform = this.windUniform;
    const onBeforeCompile = (
      shader: THREE.WebGLProgramParametersWithUniforms,
    ) => {
      shader.uniforms.uTime = windUniform;

      shader.vertexShader =
        /* glsl */ `uniform float uTime;\n` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        float heightFactor = clamp(transformed.y / ${BLADE_HEIGHT.toFixed(1)}, 0.0, 1.0);
        #ifdef USE_INSTANCING
          float phase = instanceMatrix[3][0] * 0.31 + instanceMatrix[3][2] * 0.19;
        #else
          float phase = 0.0;
        #endif
        transformed.x += sin(uTime * 2.1 + phase) * 0.18 * heightFactor;
        transformed.z += cos(uTime * 1.8 + phase) * 0.10 * heightFactor;
        `,
      );
    };

    const dummy = new THREE.Object3D();
    const localPos = new THREE.Vector3();

    const origRand = Math.random;
    Math.random = makeRng(44);

    for (let v = 0; v < UV_OFFSETS.length; v++) {
      const tex = baseTex.clone();
      tex.repeat.set(0.5, 0.5);
      tex.offset.set(UV_OFFSETS[v][0], UV_OFFSETS[v][1]);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;

      const material = new THREE.MeshStandardMaterial({
        map: tex,
        alphaTest: 0.2,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0,
        depthWrite: true,
      });
      material.onBeforeCompile = onBeforeCompile;
      material.customProgramCacheKey = () => "grass-wind";

      const mesh = new THREE.InstancedMesh(geo, material, COUNT_PER_VARIANT);
      mesh.castShadow = false;
      mesh.receiveShadow = true;

      const vdata: GrassBlade[] = [];
      let placed = 0;
      let attempts = 0;

      while (placed < COUNT_PER_VARIANT && attempts < COUNT_PER_VARIANT * 8) {
        attempts++;
        sampler.sample(localPos);

        const wx = localPos.x;
        const wz = -localPos.y;

        const d = Math.sqrt(wx * wx + wz * wz);
        if (d < LAKE_INNER_RADIUS + 5) continue;

        const wy = getTerrainHeight(wx, wz) - 0.1;
        vdata.push({
          wx,
          wy,
          wz,
          rotY: Math.random() * Math.PI * 2,
          s: 0.7 + Math.random() * 1.0,
        });
        placed++;
      }

      this.pdata.push(vdata);
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      this.meshes.push(mesh);
    }

    Math.random = origRand;
    this.rebuildMatrices();
  }

  private rebuildMatrices() {
    const d = this.dummyG;
    for (let v = 0; v < this.meshes.length; v++) {
      const mesh = this.meshes[v];
      const data = this.pdata[v];
      for (let i = 0; i < data.length; i++) {
        const p = data[i];
        d.position.set(p.wx, p.wy, p.wz);
        d.rotation.y = p.rotY;
        const s = p.s * this.scaleMult;
        d.scale.set(s, s, s);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  setupGui(gui: GUI) {
    const folder = gui.addFolder("Grass");
    const total = COUNT_PER_VARIANT * UV_OFFSETS.length;
    const defaultCount = 10_000;
    this.meshes.forEach((m) => {
      m.count = Math.round(defaultCount / this.meshes.length);
    });
    const params = { count: defaultCount, scale: this.scaleMult };
    folder
      .add(params, "scale", 0.1, 4.0, 0.05)
      .name("Scale")
      .onChange((v: number) => {
        this.scaleMult = v;
        this.rebuildMatrices();
      });
    folder
      .add(params, "count", 0, total, 1)
      .name("Count")
      .onChange((v: number) => {
        const perVariant = Math.round(v / this.meshes.length);
        this.meshes.forEach((m) => {
          m.count = Math.min(perVariant, COUNT_PER_VARIANT);
        });
      });
  }

  update(time: number) {
    this.windUniform.value = time;
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.MeshStandardMaterial).dispose();
    }
  }
}
