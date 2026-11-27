// Monde « colosse » : les rails sont posés sur le dos d'une créature qui marche.
// Repère : la Cloche de l'Échine (clocher de bronze sur la plus haute vertèbre), le Hameau-Écaille,
// la peau qui respire (dômes animés loin des voies), Grignoteux, Mère Lichen, puces-wagons, 6 fragments.
import * as THREE from 'three';
import { Kit, G, mat, MAT, glow } from '../kit.js';
import { mulberry } from '../../util/noise.js';
import { WORLD_LORE } from '../../data/lore.js';

const PI = Math.PI, H = PI / 2;
const LORE = WORLD_LORE.find(w => w.id === 'colosse');

export function buildWorld(scene, terrain, net, ctx) {
  const rnd = mulberry(90210);
  const hAt = (x, z) => terrain.heightAt(x, z);
  const free = (x, z, r) => net.nearest(x, z, r) === null;
  const inSector = (x, z, deg = 20) => Math.abs(Math.atan2(-z, x)) < deg * PI / 180;
  const placed = []; // vérification : { n, x, z, y } (y = base posée)
  // base d'un objet large : minimum du sol sous l'emprise (le reste est enfoui)
  const baseY = (x, z, r, n = 8) => { let m = hAt(x, z); for (let i = 0; i < n; i++) { const a = i / n * PI * 2; m = Math.min(m, hAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return m; };
  // emprise entièrement libre (>= d m de toute voie)
  const clear = (x, z, r, d) => { if (!free(x, z, d + r)) { for (let k = 0; k <= 16; k++) { const a = k / 16 * PI * 2, rr = k === 16 ? 0 : r; if (!free(x + Math.cos(a) * rr, z + Math.sin(a) * rr, d)) return false; } } return true; };

  // ---------------------------------------------------------------- matériaux
  const M = {
    bone: mat('#ddcfa6', { roughness: 0.75, flatShading: true }), boneD: mat('#a8946a', { roughness: 0.85, flatShading: true }),
    moss: mat('#5f7a2e', { roughness: 1, flatShading: true }), skin: mat('#86704a', { roughness: 0.9, flatShading: true }),
    bronze: mat('#b5782e', { metalness: 0.85, roughness: 0.3 }), wood: MAT.wood(), woodD: MAT.woodDark(),
    scale: mat('#c98a2e', { roughness: 0.45, metalness: 0.2, flatShading: true }), mud: mat('#9b8259', { roughness: 0.95, flatShading: true }),
    cloth: mat('#7a2f2a', { roughness: 0.9 }), cloth2: mat('#3f6b5a', { roughness: 0.9 }), brass: MAT.brass(), iron: MAT.iron(),
    lamp: glow('#ffb347', 2.6), amber: mat('#e8a33a', { emissive: '#b85a00', emissiveIntensity: 0.6, roughness: 0.3 }),
    hair: mat('#5c4a2a', { roughness: 1, flatShading: true }), fur: mat('#8a5a3a', { roughness: 1, flatShading: true }),
    eye: mat('#fff6d8', { emissive: '#ffe9a0', emissiveIntensity: 0.6 }), rust: mat('#8c3b22', { roughness: 0.55, metalness: 0.4 }),
  };
  const K = new Kit(); // tout le statique du monde : 1 draw call par matériau

  // ---------------------------------------------------------------- 1. La Cloche de l'Échine
  let L = null;
  for (const [x, z] of [[830, -150], [860, -170], [800, -165], [900, -150], [760, -170], [620, 150], [820, 150]]) if (inSector(x, z, 19) && clear(x, z, 42, 26)) { L = { x, z }; break; }
  if (!L) L = { x: 830, z: -150 };
  L.y = baseY(L.x, L.z, 40, 16);
  const toTrack = new THREE.Vector2(-L.x * 0 + 0, -L.z).normalize(); // vers la voie principale (z = 0)
  const SC = 1.5, LK = (geo, m, p, r = [0, 0, 0], s = [1, 1, 1]) => K.add(geo, m, { p: [L.x + p[0] * SC, L.y + p[1] * SC, L.z + p[2] * SC], r, s: s.map(v => v * SC) });
  // corps vertébral (enfoui), apophyses transverses plongeant dans le sol, colonne-épine
  LK(G.sph(1, 14, 10), M.skin, [0, -1.5, 0], [0, 0, 0], [24, 9, 19]);
  LK(G.sph(1, 12, 9), M.bone, [0, -0.5, 0], [0, 0, 0], [17, 12, 13]);
  for (const sx of [-1, 1]) {
    LK(G.cone(3.6, 21, 7), M.bone, [sx * 17.7, 1.5, 0], [0, 0, sx * -(H + 0.25)]);
    LK(G.cone(1.6, 9, 6), M.boneD, [sx * 9, 5, sx * 6], [sx * 0.5, 0, sx * -(H + 0.6)]);
  }
  const prof = [[5.6, 0], [4.6, 6], [3.4, 14], [2.8, 22], [3.2, 27], [4.6, 29.3], [0, 29.6]];
  const rAt = h => { for (let i = 1; i < prof.length - 1; i++) if (h <= prof[i][1]) { const [r0, h0] = prof[i - 1], [r1, h1] = prof[i]; return r0 + (r1 - r0) * (h - h0) / (h1 - h0); } return 4.6; };
  LK(G.lathe(prof, 12), M.bone, [0, 2, 0], [0, 0, 0], [1, 1, 0.72]);
  for (let i = 0; i < 6; i++) LK(G.tor(rAt(4 + i * 4) * 1.02 + 0.1, 0.35, 5, 14), M.boneD, [0, 6 + i * 4, 0], [H, 0, 0], [1, 0.72, 1]);
  // mousse sur le dos de la vertèbre
  for (let i = 0; i < 9; i++) { const a = rnd() * PI * 2, r = 6 + rnd() * 8; LK(G.sph(1, 7, 5), M.moss, [Math.cos(a) * r, -0.5 + 12 * Math.sqrt(1 - (r / 17.5) ** 2) - 0.4, Math.sin(a) * r * 0.7], [0, a, 0], [2.6 + rnd() * 2, 0.8, 2 + rnd() * 1.5]); }
  // escalier de planches qui s'enroule autour de l'épine
  for (let k = 10; k <= 38; k++) {
    const h = 6.2 + k * 0.6, a = k * 0.3 + 0.6, r = rAt(h - 2) + 1.05, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.78;
    LK(G.box(2.2, 0.22, 0.95), M.wood, [x, h, z], [0, -a, 0]);
    if (k % 3 === 0) { LK(G.cyl(0.08, 0.08, 1.5, 5), M.woodD, [Math.cos(a) * (r + 1.0), h + 0.7, Math.sin(a) * (r + 1.0) * 0.78]); LK(G.cyl(0.07, 0.07, 1.6, 5), M.woodD, [x, h - 0.8, z]); }
  }
  // plate-forme + clocher
  const TOP = 31.6;
  LK(G.cyl(5.8, 4.6, 1.4, 12), M.mud, [0, TOP - 0.7, 0]);
  LK(G.cyl(6.0, 6.0, 0.25, 12), M.woodD, [0, TOP + 0.12, 0]);
  for (const [px, pz] of [[-2.6, -2.6], [2.6, -2.6], [2.6, 2.6], [-2.6, 2.6]]) {
    LK(G.box(0.6, 8, 0.6), M.wood, [px, TOP + 4, pz]);
    LK(G.box(0.9, 0.6, 0.9), M.bronze, [px, TOP + 0.3, pz]);
    LK(G.sph(0.32, 8, 6), M.lamp, [px * 1.25, TOP + 6.2, pz * 1.25]);
    LK(G.cyl(0.05, 0.05, 0.8, 4), M.iron, [px * 1.25, TOP + 6.75, pz * 1.25]);
  }
  for (const s of [-1, 1]) { LK(G.box(6, 0.5, 0.5), M.woodD, [0, TOP + 7.8, s * 2.6]); LK(G.box(0.5, 0.5, 6), M.woodD, [s * 2.6, TOP + 7.8, 0]); LK(G.box(5.6, 0.3, 0.3), M.wood, [0, TOP + 1.4, s * 2.6]); LK(G.box(0.3, 0.3, 5.6), M.wood, [s * 2.6, TOP + 1.4, 0]); }
  LK(G.box(6.2, 0.5, 0.6), M.woodD, [0, TOP + 7.2, 0]);
  LK(G.cone(5.2, 6.5, 4), M.scale, [0, TOP + 11.3, 0], [0, PI / 4, 0]);
  LK(G.cone(5.5, 0.6, 4), M.woodD, [0, TOP + 8.1, 0], [0, PI / 4, 0]);
  LK(G.cyl(0.12, 0.12, 3, 5), M.bronze, [0, TOP + 15.5, 0]); LK(G.sph(0.45, 8, 6), M.bronze, [0, TOP + 16.2, 0]);
  placed.push({ n: 'cloche', x: L.x, z: L.z, y: L.y, r: 40 });
  // la cloche (animée)
  const bell = new THREE.Group(); bell.position.set(L.x, L.y + (TOP + 7.0) * SC, L.z); bell.scale.setScalar(SC);
  { const bk = new Kit(); bk.add(G.lathe([[0, 0], [1.9, 0], [1.75, 0.35], [1.3, 1.2], [1.12, 2.3], [0.95, 2.8], [0.45, 3.05], [0, 3.05]], 18), M.bronze, { p: [0, -3.3, 0] });
    bk.add(G.tor(1.85, 0.12, 5, 18), M.bronze, { p: [0, -3.25, 0], r: [H, 0, 0] }); bk.add(G.box(0.3, 0.5, 0.3), M.iron, { p: [0, -0.1, 0] });
    bk.add(G.cyl(0.06, 0.06, 2.4, 4), M.iron, { p: [0, -1.6, 0] }); bk.add(G.sph(0.32, 8, 6), M.iron, { p: [0, -2.9, 0] });
    bell.add(bk.build()); }
  scene.add(bell);

  // l'échine : vertèbres plus petites alignées (la colonne du Colosse affleure)
  for (const [dx, s] of [[-52, 0.5], [52, 0.5], [-96, 0.36], [96, 0.38], [-136, 0.26], [136, 0.28]]) {
    const x = L.x + dx, z = L.z + (rnd() - 0.5) * 6; if (!inSector(x, z, 20) || !clear(x, z, 20 * s + 8, 25)) continue;
    const y = baseY(x, z, 18 * s, 10), sc = (v) => v * s;
    K.add(G.sph(1, 10, 8), M.bone, { p: [x, y - sc(4), z], s: [sc(17), sc(11), sc(13)] });
    K.add(G.lathe(prof.slice(0, 5).concat([[0, 27]]), 10), M.bone, { p: [x, y, z], s: [s, s * 0.8, s * 0.72] });
    for (const sx of [-1, 1]) K.add(G.cone(3.6 * s, 21 * s, 6), M.boneD, { p: [x + sx * 17.7 * s, y + 1.5 * s - 1, z], r: [0, 0, sx * -(H + 0.25)] });
    K.add(G.sph(1, 7, 5), M.moss, { p: [x, y + sc(5.5), z], s: [sc(9), sc(2), sc(7)] });
    placed.push({ n: 'vertebre', x, z, y, r: 18 * s });
  }

  // ---------------------------------------------------------------- Hameau-Écaille + marché
  const huts = [];
  for (let i = 0; i < 14 && huts.length < 9; i++) {
    const a = Math.atan2(toTrack.y, toTrack.x) + (i - 6.5) * 0.3, r = 48 + (i % 3) * 7;
    const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
    if (!clear(x, z, 4, 14) || huts.some(h => Math.hypot(h.x - x, h.z - z) < 10)) continue;
    const y = baseY(x, z, 3.2), s = 0.85 + rnd() * 0.4, ry = rnd() * PI * 2; huts.push({ x, z, y });
    K.add(G.cyl(2.6 * s, 2.9 * s, 3.6 * s, 10), M.mud, { p: [x, y + 1.6 * s - 0.4, z] });
    K.add(G.cone(3.7 * s, 3.2 * s, 10), M.scale, { p: [x, y + 4.6 * s - 0.4, z], r: [0, ry, 0] });
    K.add(G.cone(3.2 * s, 2.2 * s, 10), M.moss, { p: [x, y + 5.6 * s - 0.4, z], r: [0, ry + 0.3, 0], s: [0.6, 1, 0.6] });
    for (let k = 0; k < 8; k++) { const b = ry + k / 8 * PI * 2; K.add(G.cone(0.75 * s, 1.2 * s, 4), M.scale, { p: [x + Math.cos(b) * 3.3 * s, y + 3.1 * s - 0.4, z + Math.sin(b) * 3.3 * s], r: [Math.sin(b) * 2.3, 0, -Math.cos(b) * 2.3], s: [1, 1, 0.35] }); }
    const dx = Math.cos(ry) * 2.75 * s, dz = Math.sin(ry) * 2.75 * s;
    K.add(G.box(1.1 * s, 1.9 * s, 0.3), M.woodD, { p: [x + dx, y + 0.95 * s - 0.15, z + dz], r: [0, -ry + H, 0] });
    K.add(G.sph(0.22, 6, 5), M.lamp, { p: [x + dx * 1.12, y + 2.3 * s, z + dz * 1.12] });
    K.add(G.cyl(0.35, 0.45, 2.2, 6), M.mud, { p: [x - dz * 0.6, y + 4.9 * s, z + dx * 0.6] });
    placed.push({ n: 'case', x, z, y, r: 3.2 });
  }
  // place du marché, entre le village et la voie
  let Mk = null;
  for (const r of [84, 76, 92, 70, 100]) { const x = L.x + toTrack.x * r + 10, z = L.z + toTrack.y * r; if (clear(x, z, 9, 12)) { Mk = { x, z }; break; } }
  if (!Mk) Mk = { x: L.x + 10, z: L.z + toTrack.y * 60 };
  Mk.y = hAt(Mk.x, Mk.z);
  const stalls = [];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * PI * 2 + 0.4, x = Mk.x + Math.cos(a) * 7, z = Mk.z + Math.sin(a) * 7, y = baseY(x, z, 2), ry = -a + H;
    const off = (u, v) => [x + Math.cos(-ry) * u - Math.sin(-ry) * v, z + Math.sin(-ry) * u + Math.cos(-ry) * v];
    for (const [u, v] of [[-1.4, -0.8], [1.4, -0.8], [-1.4, 0.8], [1.4, 0.8]]) { const [px, pz] = off(u, v); K.add(G.cyl(0.09, 0.09, 2.8, 5), M.woodD, { p: [px, y + 1.2, pz] }); }
    { const [px, pz] = off(0, 0); K.add(G.box(3.2, 0.25, 1.9), M.wood, { p: [px, y + 0.95, pz], r: [0, ry, 0] });
      K.add(G.box(3.5, 0.12, 2.3), i % 2 ? M.cloth : M.cloth2, { p: [px, y + 2.65, pz], r: [0.18, ry, 0] });
      for (let k = 0; k < 7; k++) { const [qx, qz] = off(-1.2 + k * 0.4, (rnd() - 0.5) * 0.9); K.add(G.cone(0.22, 0.4, 4), M.amber, { p: [qx, y + 1.25, qz], r: [rnd(), rnd() * 3, rnd() * 0.6] }); } }
    { const [px, pz] = off(2.2, 0.4); K.add(G.cyl(0.4, 0.35, 0.7, 8), M.woodD, { p: [px, y + 0.3, pz] }); K.add(G.sph(0.42, 7, 5), M.amber, { p: [px, y + 0.7, pz], s: [1, 0.5, 1] }); }
    stalls.push({ x, z }); placed.push({ n: 'etal', x, z, y, r: 2 });
  }

  // ---------------------------------------------------------------- 4. Fragments (plaques à lire)
  const frags = [];
  { const wantX = [L.x - 20, Mk.x - 60, 240, Mk.x + 30, 1060, 440];
    for (let i = 0; i < 6; i++) {
      let best = null;
      for (let dx = 0; dx < 80 && !best; dx += 8) for (const sgn of [Math.sign(L.z) || -1, -(Math.sign(L.z) || -1)]) for (const d of [12, 14, 17]) {
        const x = wantX[i] + (dx % 16 ? -dx : dx), z = sgn * d + (i === 0 || i === 3 ? 0 : 0);
        if (best || !inSector(x, z) || !free(x, z, 11) || free(x, z, 22) || frags.some(f => Math.hypot(f.x - x, f.z - z) < 40)) continue;
        best = { x, z };
      }
      if (!best) continue;
      const q = net.nearest(best.x, best.z, 24), tp = net.edges[q.edge].pts[q.k], face = Math.atan2(tp.x - best.x, tp.z - best.z);
      const y = baseY(best.x, best.z, 0.6, 6), fx = Math.sin(face), fz = Math.cos(face);
      K.add(G.cyl(0.12, 0.16, 2.0, 6), M.woodD, { p: [best.x, y + 0.7, best.z] });
      K.add(G.box(1.25, 0.85, 0.12), M.brass, { p: [best.x + fx * 0.12, y + 1.55, best.z + fz * 0.12], r: [-0.35, face, 0], s: [1, 1, 1] });
      K.add(G.box(1.05, 0.65, 0.05), M.woodD, { p: [best.x + fx * 0.2, y + 1.57, best.z + fz * 0.2], r: [-0.35, face, 0] });
      K.add(G.cone(0.55, 0.35, 4), M.scale, { p: [best.x, y + 2.15, best.z], r: [0, face + PI / 4, 0] });
      K.add(G.sph(0.11, 6, 5), M.lamp, { p: [best.x - fx * 0.15, y + 1.95, best.z - fz * 0.15] });
      K.add(G.cyl(0.45, 0.55, 0.3, 7), M.mud, { p: [best.x, y + 0.05, best.z] });
      frags.push({ ...best, y, i, f: LORE.fragments[i], id: `colosse:${i}` }); placed.push({ n: 'fragment', x: best.x, z: best.z, y, r: 0.6 });
    } }

  // ---------------------------------------------------------------- 2. Habillage : touffes de pelage géant, écailles tombées
  { const tk = new Kit(); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; tk.add(G.cone(0.18, 5 + (i % 3), 4), M.hair, { p: [Math.cos(a) * 0.7, 2.6, Math.sin(a) * 0.7], r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] }); }
    tk.add(G.cone(0.2, 7, 4), M.hair, { p: [0, 3.4, 0] });
    const list = []; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let t = 0; t < 900 && list.length < 70; t++) { const r = 160 + rnd() * 1180, a = (rnd() - 0.5) * 0.7, x = Math.cos(a) * r, z = -Math.sin(a) * r;
      if (!free(x, z, 12) || Math.hypot(x - L.x, z - L.z) < 40 || Math.hypot(x - Mk.x, z - Mk.z) < 14) continue;
      const s = 0.8 + rnd() * 1.3, y = baseY(x, z, 0.9 * s, 5) - 0.3; m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set((rnd() - 0.5) * 0.2, rnd() * 6, (rnd() - 0.5) * 0.2)), new THREE.Vector3(s, s, s)); list.push(m4.clone()); placed.push({ n: 'touffe', x, z, y: y + 0.3, r: 0.9 * s }); }
    const im = new THREE.InstancedMesh(tk.geometry(), M.hair, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; scene.add(im); }
  { // écailles ambrées tombées (mues), à demi enfoncées
    const list = []; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let t = 0; t < 700 && list.length < 90; t++) { const r = 150 + rnd() * 1200, a = (rnd() - 0.5) * 0.7, x = Math.cos(a) * r, z = -Math.sin(a) * r;
      if (!free(x, z, 10)) continue; const s = 0.8 + rnd() * 1.6, y = baseY(x, z, 0.8 * s, 4);
      m4.compose(new THREE.Vector3(x, y - 0.3 * s, z), q.setFromEuler(e.set(0.5 + rnd() * 0.5, rnd() * 6, 0)), new THREE.Vector3(s, s, s * 0.3)); list.push(m4.clone()); placed.push({ n: 'ecaille', x, z, y, r: 0.8 * s }); }
    const im = new THREE.InstancedMesh(G.cone(1, 1.6, 5), M.amber, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.receiveShadow = true; scene.add(im); }

  scene.add(K.build());

  // ---------------------------------------------------------------- 5. La peau qui respire : dômes animés (loin des voies)
  const domes = [];
  for (let t = 0; t < 2000 && domes.length < 16; t++) {
    const R = 14 + rnd() * 24, r = 200 + rnd() * 1150, a = (rnd() - 0.5) * 0.68, x = Math.cos(a) * r, z = -Math.sin(a) * r;
    if (!inSector(x, z, 19) || !free(x, z, R + 32) || Math.hypot(x - L.x, z - L.z) < R + 60 || Math.hypot(x - Mk.x, z - Mk.z) < R + 20 || domes.some(d => Math.hypot(d.x - x, d.z - z) < d.R + R + 6)) continue;
    const g = Math.min(baseY(x, z, R * 0.95, 16), baseY(x, z, R * 0.6, 12)); domes.push({ x, z, R, y: g - R * 0.42, ph: rnd() * PI * 2, sp: 0.35 + rnd() * 0.2, top: new THREE.Vector3(x, g + R * 0.38, z), g });
    placed.push({ n: 'dome', x, z, y: g, r: R * 0.95 });
  }
  const domeIM = new THREE.InstancedMesh(G.sph(1, 12, 8), M.skin, domes.length); domeIM.castShadow = true; domeIM.receiveShadow = true; domeIM.frustumCulled = false; scene.add(domeIM);
  const plateIM = new THREE.InstancedMesh(new Kit().add(G.cone(0.09, 0.16, 4), M.bone, { p: [0, 0.79, 0], s: [1, 1, 0.35] }).add(G.cone(0.07, 0.12, 4), M.bone, { p: [0.18, 0.75, 0.1], r: [0, 0, -0.25], s: [1, 1, 0.35] }).add(G.cone(0.07, 0.12, 4), M.bone, { p: [-0.18, 0.75, -0.05], r: [0, 0, 0.25], s: [1, 1, 0.35] }).geometry(), M.bone, domes.length); plateIM.frustumCulled = false; plateIM.castShadow = true; scene.add(plateIM);
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const breath = (d, t) => 1 + 0.07 * Math.sin(t * d.sp + d.ph);
  const setDomes = (t) => { domes.forEach((d, i) => { const b = breath(d, t), sx = 1 + (b - 1) * 0.3; tm.compose(tv.set(d.x, d.y, d.z), tq.identity(), ts.set(d.R * sx, d.R * 0.8 * b, d.R * sx)); domeIM.setMatrixAt(i, tm); plateIM.setMatrixAt(i, tm); }); domeIM.instanceMatrix.needsUpdate = true; plateIM.instanceMatrix.needsUpdate = true; };
  setDomes(0);

  // ---------------------------------------------------------------- 3. Habitants
  // Grignoteux : boules de poils marchandes autour du marché
  const gk = new Kit(); gk.add(G.sph(0.42, 8, 6), M.fur, { p: [0, 0.38, 0], s: [1, 0.85, 1.1] });
  for (const s of [-1, 1]) { gk.add(G.cone(0.12, 0.35, 4), M.fur, { p: [s * 0.22, 0.8, 0.05], r: [0, 0, -s * 0.3] }); gk.add(G.cyl(0.06, 0.05, 0.2, 4), M.fur, { p: [s * 0.18, 0.08, 0.15] }); }
  gk.add(G.cone(0.1, 0.5, 4), M.fur, { p: [0, 0.45, -0.5], r: [-1.1, 0, 0] });
  const ek = new Kit(); for (const s of [-1, 1]) ek.add(G.sph(0.11, 6, 5), M.eye, { p: [s * 0.15, 0.5, 0.38] }); ek.add(G.cone(0.16, 0.28, 4), M.amber, { p: [0, 0.78, -0.1], r: [-0.5, 0, 0], s: [1, 1, 0.4] });
  const NG = 10, grigs = [];
  for (let i = 0; i < NG; i++) grigs.push({ r: 1.8 + rnd() * 2, a: rnd() * PI * 2, sp: (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.3), ph: rnd() * 6, hop: 2 + rnd() * 2 });
  const grigIM = new THREE.InstancedMesh(gk.geometry(), M.fur, NG), grigE = new THREE.InstancedMesh(ek.geometry(), M.eye, NG);
  for (const m of [grigIM, grigE]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }
  // Mère Lichen
  const lichen = new THREE.Group(); { const lk = new Kit();
    lk.add(G.cone(0.75, 1.7, 9), M.moss, { p: [0, 0.85, 0] }); lk.add(G.sph(0.32, 8, 6), M.skin, { p: [0, 1.85, 0.05] });
    lk.add(G.sph(0.42, 8, 6, 0, PI * 2, 0, PI / 1.7), M.moss, { p: [0, 1.95, -0.02] }); for (let k = 0; k < 6; k++) lk.add(G.sph(0.18, 5, 4), M.moss, { p: [Math.cos(k) * 0.5, 0.4 + k * 0.22, Math.sin(k) * 0.5] });
    for (const s of [-1, 1]) lk.add(G.sph(0.05, 5, 4), M.eye, { p: [s * 0.11, 1.9, 0.32] }); lk.add(G.sph(0.13, 6, 5), M.amber, { p: [0, 1.4, 0.55] });
    lichen.add(lk.build()); }
  const cane = new THREE.Group(); { const ck = new Kit(); ck.add(G.cyl(0.04, 0.05, 1.7, 5), M.woodD, { p: [0, -0.85, 0] }); ck.add(G.sph(0.09, 6, 5), M.amber, { p: [0, 0.02, 0] }); cane.add(ck.build()); }
  cane.position.set(0.55, 1.55, 0.25); lichen.add(cane);
  { const a = Math.atan2(-Mk.z, 0) ; const x = Mk.x + 3.5, z = Mk.z + (Math.sign(-Mk.z) || 1) * 3.5; lichen.position.set(x, baseY(x, z, 0.5, 6) - 0.05, z); lichen.rotation.y = Math.atan2(-x + Mk.x, -z + Mk.z) + a * 0; placed.push({ n: 'lichen', x, z, y: lichen.position.y + 0.05, r: 0.5 }); }
  scene.add(lichen);
  // Puces-wagons : insectes-locomotives qui trottinent près des voies
  const pk = new Kit(); pk.add(G.cyl(0.45, 0.45, 1.4, 10), M.rust, { p: [0, 0.75, 0], r: [H, 0, 0] }); pk.add(G.sph(0.5, 8, 6), M.rust, { p: [0, 0.85, -0.55], s: [1, 0.9, 0.8] }); pk.add(G.cyl(0.12, 0.18, 0.55, 6), M.rust, { p: [0, 1.35, 0.35] });
  const pk2 = new Kit(); pk2.add(G.cyl(0.47, 0.47, 0.12, 10), M.brass, { p: [0, 0.75, 0.72], r: [H, 0, 0] }); pk2.add(G.sph(0.12, 6, 5), M.lamp, { p: [0, 0.75, 0.79] }); pk2.add(G.tor(0.46, 0.05, 4, 10), M.brass, { p: [0, 0.75, 0], r: [0, 0, 0] });
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) pk2.add(G.cyl(0.035, 0.03, 0.95, 4), M.iron, { p: [s * 0.55, 0.38, -0.45 + k * 0.45], r: [0, 0, s * 0.5] });
  for (const s of [-1, 1]) pk2.add(G.cyl(0.02, 0.02, 0.7, 3), M.iron, { p: [s * 0.15, 1.35, 0.85], r: [0.9, 0, s * 0.3] });
  const fleas = [];
  for (let t = 0; t < 400 && fleas.length < 4; t++) { const x = 200 + rnd() * 1050, z = (rnd() < 0.5 ? -1 : 1) * (22 + rnd() * 30);
    if (!clear(x, z, 7, 11) || fleas.some(f => Math.hypot(f.x - x, f.z - z) < 120)) continue; fleas.push({ x, z, r: 4 + rnd() * 3, sp: 0.35 + rnd() * 0.2, ph: rnd() * 6 }); }
  const fleaIM = new THREE.InstancedMesh(pk.geometry(), M.rust, fleas.length), fleaIM2 = new THREE.InstancedMesh(pk2.geometry(), M.brass, fleas.length);
  for (const m of [fleaIM, fleaIM2]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }
  // spores ambrées qui dérivent autour du clocher et du marché (VFX lumineux)
  const NS = 36, spores = []; for (let i = 0; i < NS; i++) { const c = i < 22 ? L : Mk; spores.push({ c, r: 4 + rnd() * (i < 22 ? 22 : 10), a: rnd() * 6, h: 2 + rnd() * (i < 22 ? 30 : 5), sp: 0.1 + rnd() * 0.2, ph: rnd() * 6 }); }
  const sporeIM = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.14, 0), glow('#ffcf6a', 3), NS); sporeIM.frustumCulled = false; scene.add(sporeIM);
  // halo de fragment (un seul, déplacé sur la plaque la plus proche)
  const halo = new THREE.Mesh(G.sph(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })); halo.visible = false; scene.add(halo);

  for (const m of [domeIM, plateIM, grigIM, grigE, fleaIM, fleaIM2, sporeIM]) { m.userData.noChunk = true; m.userData.noCull = true; } // animées : pas de découpe par cull.js
  // ---------------------------------------------------------------- update
  let wasE = false, sneezeT = 40 + rnd() * 30, swing = 0, swingV = 0, lastRing = -9, lichenLine = 0, grigLine = 0, near = false;
  const v3 = new THREE.Vector3(), eul = new THREE.Euler();
  const ring = (vol) => { const a = ctx.audio; if (!a?.ready) return; const t = a.now; for (const [f, v, d] of [[196, 1, 4], [392, 0.5, 3], [466, 0.35, 2.2], [587, 0.25, 1.6], [784, 0.15, 1]]) a.tone(t, f, d, { vol: vol * v * 0.18, attack: 0.004 }); };
  if (typeof window !== 'undefined') window.__colosse = { L, Mk, frags, domes, fleas, placed, huts, grigIM, lichen };

  return {
    update(dt, time, camPos) {
      const dCam = camPos ? Math.hypot(camPos.x - L.x, camPos.z - L.z) : 0, inRange = !camPos || Math.hypot(camPos.x - 760, camPos.z) < 760;
      for (const m of [domeIM, plateIM, grigIM, grigE, fleaIM, fleaIM2, sporeIM]) m.visible = inRange;
      if (!inRange) return;
      setDomes(time);
      // éternuement / grattage : la cloche sonne toute seule
      sneezeT -= dt;
      if (sneezeT <= 0) { sneezeT = 70 + Math.random() * 50; swingV += 1.6;
        if (dCam < 600) { ring(Math.max(0.15, 1 - dCam / 600)); lastRing = time;
          for (const d of domes) if (Math.hypot(camPos.x - d.x, camPos.z - d.z) < 500) for (let k = 0; k < 6; k++) ctx.smoke?.emit(v3.set(d.x + (Math.random() - 0.5) * d.R, d.top.y, d.z + (Math.random() - 0.5) * d.R), new THREE.Vector3((Math.random() - 0.5) * 4, 4 + Math.random() * 4, (Math.random() - 0.5) * 4), { life: 3, size: 4, color: '#c9b98a', alpha: 0.45 });
          const pp = ctx.player?.pos; if (pp && Math.hypot(pp.x - L.x, pp.z - L.z) < 450) ctx.ui?.toast('Le Colosse se gratte… <b>la Cloche de l’Échine</b> sonne toute seule !'); } }
      swingV += (-swing * 3.2 - swingV * 0.35) * dt; swing += swingV * dt;
      bell.rotation.z = swing * 0.5 + Math.sin(time * 0.7) * 0.03; bell.rotation.x = swing * 0.12;
      if (Math.abs(swing) > 0.5 && time - lastRing > 1.4 && dCam < 600) { ring(0.4 * (1 - dCam / 600)); lastRing = time; }
      // respiration : bouffées de poussière aux sommets des dômes qui expirent
      for (const d of domes) { const ph = Math.cos(time * d.sp + d.ph); if (ph < -0.95 && Math.random() < dt * 3 && Math.hypot(camPos.x - d.x, camPos.z - d.z) < 450) ctx.smoke?.emit(v3.set(d.x, d.top.y + 0.5, d.z), new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.5, (Math.random() - 0.5) * 1.5), { life: 2.5, size: 2.5, color: '#d8caa0', alpha: 0.3 }); }
      // Grignoteux
      const jump = Math.max(0, swing * swing * 2);
      grigs.forEach((g, i) => { g.a += g.sp * dt / Math.max(1, g.r * 0.25); const x = Mk.x + Math.cos(g.a) * g.r, z = Mk.z + Math.sin(g.a) * g.r, hop = Math.abs(Math.sin(time * g.hop + g.ph)) * (0.35 + jump);
        const sq = 1 + (hop < 0.05 ? -0.12 : 0.05); tm.compose(tv.set(x, hAt(x, z) + hop, z), tq.setFromEuler(eul.set(0, -g.a + (g.sp > 0 ? 0 : PI), 0)), ts.set(1.15 / Math.sqrt(sq), 1.15 * sq, 1.15 / Math.sqrt(sq))); grigIM.setMatrixAt(i, tm); grigE.setMatrixAt(i, tm); });
      grigIM.instanceMatrix.needsUpdate = grigE.instanceMatrix.needsUpdate = true;
      // Mère Lichen tapote le sol trois fois
      { const c = (time * 1.4) % 4; cane.rotation.x = c < 3 ? -Math.abs(Math.sin(c * PI)) * 0.35 : 0; lichen.children[0].rotation.z = Math.sin(time * 0.6) * 0.04; }
      // puces-wagons
      fleas.forEach((f, i) => { const a = time * f.sp + f.ph, x = f.x + Math.cos(a) * f.r, z = f.z + Math.sin(a) * f.r * 0.6, hop = Math.max(0, Math.sin(time * 6 + i)) * 0.15;
        tm.compose(tv.set(x, hAt(x, z) + hop, z), tq.setFromEuler(eul.set(0, Math.atan2(-Math.sin(a), Math.cos(a) * 0.6), 0)), ts.set(1.6, 1.6, 1.6)); fleaIM.setMatrixAt(i, tm); fleaIM2.setMatrixAt(i, tm);
        if (Math.random() < dt * 1.5 && camPos && Math.hypot(camPos.x - x, camPos.z - z) < 200) ctx.steam?.emit(v3.set(x, tv.y + 2.6, z), new THREE.Vector3(0, 1.5, 0), { life: 1, size: 0.7, color: '#ffffff', alpha: 0.4 }); });
      fleaIM.instanceMatrix.needsUpdate = fleaIM2.instanceMatrix.needsUpdate = true;
      // spores
      spores.forEach((s, i) => { const a = s.a + time * s.sp; tm.compose(tv.set(s.c.x + Math.cos(a) * s.r, s.c.y + s.h + Math.sin(time * 0.8 + s.ph) * 0.8, s.c.z + Math.sin(a) * s.r), tq.identity(), ts.setScalar(0.7 + 0.5 * Math.sin(time * 3 + s.ph))); sporeIM.setMatrixAt(i, tm); });
      sporeIM.instanceMatrix.needsUpdate = true;
      // interactions à pied : fragments, Mère Lichen, Grignoteux
      const P = ctx.player, inp = ctx.input; if (!P || !inp) return;
      const E = !!inp.ah?.('interact'), press = E && !wasE; wasE = E;
      let nf = null; if (P.mode === 'foot') for (const f of frags) if (Math.hypot(P.pos.x - f.x, P.pos.z - f.z) < 3) nf = f;
      halo.visible = !!nf; if (nf) { halo.position.set(nf.x, nf.y + 1.6 + Math.sin(time * 3) * 0.05, nf.z); halo.scale.setScalar(1 + Math.sin(time * 4) * 0.15); }
      if (P.mode !== 'foot' || !press || ctx.ui?.dialogOpen) return;
      if (nf) { ctx.ui.say([{ who: nf.f.title, icon: '✦', color: '#e9c46a', text: nf.f.text }]); const S = ctx.S; if (S) { S.fragments ||= []; if (!S.fragments.includes(nf.id)) { S.fragments.push(nf.id); ctx.audio?.pickup?.(); } } return; }
      if (Math.hypot(P.pos.x - lichen.position.x, P.pos.z - lichen.position.z) < 3.5) { const n = LORE.npcs[0]; ctx.ui.say([{ who: n.name, icon: '🌿', color: '#8fbf5a', text: n.lines[lichenLine++ % n.lines.length] }]); return; }
      if (Math.hypot(P.pos.x - Mk.x, P.pos.z - Mk.z) < 9) { const n = LORE.npcs[1]; ctx.ui.say([{ who: n.name, icon: '🐾', color: '#e8a33a', text: n.lines[grigLine++ % n.lines.length] }]); }
    },
  };
}
