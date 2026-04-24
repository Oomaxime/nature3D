import * as THREE from "three";
import { getTerrainHeight, LAKE_SURFACE_Y } from "./Terrain";

const RIVER_WAYPOINTS: [number, number][] = [];
import { SUN_POSITION } from "./Lighting";

const RIVER_HALF_WIDTH = 2.2;
const SAMPLES = 140;

// ── Shaders ───────────────────────────────────────────────────────────────────

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
  // Stronger downstream drift — river flows faster than a still lake
  vec2 uv1 = xz + vec2(t * 0.10, t * 0.32);
  vec2 uv2 = xz * 2.0 + vec2(-t * 0.07, t * 0.25);
  float eps = 0.05;
  float h  = fbm(uv1) + 0.45 * fbm(uv2);
  float hx = fbm(uv1 + vec2(eps,0.0)) + 0.45 * fbm(uv2 + vec2(eps,0.0));
  float hz = fbm(uv1 + vec2(0.0,eps)) + 0.45 * fbm(uv2 + vec2(0.0,eps));
  return normalize(vec3(-(hx-h)/eps * 0.55, 1.0, -(hz-h)/eps * 0.55));
}

void main() {
  vec3 V = normalize(vViewDir);
  vec3 N = waterNormal(vWorldPos.xz * 1.0, uTime);

  float NdV     = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

  vec3  L    = normalize(uSunDir);
  vec3  H    = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 120.0) * 0.9;

  vec3 skyHorizon = vec3(0.52, 0.24, 0.06);
  vec3 skyZenith  = vec3(0.09, 0.16, 0.32);
  vec3 skyColor   = mix(skyHorizon, skyZenith, pow(NdV, 0.5));

  vec3 riverBase  = vec3(0.06, 0.14, 0.26);
  vec3 waterColor = mix(riverBase, skyColor, 0.12 + fresnel * 0.68);
  waterColor += uSunColor * spec * 0.75;

  float fogDepth  = length(vWorldPos - cameraPosition);
  float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * fogDepth * fogDepth);
  waterColor = mix(waterColor, uFogColor, clamp(fogFactor, 0.0, 1.0));

  // Soft edges — blend into riverbank on both sides
  float edgeAlpha = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x);

  gl_FragColor = vec4(waterColor, (0.88 + fresnel * 0.10) * edgeAlpha);
}
`;

// ── Geometry ──────────────────────────────────────────────────────────────────

function interpolatePath(t: number): { x: number; z: number } {
  const n = RIVER_WAYPOINTS.length - 1;
  const seg = Math.min(Math.floor(t * n), n - 1);
  const st = t * n - seg;
  const [ax, az] = RIVER_WAYPOINTS[seg];
  const [bx, bz] = RIVER_WAYPOINTS[seg + 1];
  return { x: ax + (bx - ax) * st, z: az + (bz - az) * st };
}

function buildGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const c = interpolatePath(t);

    // Tangent via finite difference
    const p0 = interpolatePath(Math.max(0, t - 1 / SAMPLES));
    const p1 = interpolatePath(Math.min(1, t + 1 / SAMPLES));
    const tx = p1.x - p0.x,
      tz = p1.z - p0.z;
    const len = Math.sqrt(tx * tx + tz * tz) || 1;
    // Right-perpendicular in XZ
    const rx = tz / len,
      rz = -tx / len;

    const cy = getTerrainHeight(c.x, c.z) + 0.08;

    pos.push(
      c.x - rx * RIVER_HALF_WIDTH,
      cy,
      c.z - rz * RIVER_HALF_WIDTH,
      c.x + rx * RIVER_HALF_WIDTH,
      cy,
      c.z + rz * RIVER_HALF_WIDTH,
    );
    uvs.push(0, t, 1, t);

    if (i < SAMPLES) {
      const b = i * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ── Class ─────────────────────────────────────────────────────────────────────

export default class River {
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
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
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(buildGeometry(), this.material);
    scene.add(this.mesh);
  }

  update(elapsed: number) {
    this.material.uniforms.uTime.value = elapsed;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
