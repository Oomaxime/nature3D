import * as THREE from "three";
import type GUI from "lil-gui";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LAKE_INNER_RADIUS, LAKE_SURFACE_Y, getTerrainHeight } from "./Terrain";
import { SUN_POSITION } from "./Lighting";

const WATER_RADIUS = 27;

const ROCK_SPOTS = [
  { angle: 0.5, r: LAKE_INNER_RADIUS - 1.5, rotY: 0.8, s: 1.0 },
  { angle: 2.4, r: LAKE_INNER_RADIUS - 1.0, rotY: 2.6, s: 0.85 },
  { angle: 4.3, r: LAKE_INNER_RADIUS - 2.0, rotY: 4.9, s: 1.15 },
];

const VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  vec4 wp   = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vViewDir  = normalize(cameraPosition - wp.xyz);
  vUv       = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform float uFogDensity;
uniform vec3  uFogColor;

varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 43.21);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),             hash(i + vec2(1,0)), f.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p  = rot * p * 2.1;
    a *= 0.5;
  }
  return v;
}

vec3 waterNormal(vec2 xz, float t) {
  vec2 uv1 = xz       + vec2( t * 0.055,  t * 0.038);
  vec2 uv2 = xz * 1.6 + vec2(-t * 0.042,  t * 0.071);
  float eps = 0.05;
  float h  = fbm(uv1) + 0.45 * fbm(uv2);
  float hx = fbm(uv1 + vec2(eps,0.0)) + 0.45 * fbm(uv2 + vec2(eps,0.0));
  float hz = fbm(uv1 + vec2(0.0,eps)) + 0.45 * fbm(uv2 + vec2(0.0,eps));
  return normalize(vec3(-(hx-h)/eps * 0.42, 1.0, -(hz-h)/eps * 0.42));
}

void main() {
  vec3 V = normalize(vViewDir);
  vec3 N = waterNormal(vWorldPos.xz * 0.50, uTime);

  float NdV     = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

  vec3  L    = normalize(uSunDir);
  vec3  H    = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 200.0) * 1.1;

  vec2 toCamera    = normalize(vec2(40.0, 70.0));
  float worldDist  = length(vWorldPos.xz);
  vec2 lakeDir     = worldDist > 0.1 ? normalize(vWorldPos.xz) : vec2(0.0);
  float facingCam  = dot(lakeDir, toCamera);
  float mtn        = smoothstep(0.35, -0.15, facingCam);

  float r = length(vUv - 0.5) * 2.0;

  float jitter    = fbm(vWorldPos.xz * 0.22) * 0.05;
  float rNoisy    = r - jitter;

  float shallow   = smoothstep(0.72, 0.96, rNoisy) * (1.0 - mtn * 0.92);

  vec3 deepCol    = vec3(0.04, 0.10, 0.22);
  vec3 shoreCol   = vec3(0.14, 0.22, 0.24);
  vec3 skyH       = vec3(0.52, 0.24, 0.06);
  vec3 skyZ       = vec3(0.09, 0.16, 0.32);
  vec3 skyRefl    = mix(skyH, skyZ, pow(NdV, 0.5));
  vec3 body       = mix(deepCol, shoreCol, shallow * 0.6);
  vec3 color      = mix(body, skyRefl, 0.10 + fresnel * 0.68);
  color          += uSunColor * spec * 0.8;

  float fogD = length(vWorldPos - cameraPosition);
  color = mix(color, uFogColor, clamp(1.0 - exp(-uFogDensity*uFogDensity*fogD*fogD), 0.0, 1.0));

  float openFade  = 1.0 - smoothstep(0.76, 1.00, rNoisy);
  float mtnFade   = 1.0 - smoothstep(0.90, 1.00, r);
  float edgeFade  = mix(openFade, mtnFade, mtn);

  float alpha = mix(0.93, 0.52, shallow) * edgeFade;

  gl_FragColor = vec4(color, alpha);
}
`;

export default class Lake {
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private rocks?: THREE.InstancedMesh;

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
  ) {
    const geo = new THREE.CircleGeometry(WATER_RADIUS, 96);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: SUN_POSITION.clone().normalize() },
        uSunColor: { value: new THREE.Color(0xff8c42) },
        uFogDensity: { value: 0.007 },
        uFogColor: { value: new THREE.Color(0xd4703a) },
      },
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = LAKE_SURFACE_Y;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);

    const loader = new GLTFLoader();
    loader.load(
      "/models/RockBeachLarge010/RockBeachLarge010_Blender_Cycles.glb",
      (gltf) => {
        let srcMesh: THREE.Mesh | undefined;
        gltf.scene.traverse((c) => {
          if (!srcMesh && c instanceof THREE.Mesh) srcMesh = c;
        });
        if (!srcMesh) return;

        gltf.scene.updateWorldMatrix(true, true);
        const rockGeo = srcMesh.geometry.clone();
        rockGeo.applyMatrix4(srcMesh.matrixWorld);

        const bbox = new THREE.Box3().setFromBufferAttribute(
          rockGeo.attributes.position as THREE.BufferAttribute,
        );
        rockGeo.translate(
          -(bbox.min.x + bbox.max.x) / 2,
          -bbox.min.y,
          -(bbox.min.z + bbox.max.z) / 2,
        );

        const mat = Array.isArray(srcMesh.material)
          ? srcMesh.material[0]
          : srcMesh.material;

        this.rocks = new THREE.InstancedMesh(rockGeo, mat, ROCK_SPOTS.length);
        this.rocks.castShadow = false;
        this.rocks.receiveShadow = false;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < ROCK_SPOTS.length; i++) {
          const sp = ROCK_SPOTS[i];
          const wx = Math.cos(sp.angle) * sp.r;
          const wz = Math.sin(sp.angle) * sp.r;
          const wy = getTerrainHeight(wx, wz) - 0.3;
          dummy.position.set(wx, wy, wz);
          dummy.rotation.set(0, sp.rotY, 0);
          dummy.scale.setScalar(sp.s);
          dummy.updateMatrix();
          this.rocks.setMatrixAt(i, dummy.matrix);
        }
        this.rocks.instanceMatrix.needsUpdate = true;
        scene.add(this.rocks);
        renderer.compile(scene, camera);
      },
    );
  }

  update(elapsed: number) {
    this.material.uniforms.uTime.value = elapsed;
  }

  setupGui(gui: GUI) {
    gui.addFolder("Water").close();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    if (this.rocks) {
      this.rocks.geometry.dispose();
      (this.rocks.material as THREE.Material).dispose();
    }
  }
}
