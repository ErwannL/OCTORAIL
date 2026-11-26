import * as THREE from 'three';
import { makeNoise, smooth, lerp } from '../util/noise.js';
import { biomeWeights, groundColor, HUB_RADIUS } from './biomes.js';

export const WORLD_R = 1500;
const N = makeNoise(4242);

// Relief brut par biome (sans aplanissement des voies)
function biomeHeight(i, x, z) {
  switch (i) {
    case 4: { // Western : mesas en terrasses
      const m = N.fbm(x * 0.0035, z * 0.0035, 4);
      const mesa = smooth(0.12, 0.2, m) * 38 + smooth(0.3, 0.36, m) * 26;
      return mesa + N.fbm(x * 0.02, z * 0.02, 3) * 3;
    }
    case 5: // Gelure : congères et collines douces
      return N.fbm(x * 0.004, z * 0.004, 5) * 30 + Math.abs(N.perlin(x * 0.02, z * 0.02)) * 5;
    case 0: return N.fbm(x * 0.003, z * 0.003, 4) * 45;
    case 1: return Math.round(N.fbm(x * 0.01, z * 0.01, 2) * 6) * 4;
    case 2: return N.fbm(x * 0.004, z * 0.004, 4) * 20 - 10;
    case 3: return N.fbm(x * 0.005, z * 0.005, 4) * 28;
    case 6: return N.fbm(x * 0.006, z * 0.006, 4) * 22;
    default: return N.fbm(x * 0.008, z * 0.008, 4) * 18;
  }
}

export function rawHeight(x, z) {
  const { i0, i1, t, hub } = biomeWeights(x, z);
  let h = lerp(biomeHeight(i0, x, z), biomeHeight(i1, x, z), t);
  h *= 1 - hub;
  const r = Math.hypot(x, z);
  h += smooth(WORLD_R - 220, WORLD_R, r) * 160 * (0.6 + 0.4 * N.perlin(x * 0.01, z * 0.01));
  return h;
}

export class Terrain {
  constructor(network) {
    this.net = network;
  }

  heightAt(x, z) {
    let h = rawHeight(x, z);
    const r = Math.hypot(x, z);
    if (r < HUB_RADIUS + 10) h = lerp(0, h, smooth(HUB_RADIUS - 10, HUB_RADIUS + 10, r));
    const q = this.net.nearest(x, z, 34);
    if (q) {
      const bed = q.y - 0.75;
      h = lerp(bed, h, smooth(5, 32, q.d));
    }
    return h;
  }

  build(scene) {
    const S = WORLD_R * 2, SEG = 320;
    const geo = new THREE.PlaneGeometry(S, S, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      const n = N.fbm(x * 0.03, z * 0.03, 3);
      groundColor(x, z, n, c);
      const q = this.net.nearest(x, z, 8);
      if (q) c.lerp(new THREE.Color('#5a4c40'), (1 - q.d / 8) * 0.75);
      const r = Math.hypot(x, z);
      if (r > WORLD_R - 200) c.lerp(new THREE.Color('#6d6a74'), smooth(WORLD_R - 200, WORLD_R - 60, r) * 0.7);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.mesh = mesh;
    return mesh;
  }
}
