// Realism upgrade: HDRI image-based lighting, soft key/fill/rim lights,
// and filmic tone mapping on top of TalkingHead's renderer.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const HDRI_URL = './hdri/studio_small_09_1k.hdr';
const TONE_MAPPING_EXPOSURE = 0.9;
const ENV_INTENSITY = 0.8;

export async function applyStudioLighting(head) {
  const { renderer, scene } = head;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  try {
    const hdr = await new HDRLoader().loadAsync(HDRI_URL);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    scene.environmentIntensity = ENV_INTENSITY;
    hdr.dispose();
    pmrem.dispose();
  } catch (err) {
    console.warn('HDRI failed to load, keeping default environment:', err);
  }

  // Soft three-point lighting
  const key = new THREE.DirectionalLight(0xfff1e0, 1.6);
  key.position.set(1.2, 2.2, 2.0);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
  fill.position.set(-1.5, 1.6, 1.5);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(0, 2.0, -2.0);
  scene.add(key, fill, rim);
}
