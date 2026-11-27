import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G } from './kit.js';
import { buildSheriffModel } from './characters.js';
import { WORLD_LORE } from '../data/lore.js';

// ---------------------------------------------------------------------------------------------
// GARDIENS DE L'OCTUOR : 8 robots procéduraux (un par monde), fidèles à WORLD_LORE[i].guardian.look
//  - couleurs en attributs de sommets => 3 matériaux par robot (mat / métal / lueur), pièces statiques fusionnées
//  - pièces animées = petits groupes séparés ; 4 à 12 draw calls par robot (sauf SHÉRIF-7, modèle historique réutilisé)
//  - userData.update(dt, time, state) ; state : 'idle' | 'stuck' | 'carried' | 'home' | 'talk'
//  - base à y = 0 ; les volants (AÉRO-9, PICO-2) ont une tuyère lumineuse + une ombre au sol
// ---------------------------------------------------------------------------------------------

const PI = Math.PI, H = PI / 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const rng = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const at = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const pos = (x) => Math.max(0, x);

// matériaux propres à chaque gardien (la lueur peut pulser sans toucher aux autres)
function mats(gi = 1.3) {
  const M = {
    s: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 }),
    m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.65 }),
    g: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  M.g.color.setScalar(gi);
  return M;
}

// Kit à couleurs de sommets : f = 's' (mat), 'm' (métal), 'g' (lueur) => au plus 3 draw calls par groupe
class VK {
  constructor(M) { this.M = M; this.L = { s: [], m: [], g: [] }; }
  add(f, geo, col, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (typeof s === 'number') s = [s, s, s];
    _m.compose(_v.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...s)); g.applyMatrix4(_m);
    _c.set(col); const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    this.L[f].push(g); geo.dispose?.();
    return this;
  }
  s(...a) { return this.add('s', ...a); }
  m(...a) { return this.add('m', ...a); }
  g(...a) { return this.add('g', ...a); }
  build() {
    const grp = new THREE.Group(); grp.userData.mesh = {};
    for (const f of ['s', 'm', 'g']) {
      if (!this.L[f].length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(this.L[f], false), this.M[f]);
      if (f === 'g') { mesh.userData.noCollide = true; mesh.castShadow = false; } else { mesh.castShadow = true; mesh.receiveShadow = true; }
      grp.add(mesh); grp.userData.mesh[f] = mesh;
      for (const g of this.L[f]) g.dispose();
    }
    return grp;
  }
}

// Animation : pose(state, t, cur) renvoie des cibles ; les clés '_x' sont instantanées (oscillations), les autres lissées
function rig(root, P, pose, apply) {
  const cur = { ...P }, view = new Proxy(cur, { get: (o, k) => o[k] ?? 0 });
  root.userData.state = 'idle';
  root.userData.update = (dt = 0.016, t = 0, st = 'idle') => {
    dt = Math.min(Math.max(dt || 0, 0), 0.1); root.userData.state = st;
    const tg = pose(st, t, view), k = 1 - Math.exp(-dt * 6);
    for (const key in cur) if (key[0] === '_' && !(key in tg)) cur[key] = 0;
    for (const key in tg) {
      if (key[0] === '_' || !(key in cur)) cur[key] = tg[key];
      else cur[key] += (tg[key] - cur[key]) * k;
    }
    apply(view, t, dt, st);
  };
}

// Ombre de contact (pour les volants)
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
function shadowDisc(r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), SHADOW_MAT);
  m.rotation.x = -H; m.position.y = 0.03; m.renderOrder = 1; m.userData.noCollide = true;
  return m;
}

// Petites particules instanciées (vapeur, fumée, cendres, spores, gouttes) : 1 draw call
function puffs(n, color, { glow = false, op = 0.7 } = {}) {
  const mat = glow
    ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: op < 1, opacity: op, depthWrite: op >= 1, flatShading: true });
  const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat, n);
  m.frustumCulled = false; m.castShadow = false; m.userData.noCollide = true;
  const ps = Array.from({ length: n }, () => ({ a: 9, l: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0 }));
  const o = new THREE.Object3D(); let acc = 0;
  const hide = (i) => { o.position.set(0, 0.5, 0); o.scale.setScalar(1e-4); o.updateMatrix(); m.setMatrixAt(i, o.matrix); };
  for (let i = 0; i < n; i++) hide(i);
  m.userData.step = (dt, on, src, { rate = 4, vel = [0, 1, 0], spread = 0.1, life = 1.5, size = 0.12, grow = 1.5, grav = 0 } = {}) => {
    acc = Math.min(2, acc + (on ? dt * rate : 0));
    ps.forEach((p, i) => {
      if (p.a >= p.l) {
        if (acc < 1) { hide(i); return; }
        acc -= 1; p.a = 0; p.l = life * (0.7 + Math.random() * 0.6); p.s = size * (0.7 + Math.random() * 0.6);
        p.x = src[0] + (Math.random() - 0.5) * spread; p.y = src[1]; p.z = src[2] + (Math.random() - 0.5) * spread;
        p.vx = vel[0] + (Math.random() - 0.5) * spread * 2; p.vy = vel[1] * (0.8 + Math.random() * 0.4); p.vz = vel[2] + (Math.random() - 0.5) * spread * 2;
      }
      p.a += dt; p.vy -= grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.a / p.l, sc = p.s * (1 + k * grow) * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) * 0.7);
      o.position.set(p.x, p.y, p.z); o.scale.setScalar(Math.max(1e-4, sc)); o.rotation.set(p.a * 2, p.a, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  };
  return m;
}

// ================================================================== 0. BOBINE-3 : compacteur cubique sur chenilles
function buildBobine() {
  const root = new THREE.Group(), M = mats(1.4), R = at(root);
  const OCH = '#d9a13b', OCH2 = '#b4842c', BLK = '#222222', YEL = '#f0c419', RUB = '#3a3a3a', COP = '#b87333', STL = '#8a8f96';
  const rnd = rng(31);
  // chenilles (base au sol)
  const tk = new VK(M);
  for (const s of [-1, 1]) {
    const x = s * 0.6;
    tk.s(G.rbox(0.34, 0.44, 1.72, 0.2, 3), RUB, [x, 0.22, 0]);
    for (let i = 0; i < 10; i++) tk.s(G.box(0.36, 0.04, 0.08), '#262626', [x, 0.44, -0.72 + i * 0.16]);
    for (const z of [-0.6, -0.2, 0.2, 0.6]) { tk.m(G.cyl(0.13, 0.13, 0.05, 14), STL, [x + s * 0.17, 0.21, z], [0, 0, H]); tk.m(G.cyl(0.04, 0.04, 0.06, 8), COP, [x + s * 0.19, 0.21, z], [0, 0, H]); }
  }
  // chenille qui pend (côté gauche, arrière)
  tk.s(G.tube([[0.6, 0.42, -0.8], [0.63, 0.32, -0.98], [0.66, 0.16, -1.06], [0.62, 0.04, -1.16]], 0.045, 14, 5), RUB, [0, 0, 0], [0, 0, 0], [1, 1, 1]);
  for (let i = 0; i < 4; i++) tk.s(G.box(0.2, 0.03, 0.05), '#262626', [0.62 + i * 0.01, 0.36 - i * 0.1, -0.92 - i * 0.07], [0.5, 0, 0]);
  R.add(tk.build());

  // corps
  const B = at(R, 0, 0.42, 0), bk = new VK(M);
  bk.s(G.rbox(1.5, 1.12, 1.5, 0.07, 2), OCH, [0, 0.58, 0]);
  // cabosses de la moitié gauche
  bk.s(G.rbox(0.05, 0.5, 0.62, 0.02), OCH2, [0.75, 0.78, 0.25], [0, 0.05, 0.1]);
  bk.s(G.sph(0.24, 10, 8), OCH2, [0.66, 0.36, -0.35], [0, 0, 0], [0.45, 1, 1.1]);
  bk.s(G.rbox(0.55, 0.04, 0.5, 0.02), OCH2, [0.45, 1.15, 0.38], [0.06, 0, -0.06]);
  bk.s(G.sph(0.2, 10, 8), OCH2, [0.4, 0.95, 0.68], [0, 0, 0], [1.1, 0.8, 0.4]);
  // bandes de danger
  for (let i = 0; i < 8; i++) { const c = i % 2 ? BLK : YEL; bk.s(G.box(0.1875, 0.16, 0.03), c, [-0.656 + i * 0.1875, 0.12, 0.76]); bk.s(G.box(0.1875, 0.16, 0.03), c, [-0.656 + i * 0.1875, 0.12, -0.76]); }
  for (let i = 0; i < 6; i++) { const c = i % 2 ? BLK : YEL; bk.s(G.box(0.03, 0.16, 0.25), c, [-0.76, 0.12, -0.625 + i * 0.25]); }
  // œil-projecteur cerclé de cuivre
  bk.m(G.tor(0.27, 0.05, 8, 28), COP, [0, 0.8, 0.76]);
  bk.s(G.cyl(0.25, 0.25, 0.04, 24), '#151515', [0, 0.8, 0.75], [H, 0, 0]);
  bk.g(G.tor(0.215, 0.018, 6, 28), '#a5601c', [0, 0.8, 0.772]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; bk.m(G.sph(0.025, 5, 4), COP, [Math.cos(a) * 0.34, 0.8 + Math.sin(a) * 0.34, 0.76]); }
  // bouche (cavité derrière la trappe) + dents
  bk.s(G.box(0.82, 0.26, 0.02), '#0e0e0e', [0, 0.38, 0.755]);
  for (let i = 0; i < 8; i++) bk.m(G.box(0.06, 0.06, 0.04), STL, [-0.35 + i * 0.1, 0.49, 0.765]);
  // rivets sur les arêtes
  for (let i = 0; i < 9; i++) for (const [x, z] of [[-0.74, 0.74], [0.74, 0.74], [-0.74, -0.74], [0.74, -0.74]]) bk.m(G.sph(0.025, 5, 4), COP, [x, 0.08 + i * 0.13, z]);
  // charnières des bras
  for (const s of [-1, 1]) bk.m(G.cyl(0.09, 0.09, 0.06, 12), STL, [s * 0.77, 0.55, 0.2], [0, 0, H]);
  // trésors scotchés sur le toit
  for (let i = 0; i < 9; i++) bk.m(G.cyl(0.05, 0.05, 0.07, 6), i % 3 ? '#9aa3ad' : '#c9a24a', [-0.6 + rnd() * 1.0, 1.17, -0.6 + rnd() * 1.1], [rnd() * 0.3, rnd() * 3, 0]);
  for (let i = 0; i < 8; i++) bk.s(G.sph(0.1, 8, 6), '#e8a33a', [-0.6 + rnd() * 1.1, 1.15, -0.55 + rnd() * 1.1], [0, rnd() * 3, 0], [1, 0.22, 0.75]);
  for (let i = 0; i < 6; i++) bk.s(G.box(0.24, 0.012, 0.06), '#d9d0b0', [-0.55 + rnd() * 1.1, 1.145, -0.55 + rnd() * 1.1], [0, rnd() * 3, 0]);
  bk.s(G.tor(0.08, 0.02, 6, 12), '#e8a33a', [0.15, 1.16, 0.45], [H, 0, 0]);
  B.add(bk.build());

  // pupille lumineuse (balaie de gauche à droite)
  const pupil = at(B, 0, 0.8, 0.775), pk = new VK(M);
  pk.g(G.cyl(0.13, 0.13, 0.02, 20), '#ffb040', [0, 0, 0], [H, 0, 0]);
  pk.g(G.cyl(0.06, 0.06, 0.025, 14), '#fff2c0', [0, 0, 0.004], [H, 0, 0]);
  pupil.add(pk.build());
  // trappe-bouche (charnière en bas)
  const hatch = at(B, 0, 0.24, 0.775), hk = new VK(M);
  hk.s(G.rbox(0.86, 0.28, 0.05, 0.02), OCH2, [0, 0.14, 0]);
  hk.s(G.box(0.8, 0.035, 0.07), '#5a5a5a', [0, 0.02, 0]);
  for (const x of [-0.3, 0.3]) hk.s(G.box(0.1, 0.03, 0.06), BLK, [x, 0.22, 0.02]);
  hatch.add(hk.build());
  // bras-pinces repliables
  const arms = [-1, 1].map((s) => {
    const a = at(B, s * 0.82, 0.55, 0.2), ak = new VK(M);
    ak.m(G.cyl(0.05, 0.05, 0.3, 8), STL, [0, -0.15, 0]);
    ak.m(G.sph(0.07, 8, 6), COP, [0, -0.3, 0]);
    ak.m(G.cyl(0.045, 0.045, 0.22, 8), STL, [0, -0.42, 0]);
    ak.m(G.cone(0.03, 0.16, 6), '#5a5a5a', [0, -0.58, 0.05], [-0.4, 0, 0]);
    ak.m(G.cone(0.03, 0.16, 6), '#5a5a5a', [0, -0.58, -0.05], [0.4, 0, 0]);
    a.add(ak.build()); return a;
  });
  // mât-antenne tordu + fanion vert mousse
  const mast = at(B, 0.45, 1.14, -0.45), mk = new VK(M);
  mk.s(G.tube([[0, 0, 0], [0, 0.18, 0], [0.07, 0.28, 0.02], [0.02, 0.44, -0.03]], 0.022, 12, 5), '#7a7f86');
  mk.s(G.box(0.26, 0.15, 0.012), '#6a8f3a', [0.15, 0.37, -0.03], [0, 0, -0.08]);
  mk.s(G.sph(0.035, 6, 5), '#c0392b', [0.02, 0.46, -0.03]);
  mast.add(mk.build());

  rig(root, { by: 0, pitch: 0, roll: 0, arm: 0, armZ: 0, mast: 0, hatch: 0, eyeS: 1, gi: 1.4 }, (st, t) => {
    if (st === 'stuck') return { by: -0.3, pitch: 0.18, roll: 0.22, arm: -2.2, armZ: 0.3, mast: 0.7, hatch: 0.5, eyeS: 1, gi: 1, _pitch: Math.sin(t * 27) * 0.015 * (Math.sin(t * 1.3) > 0 ? 1 : 0), _armA: Math.sin(t * 6) * 0.6, _armB: Math.sin(t * 6 + 2) * 0.6, _eyeS: Math.sin(t * 11) > 0.3 ? 0 : -0.6, _eyeX: Math.sin(t * 3) * 0.1, _hatch: Math.sin(t * 8) * 0.15 };
    if (st === 'carried') return { by: 0, pitch: 0, roll: 0, arm: 0, armZ: -0.04, mast: -1.35, hatch: 0, eyeS: 0.8, gi: 0.9, _eyeX: Math.sin(t * 0.5) * 0.06 };
    if (st === 'home') return { by: 0, pitch: 0, roll: 0, arm: -2.7, armZ: 0.25, mast: 0, hatch: 0.7, eyeS: 1.2, gi: 1.9, _hop: Math.abs(Math.sin(t * 4)) * 0.22, _yaw: Math.sin(t * 2) * 0.35, _armA: Math.sin(t * 8) * 0.35, _armB: -Math.sin(t * 8) * 0.35, _mast: Math.sin(t * 6) * 0.3, _roll: Math.sin(t * 4) * 0.05 };
    if (st === 'talk') return { by: 0, pitch: 0, roll: 0, arm: -0.3, armZ: 0, mast: 0, hatch: 0, eyeS: 1, gi: 1.4, _hatch: Math.abs(Math.sin(t * 9)) * 0.3, _pitch: Math.sin(t * 3) * 0.04, _gi: Math.sin(t * 6) * 0.3, _eyeS: Math.sin(t * 6) * 0.1, _armA: Math.sin(t * 2.3) * 0.4, _mast: Math.sin(t * 1.3) * 0.1 };
    return { by: 0, pitch: 0, roll: 0, arm: -0.12, armZ: 0, mast: 0, hatch: 0, eyeS: 1, gi: 1.4, _pitch: Math.sin(t * 1.6) * 0.05, _eyeX: Math.sin(t * 0.7) * 0.1, _hatch: pos(Math.sin(t * 2.6)) * 0.22, _mast: Math.sin(t * 1.3) * 0.12 };
  }, (c) => {
    R.position.y = c._hop; R.rotation.y = c._yaw;
    B.position.y = 0.42 + c.by; B.rotation.set(c.pitch + c._pitch, 0, c.roll + c._roll);
    arms.forEach((a, i) => { a.rotation.x = c.arm + (i ? c._armB : c._armA); a.rotation.z = (i ? 1 : -1) * c.armZ; });
    mast.rotation.z = c.mast + c._mast; hatch.rotation.x = c.hatch + c._hatch;
    pupil.position.x = c._eyeX; pupil.scale.setScalar(Math.max(0.05, c.eyeS + c._eyeS));
    M.g.color.setScalar(c.gi + c._gi);
  });
  root.userData.height = 2.0;
  return root;
}

// ================================================================== 1. AÉRO-9 : drone-raie volant
function buildAero() {
  const root = new THREE.Group(), M = mats(1.5);
  const R = at(root, 0, 1.5, 0), B = at(R);
  const HULL = '#1a1030', MAG = '#ff2bd6', CY = '#2bf0ff', HAIR = '#c9b07a';
  const k = new VK(M);
  k.s(G.sph(1, 22, 12), HULL, [0, 0, 0], [0, 0, 0], [0.52, 0.17, 0.95]);
  k.s(G.sph(1, 16, 10), '#2c1b4c', [0, 0.06, 0.1], [0, 0, 0], [0.3, 0.13, 0.55]);
  k.m(G.box(0.04, 0.03, 1.2), '#3d2a66', [0, 0.17, -0.05]);
  // ailes en lames segmentées bordées de néon
  const blades = [[0.63, 1.0, 0.07], [0.88, 0.84, 0.06], [1.13, 0.64, 0.05], [1.38, 0.42, 0.04]];
  for (const s of [-1, 1]) {
    blades.forEach(([x, d, th], i) => {
      const z = -0.05 - i * 0.09;
      k.s(new THREE.BoxGeometry(0.235, th, d, 4, 1, 2), HULL, [s * x, 0, z]);
      k.g(new THREE.BoxGeometry(0.235, 0.025, 0.03, 4, 1, 1), MAG, [s * x, 0, z + d / 2 + 0.012]);
      k.g(new THREE.BoxGeometry(0.235, 0.02, 0.025, 4, 1, 1), MAG, [s * x, 0, z - d / 2 - 0.01]);
    });
    k.g(new THREE.BoxGeometry(0.03, 0.025, 0.42, 1, 1, 2), MAG, [s * 1.51, 0, -0.32]);
  }
  // brins de poils géants coincés dans les ailes
  k.s(G.tube([[0.45, 0.05, 0.35], [0.9, 0.09, 0.1], [1.3, 0.06, -0.15], [1.65, 0.0, -0.32]], 0.022, 18, 5), HAIR);
  k.s(G.tube([[-0.7, 0.05, 0.45], [-1.05, 0.08, 0.0], [-1.3, 0.04, -0.5], [-1.5, -0.05, -0.75]], 0.02, 14, 5), HAIR);
  k.s(G.tube([[-1.0, 0.04, 0.35], [-1.25, 0.06, 0.05], [-1.55, 0.02, -0.2]], 0.016, 10, 5), HAIR);
  // queue-fouet + balise cyan
  k.s(G.tube([[0, 0, -0.8], [0, 0, -1.3], [0, 0.02, -1.8], [0, 0.04, -2.25]], 0.038, 24, 6), HULL);
  k.s(G.cone(0.05, 0.2, 6), HULL, [0, 0.0, -0.9], [-H, 0, 0]);
  k.g(G.sph(0.07, 10, 8), CY, [0, 0.04, -2.3]);
  // phares rectangulaires
  for (const s of [-1, 1]) k.g(G.rbox(0.18, 0.06, 0.05, 0.015), '#cfe8ff', [s * 0.2, 0.03, 0.88], [-0.15, s * -0.3, 0]);
  // réacteurs ventraux
  for (const s of [-1, 1]) { k.s(G.cyl(0.1, 0.13, 0.09, 14), '#3a3050', [s * 0.25, -0.15, -0.1]); k.g(G.cyl(0.08, 0.08, 0.02, 14), CY, [s * 0.25, -0.2, -0.1]); }
  const body = k.build(); B.add(body);
  const flex = Object.values(body.userData.mesh).map((m) => { m.frustumCulled = false; return { m, base: m.geometry.attributes.position.array.slice() }; });
  const deform = (t, amp, curl, tail, tcurl) => {
    for (const f of flex) {
      const p = f.m.geometry.attributes.position.array, b = f.base;
      for (let i = 0; i < p.length; i += 3) {
        const x = b[i], y = b[i + 1], z = b[i + 2], ax = Math.abs(x);
        let dx = 0, dy = 0, dz = 0;
        if (ax > 0.42) { const w = ax - 0.42; dy = amp * Math.sin(ax * 2.6 - t * 3.2) * w + curl * w * w * 1.3; dx = -Math.sign(x) * curl * w * w * 0.5; }
        if (z < -0.8) { const tz = -z - 0.8; dx += tail * Math.sin(t * 3 - tz * 2.5) * tz * 0.3; dy += Math.sin(t * 2 - tz * 2) * 0.06 * tz + tcurl * tz * tz * 0.5; dz += tcurl * tz * tz * 0.4; }
        p[i] = x + dx; p[i + 1] = y + dy; p[i + 2] = z + dz;
      }
      f.m.geometry.attributes.position.needsUpdate = true;
    }
  };
  // bandeau LED à pictos de trafic (texture défilante)
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32;
  const cx = cv.getContext('2d'); cx.fillStyle = '#05020a'; cx.fillRect(0, 0, 256, 32); cx.font = 'bold 22px monospace'; cx.textBaseline = 'middle';
  [['◀', '#2bf0ff'], ['STOP', '#ff2bd6'], ['▲', '#ffe14a'], ['!', '#ff5a3a'], ['▶', '#2bf0ff'], ['30', '#cfe8ff']].forEach(([s, c], i) => { cx.fillStyle = c; cx.fillText(s, 6 + i * 42, 17); });
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = 0.55; tex.colorSpace = THREE.SRGBColorSpace;
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.065), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5) }));
  led.position.set(0, 0.1, 0.79); led.rotation.x = -0.75; led.userData.noCollide = true; B.add(led);
  // jets de sustentation (cônes additifs) + ombre au sol
  const bm = new THREE.MeshBasicMaterial({ color: CY, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const cones = [-1, 1].map((s) => new THREE.CylinderGeometry(0.07, 0.24, 1, 12, 1, true).translate(s * 0.25, -0.5, -0.1));
  const beams = new THREE.Mesh(mergeGeometries(cones), bm); beams.position.y = -0.21; beams.userData.noCollide = true; beams.castShadow = false; B.add(beams);
  const sh = shadowDisc(1); root.add(sh);

  rig(root, { hy: 1.5, yaw: 0, roll: 0, pitch: 0, amp: 0.12, curl: 0, tail: 1, tcurl: 0, led: 0.3, gi: 1.5 }, (st, t) => {
    if (st === 'stuck') return { hy: 1.0, yaw: 0, roll: 0.5, pitch: 0, amp: 0.35, curl: 0, tail: 2, tcurl: 0, led: 2, gi: 1.3, _hx: Math.cos(t * 2) * 1.1, _hz: Math.sin(t * 2) * 1.1, _yaw: -t * 2, _hy: Math.sin(t * 7) * 0.06, _roll: Math.sin(t * 13) * 0.08, _gi: Math.sin(t * 10) > 0 ? 0.6 : -0.4 };
    if (st === 'carried') return { hy: 0.42, yaw: 0, roll: 0, pitch: 0, amp: 0.03, curl: 1, tail: 0.2, tcurl: 1, led: 0.15, gi: 1 };
    if (st === 'home') {
      const ph = t % 5;
      return { hy: 2.2, yaw: 0, roll: 0, pitch: 0, amp: 0.3, curl: 0, tail: 1.5, tcurl: 0, led: 1, gi: 2, _hx: Math.sin(t * 0.9) * 1.6, _hz: Math.sin(t * 1.8) * 0.7, _yaw: Math.atan2(Math.cos(t * 0.9) * 1.44, Math.cos(t * 1.8) * 1.26), _roll: ph < 1.2 ? ph / 1.2 * PI * 2 : 0 };
    }
    if (st === 'talk') return { hy: 1.4, yaw: 0, roll: 0, pitch: 0, amp: 0.1, curl: 0, tail: 1, tcurl: 0, led: 0.6, gi: 1.6, _hy: Math.sin(t * 2) * 0.06, _pitch: Math.sin(t * 4) * 0.05, _gi: Math.sin(t * 6) * 0.4 };
    return { hy: 1.5, yaw: 0, roll: 0, pitch: 0, amp: 0.12, curl: 0, tail: 1, tcurl: 0, led: 0.3, gi: 1.5, _hx: Math.sin(t * 0.5) * 0.8, _hz: Math.sin(t) * 0.4, _hy: Math.sin(t * 1.3) * 0.08, _yaw: Math.atan2(Math.cos(t * 0.5) * 0.4, Math.cos(t) * 0.4), _roll: Math.sin(t) * 0.22 };
  }, (c, t, dt) => {
    R.position.set(c._hx, c.hy + c._hy, c._hz); R.rotation.y = c.yaw + c._yaw;
    B.rotation.set(c.pitch + c._pitch, 0, c.roll + c._roll);
    deform(t, c.amp, c.curl, c.tail, c.tcurl);
    tex.offset.x = (tex.offset.x + dt * c.led) % 1;
    beams.scale.y = Math.max(0.1, R.position.y - 0.2);
    sh.position.set(R.position.x, 0.03, R.position.z); sh.scale.set(1.4, 0.9, 1).multiplyScalar(Math.max(0.4, 1.1 - R.position.y * 0.15));
    M.g.color.setScalar(c.gi + c._gi);
  });
  root.userData.height = 2.0;
  return root;
}

// ================================================================== 2. PICO-2 : sphère volante à hélice
function buildPico() {
  const root = new THREE.Group(), M = mats(1.4), R = at(root), B = at(R, 0, 0.75, 0);
  const W = '#efe9dc', BL = '#7cc4f0', CU = '#b87333', MUD = '#5a3a22', SP = '#9a5cff', GR = '#9aa3ad';
  const rnd = rng(77), k = new VK(M);
  k.s(G.sph(0.45, 28, 18), W);
  for (let i = 0; i < 4; i++) k.s(new THREE.SphereGeometry(0.456, 10, 6, i * H + 0.3, H - 0.6, 0.75, 0.75), BL);
  k.s(new THREE.SphereGeometry(0.456, 18, 4, 0, PI * 2, 0, 0.38), BL);
  for (let i = 0; i < 22; i++) { const a = i / 22 * PI * 2; if (Math.cos(a) > 0.85) continue; k.m(G.sph(0.018, 5, 4), CU, [Math.sin(a) * 0.455, 0, Math.cos(a) * 0.455]); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; k.m(G.sph(0.016, 5, 4), CU, [Math.sin(a) * 0.35, 0.29, Math.cos(a) * 0.35]); }
  // boue brune + spores violettes
  k.s(new THREE.SphereGeometry(0.463, 18, 8, PI * 0.15, PI * 1.25, 1.7, PI - 1.7), MUD);
  k.s(new THREE.SphereGeometry(0.464, 10, 6, PI * 0.5, PI * 0.5, 1.2, 0.6), MUD);
  for (let i = 0; i < 6; i++) { const a = PI * (0.25 + rnd() * 1.1); k.s(G.sph(0.045, 6, 5), MUD, [Math.sin(a) * 0.43, -0.16 - rnd() * 0.05, Math.cos(a) * 0.43], [0, 0, 0], [1, 2, 1]); }
  for (let i = 0; i < 14; i++) { const a = PI * (0.2 + rnd() * 1.3), th = 1.8 + rnd() * 0.9; k.g(G.sph(0.022 + rnd() * 0.02, 6, 5), SP, [Math.sin(th) * Math.sin(a) * 0.47, Math.cos(th) * 0.47, Math.sin(th) * Math.cos(a) * 0.47]); }
  // œil-lentille + diaphragme
  k.m(G.tor(0.16, 0.035, 8, 24), GR, [0, 0.02, 0.43]);
  k.s(G.cyl(0.15, 0.15, 0.04, 24), '#0b1a2a', [0, 0.02, 0.425], [H, 0, 0]);
  for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; k.s(G.box(0.1, 0.035, 0.008), '#22303c', [Math.cos(a) * 0.105, 0.02 + Math.sin(a) * 0.105, 0.452], [0, 0, a + H * 0.7]); }
  // trappes latérales, dérives, tuyère, moyeu
  for (const s of [-1, 1]) k.m(G.cyl(0.09, 0.09, 0.03, 14), GR, [s * 0.445, -0.02, 0.05], [0, 0, H]);
  for (const s of [-1, 1]) k.s(G.rbox(0.025, 0.2, 0.2, 0.01), BL, [s * 0.14, 0.1, -0.46], [0.25, 0, s * 0.3]);
  k.m(G.cyl(0.08, 0.12, 0.1, 14), '#8a8f96', [0, -0.47, 0]);
  k.g(G.cyl(0.075, 0.075, 0.01, 14), '#7fe0ff', [0, -0.525, 0]);
  k.m(G.cyl(0.05, 0.08, 0.12, 12), '#8a8f96', [0, 0.49, 0]);
  B.add(k.build());
  const pupil = at(B, 0, 0.02, 0.447), pk = new VK(M);
  pk.g(G.cyl(0.08, 0.08, 0.006, 20), '#3aa0ff', [0, 0, 0], [H, 0, 0]);
  pk.g(G.cyl(0.03, 0.03, 0.008, 12), '#e6f6ff', [0, 0, 0.002], [H, 0, 0]);
  pupil.add(pk.build());
  // hélice tripale (Ø 1,4 m)
  const prop = at(B, 0, 0.56, 0), rk = new VK(M);
  rk.s(G.sph(0.06, 10, 8), '#8a8f96');
  for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; rk.s(G.rbox(0.64, 0.02, 0.11, 0.01), i ? BL : '#5aa8de', [Math.cos(a) * 0.37, 0, -Math.sin(a) * 0.37], [0.15, a, 0]); }
  prop.add(rk.build());
  // bras-outils (clé / tournevis)
  const arms = [-1, 1].map((s) => {
    const a = at(B, s * 0.44, -0.02, 0.05), ak = new VK(M);
    ak.m(G.cyl(0.025, 0.025, 0.22, 8), GR, [s * 0.11, 0, 0], [0, 0, H]);
    ak.m(G.sph(0.04, 8, 6), CU, [s * 0.22, 0, 0]);
    ak.m(G.cyl(0.02, 0.02, 0.14, 8), GR, [s * 0.22, 0, 0.07], [H, 0, 0]);
    if (s > 0) ak.m(G.tor(0.045, 0.016, 6, 12, PI * 1.5), '#d4d8dc', [s * 0.22, 0, 0.19], [H, 0, 0.8]);
    else { ak.m(G.cyl(0.028, 0.028, 0.09, 8), '#c0392b', [s * 0.22, 0, 0.17], [H, 0, 0]); ak.m(G.cyl(0.008, 0.008, 0.11, 6), '#d4d8dc', [s * 0.22, 0, 0.27], [H, 0, 0]); }
    a.add(ak.build()); return a;
  });
  const sh = shadowDisc(0.42); root.add(sh);
  let pa = 0;
  rig(root, { y: 0.75, roll: 0, pitch: 0, spin: 4, fold: 1, pupil: 0.8, armOut: 0, gi: 1.4, shd: 1 }, (st, t) => {
    if (st === 'stuck') return { y: 0.05, roll: 0, pitch: 0, spin: 0, fold: 1, pupil: 0.5, armOut: 1, gi: 1, shd: 0, _roll: Math.sin(t * 5) * 0.15, _pitch: Math.sin(t * 3.7) * 0.1, _spin: Math.sin(t * 9) > 0.4 ? 25 : 0, _pupil: Math.sin(t * 13) * 0.15, _armA: Math.sin(t * 10) * 0.5, _armB: Math.sin(t * 10 + 1) * 0.5 };
    if (st === 'carried') return { y: 0.45, roll: 0, pitch: 0, spin: 0, fold: 0.42, pupil: 0.6, armOut: 0, gi: 1, shd: 0 };
    if (st === 'home') return { y: 0.75, roll: 0, pitch: 0, spin: 30, fold: 1, pupil: 1, armOut: 1, gi: 2, shd: 1, _y: Math.abs(Math.sin(t * 4.5)) * 0.45, _yaw: t * 4, _armA: Math.sin(t * 12) * 0.6, _armB: -Math.sin(t * 12) * 0.6 };
    if (st === 'talk') return { y: 0.75, roll: 0, pitch: 0, spin: 6, fold: 1, pupil: 0.8, armOut: 1, gi: 1.4, shd: 1, _y: Math.sin(t * 4) * 0.04, _pupil: Math.sin(t * 8) * 0.15, _armA: Math.sin(t * 3) * 0.3, _armB: Math.sin(t * 3.4) * 0.3, _gi: Math.sin(t * 8) * 0.3 };
    return { y: 0.75, roll: 0, pitch: 0, spin: 2, fold: 1, pupil: 0.8, armOut: Math.sin(t * 0.35) > 0.6 ? 1 : 0, gi: 1.4, shd: 1, _y: Math.abs(Math.sin(t * 3.2)) * 0.1, _spin: Math.sin(t * 1.5) > 0 ? 16 : 0, _pupil: Math.sin(t * 1.1) * 0.25, _armA: Math.sin(t * 2) * 0.2 };
  }, (c, t, dt) => {
    R.rotation.y = c._yaw;
    B.position.y = c.y + c._y; B.rotation.set(c.pitch + c._pitch, 0, c.roll + c._roll);
    pa += dt * (c.spin + c._spin); prop.rotation.y = pa; prop.scale.set(c.fold, 1, c.fold);
    pupil.scale.setScalar(Math.max(0.2, c.pupil + c._pupil));
    arms.forEach((a, i) => { a.scale.setScalar(Math.max(0.01, c.armOut)); a.rotation.z = (i ? 1 : -1) * (i ? c._armB : c._armA); });
    sh.visible = c.shd > 0.3; sh.scale.setScalar(Math.max(0.4, 1.1 - (B.position.y - 0.75) * 0.6));
    M.g.color.setScalar(c.gi + c._gi);
  });
  root.userData.height = 1.4;
  return root;
}

// ================================================================== 3. VERNIER-12 : robot-horloger échassier
function buildVernier() {
  const root = new THREE.Group(), M = mats(1.4), R = at(root);
  const BR = '#b08d57', BS = '#3b5577', GO = '#e5c04a', BK = '#111111', CR = '#f3ead2';
  const B = at(R, 0, 0.85, 0);
  // jambes à ressorts (pivot hanche)
  const legs = [-1, 1].map((s) => {
    const L = at(B, s * 0.14, 0, 0), lk = new VK(M);
    lk.m(G.sph(0.06, 8, 6), BR);
    lk.m(G.cyl(0.03, 0.026, 0.34, 8), BS, [0, -0.19, 0]);
    const hp = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * PI * 10; hp.push([Math.cos(a) * 0.055, -0.35 - i / 28 * 0.22, Math.sin(a) * 0.055]); }
    lk.m(G.tube(hp, 0.014, 80, 4), GO);
    lk.m(G.cyl(0.018, 0.018, 0.24, 6), '#9aa3ad', [0, -0.46, 0]);
    lk.m(G.cyl(0.026, 0.022, 0.26, 8), BS, [0, -0.68, 0]);
    lk.m(G.cyl(0.08, 0.1, 0.05, 14), BR, [0, -0.825, 0.03]);
    lk.m(G.rbox(0.07, 0.03, 0.16, 0.01), BS, [0, -0.835, 0.11]);
    L.add(lk.build()); return L;
  });
  const k = new VK(M);
  k.m(G.rbox(0.34, 0.1, 0.22, 0.03), BR, [0, 0.05, 0]);
  k.m(G.cyl(0.04, 0.04, 0.12, 8), BS, [0, 0.14, 0]);
  // cage du torse
  k.m(G.rbox(0.46, 0.04, 0.3, 0.015), BR, [0, 0.2, 0]); k.m(G.rbox(0.48, 0.04, 0.32, 0.015), BR, [0, 0.64, 0]);
  for (const x of [-0.21, 0.21]) for (const z of [-0.13, 0.13]) k.m(G.cyl(0.018, 0.018, 0.44, 6), BR, [x, 0.42, z]);
  k.s(G.box(0.4, 0.42, 0.02), '#1b2230', [0, 0.42, -0.12]);
  for (const s of [-1, 1]) k.s(G.box(0.02, 0.42, 0.24), BS, [s * 0.2, 0.42, 0]);
  k.m(G.tor(0.14, 0.012, 4, 20), BR, [0, 0.46, -0.1]);
  // tête-cadran de gousset
  k.m(G.cyl(0.04, 0.05, 0.1, 8), BS, [0, 0.68, 0]);
  k.m(G.cyl(0.3, 0.3, 0.12, 32), BR, [0, 0.95, 0], [H, 0, 0]);
  k.s(G.cyl(0.27, 0.27, 0.01, 32), CR, [0, 0.95, 0.062], [H, 0, 0]);
  k.m(G.tor(0.28, 0.025, 6, 32), GO, [0, 0.95, 0.06]);
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; k.s(G.box(0.016, i % 3 ? 0.03 : 0.055, 0.008), BK, [Math.sin(a) * 0.235, 0.95 + Math.cos(a) * 0.235, 0.069], [0, 0, -a]); }
  k.m(G.cyl(0.025, 0.025, 0.02, 10), GO, [0, 0.95, 0.075], [H, 0, 0]);
  for (const s of [-1, 1]) { k.g(G.cyl(0.038, 0.038, 0.008, 16), '#ffd36a', [s * 0.095, 0.875, 0.07], [H, 0, 0]); k.s(G.tor(0.042, 0.008, 4, 16), BK, [s * 0.095, 0.875, 0.07]); }
  // couronne + bélière
  k.m(G.cyl(0.035, 0.035, 0.06, 10), GO, [0, 1.27, 0]); k.m(G.cyl(0.05, 0.05, 0.035, 12), BR, [0, 1.31, 0]);
  k.m(G.tor(0.055, 0.014, 6, 16), GO, [0, 1.385, 0]);
  // monocle-loupe articulé (œil droit)
  k.m(G.tor(0.058, 0.012, 6, 18), GO, [-0.095, 0.875, 0.09]);
  k.s(G.cyl(0.05, 0.05, 0.004, 16), '#a8d8e8', [-0.095, 0.875, 0.092], [H, 0, 0]);
  k.m(G.cyl(0.007, 0.007, 0.2, 5), GO, [-0.2, 0.93, 0.08], [0, 0, 1.0]);
  k.m(G.sph(0.018, 6, 5), BR, [-0.285, 0.99, 0.07]);
  // chaîne de montre qui pend
  const ch = [[0.14, 0.06, 0.12], [0.1, -0.06, 0.15], [0.02, -0.11, 0.15], [-0.08, -0.06, 0.13], [-0.13, 0.03, 0.12]];
  k.m(G.tube(ch, 0.01, 20, 4), GO);
  k.m(G.cyl(0.045, 0.045, 0.015, 12), GO, [0.02, -0.15, 0.15], [H, 0, 0]);
  B.add(k.build());
  // engrenages (visibles dans la cage) + balancier doré
  const gear = at(B, 0, 0.44, -0.07), gk = new VK(M);
  gk.m(G.cyl(0.13, 0.13, 0.02, 20), BR, [0, 0, 0], [H, 0, 0]);
  for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; gk.m(G.box(0.03, 0.03, 0.02), BR, [Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0], [0, 0, a]); }
  gk.m(G.cyl(0.07, 0.07, 0.02, 14), GO, [0, 0, 0.03], [H, 0, 0]);
  for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; gk.m(G.box(0.022, 0.022, 0.02), GO, [Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.03], [0, 0, a]); }
  for (let i = 0; i < 4; i++) gk.m(G.box(0.012, 0.2, 0.01), BR, [0, 0, 0.012], [0, 0, i * PI / 4]);
  gear.add(gk.build());
  const pend = at(B, 0, 0.6, 0.05), qk = new VK(M);
  qk.m(G.cyl(0.006, 0.006, 0.28, 5), GO, [0, -0.14, 0]);
  qk.m(G.cyl(0.055, 0.055, 0.015, 16), GO, [0, -0.3, 0], [H, 0, 0]);
  pend.add(qk.build());
  // aiguilles-sourcils (humeur)
  const hands = [0, 1].map(() => {
    const h = at(B, 0, 0.95, 0.077), hk = new VK(M);
    hk.s(G.box(0.022, 0.19, 0.008), BK, [0, 0.095, 0]);
    hk.s(G.cone(0.028, 0.055, 4), BK, [0, 0.21, 0]);
    hk.s(G.cyl(0.02, 0.02, 0.008, 8), BK, [0, 0, 0], [H, 0, 0]);
    h.add(hk.build()); return h;
  });
  // quatre bras fins (2 par épaule), dont deux à pinces de précision
  const arms = [-1, 1].map((s) => {
    const a = at(B, s * 0.25, 0.6, 0), ak = new VK(M);
    ak.m(G.sph(0.04, 8, 6), BR);
    ak.m(G.cyl(0.014, 0.014, 0.32, 6), BS, [s * 0.03, -0.16, 0], [0, 0, s * 0.18]);
    ak.m(G.sph(0.025, 6, 5), BR, [s * 0.06, -0.32, 0]);
    ak.m(G.cyl(0.012, 0.012, 0.3, 6), BS, [s * 0.07, -0.44, 0.1], [-0.7, 0, 0]);
    ak.m(G.cone(0.012, 0.08, 5), GO, [s * 0.05, -0.57, 0.24], [-1.9, 0, 0.3]); ak.m(G.cone(0.012, 0.08, 5), GO, [s * 0.09, -0.57, 0.24], [-1.9, 0, -0.3]);
    ak.m(G.cyl(0.011, 0.011, 0.26, 6), BR, [s * 0.05, -0.08, 0.12], [1.2, 0, 0]);
    ak.m(G.sph(0.02, 6, 5), BR, [s * 0.05, -0.13, 0.24]);
    ak.m(G.cyl(0.01, 0.01, 0.16, 6), BS, [s * 0.06, -0.2, 0.3], [0.7, 0, 0]);
    ak.m(G.cone(0.01, 0.06, 5), GO, [s * 0.06, -0.28, 0.36], [2.4, 0, 0]);
    a.add(ak.build()); return a;
  });
  // clé de remontage dans le dos
  const key = at(B, 0, 0.44, -0.14), kk = new VK(M);
  kk.m(G.cyl(0.014, 0.014, 0.14, 6), BR, [0, 0, -0.07], [H, 0, 0]);
  kk.m(G.tor(0.045, 0.013, 6, 14), GO, [0.05, 0, -0.15], [0, H, 0]); kk.m(G.tor(0.045, 0.013, 6, 14), GO, [-0.05, 0, -0.15], [0, H, 0]);
  key.add(kk.build());
  let ga = 0, ka = 0;
  rig(root, { hip: 0.85, flip: 0, pitch: 0, leg: 0, arm: 0.15, armX: 0, hA: 0.9, gear: 1, pend: 0.35, gi: 1.4 }, (st, t) => {
    if (st === 'stuck') return { hip: 1.46, flip: PI, pitch: 0, leg: 0, arm: 0.9, armX: 0, hA: -0.45, gear: 4, pend: 0.8, gi: 1.4, _flip: Math.sin(t * 1.6) * 0.07, _legA: Math.sin(t * 5) * 0.7, _legB: Math.sin(t * 5 + 1.6) * 0.7, _armA: Math.sin(t * 7) * 0.4, _armB: Math.sin(t * 7 + 2) * 0.4, _hA: Math.sin(t * 9) * 0.1 };
    if (st === 'carried') return { hip: 0.3, flip: 0, pitch: 0.05, leg: -1.45, arm: 0.05, armX: -0.5, hA: 0.35, gear: 0.3, pend: 0.1, gi: 1 };
    if (st === 'home') return { hip: 0.85, flip: 0, pitch: 0, leg: 0, arm: 1.6, armX: 0, hA: 0, gear: 6, pend: 0.6, gi: 2, _hop: Math.abs(Math.sin(t * 4)) * 0.15, _yaw: Math.sin(t * 2) * 0.5, _legA: Math.sin(t * 8) * 0.35, _legB: -Math.sin(t * 8) * 0.35, _armA: Math.sin(t * 8) * 0.3, _armB: -Math.sin(t * 8) * 0.3, _hA: t * 4, _key: 8 };
    if (st === 'talk') return { hip: 0.85, flip: 0, pitch: 0, leg: 0, arm: 0.3, armX: -0.3, hA: 0.9, gear: 1, pend: 0.35, gi: 1.4, _pitch: Math.sin(t * 3) * 0.05, _armA: Math.sin(t * 2.5) * 0.4, _hA: Math.sin(t * 1.7) * 0.4, _gi: Math.sin(t * 7) * 0.35 };
    return { hip: 0.85, flip: 0, pitch: 0, leg: 0, arm: 0.15, armX: 0, hA: 0.9, gear: 1, pend: 0.35, gi: 1.4, _hip: Math.sin(t * 1.3) * 0.008, _hA: Math.sin(t * 0.5) * 0.25, _key: t % 6 < 1.2 ? 6 : 0 };
  }, (c, t, dt) => {
    R.position.y = c._hop; R.rotation.y = c._yaw;
    B.position.y = c.hip + c._hip; B.rotation.set(c.pitch + c._pitch, 0, c.flip + c._flip);
    legs.forEach((l, i) => { l.rotation.x = c.leg + (i ? c._legB : c._legA); });
    arms.forEach((a, i) => { const s = i ? 1 : -1; a.rotation.z = s * (c.arm + (i ? c._armB : c._armA)); a.rotation.x = c.armX; });
    hands[0].rotation.z = c.hA + c._hA; hands[1].rotation.z = -(c.hA + c._hA);
    ga += dt * c.gear; gear.rotation.z = ga; pend.rotation.z = c.pend * Math.sin(t * 2.4);
    ka += dt * c._key; key.rotation.z = ka;
    M.g.color.setScalar(c.gi + c._gi);
  });
  root.userData.height = 2.3;
  return root;
}

// ================================================================== 4. SHÉRIF-7 : modèle historique (characters.js) animé
function buildSheriffGuardian() {
  const root = new THREE.Group(), R = at(root), S = buildSheriffModel(); R.add(S);
  const u = S.userData, hat = u.hat[0], hatY0 = hat.position.y;
  S.updateMatrixWorld(true);
  S.position.y = -new THREE.Box3().setFromObject(S).min.y;   // roue posée sur y = 0
  let wa = 0;
  rig(root, { y: 0, sc: 1, pitch: 0, roll: 0, arm: 0.35, aXA: 0, aXB: 0, hatY: 0, hatTilt: 0, gi: 3, wspin: 0 }, (st, t) => {
    if (st === 'stuck') return { y: 0.5, sc: 1, pitch: 0.2, roll: -0.15, arm: 1.3, aXA: -0.6, aXB: -0.3, hatY: 0.5, hatTilt: 0.35, gi: 3, wspin: 0, _pitch: Math.sin(t * 43) * 0.004, _gi: Math.sin(t * 0.8) > 0.95 ? -2.6 : 0 };
    if (st === 'carried') return { y: 0, sc: 0.55, pitch: 0, roll: 0, arm: 0.2, aXA: 0, aXB: 0, hatY: 0, hatTilt: 0, gi: 2.2, wspin: 0, _pitch: Math.sin(t * 1.2) * 0.03 };
    if (st === 'home') { const ph = t % 4; return { y: 0, sc: 1, pitch: 0, roll: 0, arm: 2.2, aXA: 0, aXB: 0, hatY: 0, hatTilt: 0, gi: 4, wspin: 6, _hop: Math.abs(Math.sin(t * 3)) * 0.3, _yaw: t * 1.5, _armA: Math.sin(t * 6) * 0.3, _armB: -Math.sin(t * 6) * 0.3, _hatY: ph < 1.2 ? Math.sin(ph / 1.2 * PI) * 1.2 : 0, _hatSpin: ph < 1.2 ? ph * 10 : 0 }; }
    if (st === 'talk') return { y: 0, sc: 1, pitch: 0, roll: 0, arm: 0.4, aXA: -0.6, aXB: 0, hatY: 0, hatTilt: 0, gi: 3, wspin: 0, _pitch: Math.sin(t * 3) * 0.05, _armXA: Math.sin(t * 2.6) * 0.4, _gi: Math.sin(t * 7) * 0.8 };
    const twirl = t % 7 < 2, tip = t % 9 > 4 && t % 9 < 5.2;
    return { y: 0, sc: 1, pitch: 0, roll: 0, arm: 0.35, aXA: twirl ? -1.3 : 0, aXB: tip ? -2.6 : 0, hatY: 0, hatTilt: 0, gi: 3, wspin: 0, _pitch: Math.sin(t * 1.7) * 0.05, _roll: Math.sin(t * 1.1) * 0.04, _armYA: twirl ? Math.sin(t * 14) * 0.5 : 0, _hatTip: tip ? -0.15 : 0 };
  }, (c, t, dt) => {
    R.position.y = c.y + c._hop; R.rotation.set(c.pitch + c._pitch, c._yaw, c.roll + c._roll); R.scale.setScalar(c.sc);
    wa += dt * c.wspin; u.wheel.rotation.x = wa - (c.pitch + c._pitch) * 1.3;
    u.arms[0].rotation.set(c.aXA + c._armXA, c._armYA, -(c.arm + c._armA));
    u.arms[1].rotation.set(c.aXB, 0, c.arm + c._armB);
    hat.position.y = hatY0 + c.hatY + c._hatY; hat.rotation.set(c._hatTip, c._hatSpin, 0.1 + c.hatTilt);
    u.eyeMat.emissiveIntensity = Math.max(0.2, c.gi + c._gi);
  });
  root.userData.height = 3.4;
  return root;
}

// ================================================================== 5. GIVRE-5 : robot-pelle à vapeur glacée
function buildGivre() {
  const root = new THREE.Group(), M = mats(1.4), R = at(root);
  const IB = '#8fd3f4', FW = '#f2fbff', ST = '#9aa7b3', SV = '#d6dde4', WX = '#ff9a3c', DK = '#4a5560';
  const rnd = rng(55);
  // jambes courtes sur patins-chenilles
  const legs = at(R), lk = new VK(M);
  for (const s of [-1, 1]) {
    const x = s * 0.55;
    lk.s(G.rbox(0.55, 0.32, 1.1, 0.12), DK, [x, 0.16, 0.05]);
    for (let i = 0; i < 7; i++) lk.s(G.box(0.57, 0.035, 0.08), '#2e353c', [x, 0.32, -0.4 + i * 0.15]);
    for (const z of [-0.35, 0.05, 0.45]) lk.m(G.cyl(0.11, 0.11, 0.04, 12), ST, [x + s * 0.28, 0.16, z], [0, 0, H]);
    lk.m(G.cyl(0.18, 0.22, 0.62, 14), ST, [x, 0.63, 0]);
    lk.m(G.tor(0.2, 0.04, 6, 16), SV, [x, 0.45, 0], [H, 0, 0]);
  }
  legs.add(lk.build());
  // corps voûté comme un ours
  const B = at(R, 0, 0.95, 0), bk = new VK(M);
  bk.s(G.rbox(1.7, 1.5, 1.3, 0.3, 3), IB, [0, 0.75, -0.1], [0.25, 0, 0]);
  bk.s(G.sph(0.85, 20, 12), IB, [0, 1.45, -0.35], [0, 0, 0], [1.05, 0.7, 0.85]);
  bk.s(G.rbox(1.2, 1.05, 0.25, 0.12, 2), FW, [0, 0.62, 0.58], [0.25, 0, 0]);
  bk.s(G.rbox(1.05, 0.7, 0.8, 0.2, 2), FW, [0, 1.72, 0.45]);
  bk.s(G.rbox(1.12, 0.12, 0.86, 0.05), IB, [0, 2.05, 0.45]);
  for (let i = 0; i < 5; i++) bk.s(G.cone(0.05, 0.16 + rnd() * 0.1, 5), FW, [-0.4 + i * 0.2, 1.95, 0.88], [PI, 0, 0]);   // stalactites de givre
  for (const s of [-1, 1]) { bk.m(G.tor(0.14, 0.035, 8, 20), SV, [s * 0.26, 1.8, 0.86]); bk.g(G.cyl(0.12, 0.12, 0.02, 18), '#bff4ff', [s * 0.26, 1.8, 0.855], [H, 0, 0]); bk.s(G.sph(0.04, 6, 5), FW, [s * 0.26 + 0.06, 1.86, 0.87], [0, 0, 0], [1, 1, 0.3]); }
  bk.m(G.rbox(1.0, 0.12, 0.35, 0.04), ST, [0, 1.42, 0.8]);
  for (let i = 0; i < 7; i++) bk.m(G.cone(0.04, 0.12, 4), SV, [-0.36 + i * 0.12, 1.32, 0.93], [PI, 0, 0]);
  // cheminée dorsale
  bk.m(G.cyl(0.15, 0.17, 0.9, 14), ST, [0, 2.3, -0.6], [-0.2, 0, 0]);
  bk.m(G.cyl(0.21, 0.17, 0.12, 14), SV, [0, 2.76, -0.7], [-0.2, 0, 0]);
  // rivets argent
  for (let i = 0; i < 11; i++) { const a = -1.2 + i * 0.24; bk.m(G.sph(0.035, 5, 4), SV, [Math.sin(a) * 0.86, 1.25, -0.3 + Math.cos(a) * 0.7]); }
  for (let i = 0; i < 8; i++) bk.m(G.sph(0.03, 5, 4), SV, [-0.52 + i * 0.15, 1.12, 0.78]);
  for (const s of [-1, 1]) bk.m(G.sph(0.24, 12, 10), SV, [s * 0.55, 0, 0]);
  // coulures de cire orange collées
  for (let i = 0; i < 8; i++) { const s = i % 2 ? 1 : -1, y = 0.2 + rnd() * 0.7; bk.s(G.cap(0.045 + rnd() * 0.03, 0.15 + rnd() * 0.3, 3, 6), WX, [s * (0.55 + rnd() * 0.3), y, 0.45 + rnd() * 0.2]); bk.s(G.sph(0.09, 8, 6), WX, [s * (0.5 + rnd() * 0.3), y + 0.2, 0.5 + rnd() * 0.2], [0, 0, 0], [1.3, 0.6, 1]); }
  B.add(bk.build());
  // pelle-mâchoire
  const jaw = at(B, 0, 1.36, 0.78), jk = new VK(M);
  jk.m(G.box(1.0, 0.05, 0.6), ST, [0, -0.2, 0.25]);
  for (const s of [-1, 1]) jk.m(G.box(0.05, 0.25, 0.6), ST, [s * 0.5, -0.1, 0.25]);
  jk.m(G.box(1.0, 0.25, 0.05), ST, [0, -0.1, -0.02]);
  for (let i = 0; i < 7; i++) jk.m(G.cone(0.04, 0.14, 4), SV, [-0.36 + i * 0.12, -0.12, 0.53]);
  jk.m(G.cyl(0.05, 0.05, 1.08, 10), SV, [0, 0, 0], [0, 0, H]);
  jaw.add(jk.build());
  // bras épais à grattoirs
  const arms = [-1, 1].map((s) => {
    const a = at(B, s * 0.95, 1.45, 0.15), ak = new VK(M);
    ak.s(G.sph(0.26, 12, 10), SV);
    ak.s(G.cyl(0.2, 0.2, 0.6, 12), IB, [0, -0.35, 0]);
    ak.s(G.sph(0.2, 10, 8), SV, [0, -0.68, 0]);
    ak.s(G.cyl(0.22, 0.24, 0.55, 12), IB, [0, -0.98, 0.05]);
    ak.s(G.box(0.5, 0.08, 0.4), ST, [0, -1.3, 0.1], [0.3, 0, 0]);
    for (let i = 0; i < 4; i++) ak.s(G.cone(0.035, 0.1, 4), SV, [-0.18 + i * 0.12, -1.33, 0.32], [H + 0.3, 0, 0]);
    a.add(ak.build()); return a;
  });
  // lac de cire (visible quand coincé) + gouttes + vapeur glacée
  const melt = at(R), mk = new VK(M);
  mk.s(G.cyl(1.5, 1.65, 0.06, 32), WX, [0, 0.03, 0.1]);
  for (let i = 0; i < 9; i++) { const a = rnd() * PI * 2, r = 0.9 + rnd() * 0.6; mk.s(G.sph(0.2 + rnd() * 0.15, 10, 6), '#f08a30', [Math.cos(a) * r, 0.04, Math.sin(a) * r], [0, 0, 0], [1.4, 0.35, 1]); }
  for (const s of [-1, 1]) mk.s(G.sph(0.42, 12, 8), '#f59236', [s * 0.55, 0.18, 0.05], [0, 0, 0], [1.1, 0.55, 1.4]);
  melt.add(mk.build());
  const drops = puffs(6, WX, { op: 1 }); R.add(drops);
  const steam = puffs(14, '#ffffff', { op: 0.5 }); B.add(steam);
  rig(root, { legS: 1, by: 0, pitch: 0.05, roll: 0, jaw: 0, armX: 0, armXA: 0, armZ: 0.15, sc: 1, gi: 1.4, steam: 1 }, (st, t, c) => {
    if (st === 'stuck') return { legS: 0.32, by: -0.05, pitch: 0.2, roll: 0.12, jaw: Math.sin(t * 3) > 0 ? 0.4 : 0.1, armX: -1.0, armXA: 0, armZ: 0.25, sc: 1, gi: 1.1, steam: 0.3, _roll: Math.sin(t * 0.6) * 0.04, _armA: Math.abs(Math.sin(t * 10)) * 0.35, _armB: Math.abs(Math.sin(t * 10 + 1.5)) * 0.35 };
    if (st === 'carried') return { legS: 1, by: 0, pitch: 0.3, roll: 0, jaw: 0, armX: -0.4, armXA: 0, armZ: 0.05, sc: 0.5, gi: 1, steam: 0 };
    if (st === 'home') return { legS: 1, by: 0, pitch: 0, roll: 0, jaw: 0.4, armX: -2.6, armXA: 0, armZ: 0.2, sc: 1, gi: 2, steam: 3, _hop: Math.abs(Math.sin(t * 2.4)) * 0.15, _roll: Math.sin(t * 2.4) * 0.12, _armA: Math.sin(t * 5) * 0.2, _armB: -Math.sin(t * 5) * 0.2 };
    if (st === 'talk') return { legS: 1, by: 0, pitch: 0.05, roll: 0, jaw: 0, armX: 0, armXA: -0.5, armZ: 0.15, sc: 1, gi: 1.4, steam: 0.6, _jaw: Math.abs(Math.sin(t * 7)) * 0.3, _pitch: Math.sin(t * 2.5) * 0.04, _armA: Math.sin(t * 2.2) * 0.3, _gi: Math.sin(t * 6) * 0.4 };
    const pat = Math.sin(t * 0.45) > 0.5;
    return { legS: 1, by: 0, pitch: 0.05, roll: 0, jaw: Math.sin(t * 0.7) > 0.6 ? 0.35 : 0, armX: 0, armXA: pat ? -0.9 : 0, armZ: 0.15, sc: 1, gi: 1.4, steam: t % 3 < 0.8 ? 1.5 : 0, _by: Math.sin(t * 1.1) * 0.02, _armA: c.armXA < -0.5 ? Math.abs(Math.sin(t * 9)) * 0.25 : 0 };
  }, (c, t, dt, st) => {
    R.position.y = c._hop; R.scale.setScalar(c.sc);
    legs.scale.y = c.legS;
    B.position.y = 0.95 * c.legS + c.by + c._by; B.rotation.set(c.pitch + c._pitch, 0, c.roll + c._roll);
    jaw.rotation.x = c.jaw + c._jaw;
    arms.forEach((a, i) => { const s = i ? 1 : -1; a.rotation.x = c.armX + (i ? 0 : c.armXA) - (i ? c._armB : c._armA); a.rotation.z = s * c.armZ; });
    melt.visible = st === 'stuck'; drops.visible = melt.visible;
    if (drops.visible) drops.userData.step(dt, true, [(Math.random() - 0.5) * 1.2, B.position.y + 0.3, 0.6], { rate: 3, vel: [0, -0.2, 0], spread: 0.05, life: 0.8, size: 0.05, grow: -0.3, grav: 4 });
    steam.userData.step(dt, c.steam > 0.2, [0, 2.86, -0.73], { rate: 6 * c.steam, vel: [0, 0.9, -0.15], spread: 0.12, life: 1.6, size: 0.14, grow: 2.2 });
    M.g.color.setScalar(c.gi + c._gi);
  });
  root.userData.height = 3.8;
  return root;
}

// ================================================================== 6. CENDRE-0 : robot-fondeur creuset-poêle
function buildCendre() {
  const root = new THREE.Group(), M = mats(1), R = at(root);
  const FE = '#1c1a1a', FE2 = '#2a2626', EMB = '#ff6a1a', LEA = '#5a2e1a', ASH = '#8a8580';
  const rnd = rng(13);
  // pieds de poêle
  const lk = new VK(M);
  for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4, x = Math.sin(a) * 0.3, z = Math.cos(a) * 0.3; lk.s(G.cyl(0.055, 0.035, 0.2, 8), FE2, [x * 1.08, 0.1, z * 1.08], [Math.cos(a) * -0.15, 0, Math.sin(a) * 0.15]); lk.s(G.sph(0.06, 8, 6), FE2, [x * 1.2, 0.03, z * 1.2], [0, 0, 0], [1.2, 0.5, 1.2]); }
  R.add(lk.build());
  // corps-creuset en fonte craquelée
  const prof = [[0, 0], [0.34, 0], [0.44, 0.12], [0.48, 0.3], [0.45, 0.48], [0.37, 0.58], [0.2, 0.6], [0, 0.6]];
  const rAt = (y) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; return r0 + (r1 - r0) * (y - y0) / Math.max(1e-6, y1 - y0); } return 0.2; };
  const B = at(R, 0, 0.18, 0), bk = new VK(M);
  bk.s(G.lathe(prof, 28), FE);
  bk.s(G.tor(0.48, 0.025, 5, 28), FE2, [0, 0.3, 0], [H, 0, 0]);
  // fissures braise (zigzags sur la surface)
  for (let c = 0; c < 9; c++) {
    let a = rnd() * PI * 2, y = 0.08 + rnd() * 0.4;
    if (Math.abs(Math.sin(a / 2)) < 0.25 && y < 0.42) a += 1.2;   // évite le tablier avant
    for (let sgt = 0; sgt < 4; sgt++) {
      const dy = 0.04 + rnd() * 0.05, da = (rnd() - 0.5) * 0.18, ym = y + dy / 2, r = rAt(ym) + 0.006, am = a + da / 2;
      const len = Math.hypot(dy, da * r);
      bk.g(G.box(0.02, len + 0.01, 0.012), EMB, [Math.sin(am) * r, ym, Math.cos(am) * r], [0, am, -Math.atan2(da * r, dy)]);
      y += dy; a += da; if (y > 0.56) break;
    }
  }
  // tablier de cuir roussi + plaque « 0 »
  bk.s(new THREE.CylinderGeometry(0.5, 0.47, 0.34, 16, 1, true, -0.75, 1.5), LEA, [0, 0.22, 0]);
  bk.s(G.box(0.5, 0.03, 0.04), '#3a1e10', [0, 0.4, 0.45]);
  bk.m(G.rbox(0.17, 0.15, 0.03, 0.02), '#6b5a3a', [0, 0.47, 0.42], [-0.35, 0, 0]);
  bk.m(G.tor(0.038, 0.012, 5, 14), '#c9a24a', [0, 0.475, 0.44], [-0.35, 0, 0], [0.8, 1.2, 1]);
  // suie et cendres
  for (let i = 0; i < 14; i++) { const a = rnd() * PI * 2, y = 0.35 + rnd() * 0.22; bk.s(G.sph(0.05 + rnd() * 0.04, 6, 4), ASH, [Math.sin(a) * rAt(y), y, Math.cos(a) * rAt(y)], [0, a, 0], [1.2, 0.3, 1]); }
  bk.s(G.tor(0.21, 0.03, 6, 20), FE2, [0, 0.6, 0], [H, 0, 0]);
  B.add(bk.build());
  // tête-chaudron à visière grillagée
  const head = at(B, 0, 0.58, 0), hk = new VK(M);
  hk.s(G.lathe([[0, 0], [0.22, 0], [0.3, 0.08], [0.32, 0.2], [0.3, 0.3], [0.34, 0.32], [0.34, 0.35], [0.24, 0.35], [0, 0.36]], 24), FE);
  hk.s(G.cyl(0.2, 0.2, 0.05, 20), '#060505', [0, 0.17, 0.29], [H, 0, 0]);
  for (let i = -2; i <= 2; i++) hk.s(G.cyl(0.014, 0.014, 0.26, 6), '#3a3533', [i * 0.065, 0.17, 0.33]);
  hk.s(G.box(0.36, 0.022, 0.03), '#3a3533', [0, 0.2, 0.33]);
  hk.s(G.tor(0.2, 0.02, 5, 20), '#3a3533', [0, 0.17, 0.32]);
  for (const s of [-1, 1]) hk.g(G.sph(0.045, 8, 6), '#ffc24a', [s * 0.085, 0.15, 0.3], [0, 0, 0], [1, 0.75, 0.5]);
  hk.s(G.tube([[0.12, 0.33, -0.06], [0.16, 0.42, -0.08], [0.09, 0.5, -0.03], [0.14, 0.6, 0]], 0.038, 14, 6), FE2);
  hk.s(G.cyl(0.055, 0.045, 0.05, 8), FE2, [0.14, 0.62, 0]);
  for (let i = 0; i < 5; i++) { const a = rnd() * PI * 2; hk.s(G.sph(0.05, 6, 4), ASH, [Math.sin(a) * 0.2, 0.355, Math.cos(a) * 0.2], [0, 0, 0], [1.2, 0.25, 1]); }
  head.add(hk.build());
  // bras-tenailles
  const arms = [-1, 1].map((s) => {
    const a = at(B, s * 0.47, 0.42, 0.05), ak = new VK(M);
    ak.m(G.sph(0.06, 8, 6), '#3a3533');
    ak.m(G.cyl(0.028, 0.028, 0.26, 6), '#3a3533', [s * 0.03, -0.13, 0], [0, 0, s * 0.2]);
    ak.m(G.cyl(0.04, 0.04, 0.05, 8), '#5a4a3a', [s * 0.06, -0.27, 0], [H, 0, 0]);
    ak.m(G.box(0.02, 0.18, 0.025), '#3a3533', [s * 0.06, -0.36, 0.03], [0.25, 0, 0]);
    ak.m(G.box(0.02, 0.18, 0.025), '#3a3533', [s * 0.06, -0.36, -0.03], [-0.25, 0, 0]);
    a.add(ak.build()); return a;
  });
  const smoke = puffs(9, '#4a4644', { op: 0.5 }); head.add(smoke);
  const ash = puffs(6, ASH, { op: 1 }); B.add(ash);
  rig(root, { hy: -0.05, hp: 0, hyaw: 0, arm: 0.2, armS: 1, gi: 1, smoke: 1 }, (st, t) => {
    if (st === 'stuck') { const peek = t % 5 < 1.6; return { hy: peek ? -0.15 : -0.3, hp: 0, hyaw: 0, arm: 0, armS: 0.15, gi: 0.6, smoke: 1, _hyaw: peek ? Math.sin(t * 3) * 0.5 : 0, _gi: Math.sin(t * 0.8) * 0.3 }; }
    if (st === 'carried') return { hy: -0.3, hp: 0, hyaw: 0, arm: 0, armS: 0.15, gi: 0.7, smoke: 0.3, _gi: Math.sin(t * 1.1) * 0.3 };
    if (st === 'home') return { hy: 0.06, hp: -0.1, hyaw: 0, arm: 2.2, armS: 1, gi: 1.8, smoke: 2, _hop: Math.abs(Math.sin(t * 3.5)) * 0.12, _yaw: Math.sin(t * 1.5) * 0.6, _armA: Math.sin(t * 7) * 0.3, _armB: -Math.sin(t * 7) * 0.3, _gi: Math.sin(t * 5) * 0.5 };
    if (st === 'talk') return { hy: 0, hp: 0, hyaw: 0, arm: 0.4, armS: 1, gi: 1.1, smoke: 0.7, _hp: Math.sin(t * 4) * 0.06, _gi: Math.sin(t * 6) * 0.6, _armA: Math.sin(t * 2) * 0.3 };
    return { hy: -0.05, hp: Math.sin(t * 0.4) > 0.5 ? 0.15 : 0, hyaw: 0, arm: 0.2, armS: 1, gi: 0.9, smoke: 1, _hyaw: Math.sin(t * 0.6) * 0.5, _gi: Math.sin(t * 1.2) * 0.5 };
  }, (c, t, dt) => {
    R.position.y = c._hop; R.rotation.y = c._yaw;
    head.position.y = 0.58 + c.hy; head.rotation.set(c.hp + c._hp, c.hyaw + c._hyaw, 0);
    arms.forEach((a, i) => { const s = i ? 1 : -1; a.rotation.z = s * (c.arm + (i ? c._armB : c._armA)); a.scale.setScalar(Math.max(0.01, c.armS)); });
    smoke.userData.step(dt, c.smoke > 0.2, [0.14, 0.66, 0], { rate: 3 * c.smoke, vel: [0.02, 0.5, -0.05], spread: 0.04, life: 2.2, size: 0.06, grow: 2.5 });
    ash.userData.step(dt, true, [(Math.random() - 0.5) * 0.7, 0.4, (Math.random() - 0.5) * 0.7], { rate: 1.2, vel: [0, -0.1, 0], spread: 0.1, life: 1.2, size: 0.02, grow: 0, grav: 0.4 });
    M.g.color.setScalar(Math.max(0.15, c.gi + c._gi));
  });
  root.userData.height = 1.45;
  return root;
}

// ================================================================== 7. MOUSSE-8 : champignon mécanique à six pattes
function buildMousse(opts) {
  const root = new THREE.Group(), M = mats(1), R = at(root);
  const VG = '#4f8f7a', CU = '#b87333', CRM = '#e9dfc8', VIO = '#6b2fa3', ACID = '#b6ff4a', IVY = '#3e7a2e', LIC = '#9a9a8a';
  const rnd = rng(91);
  // six pattes d'araignée, en deux trépieds alternés
  const legSets = [0, 1].map((set) => {
    const lg = at(R), k = new VK(M);
    for (let i = set; i < 6; i += 2) {
      const a = i / 6 * PI * 2 + PI / 6, sx = Math.sin(a), sz = Math.cos(a), P = (r, y) => [sx * r, y, sz * r];
      k.m(G.tube([P(0.2, 0.55), P(0.45, 0.85), P(0.62, 0.9), P(0.85, 0.5), P(0.95, 0.06)], 0.035, 18, 6), VG);
      k.m(G.sph(0.055, 8, 6), CU, P(0.2, 0.55)); k.m(G.sph(0.05, 8, 6), CU, P(0.6, 0.9)); k.m(G.sph(0.04, 8, 6), CU, P(0.85, 0.5));
      k.m(G.sph(0.06, 8, 6), VG, P(0.96, 0.03), [0, 0, 0], [1, 0.5, 1]);
    }
    lg.add(k.build()); return lg;
  });
  // pied-tronc en céramique, chapeau bombé à pois
  const B = at(R), bk = new VK(M);
  bk.s(G.lathe([[0.26, 0.45], [0.24, 0.6], [0.21, 0.9], [0.18, 1.22], [0, 1.23]], 20), CRM);
  bk.m(G.cyl(0.3, 0.3, 0.1, 16), VG, [0, 0.52, 0]);
  bk.m(G.tor(0.085, 0.02, 6, 16), CU, [0, 0.82, 0.2]);
  bk.g(G.sph(0.065, 10, 8), '#6aff5a', [0, 0.82, 0.19]);
  const cap = [[0.2, 1.18], [0.55, 1.21], [0.74, 1.26], [0.77, 1.32], [0.72, 1.44], [0.56, 1.6], [0.32, 1.72], [0, 1.77]];
  bk.s(G.lathe(cap, 32), VIO);
  for (let i = 0; i < 30; i++) { const a = i / 30 * PI * 2; bk.g(G.box(0.012, 0.035, 0.48), '#8fd63a', [Math.sin(a) * 0.46, 1.215, Math.cos(a) * 0.46], [0, a, 0]); }
  const capPt = (u) => { const f = u * (cap.length - 1), i = Math.min(cap.length - 2, Math.floor(f)), w = f - i; return [cap[i][0] + (cap[i + 1][0] - cap[i][0]) * w, cap[i][1] + (cap[i + 1][1] - cap[i][1]) * w]; };
  for (let i = 0; i < 18; i++) { const a = rnd() * PI * 2, [r, y] = capPt(0.38 + rnd() * 0.5); bk.g(G.sph(0.05 + rnd() * 0.035, 8, 6), ACID, [Math.sin(a) * r * 0.99, y, Math.cos(a) * r * 0.99], [0, a, 0], [1, 0.45, 1]); }
  B.add(bk.build());
  // yeux-lucioles sur pédoncules
  const eyes = at(B, 0, 1.0, 0.2), ek = new VK(M);
  for (const s of [-1, 1]) { ek.s(G.tube([[s * 0.07, 0, 0], [s * 0.14, 0.05, 0.25], [s * 0.2, 0.1, 0.55]], 0.02, 10, 5), VG); ek.g(G.sph(0.055, 10, 8), '#eaff7a', [s * 0.2, 0.11, 0.58]); }
  eyes.add(ek.build());
  // bras-sécateurs
  const arms = at(B, 0, 0.72, 0.15), ak = new VK(M);
  for (const s of [-1, 1]) {
    ak.m(G.tube([[s * 0.15, 0, 0], [s * 0.32, -0.04, 0.18], [s * 0.3, -0.12, 0.38]], 0.022, 10, 5), VG);
    ak.m(G.sph(0.035, 6, 5), CU, [s * 0.3, -0.12, 0.38]);
    ak.m(G.box(0.02, 0.025, 0.16), '#c9ccd0', [s * 0.27, -0.12, 0.46], [0, s * 0.3, 0]);
    ak.m(G.box(0.02, 0.025, 0.16), '#c9ccd0', [s * 0.33, -0.12, 0.46], [0, -s * 0.3, 0]);
  }
  arms.add(ak.build());
  // lierre, mousse, lichen, horloge minuscule (mille ans à Chronocline)
  const over = at(B), ok = new VK(M);
  const iv = []; for (let i = 0; i <= 20; i++) { const a = i * 0.7; iv.push([Math.sin(a) * 0.235, 0.5 + i * 0.035, Math.cos(a) * 0.235]); }
  ok.s(G.tube(iv, 0.016, 60, 4), IVY);
  for (let i = 0; i < 16; i++) { const p = iv[1 + Math.floor(rnd() * 19)]; ok.s(G.sph(0.045, 5, 4), i % 3 ? IVY : '#5a9a3a', [p[0] * 1.12, p[1], p[2] * 1.12], [rnd() * 3, rnd() * 3, 0], [1, 0.35, 1.5]); }
  for (let i = 0; i < 12; i++) { const a = rnd() * PI * 2, [r, y] = capPt(0.3 + rnd() * 0.6); ok.s(G.sph(0.1 + rnd() * 0.08, 6, 4), i % 2 ? '#4f7f34' : '#6a8f3a', [Math.sin(a) * r, y + 0.01, Math.cos(a) * r], [0, a, 0], [1.2, 0.3, 1]); }
  for (let i = 0; i < 22; i++) { const a = i / 22 * PI * 2 + rnd() * 0.2, l = 0.15 + rnd() * 0.25, r = 0.72; ok.s(G.tube([[Math.sin(a) * r, 1.25, Math.cos(a) * r], [Math.sin(a) * (r - 0.03), 1.25 - l * 0.5, Math.cos(a) * (r - 0.03)], [Math.sin(a + 0.05) * (r - 0.05), 1.25 - l, Math.cos(a + 0.05) * (r - 0.05)]], 0.012, 5, 3), LIC); }
  for (let i = 0; i < 6; i++) { const a = rnd() * PI * 2, [r, y] = capPt(0.5 + rnd() * 0.3); ok.s(G.box(0.012, 0.012, 0.22), '#3a1a5a', [Math.sin(a) * r * 1.005, y, Math.cos(a) * r * 1.005], [0.5, a, 0]); }
  { const [r, y] = capPt(0.62), a = 0.6, n = [Math.sin(a), 0.6, Math.cos(a)]; const p = [n[0] * r, y + 0.03, n[2] * r]; const rot = [-0.6, a, 0];
    ok.s(G.cyl(0.08, 0.08, 0.025, 16), '#efe6cc', p, [rot[0] + H, rot[1], 0]); ok.s(G.tor(0.08, 0.012, 5, 16), '#8a6a3a', [p[0], p[1], p[2]], [rot[0], rot[1], 0]);
    ok.s(G.box(0.008, 0.05, 0.03), '#111', [p[0] + Math.sin(a) * 0.014, p[1] + 0.02, p[2] + Math.cos(a) * 0.014], [rot[0], rot[1], 0]); }
  over.add(ok.build());
  const spores = puffs(10, ACID, { glow: true, op: 0.8 }); B.add(spores);
  rig(root, { lsy: 1, lsx: 1, by: 0, pitch: 0, arm: 0, gi: 0.9, spore: 0 }, (st, t) => {
    if (st === 'stuck') { const tt = t * 0.05; return { lsy: 1, lsx: 1, by: 0, pitch: 0.1, arm: 0.3, gi: 0.55, spore: 0, _la: pos(Math.sin(tt * 5)) * 0.03, _lb: pos(-Math.sin(tt * 5)) * 0.03, _eyZ: Math.sin(t * 0.3) * 0.05, _gi: Math.sin(t * 0.2) * 0.1 }; }
    if (st === 'carried') return { lsy: 0.5, lsx: 1.12, by: -0.27, pitch: 0.05, arm: 0.6, gi: 0.7, spore: 0, _eyX: 0.25 };
    if (st === 'home') return { lsy: 1, lsx: 1, by: 0, pitch: 0, arm: -0.8, gi: 1.6, spore: 6, _la: pos(Math.sin(t * 9)) * 0.1, _lb: pos(-Math.sin(t * 9)) * 0.1, _yaw: t * 1.5, _by: Math.abs(Math.sin(t * 4.5)) * 0.08, _gi: Math.sin(t * 6) * 0.5 };
    if (st === 'talk') return { lsy: 1, lsx: 1, by: 0, pitch: 0, arm: 0, gi: 1, spore: 0.5, _eyX: Math.sin(t * 5) * 0.15, _gi: Math.sin(t * 7) * 0.4, _arm: Math.sin(t * 3) * 0.2, _la: pos(Math.sin(t * 2)) * 0.03, _lb: pos(-Math.sin(t * 2)) * 0.03 };
    return { lsy: 1, lsx: 1, by: 0, pitch: 0, arm: 0, gi: 0.9, spore: t % 6 < 0.6 ? 8 : 0, _la: pos(Math.sin(t * 5)) * 0.06, _lb: pos(-Math.sin(t * 5)) * 0.06, _by: Math.abs(Math.sin(t * 5)) * 0.02, _yaw: Math.sin(t * 0.3) * 0.3, _gi: Math.sin(t * 1.3) * 0.35, _eyZ: Math.sin(t * 1.7) * 0.15 };
  }, (c, t, dt, st) => {
    R.rotation.y = c._yaw;
    legSets[0].position.y = c._la; legSets[1].position.y = c._lb;
    for (const l of legSets) l.scale.set(c.lsx, c.lsy, c.lsx);
    B.position.y = c.by + c._by; B.rotation.x = c.pitch;
    eyes.rotation.set(c._eyX, 0, c._eyZ); arms.rotation.x = c.arm + c._arm;
    over.visible = !!opts.overgrown || st === 'stuck' || st === 'carried';
    spores.userData.step(dt, c.spore > 0.3, [0, 1.75, 0], { rate: c.spore, vel: [0, 0.5, 0], spread: 0.5, life: 2.5, size: 0.04, grow: 0.5 });
    M.g.color.setScalar(c.gi + c._gi);
  });
  root.userData.height = 1.8;
  return root;
}

// ------------------------------------------------------------------ API
const BUILDERS = [buildBobine, buildAero, buildPico, buildVernier, buildSheriffGuardian, buildGivre, buildCendre, buildMousse];

// index = monde 0..7 (WORLD_LORE[index].guardian) ; renvoie un Group avec userData.update(dt, time, state) et userData.height
export function buildGuardian(index, opts = {}) {
  const i = ((index % 8) + 8) % 8;
  const g = BUILDERS[i](opts);
  const gd = WORLD_LORE[i]?.guardian;
  g.name = 'guardian-' + (gd?.code || i);
  Object.assign(g.userData, { index: i, code: gd?.code, guardianName: gd?.name });
  for (let k = 0; k < 25; k++) g.userData.update(0.1, 0, 'idle');
  return g;
}

// ------------------------------------------------------------------ Socles de retour (un par monde)
const PED = [
  { c: '#ffb040', st: '#8b7a5e', st2: '#6e604a' }, // Colosse : écailles ambrées
  { c: '#ff2bd6', st: '#24202e', st2: '#16131c' }, // Néon-Bas : verre noir + néons
  { c: '#7cc4f0', st: '#9aa6b2', st2: '#7d8894' }, // Archipel : roche flottante + nuages
  { c: '#e5c04a', st: '#6e5b3e', st2: '#54452f' }, // Chronocline : cadran
  { c: '#ffcc33', st: '#a2573a', st2: '#7e432c' }, // Poussière-sur-Rail : grès rouge + étoile
  { c: '#bff4ff', st: '#cfe3ee', st2: '#a9c6d6' }, // Gelure : glace
  { c: '#ff6a1a', st: '#2a2626', st2: '#1c1a1a' }, // Fonderie-Rêve : fonte + cire
  { c: '#b6ff4a', st: '#4b3f55', st2: '#3a3044' }, // Entrailles : champignons
];
export function buildGuardianPedestal(index) {
  const i = ((index % 8) + 8) % 8, T = PED[i], rnd = rng(200 + i);
  const g = new THREE.Group(), M = mats(0.35), k = new VK(M), O = PI / 8;
  k.s(G.cyl(1.75, 1.85, 0.22, 8), T.st2, [0, 0.11, 0], [0, O, 0]);
  k.s(G.cyl(1.5, 1.6, 0.2, 8), T.st, [0, 0.32, 0], [0, O, 0]);
  k.m(G.cyl(1.36, 1.42, 0.12, 32), '#b08d57', [0, 0.48, 0]);
  k.s(G.cyl(1.26, 1.26, 0.02, 32), T.st2, [0, 0.545, 0]);
  k.g(G.tor(1.31, 0.035, 6, 48), T.c, [0, 0.555, 0], [H, 0, 0]);
  for (let j = 0; j < 8; j++) { const a = j / 8 * PI * 2; k.m(G.cyl(0.07, 0.08, 0.05, 10), '#c9a24a', [Math.sin(a) * 1.62, 0.245, Math.cos(a) * 1.62]); k.g(G.sph(0.045, 8, 6), T.c, [Math.sin(a) * 1.62, 0.28, Math.cos(a) * 1.62]); }
  // plaque (zone de texte)
  k.m(G.rbox(1.0, 0.3, 0.07, 0.03), '#c9a24a', [0, 0.32, 1.47], [-0.22, 0, 0]);
  k.s(G.box(0.88, 0.2, 0.02), '#2a2116', [0, 0.322, 1.505], [-0.22, 0, 0]);
  // motif du monde
  if (i === 0) { for (let j = 0; j < 20; j++) { const a = j / 20 * PI * 2; k.s(G.sph(0.2, 8, 6), j % 2 ? '#e8a33a' : '#c98a2a', [Math.sin(a) * 1.72, 0.14, Math.cos(a) * 1.72], [0.3, a, 0], [1, 0.5, 0.35]); } }
  if (i === 1) { for (let j = 0; j < 8; j++) { const a = j / 8 * PI * 2; k.g(G.box(0.05, 0.2, 0.05), j % 2 ? '#2bf0ff' : T.c, [Math.sin(a) * 1.79, 0.11, Math.cos(a) * 1.79]); } k.g(G.tor(1.62, 0.02, 4, 8), '#2bf0ff', [0, 0.43, 0], [H, 0, O]); }
  if (i === 2) { for (let j = 0; j < 10; j++) { const a = j / 10 * PI * 2 + rnd(); k.s(G.sph(0.22 + rnd() * 0.12, 8, 6), '#f4f8ff', [Math.sin(a) * 1.85, 0.12 + rnd() * 0.1, Math.cos(a) * 1.85], [0, 0, 0], [1.5, 0.6, 1]); } for (let j = 0; j < 6; j++) { const a = rnd() * PI * 2; k.s(G.cone(0.12, 0.3, 5), '#5a8a3a', [Math.sin(a) * 1.3, 0.48, Math.cos(a) * 1.3]); } }
  if (i === 3) { for (let j = 0; j < 12; j++) { const a = j / 12 * PI * 2; k.s(G.box(0.06, 0.01, j % 3 ? 0.16 : 0.3), '#1a1410', [Math.sin(a) * 1.1, 0.558, Math.cos(a) * 1.1], [0, a, 0]); } k.m(G.tor(1.62, 0.03, 5, 32), '#e5c04a', [0, 0.42, 0], [H, 0, 0]); for (let j = 0; j < 4; j++) { const a = j * H + PI / 4; k.m(G.cyl(0.25, 0.25, 0.05, 14), '#b08d57', [Math.sin(a) * 1.68, 0.12, Math.cos(a) * 1.68], [H, a, 0]); } }
  if (i === 4) {
    const star = new THREE.Shape(); for (let j = 0; j < 10; j++) { const a = j / 10 * PI * 2 + H, r = j % 2 ? 0.08 : 0.2; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (j) star.lineTo(x, y); else star.moveTo(x, y); }
    for (const a of [PI * 0.75, -PI * 0.75, PI]) k.m(new THREE.ExtrudeGeometry(star, { depth: 0.04, bevelEnabled: false }), '#f2c85a', [Math.sin(a) * 1.5, 0.32, Math.cos(a) * 1.5], [0, a, 0]);
    for (let j = 0; j < 16; j++) { const a = j / 16 * PI * 2; k.s(G.box(0.3, 0.06, 0.05), '#7a4c2a', [Math.sin(a) * 1.86, 0.08 + (j % 2) * 0.08, Math.cos(a) * 1.86], [0, a + H, 0]); }
  }
  if (i === 5) { for (let j = 0; j < 18; j++) { const a = j / 18 * PI * 2 + rnd() * 0.2; k.s(G.cone(0.1 + rnd() * 0.06, 0.4 + rnd() * 0.5, 5), j % 2 ? '#dff6ff' : '#a8dcf5', [Math.sin(a) * 1.82, 0.2, Math.cos(a) * 1.82], [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3]); } }
  if (i === 6) { for (let j = 0; j < 16; j++) { const a = j / 16 * PI * 2 + rnd() * 0.2, l = 0.15 + rnd() * 0.25; k.s(G.cap(0.04 + rnd() * 0.03, l, 3, 6), '#ff9a3c', [Math.sin(a) * 1.43, 0.48 - l / 2, Math.cos(a) * 1.43]); } k.g(G.tor(1.76, 0.02, 4, 8), '#ff6a1a', [0, 0.225, 0], [H, 0, O]); }
  if (i === 7) { for (let j = 0; j < 9; j++) { const a = j / 9 * PI * 2 + rnd() * 0.3, s = 0.6 + rnd() * 0.7, x = Math.sin(a) * 1.9, z = Math.cos(a) * 1.9; k.s(G.cyl(0.05 * s, 0.07 * s, 0.35 * s, 8), '#e9dfc8', [x, 0.17 * s, z]); k.s(G.sph(0.18 * s, 10, 6, 0, PI * 2, 0, H), '#6b2fa3', [x, 0.33 * s, z]); k.g(G.sph(0.03 * s, 6, 4), '#b6ff4a', [x + 0.08 * s, 0.43 * s, z]); } }
  g.add(k.build());
  // faisceau lumineux (allumé quand le gardien est rentré)
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 7, 24, 1, true), new THREE.MeshBasicMaterial({ color: T.c, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 0.56 + 3.5; beam.userData.noCollide = true; beam.castShadow = false; beam.visible = false; g.add(beam);
  let lit = false;
  g.userData.top = 0.56;          // hauteur où poser le gardien
  g.userData.plaque = new THREE.Vector3(0, 0.32, 1.52);
  g.userData.setLit = (on) => { lit = !!on; beam.visible = lit; M.g.color.setScalar(lit ? 2.2 : 0.35); };
  g.userData.update = (dt, t) => { if (lit) beam.material.opacity = 0.12 + 0.04 * Math.sin(t * 2); };
  g.name = 'guardian-pedestal-' + i;
  return g;
}
