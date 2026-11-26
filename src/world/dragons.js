import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------------------------
// DRAGONS : 4 grands dragons low-poly qui planent au-dessus des mondes (décor animé).
//  - 1 SkinnedMesh par couche (corps / membranes / lueurs) => 3-4 draw calls par dragon
//  - colonne vertébrale segmentée (cou 4, queue 10), ailes à 3 articulations + 4 doigts, mâchoire
//  - vol : orbite lissée, virages inclinés, piqués / remontées, planés ; souffles (feu, cristaux, éclairs)
//  - aucun solide : userData.noCollide / noChunk / noCull partout
// ---------------------------------------------------------------------------------------------

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const rnd = (a, b) => a + Math.random() * (b - a);
const _c = new THREE.Color();
const mixC = (a, b, t) => _c.copy(a).lerp(b, t);

// ------------------------------------------------------------------ constructeur de géométrie skinnée
class Layer {
  constructor() { this.pos = []; this.col = []; this.si = []; this.sw = []; this.idx = []; }
  v(p, c, bones) {
    const i = this.pos.length / 3;
    this.pos.push(p.x, p.y, p.z); this.col.push(c.r, c.g, c.b);
    const b = [0, 0, 0, 0], w = [0, 0, 0, 0];
    bones.forEach(([bi, wi], k) => { b[k] = bi; w[k] = wi; });
    this.si.push(...b); this.sw.push(...w);
    return i;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// Tube / loft le long d'une courbe de points, section elliptique
function loft(L, o) {
  const { pts, rx, ry = rx, sides = 8, bone, color } = o;
  const n = pts.length, rings = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const T = b.clone().sub(a).normalize();
    const up = o.up || (Math.abs(T.y) > 0.9 ? V3(0, 0, 1) : V3(0, 1, 0));
    const S = up.clone().cross(T).normalize(), N = T.clone().cross(S).normalize();
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const an = (k / sides) * Math.PI * 2, sa = Math.sin(an), ca = Math.cos(an);
      const p = pts[i].clone().addScaledVector(S, sa * rx[i]).addScaledVector(N, ca * ry[i]);
      ring.push(L.v(p, color(i, k, ca, sa), bone(i)));
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) { const k2 = (k + 1) % sides; L.quad(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]); }
  if (o.capEnd) { const c = L.v(pts[n - 1], color(n - 1, 0, 0, 0), bone(n - 1)); for (let k = 0; k < sides; k++) L.tri(rings[n - 1][k], rings[n - 1][(k + 1) % sides], c); }
  if (o.capStart) { const c = L.v(pts[0], color(0, 0, 0, 0), bone(0)); for (let k = 0; k < sides; k++) L.tri(rings[0][(k + 1) % sides], rings[0][k], c); }
  return rings;
}

// pointe (cône 4 faces ou 2 anneaux)
function spike(L, base, dir, len, r, bone, color, sides = 4) {
  const d = dir.clone().normalize();
  loft(L, { pts: [base.clone(), base.clone().addScaledVector(d, len * 0.45), base.clone().addScaledVector(d, len)], rx: [r, r * 0.55, 0.002], sides, bone: () => [[bone, 1]], color: () => color });
}

// primitive THREE transformée et collée à un os
function prim(L, geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] }, bone, color) {
  const m = new THREE.Matrix4().compose(V3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V3(...s));
  const pos = geo.attributes.position, base = L.pos.length / 3, v = V3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    L.v(v, typeof color === 'function' ? color(v) : color, [[bone, 1]]);
  }
  if (geo.index) for (let i = 0; i < geo.index.count; i += 3) L.tri(base + geo.index.getX(i), base + geo.index.getX(i + 1), base + geo.index.getX(i + 2));
  else for (let i = 0; i < pos.count; i += 3) L.tri(base + i, base + i + 1, base + i + 2);
}

// boîte effilée (museau, mâchoire) : tf/tb = échelle de la face avant/arrière
function taperBox(w, h, d, tf, tb) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = p.getZ(i) / d + 0.5, s = lerp(tb, tf, f); p.setX(i, p.getX(i) * s); p.setY(i, p.getY(i) * s); }
  return g;
}

// ------------------------------------------------------------------ modèle
// Repère du modèle : +Z = avant, +Y = haut, +X = gauche du dragon. Unités ~ 1 = 1/scale m.
const SIDES = [1, -1];

function buildModel(cfg) {
  const P = cfg.pal;
  const back = C(P.back), back2 = C(P.back2), belly = C(P.belly), accent = C(P.accent), horn = C(P.horn), claw = C(P.claw);
  const mem = C(P.mem), memEdge = C(P.memEdge), eye = C(P.eye).multiplyScalar(cfg.eyeBoost || 1.6), white = C('#f1ead8');
  const hs = cfg.headScale || 1;

  // --- os
  const bones = [], bi = {}, rest = {};
  const mk = (name, parent, wp) => {
    const b = new THREE.Bone(); b.name = name;
    const w = V3(...wp); rest[name] = w;
    b.position.copy(w).sub(parent ? rest[parent] : V3());
    if (parent) bones[bi[parent]].add(b);
    bi[name] = bones.length; bones.push(b); return b;
  };
  mk('hips', null, [0, 0, 0]);
  mk('chest', 'hips', [0, 0.12, 1.7]);
  const NP = [[0, 0.45, 2.6], [0, 0.95, 3.35], [0, 1.55, 3.95], [0, 2.2, 4.4]];
  NP.forEach((p, i) => mk('n' + i, i ? 'n' + (i - 1) : 'chest', p));
  const HP = V3(0, 2.7, 4.85);
  mk('head', 'n3', [HP.x, HP.y, HP.z]);
  mk('jaw', 'head', [0, HP.y - 0.33 * hs, HP.z + 0.35 * hs]);
  const TP = [];
  for (let k = 0; k < 10; k++) { TP.push([0, -0.05 - 0.035 * k, -1.1 - k * 1.0]); mk('t' + k, k ? 't' + (k - 1) : 'hips', TP[k]); }
  const wingP = {};
  const sh = V3(0.75, 0.8, 1.55), el = V3(3.95, 1.35, 0.7), wr = V3(7.4, 1.5, 1.6);
  const tips = [V3(4.3, -0.3, -0.5), V3(3.8, -0.6, -3.0), V3(2.7, -0.8, -5.0), V3(1.1, -0.9, -6.3)].map(t => t.multiplyScalar(cfg.wingLen || 1)).map(t => wr.clone().add(t));
  const root = V3(0.7, 0.15, -2.5);
  const legP = { f: V3(0.6, -0.45, 1.3), r: V3(0.75, -0.4, -0.5) };
  SIDES.forEach((s, si) => {
    const m = (v) => V3(v.x * s, v.y, v.z);
    wingP[si] = { sh: m(sh), el: m(el), wr: m(wr), tips: tips.map(m), root: m(root) };
    mk('sh' + si, 'chest', [...Object.values(m(sh))]);
    mk('el' + si, 'sh' + si, [...Object.values(m(el))]);
    mk('wr' + si, 'el' + si, [...Object.values(m(wr))]);
    for (let k = 0; k < 4; k++) mk('f' + si + k, 'wr' + si, [...Object.values(m(wr))]);
    mk('lf' + si, 'chest', [...Object.values(m(legP.f))]);
    mk('lr' + si, 'hips', [...Object.values(m(legP.r))]);
  });
  const B = (n) => bi[n];

  const body = new Layer(), memb = new Layer(), glow = new Layer(), mouth = new Layer();

  // --- colonne vertébrale : queue -> bassin -> poitrail -> cou -> tête
  const chain = [];
  for (let k = 9; k >= 0; k--) chain.push({ name: 't' + k, p: V3(...TP[k]), r: [0.02, 0.07, 0.11, 0.16, 0.21, 0.27, 0.35, 0.43, 0.51, 0.6][9 - k] * (cfg.tailThick || 1) });
  chain.push({ name: 'hips', p: V3(0, 0, 0), r: 0.76 }, { name: 'chest', p: V3(0, 0.12, 1.7), r: 0.88, ry: 0.92 });
  NP.forEach((p, i) => chain.push({ name: 'n' + i, p: V3(...p), r: [0.62, 0.52, 0.45, 0.4][i] * (cfg.neckThick || 1) }));
  chain.push({ name: 'head', p: V3(0, 2.62, 4.7), r: 0.36 });
  const bodyColor = (i, k, ca) => {
    const base = mixC(back, back2, (i % 2) * 0.5 + 0.1 * Math.sin(i * 1.7)).clone();
    const w = sstep(-0.05, -0.8, ca);
    if (w > 0) base.lerp(i % 2 ? belly.clone().multiplyScalar(0.9) : belly, w);
    else if (ca > 0.55) base.lerp(accent, 0.12);
    return base;
  };
  const rings = loft(body, {
    pts: chain.map(c => c.p), rx: chain.map(c => c.r), ry: chain.map(c => (c.ry || c.r) * 0.95), sides: 8,
    bone: (i) => [[B(chain[i].name), 1]], color: bodyColor, capStart: true,
  });
  // crête dorsale
  const crest = cfg.crest || 'spikes';
  for (let i = 1; i < chain.length - 1; i++) {
    const c = chain[i], fr = i / chain.length;
    if (c.name === 'hips' && cfg.noHipCrest) continue;
    const h = (cfg.crestH || 1) * (0.28 + c.r * 0.85) * (crest === 'ice' ? 1.35 : 1);
    const top = c.p.clone().add(V3(0, (c.ry || c.r) * 0.92, 0));
    const tilt = crest === 'ice' ? V3(0, 1, -0.25) : crest === 'blade' ? V3(0, 1, -0.7) : V3(0, 1, -0.45);
    const bone = B(c.name);
    if (crest === 'ice') {
      const g = new THREE.OctahedronGeometry(1, 0);
      prim(body, g, { p: top.clone().addScaledVector(tilt.clone().normalize(), h * 0.5).toArray(), r: [-0.25, 0, 0], s: [h * 0.2, h * 0.62, h * 0.2] }, bone, C(i % 2 ? P.accent : '#e8f8ff'));
      prim(glow, g, { p: top.clone().addScaledVector(tilt.clone().normalize(), h * 0.5).toArray(), r: [-0.25, 0, 0], s: [h * 0.09, h * 0.34, h * 0.09] }, bone, C('#7fd4ff').multiplyScalar(0.8));
    } else {
      spike(body, top, tilt, h, 0.1 + c.r * 0.12, bone, i % 2 ? accent : mixC(accent, back, 0.4).clone());
      if (crest === 'blade') spike(glow, top.clone().addScaledVector(tilt.clone().normalize(), h * 0.62), tilt, h * 0.42, 0.05, bone, C(P.glow || '#a070ff').multiplyScalar(1.6));
    }
  }
  // lame de queue
  {
    const tb = B('t9'), tip = V3(...TP[9]);
    if (cfg.tail === 'fork') {
      for (const s of SIDES) spike(body, tip.clone().add(V3(0, 0, 0.05)), V3(0.55 * s, 0.04, -1), 1.9, 0.2, tb, accent);
      spike(glow, tip.clone().add(V3(0, 0, -0.9)), V3(0, 0, -1), 0.5, 0.06, tb, C(P.glow || '#a070ff').multiplyScalar(1.6));
    } else if (cfg.tail === 'ice') {
      prim(body, new THREE.OctahedronGeometry(1, 0), { p: [0, 0, tip.z - 0.9], s: [0.18, 0.75, 1.35] }, tb, C('#dff4ff'));
      prim(glow, new THREE.OctahedronGeometry(1, 0), { p: [0, 0, tip.z - 0.9], s: [0.07, 0.4, 0.8] }, tb, C('#7fd4ff').multiplyScalar(0.7));
    } else {
      // pointe de lance
      prim(body, new THREE.OctahedronGeometry(1, 0), { p: [0, 0, tip.z - 0.6], s: [0.16, 0.85, 1.2] }, tb, accent);
      prim(body, new THREE.OctahedronGeometry(1, 0), { p: [0, 0, tip.z - 0.6], s: [0.85, 0.12, 1.1] }, tb, accent);
    }
  }

  // --- tête (échelle hs autour du pivot)
  {
    const hb = B('head'), jb = B('jaw');
    const hp = (x, y, z) => [HP.x + x * hs, HP.y + y * hs, HP.z + z * hs];
    const hsc = (x, y, z) => [x * hs, y * hs, z * hs];
    const skullCol = (v) => mixC(back, back2, clamp((v.y - HP.y) * 1.2 + 0.4, 0, 1)).clone();
    prim(body, taperBox(0.82, 0.74, 1.35, 0.85, 1), { p: hp(0, 0.02, 0.28), s: [hs, hs, hs] }, hb, skullCol);
    prim(body, taperBox(0.72, 0.46, 1.6, 0.52, 1), { p: hp(0, -0.02, 1.3), s: [hs, hs, hs] }, hb, (v) => mixC(back, back2, 0.4).clone());
    prim(body, new THREE.BoxGeometry(0.55, 0.14, 0.7), { p: hp(0, 0.28, 0.95), r: [0.12, 0, 0], s: [hs, hs, hs] }, hb, accent);
    // narines
    for (const s of SIDES) {
      prim(body, new THREE.IcosahedronGeometry(0.1, 0), { p: hp(0.2 * s, 0.14, 1.95), s: [hs, hs, hs * 1.3] }, hb, accent);
      // arcade sourcilière
      prim(body, new THREE.BoxGeometry(0.3, 0.1, 0.56), { p: hp(0.36 * s, 0.34, 0.5), r: [0.0, -0.25 * s, 0.35 * s], s: [hs, hs, hs] }, hb, accent);
      // yeux (lueur)
      prim(glow, new THREE.IcosahedronGeometry(0.115, 0), { p: hp(0.39 * s, 0.2, 0.55), s: [0.6 * hs * (cfg.eyeScale || 1), 0.85 * hs * (cfg.eyeScale || 1), 1.5 * hs * (cfg.eyeScale || 1)], r: [0, 0, 0.0] }, hb, eye);
      // joues
      spike(body, V3(...hp(0.36 * s, -0.1, 0.1)), V3(0.7 * s, -0.2, -1), 0.85 * hs, 0.11 * hs, hb, accent);
    }
    // mâchoire inférieure
    prim(body, taperBox(0.6, 0.2, 1.6, 0.5, 1), { p: hp(0, -0.37, 1.15), s: [hs, hs, hs] }, jb, (v) => mixC(back, belly, 0.55).clone());
    prim(body, new THREE.BoxGeometry(0.18, 0.1, 0.4), { p: hp(0, -0.52, 1.85), r: [0.3, 0, 0], s: [hs, hs, hs] }, jb, accent);
    // dents
    for (let k = 0; k < 4; k++) for (const s of SIDES) {
      const z = 0.95 + k * 0.28, x = (0.3 - k * 0.04) * s;
      spike(body, V3(...hp(x, -0.22, z)), V3(0, -1, 0), 0.2 * hs, 0.045 * hs, hb, white, 3);
      spike(body, V3(...hp(x * 0.9, -0.3, z + 0.1)), V3(0, 1, 0), 0.17 * hs, 0.04 * hs, jb, white, 3);
    }
    // intérieur de la gueule : lueur visible quand elle s'ouvre
    prim(mouth, new THREE.IcosahedronGeometry(0.2, 0), { p: hp(0, -0.16, 1.05), s: [0.9 * hs, 0.5 * hs, 3.2 * hs] }, hb, C(cfg.mouthCol || '#ff8a2a').multiplyScalar(1.3));
    // cornes (courbes)
    const hornStyle = cfg.horns || 'back';
    for (const s of SIDES) {
      const pts = hornStyle === 'fwd'
        ? [[0.3, 0.38, 0.0], [0.62, 0.72, -0.35], [0.98, 1.05, -0.55], [1.22, 1.55, -0.2], [1.2, 1.95, 0.45]]
        : hornStyle === 'short'
          ? [[0.26, 0.36, 0.0], [0.4, 0.62, -0.25], [0.46, 0.86, -0.55]]
          : [[0.3, 0.36, 0.0], [0.5, 0.62, -0.4], [0.7, 0.8, -1.1], [0.84, 0.82, -1.9], [0.9, 0.7, -2.5]];
      const hp3 = pts.map(q => V3(...hp(q[0] * s, q[1], q[2])));
      const rr = pts.map((_, i) => (cfg.hornR || 0.15) * hs * (1 - i / pts.length) + 0.004);
      loft(body, { pts: hp3, rx: rr, sides: 5, bone: () => [[hb, 1]], color: (i) => mixC(horn, accent, i / pts.length * 0.4).clone() });
      if (hornStyle === 'back' && cfg.antler) {
        const q = hp3[2];
        spike(body, q, V3(0.5 * s, 0.9, -0.2), 0.9 * hs, 0.08 * hs, hb, horn);
        spike(body, hp3[3], V3(0.35 * s, 0.9, -0.2), 0.8 * hs, 0.07 * hs, hb, horn);
      }
      // ailettes derrière la mâchoire
      for (let k = 0; k < 3; k++) spike(body, V3(...hp(0.3 * s, -0.12 + k * 0.06, -0.15)), V3(0.8 * s, 0.1 - k * 0.12, -1), (0.75 - k * 0.14) * hs, 0.08 * hs, hb, accent);
      if (cfg.ears) prim(body, new THREE.IcosahedronGeometry(0.28, 0), { p: hp(0.5 * s, 0.5, -0.1), s: [0.4 * hs, 1.1 * hs, 0.9 * hs], r: [0.2, 0, 0.4 * s] }, hb, mem);
    }
  }

  // --- pattes (repliées)
  for (const [si, s] of SIDES.entries()) {
    const fp = legP.f, rp = legP.r;
    const legC = () => back.clone().lerp(accent, 0.1);
    // avant : repliée sous la poitrine
    loft(body, { pts: [V3(fp.x * s, fp.y, fp.z), V3(0.85 * s, -0.75, 1.75), V3(0.7 * s, -0.95, 2.4), V3(0.55 * s, -1.2, 2.95)], rx: [0.26, 0.2, 0.13, 0.1], sides: 5, bone: () => [[B('lf' + si), 1]], color: legC });
    for (let c = -1; c <= 1; c++) spike(body, V3((0.55 + c * 0.13) * s, -1.22, 2.95), V3(c * 0.15 * s, -0.5, 1), 0.38, 0.045, B('lf' + si), claw, 3);
    // arrière : cuisse, jarret, pied qui traîne
    loft(body, { pts: [V3(rp.x * s, rp.y, rp.z), V3(0.95 * s, -0.55, -0.45), V3(1.0 * s, -1.1, -1.1), V3(0.8 * s, -1.15, -1.9), V3(0.65 * s, -1.2, -2.5)], rx: [0.42, 0.32, 0.2, 0.13, 0.1], sides: 5, bone: () => [[B('lr' + si), 1]], color: legC });
    for (let c = -1; c <= 1; c++) spike(body, V3((0.65 + c * 0.13) * s, -1.2, -2.5), V3(c * 0.15 * s, -0.4, -1), 0.4, 0.05, B('lr' + si), claw, 3);
  }

  // --- ailes
  for (const [si, s] of SIDES.entries()) {
    const W = wingP[si];
    const sb = B('sh' + si), eb = B('el' + si), wb = B('wr' + si), fb = (k) => B('f' + si + k);
    const arm = (a, b, r0, r1, bone) => loft(body, { pts: [a, a.clone().lerp(b, 0.5), b], rx: [r0, (r0 + r1) / 2, r1], sides: 5, bone: () => [[bone, 1]], color: (i) => mixC(back, accent, 0.15 + i * 0.1).clone() });
    arm(W.sh, W.el, 0.27, 0.2, sb);
    arm(W.el, W.wr, 0.2, 0.15, eb);
    prim(body, new THREE.IcosahedronGeometry(0.24, 0), { p: W.el.toArray() }, eb, accent);
    prim(body, new THREE.IcosahedronGeometry(0.21, 0), { p: W.wr.toArray() }, wb, accent);
    // griffe du poignet (pouce)
    spike(body, W.wr, V3(0.35 * s, 0.6, 1), 1.1, 0.12, wb, claw);
    W.tips.forEach((t, k) => {
      const d = t.clone().sub(W.wr);
      loft(body, { pts: [W.wr.clone(), W.wr.clone().addScaledVector(d, 0.5), t], rx: [0.13, 0.09, 0.03], sides: 4, bone: () => [[fb(k), 1]], color: () => accent });
      spike(body, t, d.clone().add(V3(0, -0.2, 0)), 0.5, 0.05, fb(k), claw, 3);
    });
    // membrane : panneaux entre les doigts
    const mcol = (u, v, edge) => {
      const c = mixC(memEdge, mem, Math.pow(Math.sin(Math.PI * clamp(v, 0, 1)), 0.6) * (0.35 + 0.65 * u)).clone();
      if (edge) c.lerp(memEdge, 0.35);
      return c;
    };
    const NU = 4, NV = 3;
    const panel = (A, Bf, boneA, boneB, sag) => {
      const grid = [];
      for (let iu = 0; iu <= NU; iu++) {
        const u = iu / NU, row = [];
        for (let iv = 0; iv <= NV; iv++) {
          const v = iv / NV;
          const pa = A(u), pb = Bf(u);
          const p = pa.clone().lerp(pb, v);
          p.lerp(W.wr, sag * Math.sin(Math.PI * v) * u * u);
          const bonesW = []; const wa = boneA(u) , wb2 = boneB(u);
          for (const [b, w] of wa) bonesW.push([b, w * (1 - v)]);
          for (const [b, w] of wb2) { const e = bonesW.find(x => x[0] === b); if (e) e[1] += w * v; else bonesW.push([b, w * v]); }
          row.push(memb.v(p, mcol(u, v, iv === 0 || iv === NV), bonesW.filter(x => x[1] > 0.0001).slice(0, 4)));
        }
        grid.push(row);
      }
      for (let iu = 0; iu < NU; iu++) for (let iv = 0; iv < NV; iv++) memb.quad(grid[iu][iv], grid[iu + 1][iv], grid[iu + 1][iv + 1], grid[iu][iv + 1]);
    };
    for (let k = 0; k < 3; k++) {
      panel(u => W.wr.clone().lerp(W.tips[k], u), u => W.wr.clone().lerp(W.tips[k + 1], u), () => [[fb(k), 1]], () => [[fb(k + 1), 1]], 0.16);
    }
    // panneau du corps : poignet/doigt 4 -> coude/flanc
    panel(u => W.wr.clone().lerp(W.tips[3], u), u => W.el.clone().lerp(W.root, u), () => [[fb(3), 1]], u => [[eb, 1 - u], [B('hips'), u]], 0.12);
    // triangle épaule / coude / flanc
    {
      const a = memb.v(W.sh, mcol(0.4, 0.5), [[sb, 1]]), b = memb.v(W.el, mcol(0.4, 0.2), [[eb, 1]]), c = memb.v(W.root, mcol(0.8, 0.5), [[B('hips'), 1]]);
      const ab = memb.v(W.sh.clone().lerp(W.el, 0.5), mcol(0.5, 0.2), [[sb, 0.5], [eb, 0.5]]);
      const bc = memb.v(W.el.clone().lerp(W.root, 0.5), mcol(0.6, 0.5), [[eb, 0.5], [B('hips'), 0.5]]);
      const ca = memb.v(W.root.clone().lerp(W.sh, 0.5), mcol(0.6, 0.5), [[B('hips'), 0.5], [sb, 0.5]]);
      memb.tri(a, ab, ca); memb.tri(ab, b, bc); memb.tri(ca, bc, c); memb.tri(ab, bc, ca);
    }
    // petite membrane avant (propatagium) épaule -> poignet
    {
      const a = memb.v(W.sh.clone().add(V3(0, 0.05, 0)), mcol(0.3, 0.2), [[sb, 1]]);
      const b = memb.v(W.el.clone().add(V3(0, 0.05, 0.1)), mcol(0.5, 0.2), [[eb, 1]]);
      const c = memb.v(W.wr.clone().add(V3(0, 0.05, 0.05)), mcol(0.6, 0.2), [[wb, 1]]);
      const mid = memb.v(W.sh.clone().lerp(W.wr, 0.5).add(V3(0, 0.1, 0.9)), mcol(0.5, 0.5), [[eb, 1]]);
      memb.tri(a, mid, b); memb.tri(b, mid, c);
    }
  }

  // --- assemblage skinné
  const model = new THREE.Group();
  model.add(bones[0]);
  model.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bones);
  const mats = {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: P.rough ?? 0.55, metalness: P.metal ?? 0.15, side: THREE.DoubleSide }),
    memb: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: P.memOp ?? 0.9, emissive: C(P.mem), emissiveIntensity: P.memGlow ?? 0.22 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    mouth: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  const meshes = {};
  for (const [name, L] of Object.entries({ body, memb, glow, mouth })) {
    if (!L.pos.length) continue;
    const m = new THREE.SkinnedMesh(L.geometry(), mats[name]);
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    model.add(m); m.bind(skel, new THREE.Matrix4());
    meshes[name] = m;
  }
  model.userData = { bones, bi, skel, mats, meshes, rest, hs };
  return model;
}

// ------------------------------------------------------------------ éclairs
function softTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function ribbonTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 4; const g = c.getContext('2d');
  const r = g.createLinearGradient(0, 0, 32, 0);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 4); return new THREE.CanvasTexture(c);
}

function jag(a, b, levels, amp) {
  let pts = [a.clone(), b.clone()];
  for (let l = 0; l < levels; l++) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], m = p.clone().add(q).multiplyScalar(0.5), d = q.clone().sub(p).normalize();
      const r = V3().randomDirection(); r.addScaledVector(d, -r.dot(d));
      m.addScaledVector(r.normalize(), amp * (0.3 + Math.random() * 0.7));
      out.push(p, m);
    }
    out.push(pts[pts.length - 1]); pts = out; amp *= 0.55;
  }
  return pts;
}

class Lightning {
  constructor(scene, hemi, fx) {
    this.scene = scene; this.hemi = hemi; this.fx = fx;
    this.bolts = []; this.flashApplied = 0;
    const tex = ribbonTexture(), soft = softTexture();
    const CAP = 120; // segments max
    for (let b = 0; b < 3; b++) {
      const g = new THREE.BufferGeometry();
      const nq = CAP * 4, nv = nq * 4;
      const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), idx = new Uint16Array(nq * 6);
      for (let q = 0; q < nq; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
      const m = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.visible = false; mark(mesh); scene.add(mesh);
      const sp = (sz) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: '#b9a0ff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false })); s.visible = false; s.scale.setScalar(sz); mark(s); scene.add(s); return s; };
      this.bolts.push({ mesh, g, pos, uv, col, nq: 0, t: 99, life: 0.6, top: sp(1), bot: sp(1), flash: 0, cap: CAP });
    }
    this.next = 0;
  }
  strike(a, b, camPos, { branch = true, ground = true } = {}) {
    const bo = this.bolts[this.next]; this.next = (this.next + 1) % this.bolts.length;
    const len = a.distanceTo(b), camD = camPos ? camPos.distanceTo(a.clone().lerp(b, 0.5)) : len;
    const w = Math.max(len * 0.012, camD * 0.0045, 1.2);
    const main = jag(a, b, 5, len * 0.16);
    const lines = [{ pts: main, k: 1 }];
    if (branch) {
      const nb = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < nb; i++) {
        const j = Math.floor(rnd(0.15, 0.75) * main.length), p = main[j];
        const d = b.clone().sub(a).normalize(); const r = V3().randomDirection(); r.y = -Math.abs(r.y) * 0.6 - 0.2;
        const e = p.clone().addScaledVector(d, len * 0.12).addScaledVector(r, len * rnd(0.15, 0.3));
        lines.push({ pts: jag(p, e, 3, len * 0.05), k: 0.5 });
      }
    }
    let q = 0; const { pos, uv, col } = bo; const e1 = V3(), e2 = V3(), d = V3();
    const put = (p0, p1, w0, k, rgb) => {
      d.subVectors(p1, p0).normalize();
      e1.crossVectors(d, Math.abs(d.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0)).normalize(); e2.crossVectors(d, e1).normalize();
      for (const e of [e1, e2]) {
        if (q >= bo.cap * 4) return;
        const base = q * 4; const ww = w0 * k;
        const v = [p0.clone().addScaledVector(e, -ww), p0.clone().addScaledVector(e, ww), p1.clone().addScaledVector(e, ww), p1.clone().addScaledVector(e, -ww)];
        const uu = [[0, 0], [1, 0], [1, 1], [0, 1]];
        for (let n = 0; n < 4; n++) { pos.set([v[n].x, v[n].y, v[n].z], (base + n) * 3); uv.set(uu[n], (base + n) * 2); col.set(rgb, (base + n) * 3); }
        q++;
      }
    };
    for (const ln of lines) for (let i = 0; i < ln.pts.length - 1; i++) {
      put(ln.pts[i], ln.pts[i + 1], w * 1.7, ln.k, [0.4, 0.25, 0.95]);
      put(ln.pts[i], ln.pts[i + 1], w * 0.7, ln.k, [1, 0.97, 1]);
    }
    bo.nq = q; bo.g.setDrawRange(0, q * 6);
    bo.g.attributes.position.needsUpdate = bo.g.attributes.uv.needsUpdate = bo.g.attributes.color.needsUpdate = true;
    bo.mesh.visible = true; bo.t = 0; bo.life = 0.7;
    bo.top.position.copy(a); bo.top.scale.setScalar(Math.max(110, len * 0.6)); bo.top.visible = true;
    bo.bot.position.copy(b); bo.bot.scale.setScalar(Math.max(50, len * 0.3)); bo.bot.visible = ground;
    if (ground) for (let k = 0; k < 26; k++) this.fx.sparks.emit(b, V3().randomDirection().multiplyScalar(rnd(6, 22)).setY(rnd(3, 16)), { life: rnd(0.5, 1.2), size: rnd(0.5, 1.4), color: Math.random() < 0.5 ? '#ffffff' : '#b49aff' });
    return bo;
  }
  update(dt) {
    let flash = 0;
    for (const bo of this.bolts) {
      if (!bo.mesh.visible) continue;
      bo.t += dt;
      const t = bo.t;
      let f = t < 0.07 ? 1 : t < 0.13 ? 0.12 : t < 0.2 ? 1.1 : Math.exp(-(t - 0.2) * 7);
      if (t > bo.life || f < 0.02) { bo.mesh.visible = false; bo.top.visible = bo.bot.visible = false; continue; }
      bo.mesh.material.opacity = Math.min(1, f);
      bo.top.material.opacity = f * 0.4; bo.bot.material.opacity = f * 0.5;
      flash = Math.max(flash, f);
    }
    this.flash = flash;
    const target = flash * 0.9, delta = target - this.flashApplied;
    if (this.hemi && Math.abs(delta) > 1e-4) { this.hemi.intensity += delta; this.flashApplied = target; }
    return flash;
  }
}

function mark(o) { o.traverse(c => { c.userData.noCollide = true; c.userData.noChunk = true; c.userData.noCull = true; }); }

// ------------------------------------------------------------------ dragon (vol + animation + souffle)
const _v1 = V3(), _v2 = V3(), _v3 = V3(), _q1 = new THREE.Quaternion();

class Dragon {
  constructor(cfg, scene, terrain, fx) {
    this.cfg = cfg; this.terrain = terrain; this.fx = fx; this.scene = scene;
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    this.model = buildModel(cfg);
    this.root.add(this.model); this.root.scale.setScalar(cfg.scale);
    mark(this.root); this.root.userData.noCollide = true; this.root.userData.noChunk = true; this.root.userData.noCull = true;
    scene.add(this.root);
    const u = this.model.userData, b = u.bones, i = u.bi;
    this.b = { hips: b[i.hips], chest: b[i.chest], head: b[i.head], jaw: b[i.jaw], n: [0, 1, 2, 3].map(k => b[i['n' + k]]), t: [...Array(10).keys()].map(k => b[i['t' + k]]) };
    this.b.sh = [0, 1].map(s => b[i['sh' + s]]); this.b.el = [0, 1].map(s => b[i['el' + s]]); this.b.wr = [0, 1].map(s => b[i['wr' + s]]);
    this.b.f = [0, 1].map(s => [0, 1, 2, 3].map(k => b[i['f' + s + k]]));
    this.b.lf = [0, 1].map(s => b[i['lf' + s]]); this.b.lr = [0, 1].map(s => b[i['lr' + s]]);
    this.mouthTip = new THREE.Object3D(); this.mouthTip.position.set(0, -0.2, 2.15 * u.hs); this.b.head.add(this.mouthTip);
    this.tipL = new THREE.Object3D(); this.tipL.position.set(5.2, -0.3, -0.7); this.b.f[0][0].add(this.tipL);
    this.tipR = new THREE.Object3D(); this.tipR.position.set(-5.2, -0.3, -0.7); this.b.f[1][0].add(this.tipR);
    this.u = u;
    // état de vol
    this.t = rnd(0, 100); this.ph = rnd(0, 6.28); this.flapPh = rnd(0, 6.28);
    this.pos = V3(); this.yaw = 0; this.pitch = 0; this.roll = 0; this.yr = 0; this.vy = 0; this.speed = cfg.speed;
    this.center = V3(); this.centerInit = false; this.dive = { st: 'none', t: 0, off: 0, next: rnd(14, 30) };
    this.amp = 1; this.fold = 0; this.glide = { on: false, t: rnd(4, 9) };
    this.fire = { on: false, t: 0, next: rnd(6, 14), kind: cfg.breath };
    this.rear = 0; this.open = 0; this.look = { y: 0, p: 0 };
    this.stormT = rnd(3, 6); this.trailT = 0; this.rollSpin = 0; this.rollNext = rnd(18, 36);
    this.vel = V3(); this.hold = null; this.poseT = 0; this.frame = 0; this.dist = 1e9;
    this.cloud = null;
    this.spawn();
    if (cfg.storm) this.buildClouds();
  }

  orbitCenter(t, cam) {
    const c = this.cfg, a = c.angle;
    const dist = c.dist + c.distAmp * Math.sin(t * 0.017 + this.ph);
    const swing = (c.swing || 0) * Math.sin(t * 0.011 + this.ph * 2);
    const x = Math.cos(a + swing) * dist, z = -Math.sin(a + swing) * dist;
    if (c.curious && cam) {
      // le petit dragon doré vient tourner autour du joueur quand celui-ci est près du Moyeu
      const near = Math.hypot(cam.x, cam.z) < 330;
      return { x, z, follow: near, fx: cam.x, fz: cam.z };
    }
    return { x, z, follow: false };
  }
  radius(t) { const c = this.cfg; return c.R + c.Ramp * Math.sin(t * 0.031 + this.ph * 1.7); }
  ground(x, z) { return this.terrain.heightAt(x, z); }

  spawn() {
    const o = this.orbitCenter(this.t, null);
    this.center.set(o.x, 0, o.z);
    const R = this.radius(this.t), a = this.ph;
    this.pos.set(this.center.x + Math.cos(a) * R, 0, this.center.z + Math.sin(a) * R);
    const g = this.ground(this.pos.x, this.pos.z);
    this.pos.y = Math.max(this.cfg.alt, g + 80);
    const tx = -Math.sin(a) * this.cfg.dir, tz = Math.cos(a) * this.cfg.dir;
    this.yaw = Math.atan2(tx, tz);
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
  }

  step(dt, cam) {
    const c = this.cfg; this.t += dt;
    const t = this.t;
    const o = this.orbitCenter(t, cam);
    const cx = o.follow ? o.fx : o.x, cz = o.follow ? o.fz : o.z;
    const rate = o.follow ? 0.5 : 0.8;
    this.center.x += (cx - this.center.x) * Math.min(1, dt * (this.centerInit ? 0.25 * rate : 1)); this.center.z += (cz - this.center.z) * Math.min(1, dt * (this.centerInit ? 0.25 * rate : 1));
    this.centerInit = true;
    let R = this.radius(t); if (o.follow) R = c.R * 0.28 + 30 * Math.sin(t * 0.2);
    // cap vers l'orbite
    const rx = this.pos.x - this.center.x, rz = this.pos.z - this.center.z, r = Math.max(1, Math.hypot(rx, rz));
    const tx = -rz / r * c.dir, tz = rx / r * c.dir, err = clamp((R - r) / (R * 0.6), -1, 1);
    let dx = tx + rx / r * err * 0.95, dz = tz + rz / r * err * 0.95;
    // reste dans le monde
    const pr = Math.hypot(this.pos.x, this.pos.z);
    if (pr > 1330) { const k = sstep(1330, 1420, pr); dx = dx * (1 - k) - this.pos.x / pr * k; dz = dz * (1 - k) - this.pos.z / pr * k; }
    const want = Math.atan2(dx, dz), dy = wrapA(want - this.yaw);
    const maxYr = c.maxYr;
    const yrT = clamp(dy * 1.1, -maxYr, maxYr);
    this.yr += (yrT - this.yr) * Math.min(1, dt * 1.6);
    this.yaw += this.yr * dt;

    // altitude
    const alt = c.alt + c.altAmp * Math.sin(t * 0.061 + this.ph) + c.altAmp * 0.45 * Math.sin(t * 0.027 + this.ph * 3);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const sp = this.speed;
    const gnd = Math.max(this.ground(this.pos.x, this.pos.z), this.ground(this.pos.x + fx * sp * 2.5, this.pos.z + fz * sp * 2.5), this.ground(this.pos.x + fx * sp * 6, this.pos.z + fz * sp * 6), this.ground(this.pos.x + fx * sp * 10, this.pos.z + fz * sp * 10));
    // machine à états : piqué -> remontée
    const D = this.dive; D.t += dt;
    if (D.st === 'none' && D.t > D.next && !this.fire.on) { D.st = 'dive'; D.t = 0; D.depth = rnd(55, 110); }
    else if (D.st === 'dive' && D.t > 4.5) { D.st = 'zoom'; D.t = 0; }
    else if (D.st === 'zoom' && D.t > 4.5) { D.st = 'none'; D.t = 0; D.next = rnd(18, 42); }
    const offT = D.st === 'dive' ? -D.depth : D.st === 'zoom' ? 28 : 0;
    D.off += (offT - D.off) * Math.min(1, dt * (D.st === 'dive' ? 0.75 : 0.5));
    const floorY = gnd + 70;
    const tgtY = Math.max(alt + D.off, floorY + 12);
    const vyT = clamp((tgtY - this.pos.y) * 0.5, -34, 17);
    this.vy += (vyT - this.vy) * Math.min(1, dt * 1.4);
    this.pos.y += this.vy * dt;
    this.pos.y = Math.max(this.pos.y, this.ground(this.pos.x, this.pos.z) + 62);
    const hs = sp * clamp(1 - this.vy / 55, 0.75, 1.5) * (D.st === 'dive' ? 1.12 : 1);
    this.pos.x += Math.sin(this.yaw) * hs * dt; this.pos.z += Math.cos(this.yaw) * hs * dt;
    this.vel.set(Math.sin(this.yaw) * hs, this.vy, Math.cos(this.yaw) * hs);
    const pT = -Math.atan2(this.vy, hs);
    this.pitch += (pT - this.pitch) * Math.min(1, dt * 2.2);
    const rT = clamp(-this.yr * 3.2, -0.75, 0.75) * (c.bankK || 1);
    this.roll += (rT - this.roll) * Math.min(1, dt * 2.0);

    // tonneau du petit dragon
    let spin = 0;
    if (c.curious) {
      this.rollNext -= dt;
      if (this.rollNext < 0 && this.rollSpin === 0 && this.dist < 600) { this.rollSpin = 0.0001; this.rollNext = rnd(22, 40); }
      if (this.rollSpin > 0) { this.rollSpin += dt * 2.8; spin = this.rollSpin; if (this.rollSpin > Math.PI * 2) this.rollSpin = 0; }
    }
    this.root.position.copy(this.pos);
    this.root.rotation.set(this.pitch, this.yaw, this.roll - spin);
  }

  // --------- pose (os)
  pose(dt, cam) {
    const c = this.cfg, b = this.b, t = this.t;
    // battement / plané / repli
    const G = this.glide; G.t -= dt;
    if (G.t < 0) { G.on = !G.on; G.t = G.on ? rnd(3.5, 8) : rnd(5, 11); }
    const D = this.dive;
    const climbing = this.vy > 2 || D.st === 'zoom';
    let ampT = G.on && !climbing ? 0.1 : 1;
    if (D.st === 'zoom') ampT = 1.35; if (this.fire.on) ampT = Math.min(ampT, 0.2);
    let foldT = D.st === 'dive' && D.t > 0.8 ? 0.85 : 0;
    if (this.vy < -14) foldT = Math.max(foldT, 0.6);
    this.amp += (ampT - this.amp) * Math.min(1, dt * 1.6);
    this.fold += (foldT - this.fold) * Math.min(1, dt * 2.6);
    const hz = c.flapHz * (this.amp > 0.5 ? 1 + (this.amp - 1) * 0.5 : 0.6);
    this.flapPh += dt * hz * Math.PI * 2 * (0.5 + 0.5 * Math.min(1, this.amp * 1.4));
    this.applyPose(this.amp, this.flapPh, this.fold, t, cam, dt);
  }

  applyPose(amp, ph, fold, t, cam, dt) {
    const c = this.cfg, b = this.b, fs = this.fire;
    const sn = Math.sin(ph);
    const fl = amp * (0.62 * sn + 0.12 * Math.sin(2 * ph - 0.4));
    const tremble = (1 - amp) * 0.02 * Math.sin(t * 2.3);
    // corps
    b.hips.rotation.x = 0.05 * amp * Math.sin(ph - 0.3) * -1;
    b.hips.position.y = 0; this.model.position.y = -0.3 * amp * Math.cos(ph) * 0.9;
    b.chest.rotation.x = 0.05 * Math.sin(ph - 0.7) * amp;
    // cou : ondulation + rejet en arrière avant le souffle
    const rear = this.rear, look = this.look;
    for (let k = 0; k < 4; k++) {
      const w = Math.sin(ph - 0.9 - k * 0.35) * 0.09 * amp + Math.sin(t * 0.9 + k * 0.5) * 0.035;
      b.n[k].rotation.x = w - rear * 0.34 * (k === 0 ? 0.6 : 1) + 0.0 + look.p * 0.25;
      b.n[k].rotation.y = Math.sin(t * 0.6 + k * 0.7) * 0.07 + look.y * 0.25;
      b.n[k].rotation.z = Math.sin(t * 0.5 + k) * 0.02;
    }
    b.head.rotation.x = -Math.sin(ph - 1.6) * 0.07 * amp + look.p * 0.2 + rear * 0.55 - this.open * 0.06;
    b.head.rotation.y = look.y * 0.2;
    b.jaw.rotation.x = this.open * 0.75 + (c.curious ? 0 : 0.0);
    // queue : onde latérale + ondulation verticale
    for (let k = 0; k < 10; k++) {
      const kk = k / 10;
      b.t[k].rotation.y = Math.sin(t * 1.5 - k * 0.6) * (0.05 + kk * 0.09) + this.yr * -0.4 * 0.5;
      b.t[k].rotation.x = Math.sin(ph - 1.2 - k * 0.45) * 0.05 * amp * (1 - kk * 0.3) - 0.02 + this.pitch * 0.0;
    }
    // ailes
    for (let s = 0; s < 2; s++) {
      const sg = s === 0 ? 1 : -1;
      const phs = ph + (s ? 0.06 : 0);
      const flapA = 0.16 + fl + tremble + Math.sin(t * 0.7 + s) * 0.012;
      b.sh[s].rotation.z = sg * (flapA * (1 - fold * 0.5) - fold * 0.1);
      b.sh[s].rotation.y = sg * (fold * 0.55 + 0.09 + (0.05 * (1 - Math.cos(phs)) * amp));
      b.sh[s].rotation.x = -amp * 0.06 * sn;
      // coude : plie à la remontée
      const up = 0.5 - 0.5 * Math.cos(phs);
      b.el[s].rotation.z = sg * (amp * 0.5 * Math.sin(phs - 1.0) - 0.04 + fold * 0.1);
      b.el[s].rotation.y = sg * (-fold * 1.55 - amp * 0.22 * up);
      b.wr[s].rotation.z = sg * (amp * 0.62 * Math.sin(phs - 1.9) + fold * 0.1);
      b.wr[s].rotation.y = sg * (fold * 1.15 + amp * 0.12 * up);
      for (let k = 0; k < 4; k++) {
        b.f[s][k].rotation.y = sg * (fold * (0.78 + k * 0.1) + amp * 0.1 * up * (k + 1) * 0.5 - 0.0);
        b.f[s][k].rotation.z = sg * (amp * 0.28 * Math.sin(phs - 2.5 - k * 0.35) + Math.sin(t * 1.7 + k + s) * 0.018);
      }
      // pattes
      b.lr[s].rotation.x = -0.15 + 0.12 * Math.sin(ph - 1) * amp + 0.08 * Math.sin(t * 0.8 + s);
      b.lf[s].rotation.x = 0.1 * Math.sin(t * 0.7 + s * 2);
    }
  }

  // --------- souffle
  startBreath(kind) {
    const f = this.fire; f.on = true; f.t = 0; f.kind = kind || this.cfg.breath; f.dur = f.kind === 'storm' ? 3.4 : 3.2; f.acc = 0; f.bolts = 0;
  }
  breath(dt, cam) {
    const f = this.fire, c = this.cfg;
    f.t += dt;
    const T = f.t, wind = 0.8, end = f.dur - 0.7;
    const prep = sstep(0, wind, T), rel = sstep(end, f.dur, T);
    const burst = T > wind && T < end;
    this.rear += ((burst ? 0.35 : (1 - rel) * prep) - this.rear) * Math.min(1, dt * 5);
    this.open += ((T > wind * 0.6 && T < end + 0.2 ? 1 : 0) - this.open) * Math.min(1, dt * 8);
    this.u.meshes.mouth && (this.u.meshes.mouth.visible = this.open > 0.2);
    if (this.u.mats.mouth) { this.u.mats.mouth.color.setScalar(0.65 + 0.35 * Math.sin(this.t * 40)); }
    if (burst) {
      this.root.updateMatrixWorld(true);
      this.mouthTip.getWorldPosition(_v1);
      this.b.head.getWorldQuaternion(_q1);
      const F = _v2.set(0, 0, 1).applyQuaternion(_q1);
      if (f.kind === 'storm') this.stormBreath(dt, f, _v1, F, cam);
      else this.emitJet(dt, f.kind, _v1, F);
    }
    if (T > f.dur) { f.on = false; f.next = rnd(c.fireEvery[0], c.fireEvery[1]); this.open = 0; }
  }
  emitJet(dt, kind, P, F) {
    const sc = this.cfg.scale, sparks = this.fx.sparks, smoke = this.fx.smoke;
    const rate = kind === 'frost' ? 210 : kind === 'gold' ? 110 : 170;
    this.fire.acc += rate * dt;
    const n = Math.min(70, Math.floor(this.fire.acc)); this.fire.acc -= n;
    const speed = (kind === 'gold' ? 30 : 23) * sc, V = this.vel;
    for (let i = 0; i < n; i++) {
      const fr = Math.random();
      const pos = _v3.copy(P).addScaledVector(V, -dt * fr);
      const spread = kind === 'frost' ? 0.3 : 0.2;
      const v = V3().copy(F).multiplyScalar(speed * rnd(0.65, 1.15));
      v.x += rnd(-1, 1) * speed * spread; v.y += rnd(-1, 1) * speed * spread + 3; v.z += rnd(-1, 1) * speed * spread;
      v.addScaledVector(V, 0.7);
      let col, size, life;
      if (kind === 'frost') { const r = Math.random(); col = r < 0.3 ? '#ffffff' : r < 0.65 ? '#bfe9ff' : r < 0.9 ? '#7cc8ff' : '#e8f8ff'; size = rnd(0.28, 0.75) * sc; life = rnd(1.0, 1.7); }
      else if (kind === 'gold') { const r = Math.random(); col = r < 0.3 ? '#fff6c0' : r < 0.75 ? '#ffd24a' : '#ffa42a'; size = rnd(0.5, 1.0) * sc; life = rnd(0.7, 1.2); }
      else { const r = Math.random(); col = r < 0.25 ? '#fff4b0' : r < 0.7 ? '#ff9a2a' : '#ff4a12'; size = rnd(0.55, 1.15) * sc; life = rnd(0.65, 1.05); }
      sparks.emit(pos, v, { life, size, color: col, alpha: kind === 'frost' ? 0.8 : kind === 'gold' ? 0.5 : 0.3 });
      if (i % 7 === 0) smoke.emit(pos, v.clone().multiplyScalar(0.45), kind === 'frost'
        ? { life: 2.6, size: 1.8 * sc, color: '#cfeaff', alpha: 0.28 }
        : kind === 'gold' ? { life: 1.8, size: 0.9 * sc, color: '#8a6a30', alpha: 0.18 }
          : { life: 3.2, size: 1.4 * sc, color: '#2a2623', alpha: 0.22 });
    }
  }
  stormBreath(dt, f, P, F, cam) {
    // crépitement dans la gueule + arcs qui partent vers l'avant, puis éclair vers le sol
    const sparks = this.fx.sparks, sc = this.cfg.scale;
    for (let i = 0; i < Math.ceil(dt * 90); i++) {
      const v = V3().randomDirection().multiplyScalar(rnd(4, 14) * sc / 3).addScaledVector(F, 6 * sc);
      sparks.emit(P, v, { life: rnd(0.25, 0.6), size: rnd(0.25, 0.6) * sc, color: Math.random() < 0.5 ? '#ffffff' : '#9a7bff' });
    }
    f.acc += dt;
    if (f.acc > 0.55 && f.bolts < 3 && this.fx.lightning) {
      f.acc = 0; f.bolts++;
      const dir = F.clone(); dir.y = Math.min(dir.y, -0.15); dir.normalize();
      const L = rnd(160, 260);
      const end = P.clone().addScaledVector(dir, L);
      end.y = Math.max(this.ground(end.x, end.z), end.y - 0) + 2; if (end.y < P.y - 20) end.y = Math.max(end.y, this.ground(end.x, end.z) + 1);
      end.y = this.ground(end.x, end.z) + 1;
      this.fx.lightning.strike(P, end, cam, { branch: true, ground: true });
    }
  }

  buildClouds() {
    const g = new THREE.Group(), col = new THREE.Color();
    const merged = [];
    for (let i = 0; i < 18; i++) {
      const gg = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(); const R = rnd(22, 44);
      const pp = gg.attributes.position, jit = new Map();
      for (let k = 0; k < pp.count; k++) { const key = pp.getX(k).toFixed(2) + pp.getY(k).toFixed(2) + pp.getZ(k).toFixed(2); if (!jit.has(key)) jit.set(key, rnd(0.78, 1.18)); pp.setXYZ(k, pp.getX(k) * jit.get(key), pp.getY(k) * jit.get(key), pp.getZ(k) * jit.get(key)); }
      const ang = rnd(0, 6.28), rr = Math.sqrt(Math.random()) * 105;
      const m = new THREE.Matrix4().compose(V3(Math.cos(ang) * rr, rnd(-6, 10) + (rr < 50 ? 12 : 0), Math.sin(ang) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0, 3), rnd(0, 3), 0)), V3(R * rnd(1.0, 1.4), R * rnd(0.55, 0.8), R * rnd(0.95, 1.3)));
      gg.applyMatrix4(m);
      const colors = new Float32Array(pp.count * 3), cy = m.elements[13];
      for (let k = 0; k < pp.count; k++) { const hh = clamp((pp.getY(k) - cy) / (R * 0.8) * 0.5 + 0.5, 0, 1); col.set('#1b1730').lerp(C('#524a74'), hh * hh); colors.set([col.r, col.g, col.b], k * 3); }
      gg.setAttribute('color', new THREE.BufferAttribute(colors, 3)); gg.deleteAttribute('uv'); gg.deleteAttribute('normal');
      merged.push(gg);
    }
    const geo = mergeGeometries(merged, false); geo.computeVertexNormals();
    this.cloudMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: C('#4a34a0'), emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(geo, this.cloudMat); mesh.frustumCulled = false; g.add(mesh); mark(g);
    this.scene.add(g); this.cloud = g; g.position.copy(this.pos).add(V3(0, 90, 0));
  }
  updateClouds(dt) {
    const g = this.cloud; if (!g) return;
    const want = _v3.copy(this.pos).addScaledVector(V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), -40); want.y = this.pos.y + 95;
    g.position.x += (want.x - g.position.x) * Math.min(1, dt * 0.35); g.position.z += (want.z - g.position.z) * Math.min(1, dt * 0.35);
    g.position.y += (want.y - g.position.y) * Math.min(1, dt * 0.5);
    g.visible = this.dist < 1500;
    this.cloudMat.emissiveIntensity = (this.fx.lightning?.flash || 0) * 0.7;
  }
  stormStep(dt, cam) {
    const L = this.fx.lightning; if (!L) return;
    this.stormT -= dt;
    if (this.stormT > 0 || this.dist > 1250 || !this.cloud) return;
    this.stormT = rnd(3.5, 8.5);
    const cg = this.cloud.position, kind = Math.random();
    this.root.updateMatrixWorld(true);
    if (kind < 0.62) { // nuage -> sol
      const a = V3(cg.x + rnd(-110, 110), cg.y - 8, cg.z + rnd(-110, 110));
      const tx = a.x + rnd(-50, 50), tz = a.z + rnd(-50, 50);
      L.strike(a, V3(tx, this.ground(tx, tz) + 1, tz), cam);
      if (Math.random() < 0.5) setTimeout(() => { const a2 = a.clone().add(V3(rnd(-40, 40), 0, rnd(-40, 40))); L.strike(a2, V3(a2.x + rnd(-30, 30), this.ground(a2.x, a2.z) + 1, a2.z), cam); }, 160);
    } else if (kind < 0.85) { // dragon -> nuage
      this.mouthTip.getWorldPosition(_v1);
      const a = _v1.clone(), e = V3(cg.x + rnd(-80, 80), cg.y - 2, cg.z + rnd(-80, 80));
      L.strike(a, e, cam, { ground: false });
    } else { // éclair de ciel : nuage -> horizon
      const a = V3(cg.x + rnd(-100, 100), cg.y, cg.z + rnd(-100, 100)), ang = rnd(0, 6.28), e = a.clone().add(V3(Math.cos(ang) * 260, rnd(-60, -20), Math.sin(ang) * 260));
      L.strike(a, e, cam, { ground: false });
    }
    // crépitement sur les ailes
    for (const tip of [this.tipL, this.tipR]) { tip.getWorldPosition(_v2); for (let i = 0; i < 14; i++) this.fx.sparks.emit(_v2, V3().randomDirection().multiplyScalar(rnd(3, 12)), { life: rnd(0.3, 0.7), size: rnd(0.4, 0.9) * 1.5, color: Math.random() < 0.5 ? '#ffffff' : '#9a7bff' }); }
  }

  trail(dt) {
    // traînée de paillettes : frost / gold / copper (braises)
    const c = this.cfg; this.trailT -= dt; if (this.trailT > 0 || this.dist > 700) return;
    this.trailT = c.curious ? 0.05 : 0.09;
    this.root.updateMatrixWorld(true);
    const sparks = this.fx.sparks;
    for (const tip of [this.tipL, this.tipR]) {
      tip.getWorldPosition(_v2);
      if (c.breath === 'frost') sparks.emit(_v2, V3(rnd(-1, 1), rnd(-2, 0.5), rnd(-1, 1)), { life: rnd(1.4, 2.2), size: rnd(0.35, 0.7) * c.scale, color: Math.random() < 0.5 ? '#ffffff' : '#9ad8ff', alpha: 0.9 });
      else if (c.curious) sparks.emit(_v2, V3(rnd(-1.5, 1.5), rnd(-1, 2), rnd(-1.5, 1.5)), { life: rnd(0.9, 1.5), size: rnd(0.45, 0.9), color: Math.random() < 0.5 ? '#fff2a0' : '#ffc83a', alpha: 0.95 });
      else if (c.breath === 'fire' && Math.random() < 0.35) sparks.emit(_v2, V3(rnd(-1, 1), rnd(-3, -0.5), rnd(-1, 1)), { life: rnd(0.8, 1.4), size: rnd(0.3, 0.6) * c.scale, color: '#ff8a2a', alpha: 0.7 });
    }
  }

  update(dt, cam) {
    this.frame++;
    this.dist = this.root.position.distanceTo(cam);
    const d = this.dist, c = this.cfg;
    if (this.hold) {
      this.root.position.copy(this.hold.pos); this.root.rotation.set(this.hold.pitch || 0, this.hold.yaw || 0, this.hold.roll || 0);
      this.pos.copy(this.hold.pos); this.t += dt; this.dist = d;
    } else this.step(dt, cam);
    this.root.visible = d < 1550;
    if (this.cloud) this.updateClouds(dt);
    if (d > 1550) return;
    // niveaux de détail : loin = animation simplifiée (pose 1 frame sur 5, sans souffle)
    const far = d > 900;
    if (far && (this.frame % 5)) { this.poseDt = (this.poseDt || 0) + dt; return; }
    const pdt = far ? dt + (this.poseDt || 0) : dt; this.poseDt = 0;
    // regard curieux (petit dragon) : suit la caméra du regard
    if (c.curious && d < 380) {
      this.root.updateMatrixWorld(true);
      const l = this.root.worldToLocal(_v1.copy(cam));
      this.look.y += (clamp(Math.atan2(l.x, l.z), -0.9, 0.9) - this.look.y) * Math.min(1, pdt * 2.5);
      this.look.p += (clamp(-Math.atan2(l.y, Math.hypot(l.x, l.z)), -0.5, 0.5) - this.look.p) * Math.min(1, pdt * 2.5);
    } else { this.look.y *= 1 - Math.min(1, pdt * 2); this.look.p *= 1 - Math.min(1, pdt * 2); }
    this.pose(pdt, cam);
    if (far) return;
    // souffle déclenché quand on est assez proche pour le voir
    const f = this.fire;
    if (!f.on) { f.next -= dt; if (f.next < 0) { if (d < 1050 && this.dive.st === 'none') this.startBreath(); else f.next = 3; } }
    if (f.on) this.breath(dt, cam); else { this.rear += (0 - this.rear) * Math.min(1, dt * 4); this.open += (0 - this.open) * Math.min(1, dt * 6); if (this.u.meshes.mouth) this.u.meshes.mouth.visible = false; }
    if (c.storm) this.stormStep(dt, cam);
    this.trail(dt);
  }
}

// ------------------------------------------------------------------ les 4 dragons
const A = (i) => i * Math.PI / 4; // monde i : direction (cos, -sin)
const CONFIGS = [
  { // Cuivre : dragon de sable du Western (monde 4)
    name: 'cuivre', angle: A(4), dist: 560, distAmp: 200, swing: 0.2, R: 430, Ramp: 120, alt: 175, altAmp: 40, speed: 31, maxYr: 0.22, dir: 1,
    scale: 2.6, flapHz: 0.52, breath: 'fire', fireEvery: [9, 18], horns: 'back', crest: 'spikes', tail: 'spear', antler: false, crestH: 1.05,
    pal: { back: '#a8532c', back2: '#c96e38', belly: '#e9c48a', accent: '#5a2d18', horn: '#e8d2a8', claw: '#e8d8bc', mem: '#d9884a', memEdge: '#7a3a1c', eye: '#ffb02a', metal: 0.25, rough: 0.5, memGlow: 0.3 },
  },
  { // Givre : dragon de glace de Gelure (monde 5)
    name: 'givre', angle: A(5), dist: 540, distAmp: 220, swing: -0.18, R: 400, Ramp: 130, alt: 165, altAmp: 45, speed: 34, maxYr: 0.26, dir: -1,
    scale: 2.4, flapHz: 0.62, breath: 'frost', fireEvery: [8, 16], horns: 'back', crest: 'ice', tail: 'ice', antler: true, crestH: 1.0, tailThick: 0.92, neckThick: 0.92, wingLen: 1.08,
    mouthCol: '#9fe2ff',
    pal: { back: '#6aa0cc', back2: '#9cc8e8', belly: '#eef8ff', accent: '#cfeeff', horn: '#e4f6ff', claw: '#ffffff', mem: '#bfe6ff', memEdge: '#4f86b8', eye: '#4fe4ff', metal: 0.35, rough: 0.28, memOp: 0.78, memGlow: 0.35 },
  },
  { // Orage : dragon violet-noir de Néon-Bas (monde 1)
    name: 'orage', angle: A(1), dist: 600, distAmp: 240, swing: 0.15, R: 460, Ramp: 130, alt: 200, altAmp: 35, speed: 28, maxYr: 0.2, dir: 1,
    scale: 3.0, flapHz: 0.44, breath: 'storm', storm: true, fireEvery: [14, 24], horns: 'fwd', crest: 'blade', tail: 'fork', hornR: 0.19, crestH: 1.25,
    glow: '#a070ff', mouthCol: '#b79cff', eyeBoost: 2.4, eyeScale: 1.1,
    pal: { back: '#241a38', back2: '#3b2a5c', belly: '#5a4584', accent: '#7a4cff', horn: '#d9d0f0', claw: '#c8bce8', mem: '#4a2f86', memEdge: '#160e28', eye: '#e8e0ff', glow: '#a070ff', metal: 0.4, rough: 0.35, memOp: 0.92, memGlow: 0.45 },
  },
  { // Doré : petit dragon curieux autour du Moyeu
    name: 'dore', angle: A(2), dist: 150, distAmp: 130, swing: 3.2, R: 190, Ramp: 70, alt: 105, altAmp: 22, speed: 24, maxYr: 0.55, dir: 1, curious: true,
    scale: 1.15, flapHz: 1.5, breath: 'gold', fireEvery: [6, 12], horns: 'short', crest: 'spikes', tail: 'spear', headScale: 1.35, eyeScale: 1.5, ears: true, hornR: 0.12, crestH: 0.8, bankK: 1.2,
    pal: { back: '#e0a928', back2: '#f2c84a', belly: '#fff0c0', accent: '#c96a1c', horn: '#fff3d0', claw: '#fff3d0', mem: '#ffcf5a', memEdge: '#e08a1c', eye: '#58ff9a', metal: 0.3, rough: 0.35, memOp: 0.85, memGlow: 0.4 },
  },
];

export function buildDragons(scene, terrain, { sparks, smoke }) {
  let hemi = null; scene.traverse(o => { if (o.isHemisphereLight && !hemi) hemi = o; });
  const fx = { sparks, smoke, lightning: null };
  fx.lightning = new Lightning(scene, hemi, fx);
  const list = CONFIGS.map(cfg => new Dragon(cfg, scene, terrain, fx));
  const api = {
    list, fx,
    update(dt, time, camPos) {
      for (const d of list) d.update(dt, camPos);
      fx.lightning.update(dt);
    },
  };
  if (typeof window !== 'undefined') window.__dragons = api;
  return api;
}
