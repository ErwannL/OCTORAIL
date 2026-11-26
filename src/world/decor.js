import * as THREE from 'three';
import { Kit, G, mat, MAT, glow } from './kit.js';
import { sectorIndex } from './biomes.js';
import { mulberry } from '../util/noise.js';
import { COLLIDERS } from './colliders.js';
import { textSprite } from './tracks.js';
import { TSUNAMI_ZONE } from './tsunami.js';
import { rockShapeGeometry } from './flora.js';
import { goodSpot, flatEnough, overlapsSolid } from './placement.js';

const PI = Math.PI, H = PI / 2;

// Texture de détail du sol (grain, cailloux) — multipliée par les couleurs de biome
export function groundDetailTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const img = g.createImageData(S, S); const r = mulberry(5);
  for (let i = 0; i < S * S; i++) { const v = 215 + r() * 40; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`; g.beginPath(); g.ellipse(r() * S, r() * S, 1 + r() * 4, 1 + r() * 3, r() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.1})`; g.fillRect(r() * S, r() * S, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(260, 260); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Rocher irrégulier (déformé) réutilisable
export function rockGeometry(seed = 1, detail = 1) { return rockShapeGeometry(seed, 'strata', false); } // rocher stratifié (flora.js)

// ------------------------------------------------------------------ Outils communs (décors des mondes)
const _bq = new THREE.Quaternion(), _be = new THREE.Euler(), _bu = new THREE.Vector3(0, 1, 0), _bv = new THREE.Vector3();
// Poutre orientée de a vers b (section w x d)
function beam(k, m, a, b, w = 0.1, d = w) {
  _bv.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _bv.length(); if (L < 1e-4) return;
  _bq.setFromUnitVectors(_bu, _bv.normalize()); _be.setFromQuaternion(_bq);
  k.add(G.box(w, L, d), m, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [_be.x, _be.y, _be.z] });
}
// Tube effilé (défenses, côtes, branches) : rayon r0 -> r1 le long d'une courbe
function taperTube(pts, r0, r1, seg = 12, rad = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const fr = curve.computeFrenetFrames(seg, false), pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const P = curve.getPointAt(i / seg), N = fr.normals[i], B = fr.binormals[i], r = r0 + (r1 - r0) * (i / seg);
    for (let j = 0; j < rad; j++) { const a = j / rad * PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r; pos.push(P.x + N.x * c + B.x * s, P.y + N.y * c + B.y * s, P.z + N.z * c + B.z * s); }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = i * rad + j, b = i * rad + (j + 1) % rad, c = a + rad, d = b + rad; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// Déformation déterministe des sommets (rochers, îles…) — mêmes sommets => même déplacement (pas de trous)
function jitter(geo, seed, amp = 0.2, sy = 1) {
  const r = mulberry(seed), p = geo.attributes.position, mp = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!mp.has(key)) mp.set(key, [(r() - 0.5) * amp, (r() - 0.5) * amp * sy, (r() - 0.5) * amp]);
    const o = mp.get(key); p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  geo.computeVertexNormals(); return geo;
}
const M4 = (x, y, z, ry = 0, s = [1, 1, 1], rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...s));
// InstancedMesh par matériau d'un Kit
function instKit(scene, kit, list, shadow = false) {
  for (const [m, geos] of kit.parts) {
    const inst = new THREE.InstancedMesh(mergeParts(geos), m, list.length); list.forEach((mm, i) => inst.setMatrixAt(i, mm));
    inst.castShadow = shadow && !m.transparent; inst.receiveShadow = true; scene.add(inst);
  }
}
function mergeParts(geos) { const k = new Kit(); k.parts.set('x', geos); return k.geometry(); }
// Animations lentes pilotées par l'horloge (indépendantes de main.js) : appelées juste avant chaque rendu de la scène
const _anims = new WeakMap();
function sceneAnim(scene, fn) {
  let l = _anims.get(scene);
  if (!l) { l = []; _anims.set(scene, l); const prev = scene.onBeforeRender; scene.onBeforeRender = function (...a) { prev.apply(this, a); const t = performance.now() / 1000; for (const f of l) f(t); }; }
  l.push(fn);
}

// ------------------------------------------------------------------ Poteaux télégraphiques + fils le long des voies (sensation de vitesse !)
export function buildTrackside(scene, net, terrain) {
  const wood = mat('#5a3a20', { roughness: 0.9 }), glass = mat('#7fd0e8', { roughness: 0.1, metalness: 0.2 }), ceramic = mat('#cfc6b4', { roughness: 0.4 }), stoneM = mat('#7a766e', { flatShading: true }), tag = mat('#d9d2c0', { roughness: 0.6 }), strap = mat('#2a2a2c', { metalness: 0.6, roughness: 0.5 });
  const pk = new Kit();
  pk.add(G.cyl(0.11, 0.17, 7.6, 8), wood, { p: [0, 3.8, 0] });
  pk.add(G.cyl(0.2, 0.26, 0.5, 8), stoneM, { p: [0, 0.2, 0] });
  pk.add(G.box(2.3, 0.16, 0.17), wood, { p: [0, 6.95, 0] }); pk.add(G.box(1.5, 0.14, 0.15), wood, { p: [0, 6.3, 0] });
  for (const sx of [-1, 1]) { beam(pk, wood, [sx * 0.15, 6.4, 0.0], [sx * 0.8, 6.9, 0.0], 0.07, 0.07); }
  for (let i = 0; i < 6; i++) pk.add(G.box(0.34, 0.05, 0.05), wood, { p: [i % 2 ? 0.12 : -0.12, 1.8 + i * 0.5, 0.12], r: [0, i % 2 ? 0.2 : -0.2, 0] });
  pk.add(G.box(0.2, 0.26, 0.03), tag, { p: [0, 3.2, 0.17] }); pk.add(G.box(0.3, 0.04, 0.2), strap, { p: [0, 3.2, 0] });
  for (const x of [-1.0, -0.4, 0.4, 1.0]) { pk.add(G.cyl(0.05, 0.075, 0.22, 7), glass, { p: [x, 7.12, 0] }); pk.add(G.cyl(0.095, 0.095, 0.05, 7), ceramic, { p: [x, 7.03, 0] }); }
  for (const x of [-0.6, 0.6]) { pk.add(G.cyl(0.05, 0.075, 0.2, 7), glass, { p: [x, 6.47, 0] }); pk.add(G.cyl(0.09, 0.09, 0.05, 7), ceramic, { p: [x, 6.38, 0] }); }
  const ik = new Kit(), snowM = mat('#f4fbff', { roughness: 0.7 }), iceM = mat('#cfefff', { roughness: 0.2, emissive: '#5ab0e0', emissiveIntensity: 0.2 });
  ik.add(G.box(2.4, 0.22, 0.34), snowM, { p: [0, 7.1, 0] }); ik.add(G.box(1.6, 0.18, 0.3), snowM, { p: [0, 6.4, 0] }); ik.add(G.cone(0.5, 0.9, 6), snowM, { p: [0, 0.35, 0], s: [1, 0.6, 1] });
  for (const x of [-1.05, -0.7, -0.2, 0.3, 0.7, 1.05]) ik.add(G.cone(0.05 + Math.abs(x % 0.1), 0.35 + Math.abs(x) * 0.35, 5), iceM, { p: [x, 6.7, 0.05], r: [PI, 0, 0] });
  for (const x of [-0.6, 0, 0.55]) ik.add(G.cone(0.05, 0.3, 5), iceM, { p: [x, 6.05, 0.05], r: [PI, 0, 0] });
  const posts = []; const wires = [];
  for (const e of net.edges) {
    if (e.kind === 'ring') continue;
    const every = 16; // échantillons (~32 m)
    let prev = null;
    for (let k = 10; k < e.pts.length - 6; k += every) {
      const a = e.pts[k - 1], b = e.pts[k + 1], p = e.pts[k];
      const nx = -(b.z - a.z), nz = b.x - a.x, L = Math.hypot(nx, nz) || 1;
      // le poteau se décale (6,5 / 8 / 4,2 m) s'il tombe au pied d'une pente ou d'une falaise, sinon il est sauté
      let x = 0, z = 0, ok = false;
      for (const off of [5.2, 6.5, 8, 4.2]) {
        x = p.x + nx / L * off; z = p.z + nz / L * off;
        if (Math.hypot(x, z) < 75 || TSUNAMI_ZONE.test(x, z, 6)) break;
        if (goodSpot(terrain, x, z, 0.7, 0.7) && !net.nearest(x, z, off - 1.5)) { ok = true; break; }
      }
      if (!ok) { prev = null; continue; }
      const y = terrain.heightAt(x, z);
      const ang = Math.atan2(b.x - a.x, b.z - a.z) + H;
      const sec = sectorIndex(x, z);
      posts.push({ x, y, z, ang, ice: sec === 5, lean: ((x * 7.13 + z * 3.7) % 1) * 0.04 - 0.02 }); COLLIDERS.circle(x, z, 0.22, 99, -99, false);
      const top = new THREE.Vector3(x, y + 7.12, z);
      if (prev) {
        for (const off of [-1.0, -0.4, 0.4, 1.0]) {
          const A = prev.top.clone().add(new THREE.Vector3(Math.cos(prev.ang) * off, 0, -Math.sin(prev.ang) * off));
          const B = top.clone().add(new THREE.Vector3(Math.cos(ang) * off, 0, -Math.sin(ang) * off));
          let last = A;
          for (let s = 1; s <= 5; s++) { const t = s / 5; const q = A.clone().lerp(B, t); q.y -= Math.sin(t * PI) * 1.0; wires.push(last.x, last.y, last.z, q.x, q.y, q.z); last = q; }
        }
      }
      prev = { top, ang };
    }
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), yAx = new THREE.Vector3(0, 1, 0);
  const all = [], icy = [];
  posts.forEach(p => { q.setFromAxisAngle(yAx, p.ang); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), p.lean)); m.compose(new THREE.Vector3(p.x, p.y, p.z), q, one); all.push(m.clone()); if (p.ice) icy.push(m.clone()); });
  instKit(scene, pk, all, true);
  if (icy.length) instKit(scene, ik, icy, false);
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2a2420', transparent: true, opacity: 0.7 })));
}

// ------------------------------------------------------------------ Western : éoliennes de ranch, épaves, squelettes, clôtures, virevoltants
function bisonSkeleton(k, bone, dark) {
  // longueur le long de +z ; origine au sol
  k.add(G.rbox(0.55, 0.45, 0.7, 0.1), bone, { p: [0, 0.8, 2.4], r: [0.25, 0, 0] });                 // crâne
  k.add(G.cone(0.2, 0.7, 5), bone, { p: [0, 0.62, 2.95], r: [H + 0.35, 0, 0], s: [1, 1, 0.8] });                                         // museau
  for (const sx of [-1, 1]) {
    k.add(taperTube([[sx * 0.4, 0.95, 2.4], [sx * 0.9, 1.0, 2.35], [sx * 1.15, 1.35, 2.5], [sx * 1.0, 1.7, 2.7]], 0.12, 0.025, 8, 5), bone);
    k.add(G.sph(0.11, 6, 5), dark, { p: [sx * 0.27, 0.82, 2.95] });                                 // orbites
  }
  // colonne
  for (let i = 0; i < 12; i++) { const z = 2.0 - i * 0.28, y = 0.85 + Math.sin(i / 11 * PI) * 0.28 - i * 0.015; k.add(G.box(0.14, 0.22, 0.2), bone, { p: [0, y, z] }); if (i < 8 && i > 0) k.add(G.box(0.05, 0.3, 0.06), bone, { p: [0, y + 0.22, z] }); }
  // côtes (arcs fins)
  for (let i = 0; i < 8; i++) { const z = 1.65 - i * 0.27, h = 0.85 + Math.sin(i / 7 * PI) * 0.25, rr = 0.55 + Math.sin(i / 7 * PI) * 0.3, tilt = (i - 3.5) * 0.04;
    for (const sx of [-1, 1]) { const pts = []; for (let a = 0; a <= 4; a++) { const t = a / 4 * 1.25; pts.push([sx * Math.sin(t) * rr, h + 0.2 - (1 - Math.cos(t)) * rr * 1.35, z + tilt * a]); } k.add(taperTube(pts, 0.045, 0.02, 6, 4), bone); } }
  // bassin + pattes
  k.add(G.rbox(0.7, 0.3, 0.5, 0.06), bone, { p: [0, 0.82, -1.35] });
  for (const [px, pz, br] of [[-0.4, 1.7, 0.2], [0.4, 1.7, -0.1], [-0.4, -1.3, -0.15], [0.4, -1.3, 0.3]]) { beam(k, bone, [px, 0.8, pz], [px + br * 0.4, 0.45, pz + br * 0.6], 0.09); beam(k, bone, [px + br * 0.4, 0.45, pz + br * 0.6], [px + br, 0.06, pz + br * 1.2], 0.07); }
  for (let i = 0; i < 5; i++) k.add(G.box(0.07, 0.07, 0.12), bone, { p: [0, 0.7 - i * 0.04, -1.55 - i * 0.2], r: [0.1 * i, 0, 0] }); // queue
}
function westWagon() {
  const k = new Kit(), grey = mat('#6b5a48', { roughness: 0.95 }), red = mat('#7a2a1c', { roughness: 0.9 }), rust = mat('#7a3a1c', { roughness: 0.9, metalness: 0.3 }), blk = MAT.iron();
  // châssis + plancher
  for (const sx of [-0.95, 0.95]) k.add(G.box(0.18, 0.3, 6.4), blk, { p: [sx, 0.8, 0] });
  k.add(G.box(2.6, 0.14, 6.2), grey, { p: [0, 1.0, 0] });
  for (let i = 0; i < 6; i++) k.add(G.box(2.5, 0.2, 0.12), blk, { p: [0, 0.65, -2.5 + i], r: [0, 0, 0] });
  // parois : planches verticales, certaines manquantes
  const r = mulberry(31);
  for (const sx of [-1.3, 1.3]) for (let p = 0; p < 9; p++) { if (r() < 0.2) continue; const m = p % 3 === 0 ? red : grey; k.add(G.box(0.07, 1.9 - r() * 0.5, 0.64), m, { p: [sx, 2.0 - r() * 0.2, -2.7 + p * 0.68] }); }
  for (const sz of [-3.1, 3.1]) for (let p = 0; p < 4; p++) { if (r() < 0.15) continue; k.add(G.box(0.62, 1.9, 0.07), grey, { p: [-0.95 + p * 0.64, 2.0, sz] }); }
  for (const sx of [-1.3, 1.3]) for (const y of [1.3, 2.4]) k.add(G.box(0.1, 0.08, 6.2), blk, { p: [sx, y, 0] });
  // porte coulissante entrouverte
  k.add(G.box(0.1, 1.8, 1.4), red, { p: [1.36, 1.95, 0.2] }); k.add(G.box(0.08, 0.06, 3.0), blk, { p: [1.42, 2.95, 0.6] });
  // arceaux de toit effondrés
  for (let i = 0; i < 5; i++) { if (i === 2) continue; k.add(G.tor(1.3, 0.05, 4, 10, PI), grey, { p: [0, 2.9, -2.4 + i * 1.2], r: [0, 0, 0] }); }
  k.add(G.box(1.4, 0.08, 2.4), grey, { p: [-0.5, 3.0, 1.4], r: [0.2, 0, 0.3] });
  // attelage + roues pendantes
  k.add(G.cyl(0.07, 0.07, 1.0, 6), blk, { p: [0, 0.9, 3.7], r: [H, 0, 0] }); k.add(G.cyl(0.18, 0.18, 0.2, 8), blk, { p: [0, 0.9, 4.2], r: [H, 0, 0] });
  for (const z of [-2, 2]) for (const sx of [-1.05, 1.05]) { k.add(G.cyl(0.42, 0.42, 0.1, 14), rust, { p: [sx, 0.4, z], r: [0, 0, H] }); k.add(G.cyl(0.12, 0.12, 0.14, 8), blk, { p: [sx, 0.4, z], r: [0, 0, H] }); for (let a = 0; a < 4; a++) k.add(G.box(0.8, 0.05, 0.05), blk, { p: [sx, 0.4, z], r: [a * PI / 4, 0, 0] }); }
  k.add(G.cyl(0.07, 0.07, 2.2, 6), blk, { p: [0, 0.4, -2], r: [0, 0, H] });
  return k.build();
}
export function buildWesternDecor(scene, terrain, net) {
  const rnd = mulberry(1234); const anim = { windmills: [], tumbles: [] };
  const edges = net.edges.filter(e => e.biome === 4);
  const spot = (minOff, maxOff, fp = 1.5, maxDiff = 0.8) => { for (let t = 0; t < 150; t++) { const e = edges[Math.floor(rnd() * edges.length)]; const k = 10 + Math.floor(rnd() * (e.pts.length - 20)); const p = e.pts[k], a = e.pts[k - 2], b = e.pts[k + 2]; const nx = -(b.z - a.z), nz = b.x - a.x, L = Math.hypot(nx, nz) || 1; const off = (rnd() < 0.5 ? -1 : 1) * (minOff + rnd() * (maxOff - minOff)); const x = p.x + nx / L * off, z = p.z + nz / L * off; if (sectorIndex(x, z) === 4 && Math.hypot(x, z) > 160 && !net.nearest(x, z, minOff - 2) && goodSpot(terrain, x, z, fp, maxDiff)) return { x, z, y: terrain.heightAt(x, z), ang: Math.atan2(b.x - a.x, b.z - a.z) }; } return null; };
  const iron = MAT.iron(), wood = MAT.woodDark(), plank = mat('#8a6a46', { roughness: 0.9 }), cream = mat('#d6c7a4', { roughness: 0.75, side: THREE.DoubleSide }), redM = mat('#9a3a2a', { side: THREE.DoubleSide }), tin = mat('#8d98a0', { metalness: 0.7, roughness: 0.4 });
  // Éoliennes de ranch (animées, la tête s'oriente doucement au vent)
  for (let i = 0; i < 5; i++) {
    const s = spot(14, 40, 5.5, 1.2); if (!s) continue;
    const grp = new THREE.Group(), k = new Kit();
    const TH = 11, w0 = 1.5, w1 = 0.6, W = y => w0 + (w1 - w0) * (y / TH);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) beam(k, iron, [x * w0, 0, z * w0], [x * w1, TH, z * w1], 0.13);
    for (let b = 0; b < 4; b++) {
      const y0 = b * TH / 4, y1 = (b + 1) * TH / 4, a = W(y0), c = W(y1);
      for (const sg of [-1, 1]) { beam(k, iron, [-a, y0, sg * a], [c, y1, sg * c], 0.05); beam(k, iron, [a, y0, sg * a], [-c, y1, sg * c], 0.05); beam(k, iron, [sg * a, y0, -a], [sg * c, y1, c], 0.05); beam(k, iron, [sg * a, y0, a], [sg * c, y1, -c], 0.05); }
      if (b > 0) { k.add(G.box(2 * a, 0.07, 0.07), iron, { p: [0, y0, a] }); k.add(G.box(2 * a, 0.07, 0.07), iron, { p: [0, y0, -a] }); k.add(G.box(0.07, 0.07, 2 * a), iron, { p: [a, y0, 0] }); k.add(G.box(0.07, 0.07, 2 * a), iron, { p: [-a, y0, 0] }); }
    }
    for (let st = 0; st < 10; st++) k.add(G.box(0.4, 0.04, 0.06), iron, { p: [-0.5 + (st % 2) * 0.1, 0.6 + st * 1.0, W(0.6 + st) + 0.08] }); // échelons
    k.add(G.box(1.8, 0.14, 1.8), wood, { p: [0, TH, 0] }); for (const sx of [-0.85, 0.85]) k.add(G.box(0.05, 0.5, 1.7), iron, { p: [sx, TH + 0.3, 0] });
    k.add(G.cyl(0.09, 0.09, 1.8, 6), iron, { p: [0, TH - 0.8, 0] }); // tige de pompe
    // réservoir en bois sur pilotis + abreuvoir
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) beam(k, wood, [-3.6 + x * 0.9, 0, z * 0.9], [-3.6 + x * 0.7, 3.4, z * 0.7], 0.14);
    k.add(G.cyl(1.35, 1.35, 0.14, 14), wood, { p: [-3.6, 3.45, 0] }); k.add(G.cyl(1.3, 1.3, 1.9, 14), plank, { p: [-3.6, 4.45, 0] });
    for (const y of [3.8, 4.5, 5.2]) k.add(G.tor(1.32, 0.04, 4, 16), iron, { p: [-3.6, y, 0], r: [H, 0, 0] });
    k.add(G.cone(1.5, 0.8, 14), tin, { p: [-3.6, 5.8, 0] });
    k.add(G.tube([[-3.6, 3.4, 0], [-3.6, 1.6, 0.9], [-0.8, 1.2, 1.2], [1.4, 1.2, 0.9]], 0.06, 12, 5), iron);
    k.add(G.rbox(3.4, 0.8, 1.2, 0.08), wood, { p: [2.7, 0.4, 0] }); k.add(G.box(3.1, 0.05, 0.9), mat('#3a6a8a', { roughness: 0.1, metalness: 0.3 }), { p: [2.7, 0.72, 0] });
    for (const sx of [-1.4, 1.4]) k.add(G.box(0.12, 0.5, 1.3), wood, { p: [2.7 + sx, 0.25, 0] });
    // tonneaux
    for (const [bx, bz] of [[4.6, 1.6], [5.3, 0.9]]) { k.add(G.cyl(0.38, 0.38, 0.8, 10), plank, { p: [bx, 0.4, bz] }); k.add(G.tor(0.38, 0.03, 4, 10), iron, { p: [bx, 0.2, bz], r: [H, 0, 0] }); k.add(G.tor(0.38, 0.03, 4, 10), iron, { p: [bx, 0.6, bz], r: [H, 0, 0] }); }
    grp.add(k.build());
    // tête orientable : boîte d'engrenages, rotor, queue + dérive
    const head = new THREE.Group(); head.position.set(0, TH + 0.6, 0);
    const hk = new Kit();
    hk.add(G.rbox(0.7, 0.7, 1.3, 0.1), iron, { p: [0, 0, 0] }); hk.add(G.cyl(0.14, 0.14, 0.8, 8), iron, { p: [0, 0, 0.9], r: [H, 0, 0] });
    beam(hk, iron, [0, 0, -0.6], [0, 0.05, -3.8], 0.1);
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(2.4, -0.3); fin.lineTo(2.7, 0.9); fin.lineTo(2.4, 1.5); fin.lineTo(0.2, 1.0); fin.closePath();
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: false }); fg.translate(0, -0.55, -0.025);
    hk.add(fg, redM, { p: [0, 0, -1.4], r: [0, H, 0] }); // s'étend vers -z
    hk.add(G.box(0.05, 0.25, 1.2), cream, { p: [0, 0.2, -2.7] });
    head.add(hk.build());
    const rotor = new THREE.Group(); rotor.position.set(0, 0, 1.15);
    const rk = new Kit(); const NB = 18;
    for (let b = 0; b < NB; b++) {
      const a = b / NB * PI * 2, bg = G.box(0.5, 1.5, 0.025); bg.rotateY(0.5);
      rk.add(bg, b % 6 === 0 ? redM : cream, { p: [Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0], r: [0, 0, a - H] });
      if (b % 3 === 0) rk.add(G.box(0.04, 1.1, 0.04), iron, { p: [Math.cos(a) * 0.65, Math.sin(a) * 0.65, -0.04], r: [0, 0, a - H] });
    }
    rk.add(G.tor(2.3, 0.04, 4, 36), iron, { p: [0, 0, -0.03] }); rk.add(G.tor(0.92, 0.035, 4, 24), iron, { p: [0, 0, -0.03] });
    rk.add(G.cyl(0.24, 0.24, 0.3, 10), iron, { r: [H, 0, 0] }); rk.add(G.cone(0.2, 0.35, 8), iron, { p: [0, 0, 0.3], r: [H, 0, 0] });
    rotor.add(rk.build()); head.add(rotor); grp.add(head);
    grp.position.set(s.x, s.y, s.z); grp.rotation.y = rnd() * PI * 2; scene.add(grp); grp.updateMatrixWorld(true);
    COLLIDERS.circle(s.x, s.z, 1.1);
    { const v = grp.localToWorld(new THREE.Vector3(2.7, 0, 0)); COLLIDERS.box(v.x, v.z, 1.7, 0.6, grp.rotation.y, s.y + 0.8); }
    { const v = grp.localToWorld(new THREE.Vector3(-3.6, 0, 0)); COLLIDERS.circle(v.x, v.z, 1.4, s.y + 6.0, s.y + 2.4); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const u = grp.localToWorld(new THREE.Vector3(-3.6 + x * 0.8, 0, z * 0.8)); COLLIDERS.circle(u.x, u.z, 0.16, 99, -99, false); } }
    anim.windmills.push({ rotor, head, base: 0, ph: rnd() * 10 });
  }
  // Épaves de wagons renversés, entourés de cargaison éparpillée et de squelettes
  const bone = mat('#efe6d0', { roughness: 0.7 }), dark = mat('#2a2018');
  for (let i = 0; i < 3; i++) {
    const s = spot(10, 25, 5, 1.2); if (!s) continue;
    const grp = new THREE.Group(), w = westWagon(); w.rotation.z = 1.42; w.position.set(0.6, 1.3, 0); grp.add(w);
    const k = new Kit(), sand = mat('#d9ad6c', { flatShading: true, roughness: 1 });
    k.add(G.cone(3.2, 1.1, 7), sand, { p: [-1.5, 0.1, -2.5], s: [1.5, 0.6, 1] }); k.add(G.cone(2.6, 0.9, 6), sand, { p: [2.2, 0.0, 3.0], s: [1.4, 0.55, 1.1] });
    for (let c = 0; c < 4; c++) { const a = rnd() * PI * 2, d = 2.5 + rnd() * 2; k.add(G.rbox(0.8, 0.6, 0.6, 0.05), plank, { p: [Math.cos(a) * d + 1.5, 0.3, Math.sin(a) * d], r: [0, rnd() * 3, (rnd() - 0.5) * 0.5] }); }
    for (let c = 0; c < 3; c++) { const a = rnd() * PI * 2, d = 3 + rnd() * 2; k.add(G.cyl(0.4, 0.4, 0.85, 10), plank, { p: [Math.cos(a) * d + 1, 0.4, Math.sin(a) * d], r: [rnd() > 0.5 ? H : 0, rnd() * 3, 0] }); }
    // rail tordu arraché
    k.add(G.tube([[-3.5, 0.2, -4.5], [-2.5, 0.5, -3.8], [-1.0, 0.25, -4.2], [0.5, 0.15, -5.4]], 0.07, 12, 5), mat('#8a5a3a', { metalness: 0.6, roughness: 0.7 }));
    grp.add(k.build());
    const sk = new Kit(); bisonSkeleton(sk, bone, dark); const sg = sk.build(); sg.position.set(5.2, 0, 0.5); sg.rotation.y = rnd() * 6; sg.scale.setScalar(1.15); grp.add(sg);
    grp.position.set(s.x, s.y, s.z); grp.rotation.y = s.ang + 0.4; scene.add(grp);
    COLLIDERS.box(s.x + Math.sin(s.ang + 0.4) * 0.6, s.z + Math.cos(s.ang + 0.4) * 0.6, 1.6, 3.1, s.ang + 0.4, s.y + 2.8);
  }
  // Squelettes isolés dans la plaine
  for (let i = 0; i < 5; i++) { const s = spot(12, 60, 2.5, 0.8); if (!s) continue; const sk = new Kit(); bisonSkeleton(sk, bone, dark); const sg = sk.build(); sg.position.set(s.x, s.y, s.z); sg.rotation.set((rnd() - 0.5) * 0.08, rnd() * 6, (rnd() - 0.5) * 0.08); sg.scale.setScalar(1 + rnd() * 0.35); scene.add(sg); }
  // Clôtures de ranch par tronçons (montants pointus, 3 lisses, croix de Saint-André, sections cassées)
  const fk = new Kit(), fw = mat('#7a5232', { roughness: 0.9 }), fw2 = mat('#6a4528', { roughness: 0.95 }), wire = mat('#3a3a3a', { metalness: 0.6, roughness: 0.5 });
  for (let i = 0; i < 14; i++) {
    let s = null;
    for (let tr = 0; tr < 14 && !s; tr++) { // clôture : les 6 poteaux doivent tous poser sur du plat, sans rocher ni à-pic entre deux
      const c = spot(9, 12, 0.8, 0.6); if (!c) break; let ok = true, py = null;
      for (let p = 0; p < 6 && ok; p++) { const x = c.x + Math.sin(c.ang) * p * 3, z = c.z + Math.cos(c.ang) * p * 3, y = terrain.heightAt(x, z); if (!flatEnough(terrain, x, z, 0.7, 0.6) || overlapsSolid(terrain, x, z, 0.7) || net.nearest(x, z, 6) || (py !== null && Math.abs(y - py) > 0.8)) ok = false; py = y; }
      if (ok) s = c;
    }
    if (!s) continue;
    const broken = Math.floor(rnd() * 5), gate = i % 5 === 0;
    for (let p = 0; p < 6; p++) {
      const dx = Math.sin(s.ang) * p * 3, dz = Math.cos(s.ang) * p * 3;
      const y = terrain.heightAt(s.x + dx, s.z + dz);
      if (p === 0) COLLIDERS.box(s.x + Math.sin(s.ang) * 7.5, s.z + Math.cos(s.ang) * 7.5, 0.14, 7.7, s.ang, s.y + 1.4, -99, false);
      const lean = p === broken ? 0.3 : (rnd() - 0.5) * 0.1;
      fk.add(G.box(0.2, 1.5, 0.2), p % 2 ? fw : fw2, { p: [s.x + dx, y + 0.7, s.z + dz], r: [0, s.ang, lean] });
      fk.add(G.cone(0.15, 0.2, 4), fw, { p: [s.x + dx, y + 1.55, s.z + dz], r: [0, s.ang + PI / 4, lean] });
      if (p < 5) {
        const cx = s.x + dx + Math.sin(s.ang) * 1.5, cz = s.z + dz + Math.cos(s.ang) * 1.5;
        for (const h of [0.35, 0.8, 1.25]) { if (p === broken && h > 0.6) continue; fk.add(G.box(0.08, 0.12, 3.05), fw, { p: [cx, y + h, cz], r: [0, s.ang, p === broken ? 0.18 : 0] }); }
        if (gate && p === 2) { beam(fk, fw2, [s.x + dx, y + 0.3, s.z + dz], [s.x + dx + Math.sin(s.ang) * 3, y + 1.3, s.z + dz + Math.cos(s.ang) * 3], 0.08, 0.1); beam(fk, fw2, [s.x + dx, y + 1.3, s.z + dz], [s.x + dx + Math.sin(s.ang) * 3, y + 0.3, s.z + dz + Math.cos(s.ang) * 3], 0.08, 0.1); }
        else if (p % 2 === 0 && p !== broken) fk.add(G.box(0.03, 0.03, 3.0), wire, { p: [cx, y + 1.4, cz], r: [0, s.ang, 0] });
      }
    }
  }
  scene.add(fk.build({ shadow: false }));
  // Panneaux indicateurs de ranch (rapport à la ville)
  for (let i = 0; i < 4; i++) { const s = spot(7, 10, 1.4, 0.6); if (!s) continue; const g2 = new THREE.Group(), kk = new Kit(); kk.add(G.box(0.2, 3, 0.2), wood, { p: [0, 1.5, 0] }); kk.add(G.box(1.8, 0.45, 0.08), plank, { p: [0.5, 2.6, 0.12], r: [0, 0, 0.05] }); kk.add(G.cone(0.34, 0.5, 3), plank, { p: [1.65, 2.62, 0.12], r: [0, 0, -H] }); kk.add(G.box(1.5, 0.4, 0.08), plank, { p: [-0.4, 2.0, -0.12], r: [0, 0, -0.04] });
    g2.add(kk.build()); const tx = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.36), new THREE.MeshBasicMaterial({ map: textSprite(['POUSSIÈRE →', '', ''], { w: 256, h: 64, bg: '#8a6a46', fg: '#2a1a0c', border: '#5a3a20', font: 'bold 34px Georgia' }) })); tx.position.set(0.5, 2.6, 0.17); tx.rotation.z = 0.05; g2.add(tx);
    g2.position.set(s.x, s.y, s.z); g2.rotation.y = s.ang + (rnd() < 0.5 ? 0 : PI) + H; scene.add(g2); }
  // Rochers sculptés
  const rocks = [rockGeometry(1), rockGeometry(2), rockGeometry(3)];
  const rmat = mat('#a0583a', { roughness: 0.95, flatShading: true });
  rocks.forEach((geo, gi) => {
    const n = 140, inst = new THREE.InstancedMesh(geo, rmat, n); const m4 = new THREE.Matrix4(); let c = 0;
    for (let t = 0; t < n * 8 && c < n; t++) { const r = 150 + rnd() * 1200, a = rnd() * PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r; if (sectorIndex(x, z) !== 4 || net.nearest(x, z, 9)) continue; const sc = 0.6 + rnd() * rnd() * 4; if (!goodSpot(terrain, x, z, Math.min(1.15 * sc, 6), Math.max(0.8, Math.min(1.15 * sc, 6) * 0.3))) continue; m4.compose(new THREE.Vector3(x, terrain.heightAt(x, z) + sc * 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(sc, sc * (0.6 + rnd() * 0.6), sc)); inst.setMatrixAt(c++, m4); if (sc > 1.1) COLLIDERS.circle(x, z, 1.15 * sc, terrain.heightAt(x, z) + sc * 0.75); }
    inst.count = c; inst.receiveShadow = true; inst.castShadow = gi === 0; inst.userData.solidFill = true; scene.add(inst);
  });
  // Virevoltants : pelotes d'herbes sèches (anneaux entremêlés), roulent au vent
  const tk = new Kit(), twig = mat('#a58a55', { roughness: 1, flatShading: true });
  { const r = mulberry(5); for (let i = 0; i < 9; i++) tk.add(G.tor(0.55 + r() * 0.2, 0.035, 3, 11), twig, { r: [r() * PI, r() * PI, r() * PI], s: [0.9 + r() * 0.2, 0.9 + r() * 0.2, 0.9 + r() * 0.2] }); for (let i = 0; i < 6; i++) tk.add(G.cone(0.04, 0.5, 3), twig, { p: [(r() - 0.5) * 0.9, (r() - 0.5) * 0.9, (r() - 0.5) * 0.9], r: [r() * 6, r() * 6, 0] }); }
  const tg = tk.geometry();
  for (let i = 0; i < 14; i++) { const s = spot(6, 40, 1, 0.8); if (!s) continue; const m = new THREE.Mesh(tg, twig); m.position.set(s.x, s.y + 0.7, s.z); m.scale.setScalar(0.8 + rnd() * 0.7); scene.add(m); anim.tumbles.push({ m, v: new THREE.Vector3(1.5 + rnd() * 3, 0, (rnd() - 0.5) * 2), home: new THREE.Vector3(s.x, 0, s.z), ph: rnd() * 10 }); }
  return {
    update(dt, t) {
      anim.windmills.forEach((w, i) => { w.rotor.rotation.z -= dt * (1.2 + Math.sin(t * 0.3 + i) * 0.6); w.head.rotation.y = Math.sin(t * 0.07 + w.ph) * 0.6; });
      for (const tw of anim.tumbles) {
        const px = tw.m.position.x, pz = tw.m.position.z;
        tw.m.position.addScaledVector(tw.v, dt);
        if (COLLIDERS.blocked(tw.m.position.x, terrain.heightAt(tw.m.position.x, tw.m.position.z) + 0.5, tw.m.position.z, 0.6)) { tw.m.position.x = px; tw.m.position.z = pz; tw.v.x = -tw.v.x; tw.v.z = (Math.random() - 0.5) * 2; } // rebondit sur les rochers au lieu de les traverser
        if (tw.m.position.distanceTo(tw.home) > 120) tw.m.position.set(tw.home.x, 0, tw.home.z);
        const gy = terrain.heightAt(tw.m.position.x, tw.m.position.z);
        tw.m.position.y = gy + 0.7 + Math.abs(Math.sin(t * 3 + tw.ph)) * 0.8;
        tw.m.rotation.z -= dt * tw.v.x * 1.5; tw.m.rotation.x += dt * tw.v.z * 1.5;
      }
    },
  };
}

// ------------------------------------------------------------------ Gelure : trois-mâts pris dans la glace, avant-poste, arches
// Coque lofée : stations de la poupe (x=-11) à la proue (x=13)
const HB = t => t < 0.12 ? 2.4 + t * 8 : 3.4 * Math.pow(Math.max(0, 1 - Math.pow((t - 0.12) / 0.88, 2.4)), 0.7); // demi-largeur
const HD = t => (2.7 - 1.0 * t * t) * (t > 0.85 ? 1 - (t - 0.85) * 4 : 1);               // profondeur de carène
const HY = t => 0.6 + (t > 0.7 ? (t - 0.7) * 6 : 0) + (t < 0.15 ? 0.6 * (0.15 - t) / 0.15 : 0); // livet (relevé à la proue)
const HX = t => -11 + 24 * t, HLIFT = t => (t > 0.9 ? (t - 0.9) * 8 : 0);
function hullGeometry() {
  const ST = 16, RING = 13, X0 = -11, X1 = 13, pos = [], idx = [];
  const B = HB, D = t => HD(t) / (t > 0.85 ? 1 : 1) , Y = HY;
  for (let s = 0; s <= ST; s++) {
    const t = s / ST, x = X0 + (X1 - X0) * t, b = Math.max(0.02, B(t)), d = D(t), yt = 2.4 + Y(t);
    for (let j = 0; j < RING; j++) { const f = j / (RING - 1) * PI - H; pos.push(x, yt - d * Math.cos(f) + (t > 0.9 ? (t - 0.9) * 8 * (1 - Math.cos(f)) : 0), b * Math.sin(f)); }
  }
  for (let s = 0; s < ST; s++) for (let j = 0; j < RING - 1; j++) { const a = s * RING + j, b = a + 1, c = a + RING, d = c + 1; idx.push(a, b, c, b, d, c); }
  // tableau arrière (miroir)
  const c0 = pos.length / 3; pos.push(X0, 2.4 + Y(0) - 1.2, 0); for (let j = 0; j < RING - 1; j++) idx.push(c0, j + 1, j);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
export function galleon(rnd) {
  const k = new Kit(), hull = mat('#5a2e18', { roughness: 0.85, flatShading: true, side: THREE.DoubleSide }), hullD = mat('#3a1e10', { roughness: 0.9 }), deck = mat('#8a6a42', { roughness: 0.9 }), sail = mat('#e8e2d0', { roughness: 0.9, side: THREE.DoubleSide }), snow = mat('#f4fbff', { roughness: 0.7 }), ice = mat('#9fd8f5', { roughness: 0.1, metalness: 0.2, emissive: '#2a6f9a', emissiveIntensity: 0.25, flatShading: true }), brassM = MAT.brass(), warm = glow('#ffb35a', 1.6), rope = mat('#2a2018', { roughness: 1 });
  k.add(hullGeometry(), hull);
  // lisses (préceintes) le long de la coque
  for (const sz of [-1, 1]) for (const f of [0.5, 0.95, 1.3]) { const pts = []; for (let i = 0; i <= 10; i++) { const t = 0.05 + i / 10 * 0.82; pts.push([HX(t), 2.4 + HY(t) - HD(t) * Math.cos(f) + HLIFT(t) * (1 - Math.cos(f)), sz * (HB(t) * Math.sin(f) + 0.07)]); } k.add(G.tube(pts, 0.09, 14, 4), hullD); }
  // pont : planches
  const dk = new THREE.Shape(); dk.moveTo(-10.6, -2.3); dk.lineTo(-10.6, 2.3); dk.lineTo(6, 3.1); dk.lineTo(12, 1.0); dk.lineTo(12.6, 0); dk.lineTo(12, -1.0); dk.lineTo(6, -3.1); dk.closePath();
  const dg = new THREE.ExtrudeGeometry(dk, { depth: 0.2, bevelEnabled: false }); dg.rotateX(H); k.add(dg, deck, { p: [0, 3.1, 0] });
  // gaillard d'arrière (dunette) + fenêtres de poupe éclairées
  k.add(G.rbox(7, 2.2, 4.4, 0.1), hullD, { p: [-7.2, 4.3, 0] }); k.add(G.box(7.4, 0.2, 4.8), deck, { p: [-7.2, 5.5, 0] });
  for (let i = 0; i < 4; i++) k.add(G.box(0.7, 0.8, 0.08), warm, { p: [-10.72, 4.5, -1.5 + i * 1.0], r: [0, H, 0] }); k.add(G.box(0.08, 0.5, 3.6), brassM, { p: [-10.76, 5.0, 0] });
  for (const sz of [-1, 1]) for (let i = 0; i < 6; i++) k.add(G.box(0.08, 0.5, 0.08), hullD, { p: [-10.2 + i * 1.3, 6.0, sz * 2.3] });
  k.add(G.box(7.4, 0.08, 0.1), hullD, { p: [-7.2, 6.25, 2.3] }); k.add(G.box(7.4, 0.08, 0.1), hullD, { p: [-7.2, 6.25, -2.3] });
  k.add(G.box(0.2, 1.2, 0.2), hullD, { p: [-10.6, 6.3, 0] }); k.add(G.sph(0.2, 6, 5), warm, { p: [-10.6, 7.0, 0] });  // fanal
  // gaillard d'avant + bastingage
  k.add(G.rbox(3.6, 1.4, 3, 0.1), hullD, { p: [9.4, 4.0, 0] }); k.add(G.box(3.8, 0.16, 3.2), deck, { p: [9.4, 4.78, 0] });
  for (const sz of [-1, 1]) { k.add(G.box(17, 0.14, 0.16), hullD, { p: [-0.5, 4.1, sz * 3.1] }); for (let i = 0; i < 9; i++) k.add(G.box(0.12, 0.9, 0.12), hullD, { p: [-8 + i * 1.9, 3.7, sz * 3.1] }); }
  // mâts, vergues, voiles déchirées, nids-de-pie, haubans
  for (const [x, h, w] of [[-5.5, 15, 5.4], [1.2, 19, 6.6], [7.5, 13, 4.6]]) {
    k.add(G.cyl(0.22, 0.34, h, 8), hullD, { p: [x, 3.2 + h / 2, 0] }); k.add(G.cyl(0.35, 0.35, 0.3, 8), hullD, { p: [x, 3.2 + h * 0.62, 0] }); k.add(G.cyl(0.65, 0.5, 0.45, 8), hullD, { p: [x, 3.2 + h * 0.72, 0] });
    for (const [fy, fw] of [[0.7, w], [0.45, w * 1.12]]) {
      const y = 3.2 + h * (fy + 0.05); k.add(G.cyl(0.1, 0.1, fw + 0.8, 6), hullD, { p: [x, y, 0], r: [H, 0, 0] });
      const sg = new THREE.PlaneGeometry(fw, h * 0.26, 5, 3), sp = sg.attributes.position; for (let i = 0; i < sp.count; i++) { const u = sp.getX(i) / fw + 0.5, v = sp.getY(i); sp.setZ(i, Math.sin(u * PI) * 0.6 + (v < -h * 0.05 ? (rnd() - 0.5) * 0.3 : 0)); if (v < -h * 0.1 && rnd() < 0.3) sp.setY(i, v + rnd() * 0.8); } sg.computeVertexNormals();
      k.add(sg, sail, { p: [x + 0.15, y - h * 0.13, 0], r: [0, H, 0] });
      k.add(G.box(0.12, 0.18, fw * 0.95), snow, { p: [x, y + 0.12, 0] }); // neige sur la vergue
      for (let i = 0; i < 5; i++) k.add(G.cone(0.07, 0.5 + rnd() * 1.1, 5), ice, { p: [x + 0.2, y - 0.4, -fw / 2 + (i + 0.5) * fw / 5], r: [PI, 0, 0] });
    }
    k.add(G.cone(0.3, 0.9, 6), snow, { p: [x, 3.2 + h + 0.3, 0] });
    for (const sz of [-1, 1]) for (const dx of [-0.3, 0.3]) beam(k, rope, [x, 3.2 + h * 0.7, 0.2 * sz], [x + dx * 7, 4.1, sz * 3.0], 0.035); // haubans
  }
  // beaupré + figure de proue + ancre
  k.add(G.cyl(0.15, 0.22, 7, 7), hullD, { p: [15.6, 6.0, 0], r: [0, 0, 1.2] }); beam(k, rope, [18.5, 7.0, 0], [8, 18, 0], 0.035);
  k.add(G.cone(0.35, 1.1, 5), brassM, { p: [13.4, 4.2, 0], r: [0, 0, -H] }); k.add(G.sph(0.35, 8, 6), brassM, { p: [13.7, 4.0, 0] });
  k.add(G.tor(0.3, 0.05, 5, 10, PI), mat('#1a1b1e', { metalness: 0.6 }), { p: [12.3, 2.9, 3.3], r: [0, H, 0] }); k.add(G.cyl(0.05, 0.05, 1.2, 5), mat('#1a1b1e', { metalness: 0.6 }), { p: [12.3, 2.9, 3.3] });
  // canons, tonneaux et caisses sur le pont
  for (let i = 0; i < 4; i++) for (const sz of [-1, 1]) k.add(G.cyl(0.14, 0.2, 1.4, 7), mat('#222', { metalness: 0.5 }), { p: [-3 + i * 2.4, 3.9, sz * 2.7], r: [0, 0, H] });
  for (let i = 0; i < 5; i++) { k.add(G.cyl(0.38, 0.38, 0.8, 9), hull, { p: [-3 + i * 1.3, 3.8, 0.4 + (i % 2) * 0.7] }); }
  k.add(G.rbox(1, 0.8, 1, 0.05), deck, { p: [4, 3.9, -1] }); k.add(G.rbox(0.9, 0.7, 0.9, 0.05), deck, { p: [4.4, 4.6, -0.8], r: [0, 0.4, 0] });
  // gangue de neige sur le pont et les gaillards + stalactites au livet
  k.add(G.box(7.4, 0.3, 4.6), snow, { p: [-7.2, 5.7, 0], r: [0, 0, 0.04] }); k.add(G.box(3.8, 0.28, 3.2), snow, { p: [9.4, 4.95, 0] });
  for (let i = 0; i < 7; i++) k.add(G.sph(1.2 + rnd() * 1.2, 7, 5), snow, { p: [-4 + i * 2.2 + rnd(), 3.4, (rnd() - 0.5) * 3.2], s: [1.4, 0.35, 1.2] });
  for (let p = 0; p < 34; p++) { const sz = rnd() < 0.5 ? -1 : 1; k.add(G.cone(0.1 + rnd() * 0.18, 0.7 + rnd() * 2.0, 5), ice, { p: [-10 + rnd() * 22, 4.0, sz * 3.15], r: [PI, 0, 0] }); }
  // banquise : blocs de glace autour de la coque
  k.add(G.cyl(16, 18, 3, 24), snow, { p: [1, -0.4, 0], s: [1, 1, 0.42] });
  for (let p = 0; p < 16; p++) { const a = rnd() * PI * 2, rx = 11 + rnd() * 6, rz = 3.2 + rnd() * 2.2; k.add(jitter(new THREE.IcosahedronGeometry(1, 0), p + 50, 0.5), ice, { p: [1 + Math.cos(a) * rx, 1 + rnd() * 1.6, Math.sin(a) * rz], s: [1.5 + rnd() * 2.6, 1.4 + rnd() * 3, 1.5 + rnd() * 2], r: [rnd(), rnd() * 6, rnd()] }); }
  for (let p = 0; p < 8; p++) k.add(G.cone(0.6 + rnd() * 0.8, 3 + rnd() * 4, 5), ice, { p: [-11 + rnd() * 24, 1.5, (rnd() < 0.5 ? -1 : 1) * (3.5 + rnd() * 2)], r: [(rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6] });
  return k.build();
}
function cabinKit(k, x, v, rnd) {
  const wood = mat('#5a3a22', { roughness: 0.9 }), wood2 = mat('#6d4a2b', { roughness: 0.9 }), snow = mat('#f4fbff', { roughness: 0.7 }), ice = mat('#cfefff', { roughness: 0.2, emissive: '#5ab0e0', emissiveIntensity: 0.2 }), dark = MAT.woodDark(), stone = mat('#6e6a64', { flatShading: true }), warm = glow('#ffb35a', 1.5);
  for (let l = 0; l < 8; l++) {
    const m = l % 2 ? wood2 : wood, y = 0.28 + l * 0.5, off = (l % 2) * 0.1;
    k.add(G.cyl(0.25, 0.25, 6.2, 9), m, { p: [x, y, -2.2], r: [0, 0, H] }); k.add(G.cyl(0.25, 0.25, 6.2, 9), m, { p: [x, y, 2.2], r: [0, 0, H] });
    k.add(G.cyl(0.25, 0.25, 4.8 + off, 9), m, { p: [x - 2.8, y + 0.25, 0], r: [H, 0, 0] }); k.add(G.cyl(0.25, 0.25, 4.8 + off, 9), m, { p: [x + 2.8, y + 0.25, 0], r: [H, 0, 0] });
  }
  // toit à deux pans, avant-toit, faîtage, neige épaisse, stalactites
  for (const sg of [-1, 1]) { k.add(G.box(7.2, 0.22, 3.5), dark, { p: [x, 4.55, sg * 1.35], r: [sg * 0.6, 0, 0] }); k.add(G.box(7.3, 0.5 + rnd() * 0.12, 3.6), snow, { p: [x, 4.9, sg * 1.42], r: [sg * 0.6, 0, 0] }); }
  k.add(G.cyl(0.2, 0.2, 7.4, 8), wood, { p: [x, 5.55, 0], r: [0, 0, H] }); k.add(G.box(7.2, 0.3, 0.8), snow, { p: [x, 5.65, 0] });
  for (let i = 0; i < 12; i++) for (const sg of [-1, 1]) if (rnd() < 0.7) k.add(G.cone(0.06 + rnd() * 0.08, 0.35 + rnd() * 0.7, 5), ice, { p: [x - 3.4 + i * 0.62, 3.65, sg * 3.0], r: [PI, 0, 0] });
  // porte, fenêtre à volets, lanterne
  k.add(G.box(1.3, 2.2, 0.12), dark, { p: [x - 0.8, 1.1, 2.56] }); k.add(G.box(1.5, 0.12, 0.2), wood, { p: [x - 0.8, 2.3, 2.56] }); k.add(G.sph(0.06, 5, 4), mat('#d2a24c', { metalness: 0.9 }), { p: [x - 0.35, 1.1, 2.65] });
  k.add(G.box(0.9, 0.8, 0.08), warm, { p: [x + 1.5, 1.9, 2.5] }); k.add(G.box(0.12, 0.8, 0.12), dark, { p: [x + 1.5, 1.9, 2.55] }); k.add(G.box(0.9, 0.1, 0.12), dark, { p: [x + 1.5, 1.9, 2.55] });
  for (const sx of [-0.62, 0.62]) k.add(G.box(0.4, 0.86, 0.06), wood2, { p: [x + 1.5 + sx, 1.9, 2.6], r: [0, -sx * 0.9, 0] });
  k.add(G.cyl(0.03, 0.03, 0.5, 5), dark, { p: [x + 0.3, 2.2, 2.62] }); k.add(G.box(0.2, 0.26, 0.2), warm, { p: [x + 0.3, 1.85, 2.7] });
  // cheminée en pierre
  k.add(G.box(0.9, 2.6, 0.9), stone, { p: [x + 1.9, 5.3, -0.9] }); k.add(G.box(1.1, 0.25, 1.1), snow, { p: [x + 1.9, 6.7, -0.9] });
  // tas de bois, neige accumulée
  if (v % 2 === 0) for (let r = 0; r < 4; r++) for (let c = 0; c < 6 - r; c++) k.add(G.cyl(0.17, 0.17, 1.4, 6), wood2, { p: [x - 3.7 + r * 0.1, 0.18 + r * 0.32, -1.2 + c * 0.36 + r * 0.17] });
  k.add(G.cone(1.6, 0.9, 7), snow, { p: [x - 2.8, 0.25, 2.8], s: [1.4, 0.7, 1] }); k.add(G.cone(1.8, 0.8, 7), snow, { p: [x + 3.0, 0.2, -2.7], s: [1.4, 0.7, 1] });
}
export function buildGelureDecor(scene, terrain, net) {
  const rnd = mulberry(4321);
  const edges = net.edges.filter(e => e.biome === 5);
  const spot = (minOff, maxOff, frac = null, fp = 1.5, maxDiff = 0.8) => { for (let t = 0; t < 150; t++) { const e = edges[Math.floor(rnd() * edges.length)]; const k = frac != null ? Math.floor(e.pts.length * frac) : 10 + Math.floor(rnd() * (e.pts.length - 20)); const p = e.pts[k], a = e.pts[Math.max(0, k - 2)], b = e.pts[Math.min(e.pts.length - 1, k + 2)]; const nx = -(b.z - a.z), nz = b.x - a.x, L = Math.hypot(nx, nz) || 1; const off = (rnd() < 0.5 ? -1 : 1) * (minOff + rnd() * (maxOff - minOff)); const x = p.x + nx / L * off, z = p.z + nz / L * off; if (sectorIndex(x, z) === 5 && Math.hypot(x, z) > 160 && !net.nearest(x, z, minOff - 2) && goodSpot(terrain, x, z, fp, maxDiff)) return { x, z, y: terrain.heightAt(x, z), ang: Math.atan2(b.x - a.x, b.z - a.z) }; } return null; };
  const snow = mat('#f4fbff', { roughness: 0.7 }), ice = mat('#9fd8f5', { roughness: 0.1, metalness: 0.2, emissive: '#2a6f9a', emissiveIntensity: 0.25, flatShading: true });
  // Trois-mâts pris dans la banquise
  for (let i = 0; i < 2; i++) {
    const s = spot(22, 45, null, 9, 2.2); if (!s) continue;
    const ship = galleon(rnd); ship.position.set(s.x, s.y - 2.2, s.z); ship.rotation.set(0.1, s.ang + 0.6 + i * 1.2, -0.16); scene.add(ship);
    ship.updateMatrixWorld(true); { const v = ship.localToWorld(new THREE.Vector3(1, 0, 0)); COLLIDERS.box(v.x, v.z, 12.5, 3.3, s.ang + 0.6 + i * 1.2, s.y + 4.5); }
  }
  // Avant-poste de cabanes enneigées + feu de camp
  let flames = null;
  const s = spot(14, 18, 0.25, 13, 2.2) || spot(14, 18, 0.25, 13, 5);
  if (s) {
    const out = new THREE.Group(), k = new Kit(), wood = mat('#5a3a22', { roughness: 0.9 }), wood2 = mat('#6d4a2b', { roughness: 0.9 }), stoneM = mat('#6e6a64', { flatShading: true }), iron = MAT.iron(), cloth = mat('#9a3a2a', { side: THREE.DoubleSide });
    for (let c = 0; c < 3; c++) cabinKit(k, c * 9 - 9, c, rnd);
    // foyer : cercle de pierres, tipi de bûches, bancs, séchoir, traîneau, caisses, mât à fanion
    for (let a = 0; a < 9; a++) k.add(jitter(new THREE.IcosahedronGeometry(0.28, 0), a + 3, 0.1), stoneM, { p: [Math.cos(a / 9 * PI * 2) * 1.0, 0.2, 6 + Math.sin(a / 9 * PI * 2) * 1.0] });
    for (let l = 0; l < 6; l++) k.add(G.cyl(0.1, 0.1, 1.7, 6), wood, { p: [Math.cos(l / 6 * PI * 2) * 0.25, 0.7, 6 + Math.sin(l / 6 * PI * 2) * 0.25], r: [Math.sin(l / 6 * PI * 2) * 0.35, 0, -Math.cos(l / 6 * PI * 2) * 0.35] });
    k.add(G.cyl(1.05, 1.05, 0.06, 12), mat('#1a1410'), { p: [0, 0.08, 6] });
    for (const a of [0.8, 2.6, 4.4]) { const bx = Math.cos(a) * 3.0, bz = 6 + Math.sin(a) * 3.0; k.add(G.cyl(0.22, 0.22, 2.2, 8), wood2, { p: [bx, 0.4, bz], r: [0, -a + H, H] }); for (const sg of [-0.8, 0.8]) k.add(G.box(0.2, 0.3, 0.2), wood, { p: [bx + Math.sin(-a + H) * sg * 0.0 + Math.cos(a + H) * sg, 0.15, bz + Math.sin(a + H) * sg] }); k.add(G.box(1.8, 0.2, 0.7), snow, { p: [bx, 0.74, bz], r: [0, -a + H, 0] }); }
    // séchoir à peaux
    for (const sx of [-1.4, 1.4]) beam(k, wood, [12 + sx, 0, 5], [12 + sx * 0.8, 2.2, 5], 0.1); k.add(G.cyl(0.07, 0.07, 3.2, 6), wood, { p: [12, 2.1, 5], r: [0, 0, H] }); k.add(G.box(0.9, 1.2, 0.04), cloth, { p: [11.4, 1.5, 5], r: [0, 0, 0.05] }); k.add(G.box(0.8, 1.0, 0.04), mat('#d8c9a8', { side: THREE.DoubleSide }), { p: [12.6, 1.6, 5.02] });
    // traîneau chargé
    k.add(G.box(2.4, 0.12, 1.0), wood2, { p: [-12, 0.35, 5] }); for (const sz of [-0.5, 0.5]) k.add(G.tube([[-13.4, 0.5, 5 + sz], [-13.0, 0.1, 5 + sz], [-10.8, 0.1, 5 + sz], [-10.5, 0.2, 5 + sz]], 0.05, 8, 4), iron);
    k.add(G.rbox(1, 0.6, 0.8, 0.05), wood, { p: [-12.3, 0.7, 5] }); k.add(G.rbox(0.8, 0.5, 0.7, 0.05), wood2, { p: [-11.6, 0.65, 5.05], r: [0, 0.3, 0] }); k.add(G.cone(0.9, 0.4, 6), snow, { p: [-12, 1.0, 5], s: [1.4, 1, 0.8] });
    // mât à fanion
    k.add(G.cyl(0.07, 0.1, 8, 6), wood, { p: [-14, 4, -1] }); k.add(G.box(1.4, 0.8, 0.04), cloth, { p: [-13.3, 7.4, -1] });
    for (let c = 0; c < 4; c++) k.add(G.rbox(0.7, 0.6, 0.7, 0.05), c % 2 ? wood : wood2, { p: [13.5 + (c % 2) * 0.1, 0.3 + (c > 1 ? 0.6 : 0), 0.6 + (c % 2) * 0.8], r: [0, c * 0.4, 0] });
    out.add(k.build());
    // flammes (animées)
    flames = new THREE.Group(); flames.position.set(0, 0.15, 6);
    const fm = glow('#ff7a2a', 3), fm2 = glow('#ffd060', 3.5);
    const f1 = new THREE.Mesh(G.cone(0.55, 1.5, 7), fm); f1.position.y = 0.75; const f2 = new THREE.Mesh(G.cone(0.3, 1.0, 6), fm2); f2.position.y = 0.55;
    flames.add(f1, f2); out.add(flames);
    out.position.set(s.x, s.y, s.z); out.rotation.y = s.ang; scene.add(out);
    out.updateMatrixWorld(true); for (const cx of [-9, 0, 9]) { const v = out.localToWorld(new THREE.Vector3(cx, 0, 0)); COLLIDERS.box(v.x, v.z, 3.1, 2.6, s.ang, s.y + 6); } { const v = out.localToWorld(new THREE.Vector3(0, 0, 6)); COLLIDERS.circle(v.x, v.z, 1.0, s.y + 1.2); }
    { const v = out.localToWorld(new THREE.Vector3(-12, 0, 5)); COLLIDERS.box(v.x, v.z, 1.3, 0.7, s.ang, s.y + 0.9); }
  }
  // Arches de glace au-dessus de la voie : blocs facettés assemblés en voûte, stalactites, neige au sommet
  const archK = new Kit();
  for (let i = 0; i < 6; i++) {
    const e = edges[i % edges.length]; const k = Math.floor(e.pts.length * (0.15 + 0.7 * rnd())); const p = e.pts[k], b = e.pts[Math.min(e.pts.length - 1, k + 3)];
    if (sectorIndex(p.x, p.z) !== 5 || Math.hypot(p.x, p.z) < 180) continue;
    const ang = Math.atan2(b.x - p.x, b.z - p.z), rx = Math.cos(ang), rz = -Math.sin(ang);
    const N = 13, R = 9.5 + rnd(); // voûte assez large et haute pour le gabarit du train
    for (let j = 0; j <= N; j++) {
      const th = j / N * PI, lx = Math.cos(th) * R, ly = Math.sin(th) * R, sz = 1.0 + rnd() * 0.5, c = Math.sin(th);
      archK.add(jitter(new THREE.IcosahedronGeometry(1, 0), 100 + i * 20 + j, 0.5), ice, { p: [p.x + rx * lx, p.y - 0.4 + ly, p.z + rz * lx], s: [sz, sz * (1 + c * 0.5), sz * 1.5 + 0.5], r: [rnd(), ang + (rnd() - 0.5) * 0.3, rnd()] });
      if (j % 2 === 0) archK.add(jitter(new THREE.IcosahedronGeometry(1, 0), 300 + j, 0.4), snow, { p: [p.x + rx * lx * 1.05, p.y - 0.2 + ly * 1.08 + 0.7, p.z + rz * lx * 1.05], s: [sz * 0.9, sz * 0.55, sz * 1.4], r: [0, ang, 0] });
      if (c > 0.15 && c < 0.75 && j % 2 === 1) for (let d = 0; d < 3; d++) archK.add(G.cone(0.14, 0.8 + rnd() * 1.6, 5), ice, { p: [p.x + rx * lx * 0.93 + (rnd() - 0.5) * 0.6, p.y - 0.4 + ly * 0.9 - 0.8, p.z + rz * lx * 0.93 + (rnd() - 0.5) * 0.6], r: [PI, 0, 0] });
    }
    for (const sg of [-1, 1]) for (let q = 0; q < 3; q++) archK.add(jitter(new THREE.IcosahedronGeometry(1, 0), 500 + q, 0.5), snow, { p: [p.x + rx * R * sg * 1.1 + (rnd() - 0.5) * 2, p.y - 0.4, p.z + rz * R * sg * 1.1], s: [1.8 + rnd(), 0.9, 1.8 + rnd()] });
  }
  scene.add(archK.build({ shadow: false }));
  return { update(dt, t) { if (flames) { flames.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 9.3) * 0.12 + Math.sin(t * 23) * 0.05, 1 + Math.cos(t * 11) * 0.08); } } };
}

// ------------------------------------------------------------------ Aperçus des 6 mondes fermés (derrière les barrières)
// Boîte dont les UV sont en mètres (fenêtres de taille constante)
function windowBox(w, h, d, cw, ch, tileW, tileH) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), u = uv.getX(i), v = uv.getY(i);
    if (ny > 0.5) uv.setXY(i, 0.02, 0.02);
    else if (nx > 0.5) uv.setXY(i, u * d / tileW, v * h / tileH);
    else uv.setXY(i, u * w / tileW, v * h / tileH);
  }
  return g;
}
function neonTexture(rnd) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  const pal = ['#ff3fd0', '#3fe0ff', '#ffd070', '#9a6bff', '#ff6a4a'];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { if (rnd() < 0.42) continue; g.fillStyle = pal[Math.floor(rnd() * pal.length)]; g.globalAlpha = 0.6 + rnd() * 0.4; g.fillRect(x * 32 + 5, y * 32 + 6, 22, 18); g.globalAlpha = 1; }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function gearGeometry(teeth, rOut, rIn, spokes, depth) {
  const sh = new THREE.Shape(), s = PI * 2 / teeth;
  for (let i = 0; i < teeth; i++) { const a = i * s; for (const [r, f] of [[rIn, 0], [rOut, 0.16], [rOut, 0.5], [rIn, 0.66]]) { const x = Math.cos(a + f * s) * r, y = Math.sin(a + f * s) * r; if (i === 0 && f === 0) sh.moveTo(x, y); else sh.lineTo(x, y); } }
  const hub = rIn * 0.22, rim = rIn * 0.8;
  const hole = new THREE.Path(); for (let a = 0; a <= 12; a++) { const t = a / 12 * PI * 2; if (a === 0) hole.moveTo(Math.cos(t) * hub * 0.45, Math.sin(t) * hub * 0.45); else hole.lineTo(Math.cos(t) * hub * 0.45, Math.sin(t) * hub * 0.45); } sh.holes.push(hole);
  for (let sp = 0; sp < spokes; sp++) {
    const a0 = sp / spokes * PI * 2 + 0.12, a1 = (sp + 1) / spokes * PI * 2 - 0.12, w = new THREE.Path();
    for (let a = 0; a <= 4; a++) { const t = a0 + (a1 - a0) * a / 4; const x = Math.cos(t) * rim, y = Math.sin(t) * rim; a === 0 ? w.moveTo(x, y) : w.lineTo(x, y); }
    for (let a = 4; a >= 0; a--) { const t = a0 + (a1 - a0) * a / 4; const x = Math.cos(t) * hub * 1.9, y = Math.sin(t) * hub * 1.9; w.lineTo(x, y); }
    sh.holes.push(w);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); return g;
}
function clockFaceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#e8d9b0'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill(); g.strokeStyle = '#4a3010'; g.lineWidth = 8; g.stroke();
  g.fillStyle = '#3a2410'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 26px Georgia';
  const R = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2 - H; g.fillText(R[i], 128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); }
  for (let i = 0; i < 60; i++) { const a = i / 60 * PI * 2; g.lineWidth = i % 5 ? 2 : 4; g.beginPath(); g.moveTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.lineTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function buildClosedWorlds(scene, terrain, net) {
  const rnd = mulberry(99);
  const place = (sector, n, rMin, rMax, cb) => { let c = 0; for (let t = 0; t < n * 20 && c < n; t++) { const r = rMin + rnd() * (rMax - rMin), a = sector * PI / 4 + (rnd() - 0.5) * PI / 4 * 0.9; const x = Math.cos(a) * r, z = -Math.sin(a) * r; if (sectorIndex(x, z) !== sector || net.nearest(x, z, 12)) continue; cb(x, terrain.heightAt(x, z), z, c++); } };
  const instanced = (geo, material, list, shadow = false) => { const inst = new THREE.InstancedMesh(geo, material, list.length); list.forEach((m, i) => inst.setMatrixAt(i, m)); inst.castShadow = shadow; inst.receiveShadow = true; scene.add(inst); return inst; };

  // ---- Néon-Bas : gratte-ciels à façades vitrées lumineuses, enseignes verticales, anneaux néon, balises
  { const winTex = neonTexture(mulberry(11));
    const winM = new THREE.MeshStandardMaterial({ color: '#0d0a1c', roughness: 0.45, metalness: 0.55, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 1.5 });
    const TW = 8.8, TH = 12, CW = 2.2, CH = 3;
    const mk = (blocks) => { const k = new Kit(); for (const [w, h, d, y] of blocks) k.add(windowBox(w, h, d, CW, CH, TW, TH), winM, { p: [0, y + h / 2, 0] }); return k; };
    const types = [
      { k: mk([[10, 36, 10, 0], [7.6, 16, 7.6, 36], [4.4, 9, 4.4, 52]]), h: 61, w: 10 },
      { k: mk([[12, 22, 8, 0], [9, 12, 6, 22]]), h: 34, w: 12 },
      { k: mk([[9, 52, 9, 0], [6.4, 20, 6.4, 52], [3.4, 12, 3.4, 72]]), h: 84, w: 9 },
      { k: mk([[14, 14, 14, 0], [10, 10, 10, 14], [6, 9, 6, 24]]), h: 33, w: 14 },
    ];
    const lists = types.map(() => []), blades = [[], [], []], rings = [[], []], beacons = [], spires = [];
    place(1, 150, 260, 1300, (x, y, z) => {
      const ti = Math.floor(rnd() * types.length), T = types[ti], s = 0.8 + rnd() * 0.5, ry = Math.floor(rnd() * 4) * H + (rnd() - 0.5) * 0.25;
      lists[ti].push(M4(x, y - 1, z, ry, [s, s, s]));
      const hh = T.h * s, ww = T.w * s;
      spires.push(M4(x, y + hh + 6 * s, z, ry, [0.25 * s, 12 * s, 0.25 * s])); beacons.push(M4(x, y + hh + 12.4 * s, z, 0, [0.7 * s, 0.7 * s, 0.7 * s]));
      const c = Math.floor(rnd() * 3), side = Math.floor(rnd() * 4) * H + ry;
      blades[c].push(M4(x + Math.sin(side) * (ww * 0.5 + 0.4), y + hh * (0.35 + rnd() * 0.2), z + Math.cos(side) * (ww * 0.5 + 0.4), side, [1, 0.6 * hh * (0.3 + rnd() * 0.3), 1]));
      if (rnd() < 0.7) rings[Math.floor(rnd() * 2)].push(M4(x, y + hh * (0.55 + rnd() * 0.3), z, 0, [ww * 0.62, ww * 0.62, ww * 0.62], H, 0));
    });
    types.forEach((T, i) => instanced(T.k.geometry(), winM, lists[i], false));
    const neonCol = ['#ff2fb8', '#2fe6ff', '#ffb030'];
    blades.forEach((l, i) => instanced(new THREE.BoxGeometry(0.5, 1, 1.6), glow(neonCol[i], 3.2), l));
    rings.forEach((l, i) => instanced(new THREE.TorusGeometry(1, 0.04, 4, 20), glow(neonCol[i], 3.5), l));
    instanced(new THREE.CylinderGeometry(1, 1, 1, 5), mat('#2a2a38', { metalness: 0.7 }), spires);
    instanced(new THREE.IcosahedronGeometry(1, 0), glow('#ff2a3a', 4), beacons);
  }

  // ---- Archipel suspendu : îles flottantes (roche suspendue, prairie, arbres, cascades, maisonnette)
  { const rock = mat('#8a7a68', { flatShading: true, roughness: 0.95 }), rock2 = mat('#6f6252', { flatShading: true }), grass = mat('#79b84f', { flatShading: true }), dirt = mat('#6b4a32', { flatShading: true }), trunk = mat('#5a3a20'), leaf = mat('#4f9a3a', { flatShading: true }), leaf2 = mat('#f0a0b8', { flatShading: true }), pine = mat('#2f6a46', { flatShading: true }), water = glow('#a8e4ff', 0.9), mist = mat('#ffffff', { emissive: '#cfeaff', emissiveIntensity: 0.6, roughness: 1 }), wall = mat('#e8dcc4'), roofM = mat('#b04a3a'), win = glow('#ffcf70', 1.5), vine = mat('#3f8a3a', { flatShading: true });
    const base = (k, v) => {
      k.add(jitter(G.cone(1.0, 1.9, 9), 40 + v, 0.18, 0.4), rock, { p: [0, -0.95, 0], r: [PI, 0, 0] });
      k.add(jitter(G.cone(0.55, 1.3, 7), 60 + v, 0.15), rock2, { p: [0.2, -2.1, -0.1], r: [PI, 0.4, 0] });
      for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + v; k.add(G.cone(0.07, 0.5 + (i % 3) * 0.35, 5), rock2, { p: [Math.cos(a) * 0.55, -0.7, Math.sin(a) * 0.55], r: [PI, 0, 0] }); }
      k.add(jitter(G.cyl(1.03, 0.98, 0.16, 10), 20 + v, 0.06), dirt, { p: [0, -0.02, 0] });
      k.add(jitter(G.cyl(1.0, 1.03, 0.14, 10), 30 + v, 0.05), grass, { p: [0, 0.1, 0] });
      for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; k.add(G.cone(0.04, 0.45 + (i % 2) * 0.3, 4), vine, { p: [Math.cos(a) * 1.0, -0.2, Math.sin(a) * 1.0], r: [PI, 0, 0] }); }
    };
    const treeA = (k, x, z, s) => { k.add(G.cyl(0.035 * s, 0.05 * s, 0.4 * s, 5), trunk, { p: [x, 0.3 * s, z] }); k.add(jitter(new THREE.IcosahedronGeometry(0.2 * s, 0), 3, 0.05), leaf, { p: [x, 0.62 * s, z] }); k.add(jitter(new THREE.IcosahedronGeometry(0.15 * s, 0), 4, 0.05), leaf, { p: [x + 0.08 * s, 0.8 * s, z + 0.03 * s] }); };
    const treeB = (k, x, z, s) => { k.add(G.cyl(0.03 * s, 0.045 * s, 0.35 * s, 5), trunk, { p: [x, 0.27 * s, z] }); for (let i = 0; i < 3; i++) k.add(G.cone((0.24 - i * 0.06) * s, 0.34 * s, 6), pine, { p: [x, (0.45 + i * 0.22) * s, z] }); };
    const kinds = [];
    { const k = new Kit(); base(k, 1); treeA(k, 0.3, 0.1, 1.2); treeA(k, -0.45, -0.2, 0.9); treeB(k, 0.1, -0.55, 1.0); treeA(k, -0.2, 0.55, 0.7);
      k.add(G.box(0.11, 1.5, 0.05), water, { p: [0.0, -0.68, 1.0] }); k.add(G.box(0.18, 0.1, 0.24), water, { p: [0, 0.05, 0.98] }); k.add(G.sph(0.2, 6, 4), mist, { p: [0, -1.5, 1.0], s: [1.5, 0.5, 1.5] }); kinds.push(k); }
    { const k = new Kit(); base(k, 2); k.add(G.box(0.5, 0.35, 0.4), wall, { p: [0.1, 0.35, 0] }); k.add(G.cone(0.42, 0.3, 4), roofM, { p: [0.1, 0.68, 0], r: [0, PI / 4, 0] }); k.add(G.box(0.1, 0.12, 0.02), win, { p: [0.0, 0.38, 0.21] }); k.add(G.box(0.1, 0.12, 0.02), win, { p: [0.25, 0.38, 0.21] }); k.add(G.box(0.08, 0.22, 0.08), rock, { p: [-0.05, 0.8, -0.1] });
      treeB(k, -0.55, 0.25, 1.1); treeB(k, -0.4, -0.35, 0.8); treeA(k, 0.62, 0.4, 0.8); k.add(G.cyl(0.18, 0.18, 0.04, 8), mat('#4a9ad0', { emissive: '#3a7aaa', emissiveIntensity: 0.3 }), { p: [0.3, 0.19, 0.5] }); kinds.push(k); }
    { const k = new Kit(); base(k, 3); for (const sx of [-0.28, 0.28]) k.add(G.box(0.12, 0.7, 0.12), rock, { p: [sx, 0.45, 0] }); k.add(G.box(0.8, 0.13, 0.15), rock, { p: [0, 0.85, 0] }); k.add(G.box(0.35, 0.05, 0.35), grass, { p: [0, 0.92, 0] });
      for (const [x, z, s] of [[-0.5, -0.4, 1.0], [0.4, -0.5, 0.8]]) { k.add(G.cyl(0.03 * s, 0.045 * s, 0.35 * s, 5), trunk, { p: [x, 0.27 * s, z] }); k.add(jitter(new THREE.IcosahedronGeometry(0.22 * s, 0), 8, 0.05), leaf2, { p: [x, 0.6 * s, z] }); }
      k.add(G.box(0.13, 1.2, 0.05), water, { p: [-0.7, -0.5, 0.6] }); k.add(G.sph(0.2, 6, 4), mist, { p: [-0.7, -1.2, 0.62], s: [1.4, 0.5, 1.4] }); kinds.push(k); }
    const lists = kinds.map(() => []);
    place(2, 78, 250, 1300, (x, y, z, i) => { const s = 5 + rnd() * 14; lists[i % 3].push(M4(x, y + 18 + rnd() * 50, z, rnd() * 6, [s, s, s])); });
    kinds.forEach((k, i) => instKit(scene, k, lists[i], true));
    // petits rochers en lévitation + bancs de nuages
    const pebs = []; place(2, 90, 250, 1300, (x, y, z) => { const s = 0.8 + rnd() * 3; pebs.push(M4(x, y + 14 + rnd() * 70, z, rnd() * 6, [s * 1.3, s, s], rnd(), rnd())); });
    instanced(new THREE.IcosahedronGeometry(1, 0), rock, pebs, false);
    const cl = [], ck = new Kit(), cm = mat('#ffffff', { roughness: 1, emissive: '#dfeeff', emissiveIntensity: 0.08, flatShading: true });
    for (let i = 0; i < 7; i++) ck.add(new THREE.IcosahedronGeometry(1, 1), cm, { p: [(i - 3) * 0.7, Math.sin(i * 1.7) * 0.25, Math.cos(i * 2.3) * 0.3], s: [1.1 - Math.abs(i - 3) * 0.12, 0.55, 0.9] });
    place(2, 60, 250, 1300, (x, y, z) => { const s = 8 + rnd() * 16; cl.push(M4(x, y + 26 + rnd() * 30, z, rnd() * 6, [s, s * 0.7, s])); });
    instKit(scene, ck, cl, false);
  }

  // ---- Chronocline : engrenages géants (certains tournent), tours-horloges, ressorts, pendule
  { const brass = MAT.brass(), copper = MAT.copper(), dkb = mat('#8a6a2c', { metalness: 0.8, roughness: 0.4 });
    const gears = [gearGeometry(18, 1.0, 0.86, 6, 0.28), gearGeometry(12, 1.0, 0.84, 5, 0.3), gearGeometry(24, 1.0, 0.9, 8, 0.22)];
    const gl = [[], [], []];
    place(3, 70, 250, 1300, (x, y, z, i) => { const s = 4 + rnd() * 14, gi = i % 3; gl[gi].push(M4(x, y + s * (0.35 + rnd() * 0.3), z, rnd() * 6, [s, s, s], (rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.5)); });
    gears.forEach((g, i) => instanced(g, i === 1 ? copper : (i === 2 ? dkb : brass), gl[i], true));
    // ressorts / ressorts de barillet
    { const pts = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * PI * 6; pts.push([Math.cos(a) * 0.5, i / 40 * 3, Math.sin(a) * 0.5]); } const coil = G.tube(pts, 0.07, 80, 5), cl = []; place(3, 40, 250, 1300, (x, y, z) => { const s = 3 + rnd() * 6; cl.push(M4(x, y - 0.3, z, rnd() * 6, [s, s, s])); }); instanced(coil, copper, cl, true); }
    // paires d'engrenages animés (engrènent en sens inverse)
    const pairs = [], gk = new Map();
    const gearMesh = (gi, mm) => { const m = new THREE.Mesh(gears[gi], mm); m.castShadow = true; m.receiveShadow = true; return m; };
    place(3, 6, 300, 1100, (x, y, z) => {
      const r1 = 7 + rnd() * 6, r2 = r1 * 0.62, ang = rnd() * PI * 2, tilt = (rnd() - 0.5) * 0.5, yaw = rnd() * 6;
      const g = new THREE.Group(); g.position.set(x, y + r1 * 0.55, z); g.rotation.set(0, yaw, tilt);
      const a = gearMesh(0, brass); a.scale.setScalar(r1); g.add(a);
      const b = gearMesh(1, copper); b.scale.setScalar(r2); b.position.set(r1 + r2 - 0.1 * r2, 0, 0.0); g.add(b);
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 8), dkb); axle.rotation.x = H; axle.scale.setScalar(r1 * 0.2); g.add(axle);
      scene.add(g); pairs.push({ a, b, r1, r2, ph: ang });
    });
    // tours-horloges
    const stone = mat('#6a5a3a', { roughness: 0.85, flatShading: true }), roofM = mat('#2f6a58', { metalness: 0.5, roughness: 0.5 }), faceTex = clockFaceTexture(), hands = [];
    const faceM = new THREE.MeshStandardMaterial({ map: faceTex, emissive: '#ffd080', emissiveMap: faceTex, emissiveIntensity: 0.45 });
    place(3, 5, 400, 1150, (x, y, z) => {
      const W = 8 + rnd() * 4, Ht = 55 + rnd() * 25, g = new THREE.Group(); const k = new Kit();
      k.add(G.box(W * 1.5, 6, W * 1.5), stone, { p: [0, 3, 0] }); k.add(G.cyl(W * 0.62, W * 0.78, Ht, 4), stone, { p: [0, Ht / 2 + 4, 0], r: [0, PI / 4, 0] });
      for (let i = 1; i < 6; i++) k.add(G.box(W * 1.06 - i * 0.2, 0.7, W * 1.06 - i * 0.2), brass, { p: [0, 4 + i * Ht / 6.3, 0], r: [0, 0, 0] });
      k.add(G.box(W * 1.5, W * 1.45, W * 1.5), stone, { p: [0, Ht + 4 + W * 0.72, 0] });
      k.add(G.cone(W * 1.15, W * 1.8, 4), roofM, { p: [0, Ht + 4 + W * 1.45 + W * 0.9, 0], r: [0, PI / 4, 0] }); k.add(G.cyl(0.18, 0.18, W * 0.9, 5), brass, { p: [0, Ht + 4 + W * 3.6, 0] }); k.add(G.sph(0.55, 8, 6), brass, { p: [0, Ht + 4 + W * 4.05, 0] });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(G.cone(W * 0.18, W * 0.7, 4), brass, { p: [sx * W * 0.7, Ht + 4 + W * 1.7, sz * W * 0.7], r: [0, PI / 4, 0] });
      g.add(k.build());
      const hy = Ht + 4 + W * 0.72, fd = W * 0.755;
      for (let f = 0; f < 4; f++) {
        const fg = new THREE.Group(); fg.rotation.y = f * H; fg.position.set(0, hy, 0);
        const face = new THREE.Mesh(new THREE.CircleGeometry(W * 0.62, 28), faceM); face.position.z = fd; fg.add(face);
        const hm = new THREE.Mesh(new THREE.BoxGeometry(0.5, W * 0.38, 0.12), MAT.iron()); hm.geometry.translate(0, W * 0.15, 0); hm.position.z = fd + 0.1;
        const mm = new THREE.Mesh(new THREE.BoxGeometry(0.34, W * 0.55, 0.1), MAT.iron()); mm.geometry.translate(0, W * 0.22, 0); mm.position.z = fd + 0.2;
        fg.add(hm, mm); g.add(fg); hands.push({ hm, mm, f });
      }
      g.position.set(x, y - 2, z); g.rotation.y = rnd() * 6; scene.add(g);
    });
    // pendules géants (balancier visible au pied de quelques tours)
    const pend = [];
    place(3, 4, 380, 1100, (x, y, z) => {
      const L = 40 + rnd() * 20, g = new THREE.Group(), k = new Kit();
      k.add(G.box(1, L, 0.6), mat('#8a6a2c', { metalness: 0.8, roughness: 0.4 }), { p: [0, -L / 2, 0] }); k.add(G.cyl(L * 0.12, L * 0.12, 1.2, 20), brass, { p: [0, -L, 0], r: [H, 0, 0] }); k.add(G.cyl(L * 0.09, L * 0.09, 1.4, 14), copper, { p: [0, -L, 0], r: [H, 0, 0] });
      g.add(k.build()); const frame = new Kit(); for (const sx of [-1, 1]) beam(frame, stone, [sx * 12, 0, 0], [sx * 3, L + 6, 0], 2.2, 2.2); frame.add(G.box(30, 2, 2.2), stone, { p: [0, L + 6, 0] });
      const ry = rnd() * 6, root = new THREE.Group(); root.position.set(x, y + L + 6, z); root.rotation.y = ry; root.add(g); scene.add(root);
      const fr = frame.build(); fr.position.set(x, y, z); fr.rotation.y = ry; scene.add(fr);
      pend.push({ g, ph: rnd() * 6, L });
    });
    sceneAnim(scene, (t) => {
      for (const p of pairs) { const w = 0.12; p.a.rotation.z = t * w + p.ph; p.b.rotation.z = -t * w * p.r1 / p.r2 + p.ph + PI / 12; }
      for (const h of hands) { h.mm.rotation.z = -(t / 40) * PI * 2; h.hm.rotation.z = -(t / 480) * PI * 2 + h.f; }
      for (const p of pend) p.g.rotation.z = Math.sin(t * 0.9 + p.ph) * 0.32;
    });
  }

  // ---- Le Colosse : défenses, cages thoraciques, plaques dorsales, rochers moussus, fougères géantes
  { const bone = mat('#e9dfc6', { roughness: 0.7, flatShading: true }), boneD = mat('#cdbf9d', { roughness: 0.75, flatShading: true }), plate = mat('#58683c', { flatShading: true, roughness: 0.9 }), plateTip = mat('#9aa66a', { flatShading: true }), moss = mat('#5f8a3a', { flatShading: true, roughness: 0.95 });
    // défenses effilées avec bagues
    { const k = new Kit(); k.add(taperTube([[0, 0, 0], [0.3, 1.2, 0], [1.2, 2.2, 0], [2.6, 2.6, 0], [3.4, 2.1, 0]], 0.42, 0.04, 22, 8), bone); for (const t of [0.1, 0.22]) k.add(G.tor(0.4, 0.07, 5, 10), boneD, { p: [0.15 + t, 0.5 + t * 3, 0], r: [H, 0, -0.3] });
      const list = []; place(0, 50, 260, 1300, (x, y, z) => { const s = 5 + rnd() * 10; list.push(M4(x, y - 1, z, rnd() * 6, [s, s, s])); }); instKit(scene, k, list, true); }
    // cages thoraciques (5 côtes en arc)
    { const k = new Kit(); for (let i = 0; i < 5; i++) { const pts = []; const rr = 3.6 - Math.abs(i - 2) * 0.35, hh = 5 - Math.abs(i - 2) * 0.5; for (let a = 0; a <= 8; a++) { const t = a / 8 * PI * 0.92; pts.push([Math.cos(t) * rr, Math.sin(t) * hh - 0.6, (i - 2) * 2.7]); } k.add(taperTube(pts, 0.4, 0.16, 16, 6), i % 2 ? bone : boneD); k.add(G.sph(0.5, 6, 5), boneD, { p: [rr, -0.5, (i - 2) * 2.7] }); k.add(G.sph(0.5, 6, 5), boneD, { p: [-rr, -0.5, (i - 2) * 2.7] }); } k.add(G.cyl(0.35, 0.35, 12, 6), boneD, { p: [0, 4.0, 0], r: [H, 0, 0] });
      const list = []; place(0, 24, 260, 1300, (x, y, z) => { const s = 2.5 + rnd() * 5; list.push(M4(x, y, z, rnd() * 6, [s, s, s])); }); instKit(scene, k, list, true); }
    // rangées de plaques dorsales
    { const k = new Kit(); for (let i = 0; i < 7; i++) { const h = 2 + Math.sin(i / 6 * PI) * 3 + (i % 2) * 0.4, x = (i - 3) * 1.7; k.add(G.cone(1.0, h, 4), plate, { p: [x, h / 2, 0], s: [1, 1, 0.28], r: [0, PI / 4, (i - 3) * 0.04] }); k.add(G.cone(0.38, h * 0.4, 4), plateTip, { p: [x, h * 0.85, 0], s: [1, 1, 0.3], r: [0, PI / 4, (i - 3) * 0.04] }); }
      const list = []; place(0, 40, 260, 1300, (x, y, z) => { const s = 2.2 + rnd() * 3.5; list.push(M4(x, y - 0.3, z, rnd() * 6, [s, s, s])); }); instKit(scene, k, list, true); }
    // rochers moussus + calotte d'herbe
    const rg = rockGeometry(7), capG = new THREE.IcosahedronGeometry(1, 1);
    const rl = [], cl2 = []; place(0, 120, 240, 1300, (x, y, z) => { const s = 2 + rnd() * 6, ry = rnd() * 6; rl.push(M4(x, y, z, ry, [s, s * 0.7, s])); cl2.push(M4(x, y + s * 0.5, z, ry, [s * 1.1, s * 0.3, s * 0.95])); });
    instanced(rg, mat('#7a7058', { flatShading: true, roughness: 0.95 }), rl, true); instanced(capG, moss, cl2);
    // fougères géantes
    { const k = new Kit(); for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; k.add(taperTube([[0, 0, 0], [Math.cos(a) * 0.9, 1.3, Math.sin(a) * 0.9], [Math.cos(a) * 2.1, 1.6, Math.sin(a) * 2.1]], 0.12, 0.02, 6, 4), mat('#4f7a30', { flatShading: true })); k.add(G.cone(0.35, 1.4, 4), mat('#6aa23c', { flatShading: true }), { p: [Math.cos(a) * 1.8, 1.45, Math.sin(a) * 1.8], r: [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0], s: [1, 1, 0.5] }); }
      const list = []; place(0, 150, 240, 1300, (x, y, z) => { const s = 1 + rnd() * 2; list.push(M4(x, y, z, rnd() * 6, [s, s, s])); }); instKit(scene, k, list, false); }
  }

  // ---- Fonderie-Rêve : coulées de cire, bougies géantes allumées, creusets qui versent, cheminées, flaques
  { const waxM = mat('#ff9a3a', { emissive: '#ff5a00', emissiveIntensity: 0.35, roughness: 0.3 }), candle = mat('#f2dcb0', { roughness: 0.55 }), candleD = mat('#d8b980', { roughness: 0.6 }), flame = glow('#ffb030', 3.5), flame2 = glow('#fff0a0', 4), lava = glow('#ff5a10', 2.2), clay = mat('#5a3320', { roughness: 0.9, flatShading: true }), brick = mat('#7a3a22', { flatShading: true, roughness: 0.95 });
    const drip = G.lathe([[0, 0], [1.2, 0], [1.0, 0.4], [0.7, 1.2], [0.75, 2.2], [0.5, 3.0], [0.55, 3.6], [0.2, 4.2], [0, 4.3]], 16);
    const dl = []; place(6, 90, 250, 1300, (x, y, z) => { const s = 2 + rnd() * 7; dl.push(M4(x, y - 0.5, z, rnd() * 6, [s, s * (0.6 + rnd()), s], (rnd() - 0.5) * 0.4)); });
    instanced(drip, waxM, dl, true);
    // bougies géantes
    { const k = new Kit(); k.add(G.lathe([[0, 0], [1.1, 0], [1.0, 1], [0.95, 8], [0.85, 9.2], [0.4, 9.5], [0.0, 9.3]], 14), candle); for (let i = 0; i < 5; i++) { const a = i * 1.3; k.add(G.cone(0.14, 3 + (i % 3) * 1.8, 5), candleD, { p: [Math.cos(a) * 0.9, 8.4 - (i % 3) * 0.9, Math.sin(a) * 0.9], r: [PI, 0, 0], s: [1.3, 1, 1.3] }); k.add(G.sph(0.22, 5, 4), candleD, { p: [Math.cos(a) * 0.93, 8.4 - (i % 3) * 0.9 - 1.5 - (i % 3) * 0.9, Math.sin(a) * 0.93] }); }
      k.add(G.cyl(0.05, 0.05, 0.7, 4), mat('#2a1a10'), { p: [0, 9.8, 0] }); k.add(G.cone(0.35, 1.6, 6), flame, { p: [0, 10.8, 0], s: [1, 1, 1] }); k.add(G.cone(0.18, 1.0, 5), flame2, { p: [0, 10.5, 0] });
      k.add(G.cyl(1.9, 2.0, 0.12, 14), waxM, { p: [0, 0.03, 0] });
      const list = []; place(6, 26, 260, 1300, (x, y, z) => { const s = 1.5 + rnd() * 2.8; list.push(M4(x, y - 0.1, z, rnd() * 6, [s, s, s], (rnd() - 0.5) * 0.12)); }); instKit(scene, k, list, true); }
    // creusets qui versent
    { const k = new Kit(); k.add(G.lathe([[0, 0], [1.4, 0], [2.2, 2.4], [2.4, 3.2], [2.2, 3.3], [2.0, 3.1], [1.3, 0.3], [0, 0.25]], 14), clay); k.add(G.cyl(2.1, 2.1, 0.06, 14), lava, { p: [0, 3.0, 0] });
      for (const sx of [-1, 1]) k.add(G.tor(2.3, 0.12, 4, 12, PI), mat('#2a2a2c', { metalness: 0.7 }), { p: [0, 3.2, 0], r: [0, sx * 0.0, 0] });
      for (const sx of [-1, 1]) beam(k, mat('#2a2a2c', { metalness: 0.7 }), [sx * 3.2, 0, 0], [sx * 0.6, 7, 0], 0.4, 0.4); k.add(G.box(8, 0.5, 0.5), mat('#2a2a2c', { metalness: 0.7 }), { p: [0, 7, 0] });
      k.add(G.box(0.5, 4, 0.2), lava, { p: [2.55, 1.2, 0] }); k.add(G.cyl(2.2, 2.4, 0.08, 12), lava, { p: [2.5, 0.05, 0], s: [1, 1, 0.9] });
      const list = []; place(6, 22, 260, 1300, (x, y, z) => { const s = 1.4 + rnd() * 2.2; list.push(M4(x, y, z, rnd() * 6, [s, s, s])); }); instKit(scene, k, list, true); }
    // cheminées d'usine incandescentes
    { const k = new Kit(); k.add(G.cyl(1.6, 2.6, 24, 10), brick, { p: [0, 12, 0] }); for (const y of [4, 10, 16]) k.add(G.tor(2.4 - y * 0.035, 0.18, 4, 10), mat('#2a2a2c', { metalness: 0.7 }), { p: [0, y, 0], r: [H, 0, 0] }); k.add(G.cyl(1.9, 1.6, 1.2, 10), brick, { p: [0, 24.4, 0] }); k.add(G.cyl(1.4, 1.4, 0.2, 10), lava, { p: [0, 24.9, 0] }); k.add(G.cone(1.3, 3, 8), glow('#ff7a20', 1.5), { p: [0, 26.2, 0], s: [1, 1, 1] }); k.add(G.box(3, 2.8, 0.2), mat('#1a0e08'), { p: [0, 1.4, 2.4] }); k.add(G.box(2, 1.6, 0.12), lava, { p: [0, 1.0, 2.5] });
      const list = []; place(6, 16, 280, 1300, (x, y, z) => { const s = 0.8 + rnd() * 1.1; list.push(M4(x, y - 0.5, z, rnd() * 6, [s, s, s])); }); instKit(scene, k, list, true); }
    // flaques de métal fondu
    { const pg = G.lathe([[0, 0.02], [1.6, 0.02], [2.0, 0.1], [1.9, 0.3], [0, 0.3]], 10), pl = []; place(6, 70, 250, 1300, (x, y, z) => { const s = 1.5 + rnd() * 5; pl.push(M4(x, y + 0.02, z, rnd() * 6, [s, 1, s * (0.6 + rnd() * 0.6)])); }); instanced(pg, lava, pl); }
  }

  // ---- Les Entrailles : forêt de champignons géants phosphorescents, lamelles, spores, tentacules
  { const stalk = mat('#d8c8e8', { roughness: 0.8, flatShading: true }), capA = mat('#8a4fb8', { roughness: 0.7, flatShading: true, emissive: '#6a2fa0', emissiveIntensity: 0.45 }), capB = mat('#2f9a9a', { roughness: 0.7, flatShading: true, emissive: '#1a8a80', emissiveIntensity: 0.45 }), gill = mat('#43225f', { roughness: 0.9 }), spotA = glow('#d08cff', 2.6), spotB = glow('#5dffd0', 2.6), bulb = glow('#9affd0', 2.2), vein = mat('#6a3a86', { emissive: '#8a40c0', emissiveIntensity: 0.5, roughness: 0.6, flatShading: true });
    const cap = (k, m, sp, x, y, z, r, h, st = 1) => { k.add(jitter(G.sph(r, 12, 6, 0, PI * 2, 0, H), 12, 0.12 * r), m, { p: [x, y, z], s: [1, h / r, 1] }); k.add(G.cyl(r * 0.98, r * 0.3, 0.12 * r, 12), gill, { p: [x, y - 0.02, z] }); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + y, rr = r * (0.35 + (i % 3) * 0.2); k.add(G.sph(r * 0.08, 5, 4), sp, { p: [x + Math.cos(a) * rr, y + h * Math.sqrt(Math.max(0, 1 - (rr / r) ** 2)) * 0.98, z + Math.sin(a) * rr], s: [1, 0.5, 1] }); } void st; };
    const kinds = [];
    { const k = new Kit(); k.add(G.cyl(0.18, 0.3, 2.2, 8), stalk, { p: [0, 1.1, 0] }); k.add(G.tor(0.22, 0.04, 4, 8), stalk, { p: [0, 1.6, 0], r: [H, 0, 0] }); cap(k, capA, spotA, 0, 2.15, 0, 1.25, 0.75); kinds.push(k); }
    { const k = new Kit(); k.add(taperTube([[0, 0, 0], [0.25, 1.2, 0.1], [0.1, 2.6, 0.2], [-0.3, 3.7, 0.4]], 0.3, 0.14, 10, 7), stalk); cap(k, capB, spotB, -0.35, 3.7, 0.4, 1.0, 0.55); k.add(taperTube([[0.2, 0.3, 0], [0.9, 0.9, 0.2], [1.3, 1.5, 0.3]], 0.14, 0.08, 6, 6), stalk); cap(k, capB, spotB, 1.3, 1.5, 0.3, 0.55, 0.3); kinds.push(k); }
    { const k = new Kit(); k.add(G.cyl(0.14, 0.2, 1.1, 7), stalk, { p: [0, 0.55, 0] }); cap(k, capA, spotA, 0, 1.0, 0, 0.7, 0.35); k.add(G.cyl(0.1, 0.16, 0.8, 7), stalk, { p: [0.9, 0.4, 0.3] }); cap(k, capB, spotB, 0.9, 0.75, 0.3, 0.5, 0.28); k.add(G.cyl(0.1, 0.16, 0.6, 7), stalk, { p: [-0.7, 0.3, 0.5] }); cap(k, capA, spotA, -0.7, 0.58, 0.5, 0.4, 0.22); kinds.push(k); }
    { const k = new Kit(); k.add(jitter(G.cone(1.2, 2.2, 6), 9, 0.2), mat('#3a2a44', { flatShading: true }), { p: [0, 1.0, 0] });
      for (let i = 0; i < 3; i++) { const y = 0.7 + i * 0.55; k.add(G.cyl(1.5 - i * 0.3, 1.4 - i * 0.3, 0.16, 12, false), i % 2 ? capB : capA, { p: [0.55, y, 0], s: [1, 1, 0.7], r: [0, 0, 0.12] }); k.add(G.cyl(0.07, 0.07, 0.04, 6), i % 2 ? spotB : spotA, { p: [0.55 + 0.9 - i * 0.2, y + 0.1, 0] }); } kinds.push(k); }
    const lists = kinds.map(() => []);
    place(7, 170, 240, 1300, (x, y, z, i) => { const ki = i % 4, s = (ki === 0 ? 2.2 : 1.8) + rnd() * 6; lists[ki].push(M4(x, y - 0.1, z, rnd() * 6, [s, s, s], (rnd() - 0.5) * 0.25)); });
    kinds.forEach((k, i) => instKit(scene, k, lists[i], false));
    // bulbes phosphorescents + coraux
    { const k = new Kit(); for (let i = 0; i < 5; i++) { const a = i * 1.26, h = 0.6 + (i % 3) * 0.35; k.add(G.cyl(0.03, 0.045, h, 5), stalk, { p: [Math.cos(a) * 0.35, h / 2, Math.sin(a) * 0.35] }); k.add(G.sph(0.14 + (i % 2) * 0.05, 6, 5), bulb, { p: [Math.cos(a) * 0.35, h + 0.1, Math.sin(a) * 0.35] }); }
      const list = []; place(7, 220, 240, 1300, (x, y, z) => { const s = 0.8 + rnd() * 1.6; list.push(M4(x, y, z, rnd() * 6, [s, s, s])); }); instKit(scene, k, list, false); }
    { const k = new Kit(); for (let i = 0; i < 7; i++) { const a = i * 0.9; k.add(G.cone(0.2, 1.4 + (i % 3) * 0.8, 5), vein, { p: [Math.cos(a) * (0.2 + i * 0.07), 0.7 + (i % 3) * 0.4, Math.sin(a) * (0.2 + i * 0.07)], r: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4] }); }
      const list = []; place(7, 90, 240, 1300, (x, y, z) => { const s = 1.2 + rnd() * 2.8; list.push(M4(x, y, z, rnd() * 6, [s, s, s])); }); instKit(scene, k, list, false); }
    // arches de tentacules veineuses
    { const k = new Kit(); k.add(taperTube([[-3, 0, 0], [-3.4, 3, 0.5], [-1.5, 6.4, 0], [1.5, 6.2, -0.5], [3.2, 3, 0], [3.4, 0, 0.3]], 0.55, 0.3, 22, 7), vein); for (const [x, y, z] of [[-3.4, 3, 0.5], [3.2, 3, 0]]) k.add(G.sph(0.35, 6, 5), bulb, { p: [x + 0.3, y, z + 0.4] }); k.add(G.sph(0.4, 6, 5), spotA, { p: [0, 6.4, -0.1] });
      const list = []; place(7, 22, 260, 1300, (x, y, z) => { const s = 1.5 + rnd() * 2.5; list.push(M4(x, y - 0.3, z, rnd() * 6, [s, s, s])); }); instKit(scene, k, list, true); }
  }
}
