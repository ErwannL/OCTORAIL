// Monde « archipel » (index 2, Nord) : L'Archipel Suspendu.
// Îles flottantes qui tanguent (rochers pendus à des chaînes), cascades qui tombent vers le haut,
// l'Île-Pendule (île suspendue sous une autre, petit train qui roule à l'envers dessous),
// baleine-nuage, moutons-lest, Facteur Plumet en montgolfière, 6 fragments de lore.
// Tout est cuit en géométries à couleurs de sommets (1 draw call par matériau) ou en InstancedMesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry } from '../../util/noise.js';
import { WORLD_LORE } from '../../data/lore.js';

const PI = Math.PI, H = PI / 2, WI = 2;
const AX = new THREE.Vector2(0, -1);                  // axe du monde : z négatif
const P = (r, side = 0) => [side, -r];                // (x, z) à la distance r de l'axe, décalé latéralement (x)

// ---------- outils ----------
const hash = (x, y, z, s) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453; return h - Math.floor(h); };
function jitter(geo, seed, amp, ampY = amp) {
  const A = geo.attributes.position;
  for (let i = 0; i < A.count; i++) {
    const x = A.getX(i), y = A.getY(i), z = A.getZ(i), kx = Math.round(x * 997), ky = Math.round(y * 997), kz = Math.round(z * 997);
    A.setXYZ(i, x + (hash(kx, ky, kz, seed) - 0.5) * amp, y + (hash(ky, kz, kx, seed + 3) - 0.5) * ampY, z + (hash(kz, kx, ky, seed + 7) - 0.5) * amp);
  }
  return geo;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
// Kit à couleurs de sommets : tout un modèle multicolore en UNE géométrie
class VK {
  constructor() { this.l = []; }
  add(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], j = 0, seed = 1, alpha = null, cf = null } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    if (j) jitter(g, seed, j);
    _m.compose(_v.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...s)); g.applyMatrix4(_m);
    const n = g.attributes.position.count, isz = alpha === null ? 3 : 4, col = new Float32Array(n * isz); _c.set(color);
    for (let i = 0; i < n; i++) {
      let c = _c; if (cf) c = cf(g.attributes.position, i, _c.clone());
      col[i * isz] = c.r; col[i * isz + 1] = c.g; col[i * isz + 2] = c.b;
      if (isz === 4) col[i * 4 + 3] = typeof alpha === 'function' ? alpha(g.attributes.position, i) : alpha;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, isz));
    this.l.push(g); return this;
  }
  geo() { if (!this.l.length) return null; const g = mergeGeometries(this.l, false); g.computeVertexNormals(); g.computeBoundingSphere(); return g; }
}
const B = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (a, b, h, s = 10) => new THREE.CylinderGeometry(a, b, h, s),
  cone: (r, h, s = 10) => new THREE.ConeGeometry(r, h, s),
  sph: (r, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  tor: (r, t, a = 6, b = 12, arc = PI * 2) => new THREE.TorusGeometry(r, t, a, b, arc),
  lathe: (pts, seg = 12, p0 = 0, pl = PI * 2) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg, p0, pl),
};
// segment cylindrique entre deux points
function seg(vk, a, b, r, color, sides = 5) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), L = d.length();
  const g = B.cyl(r, r, L, sides); g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(A.x, A.y, A.z);
  vk.add(g, color);
}

export function buildWorld(scene, terrain, net, ctx) {
  const rnd = mulberry(2202);
  const hAt = (x, z) => terrain.heightAt(x, z);
  const minH = (x, z, r) => { let m = hAt(x, z); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; m = Math.min(m, hAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return m; };
  const clear = (x, z, d) => !net.nearest(x, z, d);
  const clearDisk = (x, z, r, d) => { if (!clear(x, z, r + d)) return false; return true; };
  const inSector = (x, z, marg = 0) => { const r = Math.hypot(x, z), a = Math.atan2(x, -z); return r > 120 && r < 1390 && Math.abs(a) < (22 * PI / 180) - marg / r; };

  const matV = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.05 });
  const matM = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.38, metalness: 0.75 }); // métal (laiton, fer, chaînes)
  const matG = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });                                      // lueurs (fenêtres, lampes)
  const matW = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }); // eau qui monte (alpha par sommet)
  const matCloud = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: '#cfe2f5', emissiveIntensity: 0.22 });
  const mesh = (g, m, shadow = true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow && !m.transparent; o.receiveShadow = !m.transparent; return o; };
  const addKits = (parent, kits, shadow = true) => { for (const [vk, m] of kits) { const g = vk.geo(); if (g) parent.add(mesh(g, m, shadow)); } };
  const placed = [];   // { name, x, y, z } pour la vérification (base posée au sol)
  const C = { grass: '#86c25e', grass2: '#a6d36a', dirt: '#7a5636', rock: '#a0907c', rock2: '#80725f', rock3: '#b9ab96', trunk: '#6b4426', leaf: '#5aa845', leaf2: '#f2a7c3', pine: '#3d7a52',
    wall: '#efe4cc', roof: '#4f86c6', roof2: '#c4553a', brass: '#d2a24c', iron: '#2f3236', copper: '#b8643a', wood: '#8a5a2c', win: '#ffd27a', water: '#bfeaff', wool: '#f3efe6', sheepFace: '#2b2420' };

  // =====================================================================
  // 1) Îles flottantes (type générique, rayon 1, dessus à y=0)
  // =====================================================================
  function islandBase(vk, mk, seed, r = 1, deep = 1.8) {
    vk.add(B.cyl(r, r * 0.97, 0.12 * r, 14), C.grass, { p: [0, 0.0, 0], j: 0.05 * r, seed, cf: (A, i, c) => c.lerp(_c.set(C.grass2), hash(i, seed, 1, 2) * 0.5) });
    vk.add(B.cyl(r * 0.97, r * 0.9, 0.22 * r, 14), C.dirt, { p: [0, -0.17 * r, 0], j: 0.04 * r, seed: seed + 1 });
    vk.add(B.cone(r * 0.92, deep * r, 11), C.rock, { p: [0, -0.28 * r - deep * r / 2, 0], r: [PI, 0, 0], j: 0.16 * r, seed: seed + 2,
      cf: (A, i, c) => c.lerp(_c.set(C.rock2), Math.min(1, -A.getY(i) / (deep * r) + hash(i, seed, 3, 1) * 0.3)) });
    vk.add(B.cone(r * 0.45, deep * 0.7 * r, 8), C.rock2, { p: [r * 0.35, -0.28 * r - deep * 0.35 * r, -r * 0.2], r: [PI, 0.5, 0.15], j: 0.1 * r, seed: seed + 3 });
    // racines / lianes pendantes
    for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2 + seed; vk.add(B.cone(0.035 * r, (0.35 + hash(i, seed, 0, 0) * 0.5) * r, 4), '#4f8a3a', { p: [Math.cos(a) * r * 0.93, -0.4 * r, Math.sin(a) * r * 0.93], r: [PI, 0, 0] }); }
    // rochers pendus à des chaînes (la gravité a ses humeurs)
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * PI * 2 + seed * 1.7, rr = (0.35 + 0.15 * i) * r, y0 = -0.28 * r - deep * r * (1 - rr / (0.92 * r)) + 0.05 * r, L = (0.5 + hash(i, seed, 5, 5) * 0.9) * r;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      seg(mk, [x, y0, z], [x, y0 - L, z], 0.018 * r, C.iron, 4);
      vk.add(B.ico(0.13 * r, 0), C.rock2, { p: [x, y0 - L - 0.1 * r, z], j: 0.05 * r, seed: seed + 10 + i });
      mk.add(B.tor(0.05 * r, 0.012 * r, 4, 8), C.brass, { p: [x, y0 - L + 0.02 * r, z], r: [H, 0, 0] });
    }
  }
  const treeA = (vk, x, z, s, seed) => { vk.add(B.cyl(0.035 * s, 0.05 * s, 0.4 * s, 5), C.trunk, { p: [x, 0.25 * s, z] }); vk.add(B.ico(0.22 * s, 0), C.leaf, { p: [x, 0.58 * s, z], j: 0.06 * s, seed }); vk.add(B.ico(0.15 * s, 0), C.leaf, { p: [x + 0.08 * s, 0.78 * s, z + 0.03 * s], j: 0.04 * s, seed: seed + 1 }); };
  const treeB = (vk, x, z, s) => { vk.add(B.cyl(0.03 * s, 0.045 * s, 0.35 * s, 5), C.trunk, { p: [x, 0.22 * s, z] }); for (let i = 0; i < 3; i++) vk.add(B.cone((0.24 - i * 0.06) * s, 0.34 * s, 6), C.pine, { p: [x, (0.45 + i * 0.22) * s, z] }); };
  const treeC = (vk, x, z, s, seed) => { vk.add(B.cyl(0.03 * s, 0.045 * s, 0.35 * s, 5), C.trunk, { p: [x, 0.22 * s, z] }); vk.add(B.ico(0.24 * s, 0), C.leaf2, { p: [x, 0.52 * s, z], j: 0.05 * s, seed }); };
  const cottage = (vk, gl, x, z, s, ry, roof = C.roof) => {
    const c = Math.cos(ry), sn = Math.sin(ry), R = (dx, dz) => [x + dx * c + dz * sn, z - dx * sn + dz * c];
    vk.add(B.box(0.5 * s, 0.36 * s, 0.4 * s), C.wall, { p: [x, 0.17 * s, z], r: [0, ry, 0] });
    vk.add(B.cone(0.44 * s, 0.32 * s, 4), roof, { p: [x, 0.51 * s, z], r: [0, ry + PI / 4, 0] });
    const [cx, cz] = R(0.12 * s, -0.08 * s); vk.add(B.box(0.07 * s, 0.25 * s, 0.07 * s), C.rock2, { p: [cx, 0.58 * s, cz], r: [0, ry, 0] });
    for (const dx of [-0.12, 0.12]) { const [wx, wz] = R(dx * s, 0.205 * s); gl.add(B.box(0.09 * s, 0.1 * s, 0.01 * s), C.win, { p: [wx, 0.2 * s, wz], r: [0, ry, 0] }); }
    const [dx, dz] = R(0.255 * s, 0); vk.add(B.box(0.01 * s, 0.2 * s, 0.1 * s), C.roof2, { p: [dx, 0.1 * s, dz], r: [0, ry, 0] });
  };
  // cascade qui tombe vers le HAUT : ruban translucide qui s'effiloche en montant
  const upFall = (wk, x, y, z, w, h, ry) => {
    const g = new THREE.PlaneGeometry(w, h, 1, 6); g.translate(0, h / 2, 0);
    wk.add(g, C.water, { p: [x, y, z], r: [0, ry, 0], alpha: (A, i) => Math.max(0, 0.75 - A.getY(i) / h * 0.75) });
  };

  const islandTypes = [];
  { // A : bosquet + mare et cascade montante
    const vk = new VK(), mk = new VK(), gl = new VK(), wk = new VK();
    islandBase(vk, mk, 11); treeA(vk, 0.3, 0.1, 1.2, 1); treeA(vk, -0.45, -0.2, 0.9, 2); treeB(vk, 0.1, -0.55, 1.0); treeC(vk, -0.2, 0.5, 0.8, 3);
    vk.add(B.cyl(0.22, 0.22, 0.03, 10), '#5aa9d6', { p: [0.45, 0.07, 0.45] });
    upFall(wk, 0.45, 0.07, 0.45, 0.14, 2.6, 0.6);
    islandTypes.push({ vk, mk, gl, wk, spout: [0.45, 2.7, 0.45] });
  }
  { // B : maisonnette, pins, borne d'amarrage
    const vk = new VK(), mk = new VK(), gl = new VK(), wk = new VK();
    islandBase(vk, mk, 23); cottage(vk, gl, 0.1, 0.0, 1, 0.3); treeB(vk, -0.55, 0.25, 1.1); treeB(vk, -0.4, -0.35, 0.8); treeA(vk, 0.62, 0.4, 0.8, 5);
    mk.add(B.cyl(0.03, 0.04, 0.3, 6), C.brass, { p: [0.6, 0.15, -0.45] });
    islandTypes.push({ vk, mk, gl, wk });
  }
  { // C : arche de pierre + bout de rail qui pend dans le vide
    const vk = new VK(), mk = new VK(), gl = new VK(), wk = new VK();
    islandBase(vk, mk, 37); for (const sx of [-0.28, 0.28]) vk.add(B.box(0.12, 0.7, 0.12), C.rock3, { p: [sx, 0.35, -0.2] }); vk.add(B.box(0.8, 0.13, 0.16), C.rock3, { p: [0, 0.76, -0.2] });
    treeC(vk, -0.5, 0.35, 1.0, 7); treeC(vk, 0.45, -0.6, 0.7, 8);
    // rails : posés sur l'île puis qui plongent par-dessus le bord
    for (let i = 0; i < 9; i++) { const t = i / 8, x = 0.1 + t * 1.25, y = t < 0.6 ? 0.08 : 0.08 - (t - 0.6) * 2.2, rz = t < 0.6 ? 0 : -0.9; vk.add(B.box(0.06, 0.03, 0.34), C.wood, { p: [x, y, 0.3], r: [0, 0, rz] }); }
    for (const dz of [-0.11, 0.11]) { seg(mk, [0.05, 0.11, 0.3 + dz], [0.85, 0.11, 0.3 + dz], 0.014, '#6a6e74', 4); seg(mk, [0.85, 0.11, 0.3 + dz], [1.45, -0.55, 0.3 + dz], 0.014, '#6a6e74', 4); }
    islandTypes.push({ vk, mk, gl, wk });
  }
  // placement des îles (au-dessus du sol, loin des voies)
  const islands = islandTypes.map(() => []);
  for (let t = 0, n = 0; t < 900 && n < 18; t++) {
    const r = 180 + rnd() * 1180, a = (rnd() - 0.5) * 40 * PI / 180, x = Math.sin(a) * r, z = -Math.cos(a) * r, s = 7 + rnd() * 13;
    if (!inSector(x, z, s) || !clear(x, z, s + 10)) continue;
    if (Math.hypot(x + 250, z + 1010) < 160) continue; // place pour l'Île-Pendule
    if (islands.flat().some(o => Math.hypot(o.x - x, o.z - z) < (o.s + s) * 2.2)) continue;
    const y = hAt(x, z) + 28 + s * 2.3 + rnd() * 70;
    islands[n % 3].push({ x, y, z, s, ry: rnd() * 6, ph: rnd() * 6, sp: 0.18 + rnd() * 0.15 }); n++;
  }
  const islandMeshes = [];
  islandTypes.forEach((T, ti) => {
    const list = islands[ti]; if (!list.length) return;
    for (const [vk, m] of [[T.vk, matV], [T.mk, matM], [T.gl, matG], [T.wk, matW]]) {
      const g = vk.geo(); if (!g) continue;
      const im = new THREE.InstancedMesh(g, m, list.length); im.castShadow = !m.transparent && m !== matG; im.receiveShadow = !m.transparent;
      im.frustumCulled = false; scene.add(im); islandMeshes.push({ im, list });
    }
  });
  const setIsland = (im, i, o, t) => {
    const bob = Math.sin(t * o.sp + o.ph) * 0.12 * o.s * 0.3, tl = Math.sin(t * o.sp * 0.7 + o.ph * 2) * 0.03;
    _m.compose(_v.set(o.x, o.y + bob, o.z), _q.setFromEuler(_e.set(tl, o.ry + t * 0.004, -tl * 0.7)), _s.set(o.s, o.s, o.s)); im.setMatrixAt(i, _m);
  };
  for (const { im, list } of islandMeshes) { list.forEach((o, i) => setIsland(im, i, o, 0)); im.instanceMatrix.needsUpdate = true; }

  // =====================================================================
  // 2) L'Île-Pendule (repère) : île haute amarrée au sol + île qui se balance dessous
  // =====================================================================
  const LX = -250, LZ = -1010, h0 = minH(LX, LZ, 30);
  const TOP = h0 + 250, RU = 62;                // île haute
  const PIV = TOP - 98, CH = 62;                 // pivot du pendule, longueur
  const RL = 26;                                 // île basse
  const land = new THREE.Group(); land.position.set(LX, 0, LZ); scene.add(land);
  { const vk = new VK(), mk = new VK(), gl = new VK(), wk = new VK();
    // île haute (repère : roche massive en pointe, plateau habité)
    vk.add(B.cyl(RU, RU * 0.97, 5, 22), C.grass, { p: [0, TOP - 2, 0], j: 2.4, seed: 4, cf: (A, i, c) => c.lerp(_c.set(C.grass2), hash(i, 4, 1, 2) * 0.5) });
    vk.add(B.cyl(RU * 0.97, RU * 0.88, 10, 22), C.dirt, { p: [0, TOP - 9, 0], j: 2, seed: 5 });
    vk.add(B.cone(RU * 0.9, 88, 16, 4), C.rock, { p: [0, TOP - 14 - 44, 0], r: [PI, 0, 0], j: 7, seed: 6, cf: (A, i, c) => c.lerp(_c.set(C.rock2), Math.min(1, (TOP - A.getY(i)) / 100 + hash(i, 6, 1, 1) * 0.25)) });
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + 0.4, d = RU * (0.45 + (i % 2) * 0.2); vk.add(B.cone(14 + (i % 3) * 5, 40 + (i % 3) * 14, 7), i % 2 ? C.rock2 : C.rock3, { p: [Math.cos(a) * d, TOP - 30 - (i % 3) * 7, Math.sin(a) * d], r: [PI, a, 0.12], j: 3, seed: 30 + i }); }
    for (let i = 0; i < 22; i++) { const a = i / 22 * PI * 2; vk.add(B.cone(1.3, 8 + (i % 4) * 5, 4), '#4f8a3a', { p: [Math.cos(a) * RU * 0.92, TOP - 14 - (i % 4) * 2, Math.sin(a) * RU * 0.92], r: [PI, 0, 0] }); }
    // village perché : maisons, phare, arbres
    const houses = [[-22, 14, 0.4, C.roof], [-8, 28, 1.6, C.roof2], [18, 24, 2.6, C.roof], [30, -8, 0.9, C.roof2], [-30, -14, 2.0, C.roof], [6, -30, 3.1, C.roof2]];
    for (const [x, z, ry, rf] of houses) { const s = 16; vk.add(B.box(9, 1.2, 7.5), C.rock3, { p: [x, TOP + 0.3, z], r: [0, ry, 0] }); const v2 = new VK(); cottage(v2, gl, 0, 0, s, 0, rf); for (const g of v2.l) { g.rotateY(ry); g.translate(x, TOP + 0.6, z); vk.l.push(g); } }
    // phare-balise (lanterne lumineuse)
    vk.add(B.cyl(3.2, 4.2, 26, 10), C.wall, { p: [6, TOP + 13, 4] }); for (let i = 0; i < 3; i++) vk.add(B.cyl(4.35 - i * 0.35, 4.35 - i * 0.35, 1.6, 10), C.roof2, { p: [6, TOP + 5 + i * 8, 4] });
    mk.add(B.cyl(4.6, 4.6, 0.8, 12), C.brass, { p: [6, TOP + 26.4, 4] }); gl.add(B.cyl(2.6, 2.6, 4, 10), '#fff1c0', { p: [6, TOP + 28.8, 4] }); mk.add(B.cone(3.6, 4.5, 10), C.copper, { p: [6, TOP + 33, 4] });
    for (let i = 0; i < 34; i++) { const a = rnd() * PI * 2, d = 12 + rnd() * (RU - 18), x = Math.cos(a) * d, z = Math.sin(a) * d; if (houses.some(h => Math.hypot(h[0] - x, h[1] - z) < 9) || Math.hypot(x - 6, z - 4) < 8) continue; const f = [treeA, treeB, treeC][i % 3]; f(vk, x, z, 9 + rnd() * 9, 50 + i); }
    // cascades qui montent depuis le plateau
    upFall(wk, RU * 0.8, TOP - 0.2, -RU * 0.45, 4.5, 75, -0.5); upFall(wk, -RU * 0.7, TOP - 0.2, RU * 0.55, 3.5, 60, 0.9);
    vk.add(B.cyl(6, 6, 0.6, 12), '#5aa9d6', { p: [RU * 0.8 - 3, TOP + 0.6, -RU * 0.45 + 2] });
    // anneau de suspension sous la pointe
    mk.add(B.cyl(5, 9, 10, 10), C.brass, { p: [0, PIV + 7, 0] }); mk.add(B.tor(4, 1.1, 8, 16), C.brass, { p: [0, PIV + 0.5, 0] });
    // ancrages au sol (deux grandes bornes de pierre et treuils) + chaînes obliques
    const anchors = [[78, 52], [-64, -60]];
    for (const [ax, az] of anchors) {
      const gy = minH(LX + ax, LZ + az, 11) - 2.5;
      vk.add(B.cyl(10, 12, 6, 8), C.rock3, { p: [ax, gy + 3, az], j: 0.4, seed: 70 }); vk.add(B.cyl(7, 8.5, 6, 8), C.rock, { p: [ax, gy + 8, az] });
      mk.add(B.cyl(3, 3, 9, 14), C.brass, { p: [ax, gy + 13, az], r: [H, 0, 0] }); for (const sz of [-4.8, 4.8]) vk.add(B.box(2.2, 8, 1.4), C.iron, { p: [ax, gy + 12, az + sz] });
      mk.add(B.tor(2.4, 0.7, 6, 12), C.iron, { p: [ax, gy + 17.5, az] });
      placed.push({ name: 'borne-amarrage', x: LX + ax, z: LZ + az, y: gy + 2.5, r: 12 });
    }
    addKits(land, [[vk, matV], [mk, matM], [gl, matG], [wk, matW]]);
    // chaînes d'amarrage (maillons instanciés)
    const linkG = B.tor(1.5, 0.42, 5, 10); linkG.scale(1, 1.6, 1);
    const links = [];
    for (const [ax, az] of anchors) {
      const gy = minH(LX + ax, LZ + az, 11) - 2.5, A = new THREE.Vector3(ax, gy + 17.5, az), Bp = new THREE.Vector3(ax * 0.62, TOP - 8, az * 0.62), L = A.distanceTo(Bp), n = Math.floor(L / 4.2);
      for (let i = 0; i <= n; i++) { const t = i / n, p = A.clone().lerp(Bp, t); p.x -= Math.sin(t * PI) * ax * 0.06; p.z -= Math.sin(t * PI) * az * 0.06;
        const dir = Bp.clone().sub(A).normalize(); _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); const q2 = new THREE.Quaternion().setFromAxisAngle(dir, i % 2 ? H : 0); _q.premultiply(q2);
        links.push(new THREE.Matrix4().compose(p, _q.clone(), new THREE.Vector3(1, 1, 1))); }
    }
    const lm = new THREE.InstancedMesh(linkG, new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.7, roughness: 0.45, flatShading: true }), links.length);
    links.forEach((m, i) => lm.setMatrixAt(i, m)); lm.castShadow = true; land.add(lm);
  }
  // pendule : chaîne + île basse + anneau de rails à l'envers sous l'île
  const pend = new THREE.Group(); pend.position.set(0, PIV, 0); land.add(pend);
  const LTOP = -CH; // dessus de l'île basse (repère du pendule)
  const ringR = 17, ringY = LTOP - 13;
  { const vk = new VK(), mk = new VK(), gl = new VK();
    for (let i = 0; i < 11; i++) { const y = -2 - i * 3.9; mk.add(B.tor(1.4, 0.4, 5, 10), '#3a3d42', { p: [0, y, 0], r: [0, i % 2 ? H : 0, 0], s: [1, 1.6, 1] }); }
    mk.add(B.tor(2.6, 0.6, 6, 14), C.brass, { p: [0, -45, 0] });
    for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4; seg(mk, [0, -46, 0], [Math.cos(a) * RL * 0.8, LTOP + 0.8, Math.sin(a) * RL * 0.8], 0.35, '#3a3d42', 5); mk.add(B.cyl(1, 1.3, 1.2, 8), C.brass, { p: [Math.cos(a) * RL * 0.8, LTOP + 0.5, Math.sin(a) * RL * 0.8] }); }
    vk.add(B.cyl(RL, RL * 0.96, 3, 18), C.grass, { p: [0, LTOP - 1.3, 0], j: 1, seed: 90 });
    vk.add(B.cyl(RL * 0.96, RL * 0.85, 6, 18), C.dirt, { p: [0, LTOP - 5.8, 0], j: 1, seed: 91 });
    vk.add(B.cyl(RL * 0.85, RL * 0.7, 4, 14), C.rock, { p: [0, LTOP - 10.5, 0], j: 1.4, seed: 92 });
    for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2, d = RL * 0.5; vk.add(B.cone(4.5, 12 + (i % 3) * 6, 6), C.rock2, { p: [Math.cos(a) * d, LTOP - 16 - (i % 3) * 3, Math.sin(a) * d], r: [PI, 0, 0], j: 1, seed: 93 + i }); }
    // petite gare sur l'île basse
    vk.add(B.box(14, 0.8, 6), C.rock3, { p: [-4, LTOP + 0.4, 9] }); vk.add(B.box(9, 4.5, 4), C.wall, { p: [-4, LTOP + 3, 11] }); vk.add(B.box(11, 0.6, 6.5), C.roof, { p: [-4, LTOP + 5.6, 10.3], r: [0.12, 0, 0] });
    for (const x of [-7, -1]) gl.add(B.box(1.4, 1.4, 0.1), C.win, { p: [x, LTOP + 3.2, 8.97] });
    mk.add(B.box(5, 1.1, 0.15), C.brass, { p: [-4, LTOP + 6.4, 7.9] });
    treeA(vk, 10, -6, 12, 95); treeB(vk, -12, -8, 11); treeC(vk, 6, 12, 9, 96); treeA(vk, -16, 4, 8, 97);
    // anneau de voie à l'envers (traverses + rails sous l'île)
    for (let i = 0; i < 48; i++) { const a = i / 48 * PI * 2; vk.add(B.box(3.2, 0.35, 0.7), C.wood, { p: [Math.cos(a) * ringR, ringY, Math.sin(a) * ringR], r: [0, -a, 0] }); }
    for (const dr of [-0.75, 0.75]) mk.add(B.tor(ringR + dr, 0.13, 4, 64), '#8b9096', { p: [0, ringY - 0.3, 0], r: [H, 0, 0] });
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2 + 0.2; seg(mk, [Math.cos(a) * ringR, ringY + 0.2, Math.sin(a) * ringR], [Math.cos(a) * ringR * 0.75, LTOP - 8, Math.sin(a) * ringR * 0.75], 0.3, C.iron, 5); }
    addKits(pend, [[vk, matV], [mk, matM], [gl, matG]]);
  }
  // le petit train qui roule à l'envers (tête en bas, cheminée vers le vide)
  const tRing = new THREE.Group(); tRing.position.y = ringY - 0.45; pend.add(tRing);
  { const vk = new VK(), mk = new VK(), gl = new VK();
    const car = (a, len, body, loco) => {
      const c = Math.cos(a), s = Math.sin(a), x = c * ringR, z = s * ringR, ry = -a; // tangent
      vk.add(B.box(2.4, 2.2, len), body, { p: [x, -1.5, z], r: [0, ry, 0] });
      for (const d of [-len * 0.32, len * 0.32]) mk.add(B.cyl(0.45, 0.45, 2.3, 10), C.iron, { p: [x - s * d, -0.3, z + c * d], r: [0, ry, H] });
      if (loco) { mk.add(B.cyl(1, 1, len * 0.6, 12), '#2e5a43', { p: [x - s * len * 0.15, -1.6, z + c * len * 0.15], r: [H, 0, 0].map((v, i) => i === 0 ? H : 0), s: [1, 1, 1] });
        mk.add(B.cyl(0.35, 0.5, 1.6, 8), C.brass, { p: [x - s * len * 0.35, -3.3, z + c * len * 0.35] }); gl.add(B.sph(0.35, 8, 6), '#fff0b0', { p: [x - s * len * 0.52, -1.6, z + c * len * 0.52] }); }
      else for (const d of [-0.5, 0.5]) gl.add(B.box(0.08, 0.7, 0.9), C.win, { p: [x + c * 1.22, -1.5, z + s * 1.22 + d], r: [0, ry, 0] });
    };
    car(0, 5, C.roof2, true); car(-0.36, 4.5, '#3f6fa8', false); car(-0.66, 4.5, '#d2a24c', false);
    addKits(tRing, [[vk, matV], [mk, matM], [gl, matG]], false);
  }

  // =====================================================================
  // 3) Habillage au sol : rochers, touffes, nuages posés, bornes d'amarrage, sources montantes
  // =====================================================================
  const scatter = (n, minD, cb, tries = 30) => { let c = 0; for (let t = 0; t < n * tries && c < n; t++) { const r = 130 + rnd() * 1250, a = (rnd() - 0.5) * 42 * PI / 180, x = Math.sin(a) * r, z = -Math.cos(a) * r; if (!inSector(x, z, 4) || !clear(x, z, minD)) continue; if (Math.hypot(x - LX, z - LZ) < 40) continue; if (cb(x, z, c) !== false) c++; } };
  const inst = (geo, m, list, shadow = true, colors = null) => { const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach((mm, i) => { im.setMatrixAt(i, mm); if (colors) im.setColorAt(i, colors[i]); }); im.castShadow = shadow; im.receiveShadow = true; scene.add(im); return im; };
  const M4 = (x, y, z, ry, s) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(...s));
  { // rochers (plusieurs blocs, base enfoncée)
    const vk = new VK(); vk.add(B.ico(1, 1), C.rock, { j: 0.35, seed: 3, s: [1.3, 0.8, 1.1], cf: (A, i, c) => c.lerp(_c.set(C.rock2), hash(i, 3, 1, 1) * 0.6) }); vk.add(B.ico(0.6, 0), C.rock3, { p: [0.9, -0.1, 0.4], j: 0.2, seed: 4 });
    const list = [], cols = [];
    scatter(110, 10, (x, z) => { const s = 0.6 + rnd() ** 2 * 3.5; if (!clear(x, z, 9 + s * 1.6)) return false; const y = minH(x, z, s * 1.2); list.push(M4(x, y - s * 0.12, z, rnd() * 6, [s, s, s])); cols.push(new THREE.Color().setHSL(0.08, 0.12, 0.75 + rnd() * 0.25)); placed.push({ name: 'rocher', x, z, y: y - s * 0.12, r: s * 1.6, sunk: true }); });
    inst(vk.geo(), matV, list, true, cols);
  }
  { // touffes d'herbe + fleurs
    const vk = new VK(); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; vk.add(B.cone(0.09, 0.7 + (i % 3) * 0.25, 4), i % 2 ? C.grass : '#6fae4a', { p: [Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] }); }
    vk.add(B.ico(0.09, 0), '#ffffff', { p: [0.12, 0.85, 0.05] }); vk.add(B.ico(0.08, 0), '#f6c9e0', { p: [-0.18, 0.7, -0.1] });
    const list = [], cols = [];
    scatter(420, 9, (x, z) => { const s = 0.8 + rnd() * 1.1, y = hAt(x, z) - 0.05; list.push(M4(x, y, z, rnd() * 6, [s, s, s])); cols.push(new THREE.Color().setHSL(0.25 + rnd() * 0.08, 0.3, 0.8 + rnd() * 0.2)); });
    inst(vk.geo(), matV, list, false, cols);
  }
  { // bancs de nuages posés au sol (le sol de l'Archipel est une mer de nuages)
    const vk = new VK(); for (let i = 0; i < 6; i++) vk.add(B.ico(1, 1), '#ffffff', { p: [(i - 2.5) * 0.75, Math.sin(i * 1.7) * 0.15, Math.cos(i * 2.3) * 0.35], s: [1.05 - Math.abs(i - 2.5) * 0.12, 0.62, 0.9], j: 0.1, seed: 120 + i });
    const list = [];
    scatter(46, 14, (x, z) => { const s = 4 + rnd() * 7; if (!clear(x, z, 10 + s * 2.4)) return false; const y = minH(x, z, s * 2) - s * 0.25; list.push(M4(x, y, z, rnd() * 6, [s, s * 0.8, s])); placed.push({ name: 'nuage-sol', x, z, y, r: s * 2.2, sunk: true }); });
    inst(vk.geo(), matCloud, list, false);
  }
  { // bornes d'amarrage : poteau, corde tendue vers un petit rocher captif
    const vk = new VK(), mk = new VK();
    vk.add(B.cyl(0.9, 1.2, 0.8, 8), C.rock3, { p: [0, 0.1, 0] }); vk.add(B.cyl(0.22, 0.28, 2.6, 8), C.wood, { p: [0, 1.6, 0] }); mk.add(B.tor(0.3, 0.07, 5, 10), C.brass, { p: [0, 2.6, 0.25], r: [0, 0, 0] });
    seg(vk, [0, 2.5, 0.3], [1.2, 13, 0.6], 0.04, '#d8c49a', 4); vk.add(B.ico(1.3, 0), C.rock, { p: [1.25, 14.2, 0.6], j: 0.4, seed: 140 }); vk.add(B.cyl(1.1, 1.0, 0.3, 8), C.grass, { p: [1.25, 15.0, 0.6] }); vk.add(B.cone(0.08, 0.6, 4), '#4f8a3a', { p: [1.6, 13.1, 0.6], r: [PI, 0, 0] });
    const list = []; const g = mergeGeometries([vk.geo(), mk.geo()]);
    scatter(14, 14, (x, z) => { const y = minH(x, z, 1.2) - 0.3; list.push(M4(x, y, z, rnd() * 6, [1, 1, 1])); placed.push({ name: 'borne', x, z, y, r: 1.2, sunk: true }); });
    inst(g, matV, list, true);
  }
  // sources montantes : vasque de pierre, colonne d'eau qui monte
  const springs = [];
  { const vk = new VK(), wk = new VK();
    vk.add(B.cyl(3.2, 3.6, 1.6, 12), C.rock3, { p: [0, 0.2, 0], j: 0.15, seed: 150 }); vk.add(B.cyl(2.7, 2.7, 0.2, 12), '#5aa9d6', { p: [0, 1.0, 0] });
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; vk.add(B.ico(0.7, 0), C.rock2, { p: [Math.cos(a) * 3.6, 0.2, Math.sin(a) * 3.6], j: 0.2, seed: 151 + i }); }
    upFall(wk, 0, 1, 0, 1.4, 26, 0); upFall(wk, 0, 1, 0, 1.4, 26, H); upFall(wk, 0.4, 1, 0.3, 0.7, 34, PI / 4);
    const L1 = [], L2 = [];
    scatter(4, 30, (x, z) => { if (springs.some(s => Math.hypot(s.x - x, s.z - z) < 180)) return false; const y = minH(x, z, 4) - 0.6; L1.push(M4(x, y, z, rnd() * 6, [1, 1, 1])); springs.push({ x, y: y + 1.2, z }); placed.push({ name: 'source', x, z, y, r: 4, sunk: true }); });
    inst(vk.geo(), matV, L1, true); const w = inst(wk.geo(), matW, L1, false); w.receiveShadow = false;
  }

  // =====================================================================
  // 4) Vie : baleine-nuage, moutons-lest, Facteur Plumet
  // =====================================================================
  const whale = new THREE.Group(), whaleTail = new THREE.Group(); scene.add(whale);
  const whaleM = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, emissive: '#b8d4ee', emissiveIntensity: 0.18 });
  { const vk = new VK(), gl = new VK(), tk = new VK();
    const prof = [[0, 0], [0.025, 0.04], [0.055, 0.14], [0.085, 0.32], [0.1, 0.52], [0.105, 0.68], [0.095, 0.82], [0.07, 0.93], [0.03, 0.99], [0, 1]];
    const body = B.lathe(prof, 14); body.rotateX(H); body.translate(0, 0, -0.5); body.scale(80, 64, 80);
    vk.add(body, '#e6f0fa', { j: 0.6, seed: 160, cf: (A, i, c) => A.getY(i) < -1.5 ? c.set('#9fbcd8').lerp(_c.set('#c7dbee'), hash(i, 1, 2, 3) * 0.4) : c.lerp(_c.set('#ffffff'), hash(i, 2, 2, 3) * 0.3) });
    for (let i = 0; i < 9; i++) vk.add(B.box(0.4, 0.3, 14), '#8fb0cf', { p: [(i - 4) * 1.4, -5.6 - Math.abs(i - 4) * 0.15, 20], r: [0, 0, 0] }); // sillons ventraux
    for (const sx of [-1, 1]) { vk.add(B.box(12, 0.8, 5), '#cfe1f2', { p: [sx * 11, -3, 14], r: [0, sx * 0.4, sx * -0.4] }); gl.add(B.sph(0.7, 8, 6), '#1b2a3a', { p: [sx * 6.2, 0.6, 30] }); }
    vk.add(B.box(1.2, 3, 4), '#cfe1f2', { p: [0, 7.6, -6], r: [-0.4, 0, 0] });
    tk.add(B.box(1.4, 1.4, 10), '#e0ecf8', { p: [0, 0, -5] }); for (const sx of [-1, 1]) tk.add(B.box(10, 0.6, 5), '#d2e3f3', { p: [sx * 5, 0, -9], r: [0, sx * 0.5, 0] });
    whale.add(mesh(vk.geo(), whaleM), mesh(gl.geo(), matG, false)); whaleTail.add(mesh(tk.geo(), whaleM)); whaleTail.position.set(0, 0.5, -39); whale.add(whaleTail);
  }
  const WC = { x: -60, z: -820, r: 230, y: 150 };

  // moutons-lest (instanciés, broutent en tournant lentement)
  const sheep = [];
  let sheepIM = null;
  { const vk = new VK();
    vk.add(B.ico(0.5, 1), C.wool, { p: [0, 0.85, 0], s: [1.3, 0.85, 0.95], j: 0.12, seed: 170 }); for (let i = 0; i < 5; i++) vk.add(B.ico(0.22, 0), C.wool, { p: [-0.45 + i * 0.22, 1.2, (i % 2 - 0.5) * 0.25], j: 0.05, seed: 171 + i });
    vk.add(B.box(0.3, 0.3, 0.26), C.sheepFace, { p: [0.72, 0.95, 0], r: [0, 0, -0.3] }); for (const s of [-1, 1]) vk.add(B.box(0.06, 0.06, 0.18), C.sheepFace, { p: [0.68, 1.06, s * 0.18], r: [0, 0, -0.3] });
    for (const [x, z] of [[0.38, 0.22], [0.38, -0.22], [-0.38, 0.22], [-0.38, -0.22]]) vk.add(B.cyl(0.06, 0.05, 0.6, 5), C.sheepFace, { p: [x, 0.3, z] });
    vk.add(B.tor(0.47, 0.05, 4, 12), C.brass, { p: [0.15, 0.85, 0], r: [0, H, 0], s: [1, 0.9, 1] });          // harnais
    vk.add(B.cyl(0.18, 0.2, 0.28, 8), C.iron, { p: [0.15, 1.35, 0] }); vk.add(B.tor(0.08, 0.025, 4, 8), C.brass, { p: [0.15, 1.53, 0] }); // le lest
    const sp = new THREE.Vector3(); let herd = 0;
    for (let t = 0; t < 400 && sheep.length < 16; t++) {
      if (sheep.length % 4 === 0) { // nouveau troupeau
        const r = 200 + rnd() * 1050, a = (rnd() - 0.5) * 36 * PI / 180; sp.set(Math.sin(a) * r, 0, -Math.cos(a) * r);
        if (!clear(sp.x, sp.z, 28) || Math.hypot(sp.x - LX, sp.z - LZ) < 50) continue; herd++;
      }
      const cx = sp.x + (rnd() - 0.5) * 18, cz = sp.z + (rnd() - 0.5) * 18, R = 2 + rnd() * 3;
      if (!clear(cx, cz, 10 + R)) continue;
      sheep.push({ cx, cz, R, ph: rnd() * 6, w: (0.08 + rnd() * 0.1) * (rnd() < 0.5 ? -1 : 1), s: 0.9 + rnd() * 0.35, x: cx, z: cz });
    }
    sheepIM = new THREE.InstancedMesh(vk.geo(), matV, sheep.length); sheepIM.castShadow = true; sheepIM.frustumCulled = false; scene.add(sheepIM);
  }
  const setSheep = (t) => {
    sheep.forEach((o, i) => {
      const walk = Math.max(0, Math.sin(t * 0.25 + o.ph)), a = o.ph + (t * o.w + Math.cos(t * 0.25 + o.ph) * o.w * 4), x = o.cx + Math.cos(a) * o.R, z = o.cz + Math.sin(a) * o.R;
      const ry = Math.atan2(-(Math.cos(a)), -Math.sin(a)) + (o.w < 0 ? PI : 0), y = hAt(x, z) - 0.04 + walk * Math.abs(Math.sin(t * 6 + i)) * 0.06;
      o.x = x; o.z = z; o.y = y;
      _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, ry, (1 - walk) * -0.12)), _s.set(o.s, o.s, o.s)); sheepIM.setMatrixAt(i, _m);
    });
    sheepIM.instanceMatrix.needsUpdate = true;
  };
  setSheep(0);

  // Facteur Plumet en montgolfière rapiécée
  const balloon = new THREE.Group(); scene.add(balloon);
  { const vk = new VK(), mk = new VK(), gl = new VK();
    const prof = [[0.01, 0], [1.2, 0.3], [3.3, 2], [4.6, 4.6], [4.9, 6.8], [4.4, 8.8], [3, 10.2], [0.01, 10.8]];
    const gores = ['#d9a441', '#c4553a', '#efe2c4', '#4f86c6'];
    for (let i = 0; i < 12; i++) vk.add(B.lathe(prof, 2, i / 12 * PI * 2, PI * 2 / 12), gores[i % 4], { p: [0, 6, 0], cf: (A, k, c) => (hash(k, i, 1, 9) < 0.08 ? c.set('#8a6a4a') : c) });
    for (let i = 0; i < 5; i++) { const a = i * 1.3, y = 9 + i * 1.1, r = 4.6 - Math.abs(y - 11) * 0.12; vk.add(B.box(1.6, 1.4, 0.15), ['#6f9a4a', '#8a6a4a', '#d9c7a1'][i % 3], { p: [Math.cos(a) * (r + 0.05), y, Math.sin(a) * (r + 0.05)], r: [0, -a + H, 0] }); }
    vk.add(B.box(2.4, 1.4, 2.4), C.wood, { p: [0, 0.7, 0] }); vk.add(B.box(2.6, 0.2, 2.6), '#6b4426', { p: [0, 1.45, 0] });
    for (const [x, z] of [[1.1, 1.1], [1.1, -1.1], [-1.1, 1.1], [-1.1, -1.1]]) seg(vk, [x, 1.4, z], [x * 2.4, 6.6, z * 2.4], 0.04, '#d8c49a', 3);
    mk.add(B.cyl(0.35, 0.45, 0.6, 8), C.brass, { p: [0, 3.2, 0] }); gl.add(B.cone(0.3, 0.9, 6), '#ffb040', { p: [0, 3.9, 0] });
    vk.add(B.sph(0.55, 8, 6), '#2f3f6b', { p: [0.3, 1.9, 0.2], s: [1, 1.1, 1] }); vk.add(B.sph(0.32, 8, 6), '#f0c8a0', { p: [0.3, 2.75, 0.2] });
    vk.add(B.cyl(0.32, 0.36, 0.25, 8), '#2f3f6b', { p: [0.3, 3.05, 0.2] }); vk.add(B.box(0.5, 0.06, 0.35), '#2f3f6b', { p: [0.55, 2.95, 0.2] }); vk.add(B.cyl(0.33, 0.33, 0.07, 8), '#c4553a', { p: [0.3, 3.0, 0.2] });
    vk.add(B.box(0.7, 0.55, 0.3), '#7a4c2a', { p: [-0.2, 1.65, 0.75] }); vk.add(B.box(0.4, 0.05, 0.3), '#ffffff', { p: [-0.25, 1.95, 0.75], r: [0, 0, 0.2] });
    addKits(balloon, [[vk, matV], [mk, matM], [gl, matG]]);
  }
  const BC = { x: 130, z: -560, r: 140 };

  // =====================================================================
  // 5) Fragments de lore : bornes-pupitres au bord des voies
  // =====================================================================
  const lore = WORLD_LORE.find(w => w.id === 'archipel') || null;
  const frags = (lore && lore.fragments) || [];
  const plaques = [];
  { const targets = [210, 470, 680, 930, 1160, 1290], sides = [-1, 1, -1, 1, -1, 1];
    targets.forEach((r, i) => {
      let best = null;
      for (let d = 12; d <= 22 && !best; d += 1) for (const sd of [sides[i], -sides[i]]) {
        const x = 0, z = -r;
        const q = net.nearest(x, z, 40); if (!q) continue; const e = net.edges[q.edge], p = e.pts[q.k];
        const px = p.x + sd * d, pz = p.z; void x;
        if (clear(px, pz, 11) && inSector(px, pz)) { best = { x: px, z: pz, track: p }; break; }
      }
      if (best) plaques.push({ ...best, i, frag: frags[i] });
    });
    const vk = new VK(), mk = new VK(), gl = new VK();
    vk.add(B.cyl(0.9, 1.1, 0.5, 8), C.rock3, { p: [0, 0.05, 0] }); mk.add(B.cyl(0.1, 0.14, 1.3, 8), C.brass, { p: [0, 0.9, 0] });
    mk.add(B.box(0.9, 0.06, 0.6), C.brass, { p: [0, 1.58, 0.05], r: [-0.55, 0, 0] }); vk.add(B.box(0.75, 0.04, 0.48), '#2e4a5e', { p: [0, 1.62, 0.07], r: [-0.55, 0, 0] });
    for (const a of [0, 2.1, 4.2]) seg(mk, [0, 1.9, 0], [Math.cos(a) * 0.22, 2.3, Math.sin(a) * 0.22], 0.025, C.brass, 4);
    gl.add(B.ico(0.18, 0), '#e9c46a', { p: [0, 2.28, 0] });
    const g = vk.geo(), gm = mk.geo(), gg = gl.geo(), L = plaques.map(p => { const y = minH(p.x, p.z, 1.1) - 0.15; p.y = y; placed.push({ name: 'fragment', x: p.x, z: p.z, y, r: 1.1, sunk: true }); return M4(p.x, y, p.z, Math.atan2(p.track.x - p.x, p.track.z - p.z), [1, 1, 1]); });
    inst(g, matV, L, true); inst(gm, matM, L, true); inst(gg, matG, L, false);
  }
  // halo quand le joueur est proche
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 32), new THREE.MeshBasicMaterial({ color: '#e9c46a', transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
  halo.rotation.x = -H; halo.visible = false; scene.add(halo);
  const haloOrb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.8, toneMapped: false })); haloOrb.visible = false; scene.add(haloOrb);

  // debug / vérifications
  window.__archipel = { placed, plaques, islands, sheep, springs, land: { LX, LZ, h0, TOP }, WC, BC };

  // =====================================================================
  // update
  // =====================================================================
  const tmp = new THREE.Vector3(), tmpV = new THREE.Vector3();
  let acc = 0, lastE = false;
  const axisDist = (p) => { const r = Math.max(100, Math.min(1400, -p.z)); return Math.hypot(p.x, p.z + r); };
  return {
    update(dt, time, camPos) {
      if (!camPos || axisDist(camPos) > 700) { halo.visible = haloOrb.visible = false; return; }
      const t = time;
      // îles qui tanguent
      for (const { im, list } of islandMeshes) { list.forEach((o, i) => setIsland(im, i, o, t)); im.instanceMatrix.needsUpdate = true; }
      // pendule + train à l'envers
      pend.rotation.z = Math.sin(t * 0.32) * 0.1; pend.rotation.x = Math.sin(t * 0.32 * 0.71 + 1) * 0.045;
      tRing.rotation.y = t * 0.3;
      // baleine-nuage
      const wa = t * 0.022, wx = WC.x + Math.cos(wa) * WC.r, wz = WC.z + Math.sin(wa) * WC.r * 0.9;
      whale.position.set(wx, WC.y + Math.sin(t * 0.2) * 8, wz); whale.rotation.set(Math.sin(t * 0.2 + 1) * 0.05, Math.atan2(-Math.sin(wa), Math.cos(wa) * 0.9) , Math.sin(t * 0.11) * 0.06);
      whaleTail.rotation.x = Math.sin(t * 0.9) * 0.35;
      // moutons
      setSheep(t);
      // Facteur Plumet : huit lent entre les îles
      const ba = t * 0.035; balloon.position.set(BC.x + Math.sin(ba) * BC.r * 0.5, 0, BC.z + Math.sin(ba * 2) * BC.r * 0.9);
      balloon.position.y = hAt(balloon.position.x, balloon.position.z) + 62 + Math.sin(t * 0.5) * 3; balloon.rotation.y = t * 0.05; balloon.rotation.z = Math.sin(t * 0.7) * 0.03;
      // particules (limitées)
      acc += dt;
      if (acc > 0.12) { acc = 0;
        const steam = ctx.steam, smoke = ctx.smoke;
        if (steam) {
          for (const s of springs) if (Math.hypot(s.x - camPos.x, s.z - camPos.z) < 400) steam.emit(tmp.set(s.x + (Math.random() - 0.5) * 1.5, s.y + 26 + Math.random() * 6, s.z + (Math.random() - 0.5) * 1.5), tmpV.set((Math.random() - 0.5) * 2, 6 + Math.random() * 4, (Math.random() - 0.5) * 2), { life: 2.2, size: 3.5, color: '#dff4ff', alpha: 0.5 });
          if (whale.position.distanceTo(camPos) < 650 && Math.random() < 0.25) { whale.localToWorld(tmp.set(0, 8, 8)); for (let k = 0; k < 3; k++) steam.emit(tmp, tmpV.set((Math.random() - 0.5) * 3, 10 + Math.random() * 6, (Math.random() - 0.5) * 3), { life: 2.5, size: 9, color: '#ffffff', alpha: 0.55 }); }
          if (Math.hypot(LX - camPos.x, LZ - camPos.z) < 600) { tRing.updateMatrixWorld(); tRing.localToWorld(tmp.set(ringR, -4.2, 5 * 0.35)); steam.emit(tmp, tmpV.set(0, -5, 0), { life: 1.6, size: 2.2, color: '#c9ccd2', alpha: 0.6 }); } // fumée qui tombe vers le vide
        }
        if (smoke && balloon.position.distanceTo(camPos) < 500 && Math.random() < 0.1) smoke.emit(tmp.copy(balloon.position).add(tmpV.set(0, 1, 0)), tmpV.set((Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2), { life: 4, size: 0.5, color: '#ffffff', alpha: 0.9 }); // une lettre s'envole
      }
      // fragments
      const pl = ctx.player; let near = null;
      if (pl && pl.mode === 'foot') for (const p of plaques) { if (Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) < 3 && Math.abs(p.y - pl.pos.y) < 4) { near = p; break; } }
      halo.visible = haloOrb.visible = !!near;
      if (near) {
        halo.position.set(near.x, near.y + 0.32, near.z); halo.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
        haloOrb.position.set(near.x, near.y + 2.28 + Math.sin(t * 3) * 0.05, near.z); haloOrb.material.opacity = 0.5 + Math.sin(t * 5) * 0.3;
        const e = ctx.input && ctx.input.ah('interact');
        if (e && !lastE && near.frag) {
          ctx.ui.say([{ who: near.frag.title, icon: '✦', color: '#e9c46a', text: near.frag.text }]);
          const S = ctx.S; if (S) { S.fragments = Array.isArray(S.fragments) ? S.fragments : []; const id = `archipel-${near.i}`; if (!S.fragments.includes(id)) S.fragments.push(id); }
        }
        lastE = e;
      } else lastE = false;
    },
  };
}
