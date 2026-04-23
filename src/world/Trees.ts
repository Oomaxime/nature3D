import * as THREE from "three";
import type GUI from "lil-gui";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { LAKE_INNER_RADIUS, getTerrainHeight } from "./Terrain";

const TREE_COUNT = 300;
const MIN_LAKE = LAKE_INNER_RADIUS + 12;

function makeRng(seed: number) {
  let s = seed >>> 0
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
}

const DIST_HIGH = 60;
const DIST_LOW  = 97;

const MAX_HIGH = 80;
const MAX_LOW  = 250;

const IMP_W = 5.5;
const IMP_H = 5.0;

function buildImpostorGeo(): THREE.BufferGeometry {
  const planes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(IMP_W, IMP_H);
    g.translate(0, IMP_H / 2, 0);
    g.rotateY((i / 3) * Math.PI);
    planes.push(g);
  }
  return mergeGeometries(planes)!;
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
    const wx = tmp.x, wz = -tmp.y;
    if (Math.sqrt(wx * wx + wz * wz) < MIN_LAKE) continue;
    out.push({
      pos: new THREE.Vector3(wx, getTerrainHeight(wx, wz), wz),
      rotY: Math.random() * Math.PI * 2,
      scale: 0.7 + Math.random() * 0.7,
    });
  }
  return out;
}

export default class Trees {
  private placements: Placement[] = [];
  private imHigh?: THREE.InstancedMesh;
  private imLow?: THREE.InstancedMesh;
  private imImpostor?: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private ticks = 0;
  private active = 200;
  private dHigh = DIST_HIGH;
  private dLow = DIST_LOW;
  private scaleMult = 2.25;
  private sortBuf: { p: Placement; dist: number }[] = [];

  constructor(
    scene: THREE.Scene,
    sampler: MeshSurfaceSampler,
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
  ) {
    const origRand = Math.random
    Math.random = makeRng(42)
    this.placements = samplePlacements(sampler, TREE_COUNT);
    Math.random = origRand

    // ── Impostor billboard — visible immediately ──────────────────────────
    const tex = new THREE.TextureLoader();
    const impostorTex = tex.load("/textures/arbre/impostor.png");
    impostorTex.colorSpace = THREE.SRGBColorSpace;

    this.imImpostor = new THREE.InstancedMesh(
      buildImpostorGeo(),
      new THREE.MeshLambertMaterial({
        map: impostorTex,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
      }),
      TREE_COUNT,
    );
    this.imImpostor.castShadow = false;
    this.imImpostor.receiveShadow = false;

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

    // ── Full 3D meshes — loaded async ─────────────────────────────────────
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
    if (++this.ticks % 6 !== 0) return;

    const camPos = camera.position;
    const dummy = this.dummy;
    const count = Math.min(this.active, this.placements.length);

    if (this.sortBuf.length !== count) {
      this.sortBuf = Array.from({ length: count }, (_, i) => ({
        p: this.placements[i],
        dist: 0,
      }));
    }
    for (let i = 0; i < count; i++) {
      this.sortBuf[i].p = this.placements[i];
      this.sortBuf[i].dist = camPos.distanceTo(this.placements[i].pos);
    }
    this.sortBuf.sort((a, b) => a.dist - b.dist);

    let hi = 0, lo = 0, imp = 0;
    for (const { p, dist } of this.sortBuf) {
      dummy.position.copy(p.pos);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.setScalar(p.scale * this.scaleMult);
      dummy.updateMatrix();

      if (dist <= this.dHigh && hi < MAX_HIGH) {
        this.imHigh.setMatrixAt(hi++, dummy.matrix);
      } else if (dist <= this.dLow && lo < MAX_LOW) {
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
    const params = { count: 200, scale: 2.25, distHigh: this.dHigh, distLow: this.dLow };
    folder.add(params, "scale", 0.1, 3.0, 0.05).name("Scale")
      .onChange((v: number) => { this.scaleMult = v });
    folder.add(params, "count", 0, TREE_COUNT, 1).name("Count")
      .onChange((v: number) => { this.active = Math.round(v) });
    folder.add(params, "distHigh", 10, 80, 1).name("Full PBR dist")
      .onChange((v: number) => { this.dHigh = v });
    folder.add(params, "distLow", 40, 200, 1).name("Low PBR dist")
      .onChange((v: number) => { this.dLow = v });
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
