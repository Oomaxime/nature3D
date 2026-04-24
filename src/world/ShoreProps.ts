import * as THREE from "three";
import type GUI from "lil-gui";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { getTerrainHeight } from "./Terrain";

interface Instance {
  x: number;
  z: number;
  rotY: number;
  scale: number;
}

interface PropGroup {
  name: string;
  path: string;
  instances: Instance[];
  zoneThreshold: number;
  mesh?: THREE.InstancedMesh;
}

const GROUPS: PropGroup[] = [
  {
    name: "Rocks",
    path: "/models/RockBoulderLarge054/RockBoulderLarge054_Blender_Cycles.glb",
    zoneThreshold: 3,
    instances: [
      { x: -18.6, z: -17.2, rotY: 4.6, scale: 2.5 },
      { x: -17.2, z: -18.6, rotY: 0.0, scale: 2.5 },
      { x: -1.8, z: -25.6, rotY: 1.9, scale: 1.0 },
      { x: -12.6, z: 21.0, rotY: 4.85, scale: 1.5 },
      { x: -24.0, z: 8.0, rotY: 4.5, scale: 3.0 },
    ],
  },
];

export default class ShoreProps {
  private groups: PropGroup[] = GROUPS;
  private allMeshes: THREE.InstancedMesh[] = [];

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
  ) {
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    let loaded = 0;
    for (const group of this.groups) {
      loader.load(group.path, (gltf) => {
        let src: THREE.Mesh | undefined;
        gltf.scene.traverse((c) => {
          if (!src && c instanceof THREE.Mesh) src = c;
        });
        if (!src) return;

        gltf.scene.updateWorldMatrix(true, true);
        const geo = src.geometry.clone();
        geo.applyMatrix4(src.matrixWorld);

        const bbox = new THREE.Box3().setFromBufferAttribute(
          geo.attributes.position as THREE.BufferAttribute,
        );
        geo.translate(
          -(bbox.min.x + bbox.max.x) / 2,
          -bbox.min.y,
          -(bbox.min.z + bbox.max.z) / 2,
        );

        const mat = Array.isArray(src.material)
          ? src.material[0]
          : src.material;
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.metalness = 0;
          mat.roughness = Math.max(mat.roughness, 0.85);
          mat.envMapIntensity = 0;
          mat.emissive.set(0x000000);
          mat.emissiveIntensity = 0;
          mat.needsUpdate = true;
        }
        const mesh = new THREE.InstancedMesh(geo, mat, group.instances.length);
        mesh.castShadow = false;
        mesh.receiveShadow = false;

        group.mesh = mesh;
        this.allMeshes.push(mesh);
        this.applyInstances(group);
        scene.add(mesh);
        renderer.compile(scene, camera);
        if (++loaded === this.groups.length) draco.dispose();
      });
    }
  }

  private applyInstances(group: PropGroup) {
    if (!group.mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < group.instances.length; i++) {
      const { x, z, rotY, scale } = group.instances[i];
      dummy.position.set(x, getTerrainHeight(x, z), z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      group.mesh.setMatrixAt(i, dummy.matrix);
    }
    group.mesh.instanceMatrix.needsUpdate = true;
  }

  setupGui(gui: GUI) {
    const root = gui.addFolder("Shore Props").close();

    for (const group of this.groups) {
      const gf = root.addFolder(group.name).close();

      for (let i = 0; i < group.instances.length; i++) {
        const inst = group.instances[i];
        const zone = i < group.zoneThreshold ? "Z1" : "Z2";
        const label = `${zone} · ${group.name[0]}${i}`;
        const f = gf.addFolder(label).close();
        const update = () => this.applyInstances(group);

        f.add(inst, "x", -50, 50, 0.1).name("X").onChange(update);
        f.add(inst, "z", -50, 50, 0.1).name("Z").onChange(update);
        f.add(inst, "rotY", 0, Math.PI * 2, 0.05)
          .name("RotY")
          .onChange(update);
        f.add(inst, "scale", 0.1, 4.0, 0.05).name("Scale").onChange(update);
      }
    }
  }

  dispose() {
    for (const m of this.allMeshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
