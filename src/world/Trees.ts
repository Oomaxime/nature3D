import * as THREE from "three";
import type GUI from "lil-gui";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import type { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { LAKE_OUTER_RADIUS, getTerrainHeight } from "./Terrain";

const TREE_COUNT = 300;
const MIN_LAKE = LAKE_OUTER_RADIUS + 8;

const DIST_HIGH = 60;
const DIST_LOW = 290;

const MAX_HIGH = 80;
const MAX_LOW = 300;

const HYSTERESIS = 0.15;

const IMP_W = 5.5;
const IMP_H = 5.0;

import { makeRng } from "../utils/rng";

function buildBillboardGeo(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(IMP_W, IMP_H);
  g.translate(0, IMP_H / 2, 0);
  return g;
}

function buildBillboardMaterial(tex: THREE.Texture): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    fog: true,
  });

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <instanced_vertex>",
      /* glsl */ `
      #ifdef USE_INSTANCING
        mat4 instanceMatrix = mat4(
          instanceMatrix0, instanceMatrix1, instanceMatrix2, instanceMatrix3
        );

        vec3 iPos = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

        float sc = length(instanceMatrix[0].xyz);

        vec3 bbRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        vec3 bbUp    = vec3(0.0, 1.0, 0.0);

        transformed = iPos
          + bbRight * (transformed.x * sc)
          + bbUp    * (transformed.y * sc);
      #endif
      `,
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      /* glsl */ `
        vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      `,
    );
  };

  return mat;
}

interface Placement {
  pos: THREE.Vector3;
  rotY: number;
  scale: number;
}

function samplePlacements(
  sampler: MeshSurfaceSampler,
  count: number,
): Placement[] {
  const out: Placement[] = [];
  const tmp = new THREE.Vector3();
  let tries = 0;
  while (out.length < count && tries < count * 30) {
    tries++;
    sampler.sample(tmp);
    const wx = tmp.x,
      wz = -tmp.y;
    if (Math.sqrt(wx * wx + wz * wz) < MIN_LAKE) continue;
    out.push({
      pos: new THREE.Vector3(wx, getTerrainHeight(wx, wz), wz),
      rotY: Math.random() * Math.PI * 2,
      scale: 0.7 + Math.random() * 0.7,
    });
  }
  return out;
}

interface SortEntry {
  p: Placement;
  dist: number;
  idx: number;
}

export default class Trees {
  private placements: Placement[] = [];
  private imHigh?: THREE.InstancedMesh;
  private imLow?: THREE.InstancedMesh;
  private imImpostor?: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private ticks = 0;
  private active = TREE_COUNT;
  private dHigh = DIST_HIGH;
  private dLow = DIST_LOW;
  private scaleMult = 2.25;
  private sortBuf: SortEntry[] = [];
  private lodState: Uint8Array;

  constructor(
    scene: THREE.Scene,
    sampler: MeshSurfaceSampler,
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
  ) {
    const origRand = Math.random;
    Math.random = makeRng(42);
    this.placements = samplePlacements(sampler, TREE_COUNT);
    Math.random = origRand;

    this.lodState = new Uint8Array(TREE_COUNT).fill(2);

    const tex = new THREE.TextureLoader();
    const impostorTex = tex.load("/textures/arbre/impostor.png");
    impostorTex.colorSpace = THREE.SRGBColorSpace;

    this.imImpostor = new THREE.InstancedMesh(
      buildBillboardGeo(),
      buildBillboardMaterial(impostorTex),
      TREE_COUNT,
    );
    this.imImpostor.castShadow = false;
    this.imImpostor.receiveShadow = false;
    this.imImpostor.frustumCulled = false;

    const dummy = this.dummy;
    for (let i = 0; i < this.placements.length; i++) {
      const p = this.placements[i];
      dummy.position.copy(p.pos);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.setScalar(p.scale * this.scaleMult);
      dummy.updateMatrix();
      this.imImpostor.setMatrixAt(i, dummy.matrix);
    }
    this.imImpostor.count = this.placements.length;
    this.imImpostor.instanceMatrix.needsUpdate = true;
    scene.add(this.imImpostor);

    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    loader.load("/models/tree.glb", (gltf) => {
      let srcMesh: THREE.Mesh | undefined;
      gltf.scene.traverse((c) => {
        if (!srcMesh && c instanceof THREE.Mesh) srcMesh = c;
      });
      if (!srcMesh) return;

      gltf.scene.updateWorldMatrix(true, true);
      const geo = srcMesh.geometry.clone();
      geo.applyMatrix4(srcMesh.matrixWorld);

      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      const bbox = new THREE.Box3().setFromBufferAttribute(posAttr);
      geo.translate(
        -(bbox.min.x + bbox.max.x) / 2,
        -bbox.min.y,
        -(bbox.min.z + bbox.max.z) / 2,
      );

      const colorTex = tex.load("/textures/arbre/color_alt.png");
      colorTex.colorSpace = THREE.SRGBColorSpace;
      colorTex.flipY = false;
      colorTex.minFilter = THREE.LinearMipMapLinearFilter;

      const normalHigh = tex.load("/textures/arbre/normal-512.jpg");
      normalHigh.flipY = false;
      normalHigh.minFilter = THREE.LinearMipMapLinearFilter;

      const matHigh = new THREE.MeshStandardMaterial({
        map: colorTex,
        normalMap: normalHigh,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        metalness: 0,
        roughness: 0.85,
      });

      const matLow = new THREE.MeshStandardMaterial({
        map: colorTex,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        metalness: 0,
        roughness: 0.85,
      });

      this.imHigh = new THREE.InstancedMesh(geo, matHigh, MAX_HIGH);
      this.imHigh.castShadow = true;
      this.imHigh.receiveShadow = false;
      this.imHigh.count = 0;

      this.imLow = new THREE.InstancedMesh(geo, matLow, MAX_LOW);
      this.imLow.castShadow = false;
      this.imLow.receiveShadow = false;
      this.imLow.count = 0;

      scene.add(this.imHigh);
      scene.add(this.imLow);

      renderer.compile(scene, camera);
      draco.dispose();
    });
  }

  update(camera: THREE.Camera) {
    if (!this.imHigh || !this.imLow || !this.imImpostor) return;
    if (++this.ticks % 2 !== 0) return;

    const camPos = camera.position;
    const dummy = this.dummy;
    const count = Math.min(this.active, this.placements.length);

    if (this.sortBuf.length !== count) {
      this.sortBuf = Array.from({ length: count }, (_, i) => ({
        p: this.placements[i],
        dist: 0,
        idx: i,
      }));
    }

    for (let i = 0; i < count; i++) {
      this.sortBuf[i].p = this.placements[i];
      this.sortBuf[i].idx = i;
      this.sortBuf[i].dist = camPos.distanceTo(this.placements[i].pos);
    }
    this.sortBuf.sort((a, b) => a.dist - b.dist);

    let hi = 0,
      lo = 0,
      imp = 0;

    for (let i = 0; i < count; i++) {
      const { p, dist, idx } = this.sortBuf[i];
      const prev = this.lodState[idx];

      const hH = this.dHigh * HYSTERESIS;
      const hL = this.dLow * HYSTERESIS;
      let next: number;

      if (prev === 0) {
        next = dist > this.dHigh + hH ? 1 : 0;
      } else if (prev === 1) {
        if (dist < this.dHigh - hH) next = 0;
        else if (dist > this.dLow + hL) next = 2;
        else next = 1;
      } else {
        next = dist < this.dLow - hL ? (dist < this.dHigh - hH ? 0 : 1) : 2;
      }

      this.lodState[idx] = next;

      dummy.position.copy(p.pos);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.setScalar(p.scale * this.scaleMult);
      dummy.updateMatrix();

      if (next === 0 && hi < MAX_HIGH) {
        this.imHigh.setMatrixAt(hi++, dummy.matrix);
      } else if (next <= 1 && lo < MAX_LOW) {
        this.imLow.setMatrixAt(lo++, dummy.matrix);
      } else {
        this.imImpostor.setMatrixAt(imp++, dummy.matrix);
      }
    }

    this.imHigh.count = hi;
    this.imHigh.instanceMatrix.needsUpdate = true;
    this.imLow.count = lo;
    this.imLow.instanceMatrix.needsUpdate = true;
    this.imImpostor.count = imp;
    this.imImpostor.instanceMatrix.needsUpdate = true;
  }

  setupGui(gui: GUI) {
    const folder = gui.addFolder("Trees");
    const params = {
      count: TREE_COUNT,
      scale: 2.25,
      distHigh: this.dHigh,
      distLow: this.dLow,
    };
    folder
      .add(params, "scale", 0.1, 3.0, 0.05)
      .name("Scale")
      .onChange((v: number) => {
        this.scaleMult = v;
      });
    folder
      .add(params, "count", 0, TREE_COUNT, 1)
      .name("Count")
      .onChange((v: number) => {
        this.active = Math.round(v);
      });
    folder
      .add(params, "distHigh", 10, 120, 1)
      .name("Full PBR dist")
      .onChange((v: number) => {
        this.dHigh = v;
      });
    folder
      .add(params, "distLow", 80, 400, 1)
      .name("Low PBR dist")
      .onChange((v: number) => {
        this.dLow = v;
      });
    folder.close();
  }

  dispose() {
    for (const im of [this.imHigh, this.imLow, this.imImpostor]) {
      if (!im) continue;
      im.geometry.dispose();
      (im.material as THREE.Material).dispose();
    }
  }
}
