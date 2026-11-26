// FLORA : modèles procéduraux « poussés » de la nature d'OCTORAIL (arbres, cactus, rochers, herbes, animaux, oiseaux, foin).
// Tout est fusionné en UNE géométrie à couleurs de sommets (matériau partagé FLORA_MAT) => 1 draw call par instance/variante.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry } from '../util/noise.js';

const PI = Math.PI, H = PI / 2, UP = new THREE.Vector3(0, 1, 0);
export const FLORA_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
export const FLORA_MAT_DS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true, side: THREE.DoubleSide });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ assemblage à couleurs de sommets
export class Bits {
  constructor(seed = 1) { this.g = []; this.rnd = mulberry(seed * 977 + 13); this.M = new THREE.Matrix4(); this.c = new THREE.Color(); }
  // color : hex/CSS ; jit : variation par face ; grad : éclaircit vers le haut (0..1) ; paint(cx,cy,cz,ny,t) : couleur par face
  add(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], q = null, jit = 0.07, grad = 0, paint = null } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.computeBoundingBox(); const bb = g.boundingBox, hy = (bb.max.y - bb.min.y) || 1;
    const pos = g.attributes.position, n = pos.count, T = new Float32Array(n / 3);
    for (let i = 0; i < n; i += 3) T[i / 3] = ((pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 - bb.min.y) / hy;
    this.M.compose(V(...p), q || new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V(...s));
    g.applyMatrix4(this.M);
    g.computeVertexNormals();
    const nor = g.attributes.normal, col = new Float32Array(n * 3), base = new THREE.Color(color), c = this.c;
    for (let i = 0; i < n; i += 3) {
      const t = T[i / 3];
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      if (paint) c.set(paint(cx, cy, cz, nor.getY(i), t)); else c.copy(base);
      const f = (1 + (this.rnd() - 0.5) * 2 * jit) * (grad ? (1 - grad * 0.5) + grad * t : 1);
      for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r * f; col[(i + k) * 3 + 1] = c.g * f; col[(i + k) * 3 + 2] = c.b * f; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.g.push(g); return this;
  }
  build() { const geo = mergeGeometries(this.g, false); geo.computeBoundingSphere(); geo.computeBoundingBox(); return geo; }
}

// ------------------------------------------------------------------ primitives organiques
const hash3 = (x, y, z, s) => { const v = Math.sin(Math.round(x * 800) * 12.9898 + Math.round(y * 800) * 78.233 + Math.round(z * 800) * 37.719 + s * 11.13) * 43758.5453; return v - Math.floor(v); };
// blob irrégulier (icosaèdre déformé de façon cohérente entre sommets partagés)
export function blob(r = 1, detail = 1, seed = 1, rough = 0.25, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = 1 + (hash3(p.getX(i), p.getY(i), p.getZ(i), seed) - 0.5) * 2 * rough; p.setXYZ(i, p.getX(i) * f * sx, p.getY(i) * f * sy, p.getZ(i) * f * sz); }
  return g;
}
// tube à rayon variable le long d'une courbe
export function ptube(pts, r0, r1, seg = 4, rs = 5) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => p.isVector3 ? p : V(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, rs, false), pos = g.attributes.position;
  for (let i = 0; i <= seg; i++) { const c = curve.getPointAt(i / seg), rr = r0 + (r1 - r0) * (i / seg); for (let j = 0; j <= rs; j++) { const k = i * (rs + 1) + j; pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * rr, c.y + (pos.getY(k) - c.y) * rr, c.z + (pos.getZ(k) - c.z) * rr); } }
  return g;
}
const spike = (r, h, seg = 3) => new THREE.ConeGeometry(r, h, seg, 1, true).translate(0, h / 2, 0);
const dirQ = (d) => new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
const lerpV = (a, b, t) => a.clone().lerp(b, t);
const pickC = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

// ------------------------------------------------------------------ ARBRES EN POT DU MOYEU
// variante 0 : érable d'ornement ; 1 : cerisier en fleurs ; 2 : arbre « nuage » doré (ginkgo taillé en plateaux)
export function potTreeGeometry(variant = 0) {
  const b = new Bits(100 + variant), rnd = mulberry(500 + variant * 37);
  const potC = ['#b8643a', '#7a8a96', '#a8884a'][variant];
  // pot : profil tourné + bourrelet + terre + cailloux
  b.add(new THREE.LatheGeometry([[0.55, 0], [0.82, 0.12], [0.98, 0.7], [1.02, 0.95], [1.12, 1.0], [1.12, 1.12], [0.98, 1.12], [0.92, 1.0]].map(([x, y]) => new THREE.Vector2(x, y)), 12), potC, { jit: 0.05, grad: 0.4 });
  b.add(new THREE.CylinderGeometry(0.93, 0.93, 0.08, 12), '#3a2a1e', { p: [0, 1.0, 0] });
  for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, rr = 0.35 + rnd() * 0.45; b.add(blob(0.12, 0, i + variant * 9, 0.3, 1.2, 0.7, 1), '#8a8a84', { p: [Math.cos(a) * rr, 1.05, Math.sin(a) * rr] }); }
  b.add(blob(0.22, 1, 3, 0.3, 1.8, 0.35, 1.5), '#5f8a3a', { p: [0.45, 1.06, -0.35] }); // touffe de mousse
  const bark = ['#5a3d2c', '#3e2a22', '#6a5238'][variant], bark2 = ['#7a5a3e', '#5a4034', '#8a6e48'][variant];
  const lean = [0.25, -0.35, 0.5][variant];
  const trunkPts = [[0, 0.95, 0], [lean * 0.4, 1.8, 0.15], [-lean * 0.3, 2.7, -0.1], [lean * 0.2, 3.5, 0.15], [lean * 0.5, 4.1, 0]];
  b.add(ptube(trunkPts, 0.3, 0.1, 6, 7), bark, { jit: 0.1, grad: 0.3 });
  b.add(new THREE.CylinderGeometry(0.3, 0.5, 0.3, 7, 1, true).translate(0, 0.15, 0), bark, { p: [0, 0.95, 0] }); // empattement
  const pal = [['#3f7a35', '#4f8a3a', '#5f9a45', '#78aa4a', '#357030'], ['#f0a3bd', '#e8809f', '#f7c6d6', '#d9688c', '#fbd9e4'], ['#e0a030', '#d98a28', '#efc050', '#c9701f', '#f2d070']][variant];
  const n = [7, 7, 6][variant], tip = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * PI * 2 + rnd() * 0.6, len = 1.8 + rnd() * 1.0, y0 = 2.4 + rnd() * 1.3, from = V(...trunkPts[Math.min(4, Math.floor(y0 / 1.0))]);
    from.y = y0; from.x = lean * 0.2; from.z = 0;
    const mid = from.clone().add(V(Math.cos(a) * len * 0.5, 0.35 + rnd() * 0.5, Math.sin(a) * len * 0.5));
    const end = from.clone().add(V(Math.cos(a) * len, 1.0 + rnd() * 1.0 + (y0 > 3.2 ? 0.2 : 0), Math.sin(a) * len));
    b.add(ptube([from, mid, end], 0.13 + 0.03 * (4 - i % 3), 0.04, 4, 5), bark2, { jit: 0.1 });
    if (rnd() < 0.8) { const sub = lerpV(mid, end, 0.5); const e2 = sub.clone().add(V(Math.cos(a + 0.8) * 0.9, 0.7, Math.sin(a + 0.8) * 0.9)); b.add(ptube([sub, lerpV(sub, e2, 0.5).add(V(0, 0.15, 0)), e2], 0.06, 0.025, 3, 4), bark2); tip.push(e2); }
    tip.push(end);
  }
  tip.push(V(lean * 0.6, 4.7, 0.1), V(lean * 0.4 - 0.9, 4.3, 0.5), V(lean * 0.4 + 0.9, 4.4, -0.5));
  // feuillage en grappes multiples : gros volume + satellites + petites touffes détachées
  tip.forEach((t, k) => {
    const R = (variant === 2 ? 1.3 : 1.15) + rnd() * 0.6;
    const sx = variant === 2 ? 1.5 : 1.0 + rnd() * 0.2, sy = variant === 2 ? 0.5 : 0.95 + rnd() * 0.2;
    b.add(blob(R, 1, k * 7 + variant, 0.3, sx, sy, sx * (0.9 + rnd() * 0.2)), pickC(rnd, pal), { p: [t.x, t.y + 0.2, t.z], grad: 0.55, jit: 0.09 });
    const sat = variant === 2 ? 1 : 2;
    for (let s = 0; s < sat; s++) { const aa = rnd() * 6.28, d = R * (0.7 + rnd() * 0.4); b.add(blob(R * (0.45 + rnd() * 0.25), 1, k * 13 + s + variant, 0.3, 1, 0.8, 1), pickC(rnd, pal), { p: [t.x + Math.cos(aa) * d, t.y + 0.05 + rnd() * 0.5 - (variant === 2 ? 0.1 : 0), t.z + Math.sin(aa) * d], grad: 0.5, jit: 0.09 }); }
  });
  if (variant === 1) for (let i = 0; i < 10; i++) { const t = tip[i % tip.length]; b.add(blob(0.07, 0, i, 0.2), '#ffe6ee', { p: [t.x + (rnd() - 0.5) * 2.4, t.y - 0.7 - rnd() * 1.6, t.z + (rnd() - 0.5) * 2.4] }); } // pétales tombants
  const geo = b.build();
  geo.userData = { trunkR: 0.45, crownR: [3.0, 3.1, 3.4][variant], crownBottom: [3.3, 3.2, 3.5][variant], top: [7.3, 7.0, 6.2][variant] };
  return geo;
}

// ------------------------------------------------------------------ WESTERN : arbres morts et arbres de Josué
function limb(b, rnd, p0, dir, len, r0, depth, cols, up = 0.15) {
  const pts = [p0.clone()]; const d = dir.clone().normalize(); let p = p0.clone();
  for (let i = 0; i < 3; i++) { d.add(V((rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.3 + up, (rnd() - 0.5) * 0.7)).normalize(); p = p.clone().addScaledVector(d, len / 3); pts.push(p); }
  b.add(ptube(pts, r0, Math.max(0.018, r0 * 0.5), 3, depth > 1 ? 5 : 4), cols[Math.min(depth, cols.length - 1) ? cols.length - 1 - Math.min(depth, cols.length - 1) : cols.length - 1], { jit: 0.1, grad: 0.2 });
  if (depth > 0) {
    const kids = depth > 1 ? 2 : 2 + (rnd() < 0.5 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const at = pts[1 + Math.min(2, k + (rnd() < 0.4 ? 1 : 0))], ax = V(rnd() - 0.5, 0, rnd() - 0.5).normalize(), nd = d.clone().applyAxisAngle(ax.lengthSq() ? ax : V(1, 0, 0), 0.6 + rnd() * 0.7);
      limb(b, rnd, at, nd, len * (0.55 + rnd() * 0.2), r0 * 0.52, depth - 1, cols, up);
    }
  }
}
export function deadTreeGeometry(variant = 0) {
  const b = new Bits(200 + variant), rnd = mulberry(900 + variant * 71);
  const cols = ['#a89a84', '#85735e', '#5f4b3a']; // pointes blanchies -> tronc sombre
  const root = new THREE.ConeGeometry(0.55, 0.7, 7, 1, true).translate(0, 0.35, 0);
  b.add(root, cols[2], { p: [0, -0.05, 0], s: [1, 1, 1] });
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + variant; b.add(ptube([V(Math.cos(a) * 0.15, 0.5, Math.sin(a) * 0.15), V(Math.cos(a) * 0.55, 0.15, Math.sin(a) * 0.55), V(Math.cos(a) * 1.0, -0.05, Math.sin(a) * 1.0)], 0.16, 0.05, 3, 4), cols[2]); }
  if (variant === 0) { // tronc fourchu, haut
    limb(b, rnd, V(0, 0.4, 0), V(0.12, 1, 0.05), 4.6, 0.3, 0, cols);
    limb(b, rnd, V(0.15, 3.4, 0.05), V(0.8, 1, 0.1), 3.0, 0.17, 2, cols);
    limb(b, rnd, V(0.1, 2.8, 0), V(-0.9, 0.8, 0.3), 2.8, 0.15, 2, cols);
    limb(b, rnd, V(0.2, 4.3, 0), V(-0.3, 1, -0.6), 2.0, 0.1, 1, cols);
  } else if (variant === 1) { // chicot brisé + une grosse branche pendante
    limb(b, rnd, V(0, 0.4, 0), V(-0.1, 1, 0.1), 3.2, 0.34, 0, cols, 0.05);
    b.add(new THREE.ConeGeometry(0.2, 0.7, 5).translate(0, 0.35, 0), cols[1], { p: [-0.18, 3.5, 0.2], r: [0.2, 0, 0.3] }); // cassure en esquilles
    limb(b, rnd, V(-0.1, 2.3, 0.1), V(1, 0.5, 0.2), 3.2, 0.2, 2, cols, -0.05);
    limb(b, rnd, V(-0.1, 1.5, 0), V(-1, 0.4, -0.5), 2.0, 0.13, 1, cols, -0.1);
  } else { // arbre penché, branche maîtresse horizontale
    limb(b, rnd, V(0, 0.4, 0), V(0.55, 1, 0), 4.2, 0.3, 1, cols, 0.1);
    limb(b, rnd, V(1.5, 2.6, 0), V(1, 0.45, 0.3), 3.4, 0.17, 2, cols, 0.12);
    limb(b, rnd, V(1.0, 2.0, 0), V(-0.5, 0.8, 0.9), 2.2, 0.12, 1, cols);
    limb(b, rnd, V(2.0, 3.6, 0), V(-0.2, 1, -0.7), 1.8, 0.1, 1, cols);
  }
  const geo = b.build(); geo.userData = { trunkR: 0.45 }; return geo;
}
export function joshuaGeometry(variant = 0) {
  const b = new Bits(300 + variant), rnd = mulberry(1300 + variant * 53);
  const bark = '#7a6040', bark2 = '#6a5236', leaf = ['#6a8a40', '#7a9a48', '#5f803c'][variant], dead = '#9a8460';
  const ros = (c, n, len) => {
    b.add(new THREE.ConeGeometry(0.3, 0.6, 6, 1, true).translate(0, -0.3, 0), dead, { p: [c.x, c.y, c.z], jit: 0.14 }); // jupe de feuilles mortes
    for (let i = 0; i < n; i++) { const az = i * 2.399 + rnd(), lean = 0.15 + (i / n) * 1.25 + rnd() * 0.2; const d = V(Math.sin(lean) * Math.cos(az), Math.cos(lean) * (i % 3 === 0 ? 0.6 : 1), Math.sin(lean) * Math.sin(az)); b.add(spike(0.05, len * (0.75 + rnd() * 0.45), 3), leaf, { p: [c.x, c.y, c.z], q: dirQ(d), grad: 0.9, jit: 0.12 }); }
  };
  const trunk = [[0, 0, 0], [0.12, 1.1, 0.05], [-0.05, 2.1, 0.1], [0.05, 2.8, 0]];
  b.add(ptube(trunk.map(p => V(...p)), 0.36, 0.26, 4, 7), bark, { jit: 0.12, grad: 0.3 });
  for (let i = 0; i < 4; i++) b.add(new THREE.CylinderGeometry(0.34 - i * 0.03, 0.36 - i * 0.03, 0.12, 7), bark2, { p: [0.1 * (i % 2), 0.6 + i * 0.6, 0.03] });
  const arms = [[[0.05, 2.7, 0], [0.8, 3.3, 0.2], [1.3, 4.1, 0.1]], [[0.0, 2.5, 0], [-0.9, 3.2, -0.3], [-1.2, 4.0, -0.5]], [[0.05, 2.8, 0], [0.2, 3.6, 0.8], [0.1, 4.5, 1.2]]].slice(0, [3, 2, 3][variant]);
  if (variant === 1) arms.push([[0.0, 2.9, 0], [0.3, 3.9, -0.2], [0.55, 5.0, -0.1]]);
  arms.forEach((a, i) => { const pts = a.map(p => V(...p)); b.add(ptube(pts, 0.2, 0.13, 4, 6), bark, { jit: 0.1 }); ros(pts[2].clone().add(V(0, 0.15, 0)), 17, 1.7); if (i === 0 && variant !== 2) { const q = pts[1].clone().add(V(0.5, 0.7, 0.2)); b.add(ptube([pts[1], q], 0.1, 0.07, 2, 5), bark); ros(q.add(V(0, 0.1, 0)), 13, 1.3); } });
  ros(V(0.05, 2.95, 0), 13, 1.3);
  const geo = b.build(); geo.userData = { trunkR: 0.4 }; return geo;
}

// ------------------------------------------------------------------ CACTUS
function ribbed(r, h, ribs = 6, hs = 3, k = 0.1) {
  const g = new THREE.CylinderGeometry(r * 0.92, r, h, ribs * 2, hs, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), f = 1 + k * Math.cos(a * ribs); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
  return g.translate(0, h / 2, 0);
}
const dome = (r, ribs = 6, k = 0.1) => { const g = new THREE.SphereGeometry(r, ribs * 2, 4, 0, PI * 2, 0, H), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), f = 1 + k * Math.cos(a * ribs) * (1 - p.getY(i) / r); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); } return g; };
export function saguaroGeometry(variant = 0) {
  const b = new Bits(400 + variant), rnd = mulberry(1700 + variant * 31);
  const col = ['#3f7a3a', '#4a8a40', '#3a7040'][variant], top = '#5f9f50';
  const h = [5.2, 3.6, 6.2][variant], r = [0.42, 0.5, 0.38][variant];
  b.add(ribbed(r, h), col, { jit: 0.1, grad: 0.35 }); b.add(dome(r * 0.97), top, { p: [0, h, 0] });
  const arm = (y, az, out, rise, rr) => {
    const dx = Math.cos(az), dz = Math.sin(az), pts = [[dx * (r - 0.05), y, dz * (r - 0.05)], [dx * (r + out * 0.7), y + 0.05, dz * (r + out * 0.7)], [dx * (r + out), y + 0.6, dz * (r + out)], [dx * (r + out), y + rise, dz * (r + out)]].map(p => V(...p));
    b.add(ptube(pts, rr * 1.05, rr * 0.9, 5, 7), col, { jit: 0.1, grad: 0.3 }); b.add(dome(rr * 0.9, 5, 0.06), top, { p: [pts[3].x, pts[3].y, pts[3].z] });
    if (rise > 1.6 && rnd() < 0.6) { b.add(blob(0.1, 0, 1, 0.2), '#f4efe0', { p: [pts[3].x, pts[3].y + rr * 0.9, pts[3].z] }); }
  };
  if (variant === 0) { arm(h * 0.45, 0, 0.95, 1.8, 0.27); arm(h * 0.6, PI + 0.4, 0.85, 1.4, 0.24); }
  if (variant === 1) { arm(h * 0.4, 0.3, 0.9, 1.0, 0.3); arm(h * 0.55, 2.2, 0.8, 1.2, 0.27); arm(h * 0.5, 4.2, 0.9, 0.8, 0.25); }
  if (variant === 2) { arm(h * 0.35, 1.0, 1.0, 2.6, 0.26); arm(h * 0.5, 1.0 + PI, 1.0, 2.2, 0.25); arm(h * 0.7, 1.0 + PI * 0.5, 0.7, 1.0, 0.2); }
  b.add(blob(0.13, 0, 5, 0.2, 1, 0.7, 1), rnd() < 0.5 ? '#f4efe0' : '#e0d060', { p: [0, h + 0.38, 0] }); // fleur au sommet
  const geo = b.build(); geo.userData = { trunkR: r + 0.15 }; return geo;
}
export function pricklyPearGeometry(variant = 0) {
  const b = new Bits(500 + variant), rnd = mulberry(2100 + variant * 11);
  const pad = (p, rz, ry, sc, c) => { b.add(blob(0.55, rnd() < 0 ? 1 : 0, rnd() * 99, 0.08, 1, 1.25, 0.2), c, { p, r: [0, ry, rz], s: [sc, sc, sc * 1.6], jit: 0.08, grad: 0.3 }); b.add(blob(0.07, 0, 1, 0.1), '#c0306a', { p: [p[0] + Math.sin(rz) * -0.5 * sc, p[1] + 0.55 * sc, p[2] + 0.12] }); };
  const c1 = '#5a8f4a', c2 = '#6aa05a', c3 = '#4f8040';
  pad([0, 0.55, 0], 0.05, 0, 1.0, c1);
  pad([-0.35, 1.25, 0.05], 0.5, 0.2, 0.85, c2); pad([0.38, 1.25, -0.05], -0.45, -0.2, 0.9, c3);
  if (variant > 0) pad([0.85, 0.75, 0.1], -1.1, 0.4, 0.75, c2);
  if (variant === 2) pad([-0.8, 0.7, -0.1], 1.1, -0.3, 0.7, c3);
  if (variant > 0) { pad([-0.65, 1.95, 0.1], 0.3, 0.1, 0.65, c2); pad([0.7, 1.95, -0.05], -0.35, 0.3, 0.6, c1); }
  const geo = b.build(); geo.userData = { trunkR: 0.8 }; return geo;
}
export function barrelCactusGeometry(variant = 0) {
  const b = new Bits(600 + variant), rnd = mulberry(2300 + variant);
  const g = new THREE.SphereGeometry(0.6, 14, 5), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), f = 1 + 0.1 * Math.cos(a * 7); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
  b.add(g, ['#5f9a4a', '#6aa050', '#4f8a40'][variant], { p: [0, 0.55, 0], s: [1, 0.95 + variant * 0.25, 1], jit: 0.1, grad: 0.4 });
  for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; b.add(blob(0.09, 0, i, 0.2, 1, 0.6, 1), ['#ffcf3a', '#ff8a3a', '#ffe070'][variant], { p: [Math.cos(a) * 0.2, 1.1 + variant * 0.25, Math.sin(a) * 0.2] }); }
  b.add(blob(0.12, 0, 9, 0.2), '#ffe9a0', { p: [0, 1.15 + variant * 0.25, 0] });
  const geo = b.build(); geo.userData = { trunkR: 0.65 }; return geo;
}

// ------------------------------------------------------------------ BUISSONS ET HERBES SÈCHES
export function sageGeometry(variant = 0) {
  const b = new Bits(700 + variant), rnd = mulberry(2500 + variant * 19);
  if (variant < 2) { // armoise : agrégat de touffes gris-vert
    const pal = variant ? ['#7a8a66', '#8e9a74', '#6a7a58'] : ['#8a9470', '#a0a67a', '#76845f', '#9aa070'];
    for (let i = 0; i < 4; i++) { const a = rnd() * 6.28, d = rnd() * 0.55; b.add(blob(0.45 + rnd() * 0.3, 1, i + variant * 7, 0.3, 1.1, 0.8, 1.1), pickC(rnd, pal), { p: [Math.cos(a) * d, 0.3 + rnd() * 0.25, Math.sin(a) * d], grad: 0.5, jit: 0.1 }); }
    for (let i = 0; i < 5; i++) { const a = rnd() * 6.28, d = rnd() * 0.5; b.add(spike(0.025, 0.7, 3), '#b8a070', { p: [Math.cos(a) * d, 0.35, Math.sin(a) * d], r: [(rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6] }); }
  } else { // buisson épineux sec : branchettes enchevêtrées
    for (let i = 0; i < 22; i++) { const az = rnd() * 6.28, lean = 0.2 + rnd() * 1.0; b.add(spike(0.03, 0.8 + rnd() * 0.7, 3), pickC(rnd, ['#8a6a3a', '#a08050', '#6a4e2c']), { p: [0, 0.05, 0], q: dirQ(V(Math.sin(lean) * Math.cos(az), Math.cos(lean), Math.sin(lean) * Math.sin(az))), jit: 0.1 }); }
    for (let i = 0; i < 4; i++) b.add(blob(0.14, 0, i, 0.3), '#7a8a40', { p: [(rnd() - 0.5) * 0.8, 0.35 + rnd() * 0.4, (rnd() - 0.5) * 0.8] });
  }
  return b.build();
}
export function snowShrubGeometry(variant = 0) {
  const b = new Bits(750 + variant), rnd = mulberry(2600 + variant);
  for (let i = 0; i < 16; i++) { const az = rnd() * 6.28, lean = 0.25 + rnd() * 0.8; b.add(spike(0.025, 0.9 + rnd() * 0.5, 3), pickC(rnd, ['#5a3a2a', '#7a4a38', '#4a3028']), { p: [0, 0.05, 0], q: dirQ(V(Math.sin(lean) * Math.cos(az), Math.cos(lean), Math.sin(lean) * Math.sin(az))) }); }
  b.add(blob(0.55, 1, 3 + variant, 0.25, 1.3, 0.55, 1.2), '#f4fbff', { p: [0, 0.38, 0], paint: (x, y, z, ny) => ny > 0.3 ? '#f6fcff' : '#cfe0ea' });
  b.add(blob(0.3, 0, 5, 0.3, 1.2, 0.6, 1), '#e8f4fb', { p: [0.4, 0.28, 0.2] });
  for (let i = 0; i < 5; i++) { const a = rnd() * 6.28, d = 0.2 + rnd() * 0.4; b.add(blob(0.06, 0, i, 0.1), variant ? '#d03a4a' : '#3a5a9a', { p: [Math.cos(a) * d, 0.55 + rnd() * 0.15, Math.sin(a) * d] }); }
  return b.build();
}
// Touffe d'herbe : lames courbes dégradées (3 triangles / lame)
export function grassTuftGeometry(baseC, tipC, h = 0.9, n = 9, seed = 1, seedHeads = false) {
  const rnd = mulberry(seed * 313 + 7), pos = [], col = [], c0 = new THREE.Color(baseC), c1 = new THREE.Color(tipC), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const az = rnd() * 6.28, ox = (rnd() - 0.5) * 0.3, oz = (rnd() - 0.5) * 0.3, ch = h * (0.55 + rnd() * 0.55), w = 0.045 + rnd() * 0.03, bend = 0.12 + rnd() * 0.35, ca = Math.cos(az), sa = Math.sin(az);
    const P = (u, v, k) => { const y = ch * k, o = bend * k * k * ch; pos.push(ox + ca * u + sa * o * 0 + Math.cos(az + H) * 0 + Math.sin(az) * o * 0 + (-sa) * 0 + ca * o, y, oz + sa * u + sa * o); c.copy(c0).lerp(c1, k); const f = 0.85 + rnd() * 0.3; col.push(c.r * f, c.g * f, c.b * f); };
    // lame : base (2 sommets), milieu (2), pointe (1)
    const hw = w / 2, ww = w * 0.7 / 2;
    P(-hw, 0, 0); P(hw, 0, 0); P(-ww, 0, 0.55); P(hw, 0, 0); P(ww, 0, 0.55); P(-ww, 0, 0.55); P(-ww, 0, 0.55); P(ww, 0, 0.55); P(0, 0, 1);
    if (seedHeads && i % 3 === 0) { const k = 1; P(-0.02, 0, k); P(0.02, 0, k); P(0, 0, k + 0.12); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
export function flowerPatchGeometry(petal, seed = 1) {
  const b = new Bits(800 + seed), rnd = mulberry(seed * 41);
  for (let i = 0; i < 7; i++) { const x = (rnd() - 0.5) * 0.7, z = (rnd() - 0.5) * 0.7, hh = 0.35 + rnd() * 0.3; b.add(spike(0.012, hh, 3), '#5a7a3a', { p: [x, 0, z], r: [(rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4] }); b.add(blob(0.07, 0, i, 0.2, 1, 0.6, 1), Array.isArray(petal) ? petal[i % petal.length] : petal, { p: [x, hh, z] }); }
  for (let i = 0; i < 3; i++) b.add(blob(0.16, 0, i, 0.3, 1.2, 0.5, 1), '#5a7f3a', { p: [(rnd() - 0.5) * 0.5, 0.06, (rnd() - 0.5) * 0.5] });
  return b.build();
}

// ------------------------------------------------------------------ ROCHERS
// Rocher stratifié : profil à replats/ledges, bandes de couleur. style : 'strata' (désert), 'snow', 'moss'
export function rockShapeGeometry(seed = 1, style = 'strata', colored = true) {
  const rnd = mulberry(seed * 131 + 5), hs = 6, rs = 9;
  const g = new THREE.CylinderGeometry(0.62, 1.0, 1.4, rs, hs, false), p = g.attributes.position;
  const ph = rnd() * 6, lay = 2 + rnd() * 1.5;
  const ring = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (y + 0.7) / 1.4, a = Math.atan2(z, x);
    const key = Math.round(a * 100) + ':' + Math.round(y * 100);
    if (!ring.has(key)) ring.set(key, 0.8 + rnd() * 0.4);
    const ledge = (Math.round(t * hs) % 2) ? 0.9 : 1.04;
    const body = Math.sqrt(Math.max(0.0, 1 - Math.pow(t * 2 - 1, 4)) * 0.3 + 0.7); // ventre arrondi
    const top = y > 0.69 ? 0.85 : 1;
    const f = ring.get(key) * ledge * (0.82 + 0.18 * body) * top * (1 + 0.12 * Math.sin(a * 2 + ph));
    p.setXYZ(i, x * f * 1.25, y * (0.85 + 0.15 * Math.sin(a * 3 + ph)) + (y > 0.69 ? (rnd() - 0.5) * 0.12 : 0), z * f);
  }
  g.computeVertexNormals();
  if (!colored) { const n = g.toNonIndexed(); n.computeVertexNormals(); n.deleteAttribute('uv'); return n; }
  const b = new Bits(seed + 900);
  const pal = style === 'strata' ? ['#a0583a', '#b8693f', '#8c4a30', '#c98a5a', '#9a5a3c'] : style === 'moss' ? ['#7a7a70', '#8a8a7c', '#6a6a60'] : ['#7f93a4', '#8aa0b2', '#6e8294'];
  b.add(g, '#fff', { jit: 0.06, paint: (x, y, z, ny, t) => { if (style === 'snow') return ny > 0.45 ? '#f6fcff' : pal[Math.floor(t * 4) % pal.length]; if (style === 'moss') return ny > 0.5 ? '#5f7a3a' : pal[Math.floor(t * 4) % pal.length]; return pal[Math.floor(t * 5) % pal.length]; } });
  return b.build();
}
// Butte / mesa : tour stratifiée à sommet plat, talus à la base
export function mesaGeometry(seed = 1) {
  const rnd = mulberry(seed * 71 + 3), hs = 10, rs = 12;
  const g = new THREE.CylinderGeometry(0.8, 1.35, 10, rs, hs, false), p = g.attributes.position, ring = new Map(); const WID = 2.3;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (y + 5) / 10, a = Math.atan2(z, x), key = Math.round(a * 100) + ':' + Math.round(y * 100);
    if (!ring.has(key)) ring.set(key, 0.85 + rnd() * 0.3);
    const step = (Math.round(t * 10) % 2) ? 0.9 : 1.0, talus = 1 + Math.max(0, 0.45 - t * 1.4);
    const f = ring.get(key) * step * talus * (1 + 0.1 * Math.sin(a * 3 + seed));
    p.setXYZ(i, x * f * WID, y, z * f * 0.85 * WID);
  }
  g.computeVertexNormals();
  const b = new Bits(seed + 950), pal = ['#9a4a30', '#b8693f', '#d08a5a', '#c47a4a', '#8a3f2a', '#dcae78'];
  b.add(g, '#fff', { jit: 0.07, paint: (x, y, z, ny, t) => ny > 0.8 ? '#b89a68' : pal[Math.floor(t * 9) % pal.length] });
  return b.build();
}
// Compatibilité decor.js : géométrie nue (sans couleurs de sommets) centrée à l'origine
export function rockGeometry(seed = 1) { return rockShapeGeometry(seed, 'strata', false); }

// Cristaux de glace (Gelure) : amas de prismes pointus
export function iceCrystalGeometry(seed = 1) {
  const rnd = mulberry(seed * 59 + 2), geos = [];
  const mk = (r, h, lean, az, ox, oz) => { const g = new THREE.LatheGeometry([[0, 0], [r, 0], [r * 1.05, h * 0.65], [0, h]].map(([x, y]) => new THREE.Vector2(x, y)), 6); g.rotateX(lean * Math.cos(az)); g.rotateZ(lean * Math.sin(az)); g.translate(ox, 0, oz); return g.toNonIndexed(); };
  geos.push(mk(1.1, 7 + rnd() * 2, 0.08, rnd() * 6, 0, 0));
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + rnd(); geos.push(mk(0.4 + rnd() * 0.4, 2.5 + rnd() * 3, 0.3 + rnd() * 0.4, a, Math.cos(a) * 1.0, Math.sin(a) * 1.0)); }
  for (const g of geos) { g.deleteAttribute('uv'); g.computeVertexNormals(); }
  return mergeGeometries(geos, false);
}

// ------------------------------------------------------------------ GELURE : conifères et bouleaux
function boughTier(b, rnd, y, r, h, green, snow, seg = 11) {
  const g = new THREE.ConeGeometry(r, h, seg, 1, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { const f = 0.82 + rnd() * 0.3, a = Math.atan2(p.getZ(i), p.getX(i)); p.setXYZ(i, p.getX(i) * f, p.getY(i) - 0.15 - 0.2 * Math.abs(Math.sin(a * 3)) * r * 0.2, p.getZ(i) * f); }
  b.add(g, green, { p: [0, y, 0], r: [0, rnd() * 6, 0], jit: 0.09, grad: 0.35 });
  const sn = new THREE.ConeGeometry(r * 0.78, h * 0.62, seg, 1, true), sp = sn.attributes.position;
  for (let i = 0; i < sp.count; i++) if (sp.getY(i) < 0) { const f = 0.8 + rnd() * 0.35; sp.setX(i, sp.getX(i) * f); sp.setZ(i, sp.getZ(i) * f); }
  b.add(sn, snow, { p: [0, y + h * 0.2 + 0.03, 0], r: [0, rnd() * 6, 0], jit: 0.04 });
}
export function pineGeometry(variant = 0) {
  const b = new Bits(1000 + variant), rnd = mulberry(3000 + variant * 17);
  const greens = ['#2f4b3a', '#264338', '#355a45', '#2a4a40'], snow = '#f4fbff', bark = '#4a3626';
  let crownR = 2.4, top = 10;
  if (variant === 0) { // sapin classique à étages
    b.add(new THREE.CylinderGeometry(0.2, 0.34, 3.5, 7), bark, { p: [0, 1.75, 0] });
    for (let i = 0; i < 7; i++) boughTier(b, rnd, 2.2 + i * 1.25, 2.5 - i * 0.3, 2.3, pickC(rnd, greens), snow);
    b.add(spike(0.3, 1.4, 6), '#2f4b3a', { p: [0, 10.6, 0] }); b.add(blob(0.3, 0, 3, 0.2, 1, 0.6, 1), snow, { p: [0, 10.9, 0] }); crownR = 2.5; top = 12;
  } else if (variant === 1) { // épicéa fin et élancé, branches tombantes
    b.add(new THREE.CylinderGeometry(0.16, 0.28, 4, 7), bark, { p: [0, 2, 0] });
    for (let i = 0; i < 10; i++) boughTier(b, rnd, 2.8 + i * 1.05, 1.75 - i * 0.14, 2.0, pickC(rnd, greens), snow, 9);
    b.add(spike(0.18, 1.6, 5), '#264338', { p: [0, 12.8, 0] }); crownR = 1.8; top = 14;
  } else { // pin sylvestre : haut tronc roux, couronnes en plateaux
    b.add(ptube([[0, 0, 0], [0.3, 3, 0.1], [-0.1, 6, 0.2], [0.2, 8, 0]].map(p => V(...p)), 0.34, 0.16, 5, 7), '#7a4a32', { jit: 0.1, grad: 0.3 });
    const tops = [[0.25, 8.2, 0, 2.4], [-1.4, 6.8, 0.8, 1.9], [1.5, 6.2, -0.7, 1.8], [0.2, 9.4, 0.3, 1.5]];
    tops.forEach(([x, y, z, r], k) => { b.add(blob(r, 1, k + 3, 0.28, 1.3, 0.42, 1.3), pickC(rnd, greens), { p: [x, y, z], grad: 0.4 }); b.add(blob(r * 0.85, 0, k + 9, 0.25, 1.25, 0.28, 1.25), snow, { p: [x, y + r * 0.22, z], jit: 0.03 }); });
    for (const [x, y, z] of [[1.0, 5.2, 0], [-0.4, 6.0, 0.6]]) b.add(ptube([V(0.1, y - 0.8, 0), V(x, y, z)], 0.09, 0.05, 2, 4), '#7a4a32');
    crownR = 3; top = 10.4;
  }
  const geo = b.build(); geo.userData = { trunkR: 0.4, crownR, crownBottom: variant === 2 ? 5 : 3, top }; return geo;
}
export function birchGeometry(variant = 0) {
  const b = new Bits(1100 + variant), rnd = mulberry(3500 + variant * 29);
  const tr = [[0, 0, 0], [0.1 * (variant - 1), 2.2, 0.1], [-0.12, 4.4, -0.05], [0.1 * variant, 6.2, 0.05]].map(p => V(...p));
  b.add(ptube(tr, 0.2, 0.08, 5, 5), '#ece8de', { jit: 0.05, grad: 0.1 });
  for (let i = 0; i < 6; i++) { const y = 0.5 + i * 0.9, at = tr[Math.min(3, Math.floor(y / 2.1))]; b.add(new THREE.BoxGeometry(0.1 + rnd() * 0.12, 0.05, 0.06), '#2a2a2e', { p: [at.x + (rnd() - 0.5) * 0.06, y, at.z + 0.17 - y * 0.012], r: [0, rnd() * 6, 0] }); }
  const frost = ['#dff3ff', '#bfe3f5', '#f4fbff', '#cfeaf7'], nb = 5 + (variant > 0 ? 1 : 0);
  for (let i = 0; i < nb; i++) {
    const a = i * 2.4 + rnd(), y = 3.0 + i * 0.55 + rnd() * 0.3, from = V(tr[Math.min(3, Math.floor(y / 2.1))].x, y, 0), len = 1.4 + rnd() * 1.0;
    const end = from.clone().add(V(Math.cos(a) * len, 0.9 + rnd() * 0.9, Math.sin(a) * len));
    b.add(ptube([from, lerpV(from, end, 0.5).add(V(0, 0.15, 0)), end], 0.06, 0.02, 3, 4), '#d8d2c4');
    for (let k = 0; k < 2; k++) b.add(blob(0.75 + rnd() * 0.45, 0, i * 5 + k, 0.3, 1.2, 0.6, 1.2), pickC(rnd, frost), { p: [end.x + (rnd() - 0.5) * 0.9, end.y + (rnd() - 0.5) * 0.5, end.z + (rnd() - 0.5) * 0.9], grad: 0.3, jit: 0.04 });
    for (let k = 0; k < 1; k++) b.add(spike(0.03, 0.4 + rnd() * 0.4, 3), '#cfefff', { p: [end.x + (rnd() - 0.5) * 0.6, end.y - 0.3, end.z + (rnd() - 0.5) * 0.6], r: [PI, 0, 0] }); // stalactites de givre
  }
  b.add(blob(0.8, 1, 4, 0.3, 1.2, 0.7, 1.2), '#dff3ff', { p: [tr[3].x, 6.6, tr[3].z], grad: 0.3, jit: 0.04 });
  const geo = b.build(); geo.userData = { trunkR: 0.3, crownR: 2.4, crownBottom: 3.4, top: 7.4 }; return geo;
}

// ------------------------------------------------------------------ FOIN
export function hayBaleGeometry(type = 0, seed = 1) {
  const b = new Bits(1200 + seed + type * 5), rnd = mulberry(seed * 7 + type);
  const straw = ['#d9b45a', '#e2c070', '#c8a04a', '#d0ac55'], twine = '#6a4a2a';
  if (type === 0) { // botte carrée en lits de paille
    for (let i = 0; i < 5; i++) b.add(new THREE.BoxGeometry(1.6 + (rnd() - 0.5) * 0.08, 0.17, 1.0 + (rnd() - 0.5) * 0.06), pickC(rnd, straw), { p: [(rnd() - 0.5) * 0.04, -0.34 + i * 0.17, (rnd() - 0.5) * 0.04], jit: 0.08 });
    for (const x of [-0.4, 0.4]) { b.add(new THREE.BoxGeometry(0.035, 0.9, 1.04), twine, { p: [x, 0, 0] }); b.add(new THREE.BoxGeometry(0.04, 0.94, 0.5), twine, { p: [x, 0, 0] }); }
    for (let i = 0; i < 16; i++) { const side = rnd() < 0.5 ? -1 : 1; b.add(spike(0.02, 0.28 + rnd() * 0.2, 3), pickC(rnd, straw), { p: [side * 0.8, -0.4 + rnd() * 0.8, (rnd() - 0.5) * 0.9], r: [(rnd() - 0.5) * 0.6, 0, -side * (1.2 + rnd() * 0.5)] }); }
  } else { // botte ronde enrubannée
    const g = new THREE.CylinderGeometry(0.68, 0.68, 1.15, 12, 1, false).rotateZ(H);
    b.add(g, '#d9b45a', { jit: 0.1, paint: (x, y, z, ny, t) => pickC(rnd, straw) });
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) b.add(new THREE.TorusGeometry(0.1 + i * 0.15, 0.012, 3, 12), i % 2 ? '#b8903f' : '#e8cc80', { p: [s * 0.585, 0, 0], r: [0, H, 0] });
    for (const x of [-0.3, 0.3]) b.add(new THREE.CylinderGeometry(0.7, 0.7, 0.04, 12, 1, true).rotateZ(H), twine, { p: [x, 0, 0] });
    for (let i = 0; i < 12; i++) b.add(spike(0.02, 0.22 + rnd() * 0.2, 3), pickC(rnd, straw), { p: [(rnd() - 0.5) * 1.1, 0.64, (rnd() - 0.5) * 0.5], r: [(rnd() - 0.5) * 1.5, 0, (rnd() - 0.5) * 1.5] });
  }
  return b.build();
}
export function strawWispsGeometry(n = 10, seed = 1) {
  const b = new Bits(1300 + seed), rnd = mulberry(seed * 23);
  for (let i = 0; i < n; i++) { const a = rnd() * 6.28, d = 1.1 + rnd() * 0.9; b.add(spike(0.018, 0.35 + rnd() * 0.3, 3), '#e8cc80', { p: [Math.cos(a) * d, (rnd() - 0.5) * 1.4, Math.sin(a) * d], r: [rnd() * 3, rnd() * 3, rnd() * 3] }); }
  return b.build();
}

// ------------------------------------------------------------------ ANIMAUX
export function hareGeometry(kind = 0) { // 0 : lièvre brun du désert, 1 : lapin des neiges
  const b = new Bits(1400 + kind), snow = kind === 1;
  const fur = snow ? '#f4f6f8' : '#a68663', dark = snow ? '#8a909a' : '#6a4e36', belly = snow ? '#e6ebf0' : '#d8c4a0';
  const sc = snow ? 0.85 : 1, earL = snow ? 0.18 : 0.4;
  const paint = (x, y, z, ny) => ny < -0.35 ? belly : fur;
  b.add(blob(0.22, 1, 1, 0.05, 0.95, 0.85, 1.55), fur, { p: [0, 0.27, 0], paint, grad: 0.2 });
  b.add(blob(0.2, 1, 2, 0.05, 0.9, 1.0, 1.15), fur, { p: [0, 0.3, -0.22], paint }); // arrière-train
  for (const s of [-1, 1]) {
    b.add(blob(0.13, 0, 3, 0.1, 0.7, 1.0, 1.4), fur, { p: [s * 0.14, 0.2, -0.24] });  // cuisse
    b.add(blob(0.05, 0, 4, 0.1, 0.8, 0.6, 2.8), dark, { p: [s * 0.14, 0.04, -0.3] });  // pied arrière
    b.add(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 5), fur, { p: [s * 0.08, 0.12, 0.2] }); // patte avant
    b.add(blob(0.1, 1, 5, 0.1, 0.55, 0.5, 1.2), fur, { p: [s * 0.065, 0.34 + (snow ? 0 : 0.06), 0.48], r: [-0.25, 0, 0] }); // joues
    b.add(blob(0.028, 0, 6, 0.1), '#14100c', { p: [s * 0.1, 0.4 + (snow ? 0 : 0.06), 0.5] }); // oeil
    const ex = s * 0.065; // oreille longue, bout sombre
    b.add(blob(0.065, 1, 7, 0.06, 0.55, earL / 0.065 * 0.5, 0.2), fur, { p: [ex, 0.52 + (snow ? 0 : 0.06) + earL * 0.42, 0.36], r: [-0.3, 0, s * 0.15] });
    b.add(blob(0.04, 0, 8, 0.05, 0.55, earL / 0.04 * 0.14, 0.2), dark, { p: [ex + s * 0.01, 0.52 + (snow ? 0 : 0.06) + earL * 0.82, 0.3], r: [-0.3, 0, s * 0.15] });
  }
  b.add(blob(0.14, 1, 9, 0.05, 0.9, 0.9, 1.2), fur, { p: [0, 0.38 + (snow ? 0 : 0.06), 0.4], paint });
  b.add(blob(0.04, 0, 10, 0.1), '#d88a90', { p: [0, 0.37 + (snow ? 0 : 0.06), 0.62] });
  b.add(blob(0.08, 1, 11, 0.1), '#fbf8f0', { p: [0, 0.3, -0.5] }); // queue pompon
  const geo = b.build(); geo.scale(sc, sc, sc); return geo;
}
export function butterflyGeometry() { // aile droite (+x) ; le corps est dans la même géométrie
  const sh = new THREE.Shape(); sh.moveTo(0, 0.03); sh.bezierCurveTo(0.06, 0.2, 0.24, 0.26, 0.3, 0.16); sh.bezierCurveTo(0.34, 0.08, 0.2, 0.02, 0.14, 0); sh.bezierCurveTo(0.26, -0.04, 0.26, -0.2, 0.16, -0.2); sh.bezierCurveTo(0.08, -0.2, 0.02, -0.1, 0, -0.04); sh.closePath();
  const g = new THREE.ShapeGeometry(sh, 3); g.rotateX(H);
  const b = new Bits(1500);
  b.add(g, '#fff', { jit: 0.03, paint: (x, y, z) => { const d = Math.hypot(x - 0.17, z - 0.02); return d < 0.07 ? '#ffffff' : d < 0.14 ? '#e8e8e8' : '#4a4a4a'; } });
  b.add(new THREE.CapsuleGeometry(0.018, 0.14, 2, 5).rotateX(H), '#2a2018', { p: [0, 0, 0] });
  return b.build();
}

// ------------------------------------------------------------------ OISEAUX
// Retourne { body, wing } : wing = aile droite (+x), à retourner (scale.x=-1) pour la gauche. Le corps regarde +z.
export function birdParts({ plume = '#2a2420', head = '#c96a5a', belly = null, tip = null, beak = '#d8c8a0', span = 2.8, size = 1, hooked = true } = {}) {
  const b = new Bits(1600 + span * 10), s = size;
  belly = belly || plume; tip = tip || plume;
  b.add(blob(0.3 * s, 1, 1, 0.04, 0.85, 0.8, 1.9), plume, { paint: (x, y, z, ny) => ny < -0.2 ? belly : plume });
  b.add(new THREE.CylinderGeometry(0.07 * s, 0.14 * s, 0.4 * s, 6).rotateX(H * 0.8), head === plume ? plume : '#efe8da', { p: [0, 0.05 * s, 0.55 * s] }); // cou (collerette claire)
  b.add(blob(0.15 * s, 1, 2, 0.05, 0.9, 0.9, 1.15), head, { p: [0, 0.1 * s, 0.82 * s] });
  b.add(new THREE.ConeGeometry(0.06 * s, 0.26 * s, 5).rotateX(H), beak, { p: [0, 0.07 * s, 1.03 * s] });
  if (hooked) b.add(new THREE.ConeGeometry(0.035 * s, 0.1 * s, 4).rotateX(PI), beak, { p: [0, 0.0, 1.14 * s] });
  const tail = new THREE.BufferGeometry(); tail.setAttribute('position', new THREE.Float32BufferAttribute([-0.12, 0, -0.5, 0.12, 0, -0.5, 0, 0.02, -0.95, 0.12, 0, -0.5, 0.26, 0, -0.95, 0, 0.02, -0.95, -0.12, 0, -0.5, 0, 0.02, -0.95, -0.26, 0, -0.95].map(v => v * s), 3));
  b.add(tail, tip, { jit: 0.05 });
  const k = span;
  const pts = [[0, 0.32], [0.5, 0.4], [0.95, 0.2], [1.0, -0.05], [0.9, -0.22], [0.93, -0.4], [0.76, -0.38], [0.78, -0.58], [0.58, -0.5], [0.3, -0.6], [0.08, -0.5], [0, -0.2]].map(([x, z]) => new THREE.Vector2(x * k * 0.5, z * s * 1.4));
  const sh = new THREE.Shape(pts); const wg = new THREE.ShapeGeometry(sh, 2); wg.rotateX(H);
  const wb = new Bits(1650 + k);
  wb.add(wg, plume, { jit: 0.05, paint: (x, y, z) => { const t = Math.min(1, Math.abs(x) / (k * 0.5)); const c = new THREE.Color(plume); return c.lerp(new THREE.Color(tip), Math.max(0, t * 1.2 - 0.4)); } });
  return { body: b.build(), wing: wb.build() };
}
export function frozenBirdGeometry(plume, wingPose, span = 1.3) {
  const { body, wing } = birdParts({ plume, head: plume, belly: '#f0ece4', tip: '#222228', span, size: 0.7, hooked: false, beak: '#e0a030' });
  const out = [body.clone()];
  for (const sgn of [-1, 1]) { const w = wing.clone(); const m = new THREE.Matrix4().compose(V(sgn * 0.12, 0.05, 0.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sgn * wingPose)), V(sgn, 1, 1)); w.applyMatrix4(m); if (sgn < 0) { const idx = w.index; /* miroir : inverse l'ordre pour garder la face */ const p = w.attributes.position; for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); const c = w.attributes.color; const r = c.getX(i + 1), g2 = c.getY(i + 1), b2 = c.getZ(i + 1); c.setXYZ(i + 1, c.getX(i + 2), c.getY(i + 2), c.getZ(i + 2)); c.setXYZ(i + 2, r, g2, b2); } void idx; } out.push(w); }
  const strip = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'color', 'normal'].includes(k)) g.deleteAttribute(k); return g; };
  const g = mergeGeometries(out.map(o => { const q = strip(o); if (!q.attributes.normal) q.computeVertexNormals(); return q; }), false); g.computeBoundingSphere(); return g;
}
