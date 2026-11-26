import * as THREE from 'three';
import { sectorIndex } from './biomes.js';

// Seuls le Moyeu et les mondes ouverts (Ouest=4, Sud-Ouest=5) sont accessibles à pied : le reste est derrière des barrières.
const reachable = (x, z) => Math.hypot(x, z) < 245 || [4, 5].includes(sectorIndex(x, z));

// Collision « géométrie réelle » : on échantillonne la surface de TOUS les modèles statiques affichés
// et on range, par colonne de 25 cm, les intervalles de hauteur occupés. Ce que tu vois est solide,
// sans aucun collider posé à la main. Le joueur et la caméra interrogent ces colonnes.
const CELL = 0.3, MERGE = 0.32;
const KEYS = 40000;
const key = (ix, iz) => (ix + 20000) * KEYS + (iz + 20000);

export class VoxelCollision {
  static _t1 = new THREE.Vector3(); static _t2 = new THREE.Vector3();
  constructor() { this.cols = new Map(); this.points = 0; this.meshes = 0; }

  _add(x, y, z) {
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    let iv = this.cols.get(k);
    if (!iv) { this.cols.set(k, [y, y]); this.points++; return; }
    for (let i = 0; i < iv.length; i += 2) {
      if (y >= iv[i] - MERGE && y <= iv[i + 1] + MERGE) { if (y < iv[i]) iv[i] = y; if (y > iv[i + 1]) iv[i + 1] = y; this.points++; return; }
    }
    iv.push(y, y); this.points++;
  }

  // intervalle plein [y0, y1] dans la colonne de (x, z)
  _addSpan(x, y0, y1, z) {
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    let iv = this.cols.get(k);
    if (!iv) { this.cols.set(k, [y0, y1]); return; }
    for (let i = 0; i < iv.length; i += 2) if (y1 >= iv[i] - MERGE && y0 <= iv[i + 1] + MERGE) { iv[i] = Math.min(iv[i], y0); iv[i + 1] = Math.max(iv[i + 1], y1); return; }
    iv.push(y0, y1);
  }

  // Parcourt les triangles d'une géométrie et appelle emit(x,y,z) (espace local) sur une grille de pas `spacing`.
  static walk(geo, spacing, emit) {
    const pos = geo.attributes.position, idx = geo.index;
    const n = idx ? idx.count : pos.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t + 2 < n; t += 3) {
      const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      // balayage par rangées parallèles au plus long côté : nb de points ~ aire / pas² (pas de surcoût sur les triangles effilés)
      let A = a, B = b, C = c;
      const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a);
      if (ab >= bc && ab >= ca) { A = c; B = a; C = b; } else if (ca >= ab && ca >= bc) { A = b; B = c; C = a; }
      const base = B.distanceTo(C); if (base < 1e-6) continue;
      const cr = VoxelCollision._t1.subVectors(B, A).cross(VoxelCollision._t2.subVectors(C, A)).length();
      const h = cr / base;
      const nr = Math.min(2000, Math.max(1, Math.ceil(h / spacing)));
      for (let r = 0; r <= nr; r++) {
        const t = r / nr, len = base * t, nc = Math.min(4000, Math.max(1, Math.ceil(len / spacing)));
        const p0x = A.x + (B.x - A.x) * t, p0y = A.y + (B.y - A.y) * t, p0z = A.z + (B.z - A.z) * t;
        const p1x = A.x + (C.x - A.x) * t, p1y = A.y + (C.y - A.y) * t, p1z = A.z + (C.z - A.z) * t;
        for (let q = 0; q <= nc; q++) { const u = q / nc; emit(p0x + (p1x - p0x) * u, p0y + (p1y - p0y) * u, p0z + (p1z - p0z) * u); }
      }
    }
  }
  static area(geo) {
    const pos = geo.attributes.position, idx = geo.index, n = idx ? idx.count : pos.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let A = 0;
    for (let t = 0; t + 2 < n; t += 3) { a.fromBufferAttribute(pos, idx ? idx.getX(t) : t); b.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1); c.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2); A += b.sub(a).cross(c.sub(a)).length() / 2; }
    return A;
  }
  // échantillons locaux mis en cache (géométries instanciées, petites)
  static samples(geo, spacing) {
    if (geo.userData._smp && geo.userData._smpS === spacing) return geo.userData._smp;
    const sc = Math.max(spacing, Math.sqrt(VoxelCollision.area(geo) / 60000));
    const out = []; VoxelCollision.walk(geo, sc, (x, y, z) => { if (y < 3.2) out.push(x, y, z); });
    const arr = new Float32Array(out); geo.userData._smp = arr; geo.userData._smpS = spacing; return arr;
  }

  static samplesFull(geo, spacing) {
    if (geo.userData._smpF) return geo.userData._smpF;
    const out = []; VoxelCollision.walk(geo, spacing, (x, y, z) => out.push(x, y, z));
    return (geo.userData._smpF = new Float32Array(out));
  }
  _addSamples(smp, m, capY = Infinity, fillFrom = null) {
    const e = m.elements;
    for (let i = 0; i < smp.length; i += 3) {
      const X = smp[i], Y = smp[i + 1], Z = smp[i + 2];
      const y = e[1] * X + e[5] * Y + e[9] * Z + e[13];
      if (y > capY) continue;
      if (fillFrom !== null) this._addSpan(e[0] * X + e[4] * Y + e[8] * Z + e[12], fillFrom, y, e[2] * X + e[6] * Y + e[10] * Z + e[14]);
      else this._add(e[0] * X + e[4] * Y + e[8] * Z + e[12], y, e[2] * X + e[6] * Y + e[10] * Z + e[14]);
    }
  }

  // Construit à partir de la scène. `exclude` : Set d'objets (et leurs descendants) à ignorer.
  build(scene, exclude) {
    const t0 = performance.now();
    scene.updateMatrixWorld(true);
    const m = new THREE.Matrix4(), box = new THREE.Box3(), size = new THREE.Vector3();
    const skip = (o) => { for (let p = o; p; p = p.parent) if (exclude.has(p) || p.userData.noCollide) return true; return false; };
    scene.traverse(o => {
      if (!o.isMesh || o.isPoints || o.isLine || o.isSprite) return;
      if (skip(o)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.every(mt => !mt || (mt.transparent && mt.opacity < 0.35) || mt.blending === THREE.AdditiveBlending || mt.wireframe)) return;
      const geo = o.geometry; if (!geo?.attributes?.position) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      geo.boundingBox.getSize(size);
      if (Math.max(size.x, size.y, size.z) > 1500) return; // ciel, dômes géants
      if (o.isInstancedMesh) {
        // herbes, cailloux, fleurs, traverses : trop bas/petits pour gêner -> ignorés
        if (size.y < 0.45 || (size.y < 1.1 && Math.max(size.x, size.z) < 1.1)) return;
        const few = o.count <= 40; // objets rares (arbres du Moyeu…) : géométrie complète, couronne comprise
        const fill = !!o.userData.solidFill;
        const smp = (few || fill) ? VoxelCollision.samplesFull(geo, fill ? 0.4 : 0.25) : VoxelCollision.samples(geo, 0.3);
        if (!smp.length) return;
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m); m.premultiply(o.matrixWorld);
          if (!reachable(m.elements[12], m.elements[14])) continue;
          this._addSamples(smp, m, (few || fill) ? Infinity : m.elements[13] + 3.2 * Math.cbrt(Math.abs(m.determinant())), fill ? m.elements[13] - 2 : null); // nombreux : tronc/base seulement ; volumes pleins remplis jusqu'au sol
        }
      } else {
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        const bc = geo.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
        if (!reachable(bc.x, bc.z) && geo.boundingSphere.radius < 200) return;
        const e = o.matrixWorld.elements, sx = Math.cbrt(Math.abs(o.matrixWorld.determinant())) || 1;
        const A = VoxelCollision.area(geo) * sx * sx;
        const sp = Math.max(0.22, Math.sqrt(A / 500000)) / sx; // gros objets (vague) : pas adaptatif
        VoxelCollision.walk(geo, sp, (X, Y, Z) => this._add(e[0] * X + e[4] * Y + e[8] * Z + e[12], e[1] * X + e[5] * Y + e[9] * Z + e[13], e[2] * X + e[6] * Y + e[10] * Z + e[14]));
      }
      this.meshes++;
    });
    this.compact();
    this.ms = Math.round(performance.now() - t0);
    return this;
  }

  // Map de tableaux -> table de hachage compacte (typed arrays) : ~10x moins de mémoire
  compact() {
    const n = this.cols.size; let cap = 1; while (cap < n * 1.6) cap <<= 1;
    const keys = new Float64Array(cap).fill(-1), start = new Int32Array(cap), cnt = new Uint8Array(cap);
    let total = 0; for (const iv of this.cols.values()) total += Math.min(iv.length, 16);
    const data = new Float32Array(total); let off = 0; const mask = cap - 1;
    for (const [k, iv] of this.cols) {
      let h = this._hash(k) & mask; while (keys[h] !== -1) h = (h + 1) & mask;
      keys[h] = k; start[h] = off; const m = Math.min(iv.length, 16); cnt[h] = m;
      for (let i = 0; i < m; i++) data[off++] = iv[i];
    }
    this.H = { keys, start, cnt, data, mask }; this.count = n; this.cols = null;
  }
  _hash(k) { const a = Math.floor(k / KEYS), b = k - a * KEYS; return (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0; }
  _get(k) {
    const H = this.H; let h = this._hash(k) & H.mask;
    while (H.keys[h] !== -1) { if (H.keys[h] === k) return h; h = (h + 1) & H.mask; }
    return -1;
  }

  // Un volume solide recoupe-t-il la tranche [y0, y1] dans un disque de rayon r autour de (x, z) ?
  solid(x, z, y0, y1, r) {
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    const r2 = (r + CELL * 0.71) ** 2;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const cx = (i + 0.5) * CELL - x, cz = (j + 0.5) * CELL - z; if (cx * cx + cz * cz > r2) continue;
      const h = this._get(key(i, j)); if (h < 0) continue;
      const D = this.H.data, s0 = this.H.start[h], e0 = s0 + this.H.cnt[h];
      for (let q = s0; q < e0; q += 2) if (D[q + 1] > y0 && D[q] < y1) return true;
    }
    return false;
  }

  // Plus haute surface sous (feet + step) dans un petit disque (pour se tenir debout sur les objets)
  floor(x, z, feet, step, r = 0.2) {
    let best = -Infinity;
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const h = this._get(key(i, j)); if (h < 0) continue;
      const D = this.H.data, s0 = this.H.start[h], e0 = s0 + this.H.cnt[h];
      for (let q = s0; q < e0; q += 2) { const top = D[q + 1]; if (top <= feet + step && top > best) best = top; }
    }
    return best;
  }
}

export const VOX = new VoxelCollision();
