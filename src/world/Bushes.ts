import * as THREE from "three";
import type GUI from "lil-gui";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import Terrain, { LAKE_INNER_RADIUS, getTerrainHeight } from "./Terrain";
import { makeRng } from "../utils/rng";

const BUSH_COUNT = 400;

interface BushPlacement {
  wx: number;
  wy: number;
  wz: number;
  rotY: number;
  sx: number;
  sy: number;
}
const BUSH_W = 2.6;
const BUSH_H = 2.0;
const PLANES = 3;

function buildBushGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < PLANES; i++) {
    const g = new THREE.PlaneGeometry(BUSH_W, BUSH_H);
    g.translate(0, BUSH_H / 2, 0);
    g.rotateY((i / PLANES) * Math.PI);
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

export default class Bushes {
  private mesh: THREE.InstancedMesh;
  private windUniform = { value: 0 };
  private placements: BushPlacement[] = [];
  private scaleMult = 1.0;
  private dummy2 = new THREE.Object3D();

  constructor(scene: THREE.Scene, terrain: Terrain) {
    const geo = buildBushGeometry();

    const loader = new THREE.TextureLoader();
    const colorMap = loader.load("/textures/buisson/BaseColor.png");
    const normMap = loader.load("/textures/buisson/Normal.png");
    const ormMap = loader.load(
      "/textures/buisson/OcclusionRoughnessMetallic.png",
    );
    colorMap.colorSpace = THREE.SRGBColorSpace;

    const windUniform = this.windUniform;

    const material = new THREE.MeshStandardMaterial({
      map: colorMap,
      normalMap: normMap,
      roughnessMap: ormMap,
      metalnessMap: ormMap,
      metalness: 1,
      alphaTest: 0.25,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniform;
      shader.vertexShader =
        /* glsl */ `uniform float uTime;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        float hf = clamp(transformed.y / ${BUSH_H.toFixed(1)}, 0.0, 1.0);
        #ifdef USE_INSTANCING
          float phase = instanceMatrix[3][0] * 0.27 + instanceMatrix[3][2] * 0.17;
        #else
          float phase = 0.0;
        #endif
        transformed.x += sin(uTime * 1.2 + phase) * 0.06 * hf;
        transformed.z += cos(uTime * 0.9 + phase) * 0.04 * hf;
        `,
      );
    };
    material.customProgramCacheKey = () => "bush-wind";

    this.mesh = new THREE.InstancedMesh(geo, material, BUSH_COUNT);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    const sampler = terrain.sampler;
    const localPos = new THREE.Vector3();

    const origRand = Math.random;
    Math.random = makeRng(43);

    let placed = 0,
      attempts = 0;

    while (placed < BUSH_COUNT && attempts < BUSH_COUNT * 10) {
      attempts++;
      sampler.sample(localPos);

      const wx = localPos.x;
      const wz = -localPos.y;

      const d = Math.sqrt(wx * wx + wz * wz);
      if (d < LAKE_INNER_RADIUS + 4) continue;

      const wy = getTerrainHeight(wx, wz) - 0.15;
      const rotY = Math.random() * Math.PI * 2;
      const sx = 0.7 + Math.random() * 1.1;
      const sy = sx * (0.85 + Math.random() * 0.3);

      this.placements.push({ wx, wy, wz, rotY, sx, sy });
      placed++;
    }

    Math.random = origRand;
    this.rebuildMatrices();

    this.mesh.count = 200;
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  private rebuildMatrices() {
    const d = this.dummy2;
    for (let i = 0; i < this.placements.length; i++) {
      const p = this.placements[i];
      d.position.set(p.wx, p.wy, p.wz);
      d.rotation.set(0, p.rotY, 0);
      d.scale.set(
        p.sx * this.scaleMult,
        p.sy * this.scaleMult,
        p.sx * this.scaleMult,
      );
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setupGui(gui: GUI) {
    const folder = gui.addFolder("Bushes");
    const params = { count: 200, scale: 1.0 };
    folder
      .add(params, "scale", 0.1, 4.0, 0.05)
      .name("Scale")
      .onChange((v: number) => {
        this.scaleMult = v;
        this.rebuildMatrices();
      });
    folder
      .add(params, "count", 0, BUSH_COUNT, 1)
      .name("Count")
      .onChange((v: number) => {
        this.mesh.count = Math.round(v);
      });
  }

  update(time: number) {
    this.windUniform.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.MeshStandardMaterial).dispose();
  }
}
