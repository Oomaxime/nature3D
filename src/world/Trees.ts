import * as THREE from "three";
import type GUI from "lil-gui";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import type { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { LAKE_INNER_RADIUS, LAKE_OUTER_RADIUS, getTerrainHeight } from "./Terrain";

const TREE_COUNT = 300;
// Keep trees well clear of the outer lake shore so nothing spawns in the water
const MIN_LAKE = LAKE_OUTER_RADIUS + 8; // 40 units — 8 m clear shore margin

// LOD distance thresholds (world units from camera)
const DIST_HIGH = 60;  // Full PBR with normals + shadows
const DIST_LOW  = 220; // Simplified PBR, no normals — impostor only on far horizon
// Beyond DIST_LOW → camera-facing billboard imposter

const MAX_HIGH = 80;
const MAX_LOW  = 300;

// Hysteresis fraction: require crossing threshold by this much before switching LOD.
// Prevents flickering at boundaries.
const HYSTERESIS = 0.15;

const IMP_W = 5.5;
const IMP_H = 5.0;

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

// Single camera-facing plane — the vertex shader handles cylindrical billboarding.
function buildBillboardGeo(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(IMP_W, IMP_H);
  g.translate(0, IMP_H / 2, 0); // pivot at bottom so tree sits on ground
  return g;
}

/**
 * Cylindrical billboard material using onBeforeCompile.
 *
 * Replaces instanced_vertex so each instance is positioned at its world origin
 * (from instanceMatrix) then offset along the camera's right vector (X) and
 * world Y (up), making every billboard always face the camera without tilting.
 *
 * Replaces project_vertex because after our instanced_vertex the `transformed`
 * variable is already in world space, so we must skip modelViewMatrix and
 * multiply by viewMatrix directly.
 */
function buildBillboardMaterial(tex: THREE.Texture): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    fog: true,
  });

  mat.onBeforeCompile = (shader) => {
    // Step 1: assemble instanceMatrix and override transformed with world-space
    // billboard position. position.x → camera-right, position.y → world-up.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <instanced_vertex>",
      /* glsl */ `
      #ifdef USE_INSTANCING
        mat4 instanceMatrix = mat4(
          instanceMatrix0, instanceMatrix1, instanceMatrix2, instanceMatrix3
        );

        // World position of this instance's origin
        vec3 iPos = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

        // Uniform scale (set with dummy.scale.setScalar so all axes are equal)
        float sc = length(instanceMatrix[0].xyz);

        // Cylindrical billboard axes:
        //   right  = camera X axis unprojected into world space (from view matrix row 0)
        //   up     = world Y — tree stays upright, never tilts toward camera
        vec3 bbRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        vec3 bbUp    = vec3(0.0, 1.0, 0.0);

        // Override transformed: place vertex in world space
        transformed = iPos
          + bbRight * (transformed.x * sc)
          + bbUp    * (transformed.y * sc);
      #endif
      `,
    );

    // Step 2: transformed is now world-space, skip modelViewMatrix — use viewMatrix only.
    // mvPosition must remain a local variable so the fog chunk can read mvPosition.z.
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

function samplePlacements(sampler: MeshSurfaceSampler, count: number): Placement[] {
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

interface SortEntry { p: Placement; dist: number; idx: number }

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
  // Per-placement LOD state for hysteresis: 0=high, 1=low, 2=impostor
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

    this.lodState = new Uint8Array(TREE_COUNT).fill(2); // start all as imposter

    // ── Impostor billboards — camera-facing, visible immediately on load ──────
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
    // The geometry bounding box is just the plane at origin — disable frustum
    // culling so Three.js never incorrectly hides the whole impostor batch.
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

    // ── Full 3-D meshes — loaded async ───────────────────────────────────────
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
    if (++this.ticks % 2 !== 0) return; // update every other frame

    const camPos = camera.position;
    const dummy = this.dummy;
    const count = Math.min(this.active, this.placements.length);

    // Rebuild sort buffer when active count changes
    if (this.sortBuf.length !== count) {
      this.sortBuf = Array.from({ length: count }, (_, i) => ({
        p: this.placements[i],
        dist: 0,
        idx: i,
      }));
    }

    for (let i = 0; i < count; i++) {
      this.sortBuf[i].p   = this.placements[i];
      this.sortBuf[i].idx = i;
      this.sortBuf[i].dist = camPos.distanceTo(this.placements[i].pos);
    }
    this.sortBuf.sort((a, b) => a.dist - b.dist);

    let hi = 0, lo = 0, imp = 0;

    for (let i = 0; i < count; i++) {
      const { p, dist, idx } = this.sortBuf[i];
      const prev = this.lodState[idx];

      // Hysteresis: widen the "stay" band so trees only switch LOD when they
      // have clearly crossed a threshold, not when hovering right on the edge.
      const hH = this.dHigh * HYSTERESIS;
      const hL = this.dLow  * HYSTERESIS;
      let next: number;

      if (prev === 0) {
        // Currently high: stay until clearly past high threshold
        next = dist > this.dHigh + hH ? 1 : 0;
      } else if (prev === 1) {
        // Currently low: go high if clearly inside high threshold, imposter if clearly past low
        if (dist < this.dHigh - hH) next = 0;
        else if (dist > this.dLow + hL) next = 2;
        else next = 1;
      } else {
        // Currently imposter: enter low if clearly inside low threshold
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
      distLow: this.dLow, // starts at 220
    };
    folder.add(params, "scale", 0.1, 3.0, 0.05).name("Scale")
      .onChange((v: number) => { this.scaleMult = v; });
    folder.add(params, "count", 0, TREE_COUNT, 1).name("Count")
      .onChange((v: number) => { this.active = Math.round(v); });
    folder.add(params, "distHigh", 10, 120, 1).name("Full PBR dist")
      .onChange((v: number) => { this.dHigh = v; });
    folder.add(params, "distLow", 80, 400, 1).name("Low PBR dist")
      .onChange((v: number) => { this.dLow = v; });
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
