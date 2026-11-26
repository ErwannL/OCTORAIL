import * as THREE from 'three';
import { makeNoise, smooth, lerp } from '../util/noise.js';
import { biomeWeights, groundColor, HUB_RADIUS } from './biomes.js';
import { groundDetailTexture } from './decor.js';
import { sectorIndex } from './biomes.js';

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
    // Relief lisible : strates colorées dans les mesas du Western, roche nue sur les pentes, congères/lueur givrée en Gelure
    { const g1 = SEG + 1, st = S / SEG, cc = new THREE.Color(), ROCK = new THREE.Color('#9a5a3c'), ROCK2 = new THREE.Color('#c48a5a'), ICE = new THREE.Color('#9ab4cc'), SNOW = new THREE.Color('#f2f9ff');
      const hy = (i, j) => pos.getY(Math.min(SEG, Math.max(0, j)) * g1 + Math.min(SEG, Math.max(0, i)));
      for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) {
        const k = j * g1 + i, x = pos.getX(k), z = pos.getZ(k), r = Math.hypot(x, z); if (r < HUB_RADIUS + 20 || r > WORLD_R - 120) continue;
        const dx = (hy(i + 1, j) - hy(i - 1, j)) / (2 * st), dz = (hy(i, j + 1) - hy(i, j - 1)) / (2 * st), slope = Math.min(1, Math.hypot(dx, dz) / 1.2), h = pos.getY(k), sec = sectorIndex(x, z);
        cc.setRGB(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]);
        if (sec === 4) { const band = Math.sin(h * 1.7 + N.perlin(x * 0.05, z * 0.05) * 2) * 0.5 + 0.5; cc.lerp(ROCK.clone().lerp(ROCK2, band), Math.min(0.8, slope * 1.3)); cc.multiplyScalar(0.94 + band * 0.1 * slope); }
        else if (sec === 5) { const n2 = N.fbm(x * 0.012, z * 0.012, 2); cc.lerp(ICE, Math.min(0.7, slope * 1.1)); cc.lerp(SNOW, (1 - slope) * 0.25 * (0.5 + n2)); }
        col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
      } }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true, map: groundDetailTexture() });
    // Tuiles : frustum culling + masquage par distance (au lieu d'un unique maillage de 205k triangles)
    const mesh = new THREE.Group();
    const T = 10, per = SEG / T, idx = geo.index.array, g1 = SEG + 1;
    for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
      const I = new Uint32Array(per * per * 6); let o = 0;
      for (let iy = ty * per; iy < (ty + 1) * per; iy++) { const q0 = (iy * SEG + tx * per) * 6; I.set(idx.subarray(q0, q0 + per * 6), o); o += per * 6; }
      const tg = new THREE.BufferGeometry(); tg.attributes = geo.attributes; tg.setIndex(new THREE.BufferAttribute(I, 1));
      const box = new THREE.Box3(); const v = new THREE.Vector3();
      box.expandByPoint(v.set(pos.getX(ty * per * g1 + tx * per), 0, pos.getZ(ty * per * g1 + tx * per)));
      box.expandByPoint(v.set(pos.getX((ty + 1) * per * g1 + (tx + 1) * per), 0, pos.getZ((ty + 1) * per * g1 + (tx + 1) * per)));
      let ymin = 1e9, ymax = -1e9; for (let iy = ty * per; iy <= (ty + 1) * per; iy++) for (let ix = tx * per; ix <= (tx + 1) * per; ix++) { const y = pos.getY(iy * g1 + ix); if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
      box.min.y = ymin; box.max.y = ymax;
      tg.boundingBox = box; tg.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(tg, mat); m.receiveShadow = true; mesh.add(m);
    }
    scene.add(mesh);
    this.mesh = mesh;
    return mesh;
  }
}
