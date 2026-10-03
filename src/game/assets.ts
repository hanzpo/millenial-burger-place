import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const MODEL_NAMES = [
  'table', 'stool', 'edison', 'strings', 'chalk', 'eat', 'taps', 'garage', 'counter', 'kitchen', 'meal', 'person',
] as const;
export type ModelName = (typeof MODEL_NAMES)[number];

const models = new Map<ModelName, THREE.Object3D>();

export async function loadModels(onProgress?: (done: number, total: number) => void) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(
    MODEL_NAMES.map(async (name) => {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const mesh = o as THREE.Mesh;
          const m = mesh.material as THREE.MeshStandardMaterial;
          // Emissive and see-through bits shouldn't cast shadows.
          const glowy = m.emissiveIntensity > 0 && m.emissive.getHex() !== 0;
          mesh.castShadow = !glowy && !m.transparent;
          mesh.receiveShadow = true;
        }
      });
      models.set(name, gltf.scene);
      onProgress?.(++done, MODEL_NAMES.length);
    }),
  );
}

/** A fresh copy. Materials are shared unless `uniqueMaterials` is set. */
export function spawn(name: ModelName, uniqueMaterials = false): THREE.Object3D {
  const src = models.get(name);
  if (!src) throw new Error(`Model ${name} not loaded`);
  const copy = src.clone(true);
  if (uniqueMaterials) {
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = (mesh.material as THREE.Material).clone();
    });
  }
  return copy;
}
