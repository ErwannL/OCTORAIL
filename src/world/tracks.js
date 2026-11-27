import * as THREE from 'three';
import { COLLIDERS } from './colliders.js';
import { Kit, G, mat, MAT, glow } from './kit.js';
import { mulberry } from '../util/noise.js';

const GAUGE = 0.75, PI = Math.PI, H = PI / 2;

// Extrusion d'un profil (polyligne [latéral, hauteur]) le long de pts (tangentes tan imposées). Renvoie {pos, idx} fusionnables.
const _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3();
function extrude(pts, tan, a0, a1, offset, profile, yOff = 0) {
  const pos = [], idx = [], P = profile.length;
  for (let k = a0; k <= a1; k++) {
    const t = tan[k]; _n.set(t.z, 0, -t.x).normalize(); // normale horizontale (up x t) ; même repère aux deux bouts d'un noeud
    const c = pts[k];
    for (const [l, h] of profile) pos.push(c.x + _n.x * (offset + l), c.y + yOff + h, c.z + _n.z * (offset + l));
    if (k > a0) { const o = (k - 1 - a0) * P, q = (k - a0) * P; for (let j = 0; j < P - 1; j++) idx.push(o + j, q + j, o + j + 1, o + j + 1, q + j, q + j + 1); }
  }
  return { pos, idx };
}
function mergeExt(arr) {
  const pos = [], idx = []; let off = 0;
  for (const g of arr) { for (const v of g.pos) pos.push(v); for (const i of g.idx) idx.push(i + off); off += g.pos.length / 3; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}
// profil de rail Vignole : patin, âme, champignon
const RAIL = [[-0.1, 0], [-0.1, 0.035], [-0.03, 0.07], [-0.03, 0.12], [-0.06, 0.17], [0.06, 0.17], [0.03, 0.12], [0.03, 0.07], [0.1, 0.035], [0.1, 0]];
// ballast : talus trapézoïdal
const BALLAST = [[-3.4, -2.2], [-2.7, -0.42], [-1.75, 0.0], [1.75, 0.0], [2.7, -0.42], [3.4, -2.2]];

// ---------------------------------------------------------------- aiguillages
// Liste des aiguillages « en talon » : pour chaque noeud et chaque arête d'arrivée offrant plusieurs sorties tangentes,
// la voie directe et les voies déviées.
export function findTurnouts(net) {
  const list = [];
  for (const n of net.nodes.values()) for (const fid of n.edges) {
    const ex = net.exits(n.id, fid).filter(x => x.dot > 0.5);
    if (ex.length < 2) continue;
    const nb = ex.filter(x => !x.branch), pool = nb.length ? nb : ex;
    const through = pool.reduce((a, b) => Math.abs(b.lat) < Math.abs(a.lat) ? b : a);
    list.push({ node: n, from: fid, through, branches: ex.filter(x => x !== through) });
  }
  return list;
}
// point (et cap en s'éloignant du noeud) à s mètres du noeud sur l'arête e
const _tp = new THREE.Vector3();
function fromNode(net, e, node, s, outP, outT) {
  net.sample(e.id, e.a === node ? s : e.len - s, outP, outT);
  if (e.a !== node) outT.negate();
  return outP;
}
const rightOf = (t, out = new THREE.Vector3()) => out.set(-t.z, 0, t.x);

// pièces métalliques de l'aiguillage : lames, tringles, cœur de croisement, contre-rails
function turnoutDetail(net, tn, kit, polished, darkM) {
  const node = tn.node.id, et = net.edges[tn.through.edge];
  const pt = new THREE.Vector3(), tt = new THREE.Vector3(), pb = new THREE.Vector3(), tb = new THREE.Vector3(), Rt = new THREE.Vector3(), Rb = new THREE.Vector3();
  const bar = (A, B, w, h, mater, lift = 0) => { // barre posée sur les rails entre A et B (horizontalement)
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 0.01;
    kit.add(G.box(w, h, L), mater, { p: [(A.x + B.x) / 2, (A.y + B.y) / 2 + 0.12 + h / 2 + lift, (A.z + B.z) / 2], r: [0, Math.atan2(dx, dz), 0] });
  };
  for (const br of tn.branches) {
    const eb = net.edges[br.edge];
    // abscisse du cœur : là où le rail intérieur de la voie déviée coupe le rail de la voie directe (écart axe à axe = 2 x demi-voie)
    let sf = -1, sd = 0;
    for (let s = 0.5; s < 70; s += 0.25) {
      fromNode(net, et, node, s, pt, tt); fromNode(net, eb, node, s, pb, tb);
      rightOf(tt, Rt); const lat = (pb.x - pt.x) * Rt.x + (pb.z - pt.z) * Rt.z;
      if (Math.abs(lat) >= 2 * GAUGE) { sf = s; sd = Math.sign(lat); break; }
    }
    if (sf < 0) continue;
    // lames d'aiguille (polies) + tringles de manoeuvre
    const L0 = 0.4, L1 = 5.0, at = (e, s, P, T) => fromNode(net, e, node, s, P, T);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), tmp = new THREE.Vector3();
    const railPos = (e, s, side, out) => { at(e, s, out, tmp); rightOf(tmp, Rt); return out.addScaledVector(Rt, side); };
    // lame de la voie directe contre le rail côté opposé à la déviation, lame de la voie déviée contre son rail extérieur
    railPos(et, L0, -sd * (GAUGE - 0.08), a); railPos(et, L1, -sd * (GAUGE - 0.08), b); bar(a, b, 0.05, 0.15, polished, 0.012);
    railPos(eb, L0, sd * (GAUGE - 0.08), c); railPos(eb, L1, sd * (GAUGE - 0.08), d); bar(c, d, 0.05, 0.15, polished, 0.012);
    for (const s of [1.2, 3.4]) { railPos(et, s, -sd * (GAUGE - 0.08), a); railPos(eb, s, sd * (GAUGE - 0.08), b); bar(a, b, 0.06, 0.05, darkM, 0); }
    // cœur de croisement (V d'acier) + deux contre-rails
    at(et, sf, pt, tt); at(eb, sf, pb, tb);
    rightOf(tt, Rt); const hx = tt.x + tb.x, hz = tt.z + tb.z, ang = Math.atan2(hx, hz);
    const fx = pt.x + Rt.x * sd * GAUGE, fz = pt.z + Rt.z * sd * GAUGE;
    kit.add(G.box(0.22, 0.17, 1.7), darkM, { p: [fx, pt.y + 0.12 + 0.085, fz], r: [0, ang, 0] });
    for (const sg of [-1, 1]) kit.add(G.box(0.07, 0.15, 1.1), polished, { p: [fx - Math.sin(ang) * 0.9 * sg + Rt.x * sd * 0.0, pt.y + 0.12 + 0.075, fz - Math.cos(ang) * 0.9 * sg], r: [0, ang + sg * sd * 0.1, 0] });
    railPos(et, sf, -sd * (GAUGE - 0.17), a); kit.add(G.box(0.07, 0.14, 3.0), polished, { p: [a.x, a.y + 0.12 + 0.07, a.z], r: [0, Math.atan2(tt.x, tt.z), 0] });
    rightOf(tb, Rb); b.copy(pb).addScaledVector(Rb, sd * (GAUGE - 0.17)); kit.add(G.box(0.07, 0.14, 3.0), polished, { p: [b.x, b.y + 0.12 + 0.07, b.z], r: [0, Math.atan2(tb.x, tb.z), 0] });
  }
}

// Extrémité d'arête en impasse : [point, cap sortant (au-delà de la fin), tangente]
export function deadEnds(net) {
  const out = [];
  for (const n of net.nodes.values()) {
    if (n.edges.length !== 1) continue;
    const e = net.edges[n.edges[0]], atB = e.b === n.id, P = e.pts, end = atB ? P[P.length - 1] : P[0], prev = atB ? P[P.length - 4] : P[3];
    const dir = new THREE.Vector3(end.x - prev.x, 0, end.z - prev.z).normalize();
    out.push({ node: n, edge: e, end, dir, ang: Math.atan2(dir.x, dir.z) });
  }
  return out;
}
// Bouchon de talus : le profil BALLAST se prolonge sur 4 m en s'abaissant sous le sol (plus de face ouverte en bout de voie)
function ballastCaps(net) {
  const pos = [], idx = [];
  for (const d of deadEnds(net)) {
    if (d.node.kind === 'hub') continue; // quai du Moyeu : couvert par la plate-forme et l'anneau
    const { end, dir } = d, nx = dir.z, nz = -dir.x, RINGS = 6, base = pos.length / 3, P = BALLAST.length;
    for (let r = 0; r <= RINGS; r++) {
      const t = r / RINGS, fwd = t * 4.2, drop = t * t * 2.6, shrink = 1 - t * 0.18;
      for (const [l, h] of BALLAST) pos.push(end.x + dir.x * fwd + nx * l * shrink, end.y + Math.min(h, -drop), end.z + dir.z * fwd + nz * l * shrink);
      if (r > 0) { const o = base + (r - 1) * P, q = base + r * P; for (let j = 0; j < P - 1; j++) idx.push(o + j, q + j, o + j + 1, o + j + 1, q + j, q + j + 1); }
    }
    // dernier anneau : fermé par un éventail (sous terre)
    const c = base + RINGS * P; for (let j = 1; j < P - 1; j++) idx.push(c, c + j, c + j + 1);
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const ni = geo.toNonIndexed(); ni.computeVertexNormals(); return ni;
}

export function buildTracks(scene, net) {
  const group = new THREE.Group();
  const railMat = new THREE.MeshStandardMaterial({ color: '#a9a39a', metalness: 0.85, roughness: 0.32 });
  const ballastMat = new THREE.MeshStandardMaterial({ color: '#5a5048', roughness: 1, flatShading: true });
  const sleeperMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
  const rnd = mulberry(77), CH = 100;
  const sg = new THREE.BoxGeometry(2.4, 0.2, 0.26);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), col = new THREE.Color(), eul = new THREE.Euler();
  const woods = ['#4a2f1c', '#5b3b24', '#6a4a2e', '#3c281a', '#74583a', '#56402c'];
  const plates = new Kit(), plateM = mat('#5a4a3c', { metalness: 0.6, roughness: 0.6 });
  // traverses : une seule traverse par emplacement, même quand deux voies se superposent (aiguillage)
  const occ = new Map(), cellOf = v => Math.floor(v / 1.2);
  const taken = (x, z, eid) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = occ.get(`${cellOf(x) + i},${cellOf(z) + j}`); if (l) for (const o of l) if (o[2] !== eid && Math.hypot(o[0] - x, o[1] - z) < 0.62) return true; } return false; };
  const claim = (x, z, eid) => { const k = `${cellOf(x)},${cellOf(z)}`; if (!occ.has(k)) occ.set(k, []); occ.get(k).push([x, z, eid]); };
  const prio = e => e.kind === 'main' ? 0 : e.kind === 'ring' ? 1 : 2;
  const order = [...net.edges].sort((a, b) => prio(a) - prio(b) || a.id - b.id);
  for (const e of order) {
    const n = e.pts.length, lift = prio(e) * 0.006;
    for (let a0 = 0; a0 < n - 1; a0 += CH) {
      const a1 = Math.min(n - 1, a0 + CH);
      const rails = mergeExt([extrude(e.pts, e.tan, a0, a1, -GAUGE, RAIL, 0.12), extrude(e.pts, e.tan, a0, a1, GAUGE, RAIL, 0.12)]);
      const rm = new THREE.Mesh(rails, railMat); rm.castShadow = true; group.add(rm);
      const bm = new THREE.Mesh(mergeExt([extrude(e.pts, e.tan, a0, a1, 0, BALLAST, -lift * 0.5)]), ballastMat); bm.receiveShadow = true; group.add(bm);
      // traverses : 2 par échantillon, couleurs / longueurs / angles variés
      const cnt = (a1 - a0) * 2, mats = [], cols = [];
      for (let k = a0; k < a1; k++) {
        const A = e.pts[k], B = e.pts[k + 1], ang = Math.atan2(e.tan[k].x + e.tan[k + 1].x, e.tan[k].z + e.tan[k + 1].z);
        for (let h = 0; h < 2; h++) {
          pp.copy(A).lerp(B, h * 0.5); pp.y += 0.02 + lift + (rnd() - 0.5) * 0.02;
          const jy = (rnd() - 0.5) * 0.06, jz = (rnd() - 0.5) * 0.03, sx = 0.92 + rnd() * 0.12, sz = 0.9 + rnd() * 0.25, wi = Math.floor(rnd() * woods.length), br = 0.85 + rnd() * 0.3;
          if (taken(pp.x, pp.z, e.id)) continue;
          claim(pp.x, pp.z, e.id);
          q.setFromEuler(eul.set(0, ang + jy, jz)); sc.set(sx, 1, sz);
          m4.compose(pp, q, sc); mats.push(m4.clone());
          cols.push(new THREE.Color(woods[wi]).multiplyScalar(br));
        }
        // éclisses tous les ~28 m (joint de rail) : deux plaques + boulons par rail (loin des aiguillages)
        if (k % 14 === 7 && k > 12 && k < n - 14) {
          for (const sx of [-1, 1]) { const px = A.x + Math.cos(ang) * sx * GAUGE, pz = A.z - Math.sin(ang) * sx * GAUGE;
            plates.add(G.box(0.06, 0.1, 0.5), plateM, { p: [px, A.y + 0.2, pz], r: [0, ang, 0] });
            plates.add(G.box(0.2, 0.025, 0.4), plateM, { p: [px, A.y + 0.135, pz], r: [0, ang, 0] }); }
        }
      }
      void cnt;
      if (!mats.length) continue;
      const sl = new THREE.InstancedMesh(sg, sleeperMat, mats.length);
      mats.forEach((m, i) => { sl.setMatrixAt(i, m); sl.setColorAt(i, cols[i]); });
      sl.userData.noChunk = true; sl.receiveShadow = true; sl.computeBoundingSphere(); group.add(sl);
    }
  }
  group.add(plates.build({ shadow: false }));
  // fins de voie : le talus de ballast ne s'arrête pas net (face ouverte) — il plonge en pente douce dans le sol
  const capGeo = ballastCaps(net);
  if (capGeo) { const cm = new THREE.Mesh(capGeo, ballastMat); cm.receiveShadow = true; group.add(cm); }
  // pièces d'aiguillage
  const dk = new Kit(), polished = mat('#d9d4c8', { metalness: 0.9, roughness: 0.2 }), darkM = mat('#2f2c29', { metalness: 0.7, roughness: 0.45 });
  for (const tn of findTurnouts(net)) turnoutDetail(net, tn, dk, polished, darkM);
  group.add(dk.build({ shadow: false }));
  // la voie elle-même ne doit jamais être « écartée de la voie » par la passe de dégagement (main.js) : morceaux courts de rails/ballast déplacés
  group.traverse(o => { o.userData.trackPart = true; });
  scene.add(group);
  return group;
}

// Panneau texte (canvas) réutilisable
export function textSprite(lines, { w = 512, h = 256, bg = '#2b1d12', fg = '#f6e3c0', border = '#c9a25a', font = 'bold 44px Georgia' } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = border; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const L = Array.isArray(lines) ? lines : [lines];
  L.forEach((l, k) => {
    g.font = k === 0 ? font : font.replace(/\d+px/, m => Math.round(parseInt(m) * 0.6) + 'px');
    g.fillText(l, w / 2, h / 2 + (k - (L.length - 1) / 2) * (h / (L.length + 1)));
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- guidage d'aiguillage (rubans lumineux au sol)
function chevronTexture(color) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = color + '33'; g.fillRect(0, 0, 64, 128);
  g.strokeStyle = color; g.lineWidth = 11; g.lineJoin = 'miter'; g.lineCap = 'butt';
  for (const y of [34, 98]) { g.beginPath(); g.moveTo(6, y + 24); g.lineTo(32, y - 6); g.lineTo(58, y + 24); g.stroke(); }
  g.fillStyle = color; g.fillRect(0, 0, 6, 128); g.fillRect(58, 0, 6, 128);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  return tex;
}
function ribbonGeometry(e, node, len = 32, w = 1.05) {
  const n = Math.min(e.pts.length - 1, Math.floor(len / e.step)), pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const k = e.a === node ? i : e.pts.length - 1 - i, p = e.pts[k], t = e.tan[k];
    const nx = -t.z, nz = t.x, v = i * e.step / 3.2;
    pos.push(p.x - nx * w / 2, p.y + 0.17, p.z - nz * w / 2, p.x + nx * w / 2, p.y + 0.17, p.z + nz * w / 2);
    uv.push(0, v, 1, v);
    if (i > 0) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  return geo;
}

export function buildSignals(scene, net, BIOMES) {
  const g = new THREE.Group();
  const steel = mat('#2f3034', { metalness: 0.7, roughness: 0.4 }), brassM = MAT.brass(), wood = mat('#5b3b24', { roughness: 0.9 });
  const redM = mat('#b02a22', { roughness: 0.55 }), whiteM = mat('#e8e2d4', { roughness: 0.7 }), lensR = glow('#ff3a2a', 2.2), lensW = glow('#ffd88a', 1.8);
  const lamps = [];
  const sig = new Kit(), stand = new Kit(), stops = [];
  const turnouts = findTurnouts(net);
  for (const n of net.nodes.values()) {
    const p = new THREE.Vector3(n.p.x, n.y, n.p.y);
    // --- aiguillage : mât de signal, support de manoeuvre (levier + contrepoids + cible + lanterne)
    const tns = turnouts.filter(t => t.node === n);
    if (tns.length) {
      const tn = tns[0], e0 = net.edges[tn.from];
      const T = net.arriveT(e0, n.id).clone(), Rr = new THREE.Vector3(-T.z, 0, T.x);
      const br = net.edges[tn.branches[0].edge], kb = Math.min(12, br.pts.length - 1), qb = br.a === n.id ? br.pts[kb] : br.pts[br.pts.length - 1 - kb];
      const sd = Math.sign((qb.x - n.p.x) * Rr.x + (qb.z - n.p.y) * Rr.z) || 1; // côté de la voie déviée (+1 droite)
      const bt = Math.atan2(T.x, T.z);
      if (n.kind === 'junction') {
        // mât : fût effilé, échelle, lanterne à auvent, bras de sémaphore — côté opposé à la déviation
        const sx = p.x - Rr.x * sd * 4.6, sz = p.z - Rr.z * sd * 4.6, sy = p.y;
        sig.add(G.cyl(0.35, 0.45, 0.5, 8), mat('#6a6a68', { flatShading: true }), { p: [sx, sy + 0.2, sz] });
        sig.add(G.cyl(0.1, 0.16, 4, 8), steel, { p: [sx, sy + 2, sz] });
        for (let r = 0; r < 7; r++) sig.add(G.box(0.34, 0.04, 0.04), steel, { p: [sx, sy + 0.6 + r * 0.5, sz + 0.14] });
        sig.add(G.box(0.7, 0.9, 0.5), steel, { p: [sx, sy + 4.2, sz] });
        sig.add(G.cone(0.55, 0.35, 4), steel, { p: [sx, sy + 4.85, sz], r: [0, PI / 4, 0] });
        sig.add(G.box(1.5, 0.12, 0.08), redM, { p: [sx + 0.9, sy + 3.5, sz], r: [0, 0, -0.35] });
        sig.add(G.box(0.12, 0.2, 0.1), whiteM, { p: [sx + 1.55, sy + 3.3, sz], r: [0, 0, -0.35] });
        const lm = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#40ff80', emissiveIntensity: 3 });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), lm); lamp.position.set(sx, sy + 4.2, sz + 0.26); lamp.scale.z = 0.5; g.add(lamp);
        lamps.push({ node: n.id, mat: lm });
        COLLIDERS.circle(sx, sz, 0.3, 99, -99, false);
      }
      // support de manoeuvre au pied de l'aiguillage
      const sp = new THREE.Vector3(p.x - Rr.x * sd * 2.4 + T.x * 3.0, 0, p.z - Rr.z * sd * 2.4 + T.z * 3.0), by = p.y;
      stand.add(G.box(0.8, 0.12, 0.5), wood, { p: [sp.x, by + 0.1, sp.z], r: [0, bt, 0] });
      stand.add(G.cyl(0.05, 0.05, 1.1, 6), steel, { p: [sp.x, by + 0.65, sp.z] });
      stand.add(G.box(0.05, 0.05, 0.9), steel, { p: [sp.x, by + 0.3, sp.z], r: [0, bt, 0] });
      stand.add(G.cyl(0.03, 0.03, 0.9, 5), steel, { p: [sp.x + Math.sin(bt) * 0.4, by + 0.8, sp.z + Math.cos(bt) * 0.4], r: [0.8 * Math.cos(bt), 0, -0.8 * Math.sin(bt)] });
      stand.add(G.sph(0.11, 8, 6), redM, { p: [sp.x + Math.sin(bt) * 0.75, by + 1.15, sp.z + Math.cos(bt) * 0.75] });
      stand.add(G.cyl(0.28, 0.28, 0.04, 12), redM, { p: [sp.x, by + 1.0, sp.z], r: [H, 0, 0] });
      stand.add(G.box(0.2, 0.26, 0.2), steel, { p: [sp.x, by + 1.35, sp.z] });
      stand.add(G.cone(0.17, 0.14, 4), steel, { p: [sp.x, by + 1.55, sp.z], r: [0, PI / 4, 0] });
      stand.add(G.box(0.13, 0.13, 0.04), lensW, { p: [sp.x, by + 1.35, sp.z + 0.11] });
      COLLIDERS.circle(sp.x, sp.z, 0.3, 99, -99, false);
    }
    if (n.kind === 'barrier') {
      const b = BIOMES[n.world];
      const e = net.edges[n.edges[0]];
      const end = e.pts[e.pts.length - 1], prev = e.pts[e.pts.length - 6];
      const ang = Math.atan2(end.x - prev.x, end.z - prev.z);
      const stop = new THREE.Group(), k = new Kit();
      const accent = mat(b.skyBot, { emissive: b.skyBot, emissiveIntensity: 0.9 });
      // talus de terre/ballast derrière le butoir
      k.add(G.box(5.2, 0.7, 2.6), mat('#5a5048', { roughness: 1, flatShading: true }), { p: [0, 0.2, 1.0] });
      k.add(G.cone(2.4, 1.2, 5), mat('#4a423b', { flatShading: true }), { p: [-0.6, 0.7, 1.4], s: [1.4, 1, 1] });
      // deux montants + poutre rouge/blanche rayée
      for (const sx of [-1.35, 1.35]) { k.add(G.box(0.32, 1.7, 0.4), steel, { p: [sx, 0.85, 0.2] }); k.add(G.box(0.5, 0.12, 0.6), steel, { p: [sx, 0.06, 0.25] }); k.add(G.box(0.12, 1.1, 0.12), steel, { p: [sx, 0.9, 1.0], r: [-0.6, 0, 0] }); }
      for (let s = 0; s < 9; s++) k.add(G.box(0.34, 0.5, 0.44), s % 2 ? whiteM : redM, { p: [-1.36 + s * 0.34, 1.35, 0.0] });
      // tampons à ressort sur les rails
      for (const sx of [-GAUGE, GAUGE]) {
        k.add(G.cyl(0.13, 0.13, 0.5, 10), brassM, { p: [sx, 0.55, -0.35], r: [H, 0, 0] });
        k.add(G.cyl(0.3, 0.3, 0.06, 14), steel, { p: [sx, 0.55, -0.62], r: [H, 0, 0] });
        k.add(G.tor(0.17, 0.025, 5, 10), steel, { p: [sx, 0.55, -0.15], r: [0, 0, 0] });
        k.add(G.box(0.2, 0.12, 0.8), steel, { p: [sx, 0.3, 0.1] });
      }
      // lanterne rouge sur potence
      k.add(G.cyl(0.07, 0.09, 2.6, 6), steel, { p: [2.2, 1.3, 0.5] });
      k.add(G.box(0.34, 0.4, 0.34), steel, { p: [2.2, 2.75, 0.5] }); k.add(G.cone(0.28, 0.22, 4), steel, { p: [2.2, 3.06, 0.5], r: [0, PI / 4, 0] });
      k.add(G.box(0.22, 0.26, 0.04), lensR, { p: [2.2, 2.75, 0.3] });
      // panneau « voie fermée » : cadre, deux poteaux, bandeau lumineux aux couleurs du monde
      for (const sx of [-2.9, 2.9]) k.add(G.box(0.22, 4.4, 0.22), wood, { p: [sx, 2.2, 0.9] });
      k.add(G.box(6.5, 0.22, 0.3), wood, { p: [0, 1.9, 0.85] }); k.add(G.box(6.5, 0.22, 0.3), wood, { p: [0, 5.6, 0.85] });
      k.add(G.box(6.0, 0.12, 0.12), accent, { p: [0, 5.76, 0.82] });
      stop.add(k.build());
      const tex = textSprite([b.name.toUpperCase(), 'VOIE FERMÉE', 'Monde non rallumé'], { bg: '#1a1a22', fg: b.skyBot, border: b.skyTop });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      sign.position.set(0, 3.9, 0.7); sign.rotation.y = PI; stop.add(sign); // texte tourné vers le train qui arrive
      stop.position.copy(end); stop.rotation.y = ang; g.add(stop);
      COLLIDERS.box(end.x, end.z, 2.0, 0.9, ang, end.y + 1.7, -99, false);
      COLLIDERS.box(end.x + Math.sin(ang) * 0.9, end.z + Math.cos(ang) * 0.9, 3.1, 0.2, ang, end.y + 5.5, end.y + 1.8, false);
      stops.push(stop);
    }
  }
  g.add(sig.build()); g.add(stand.build({ shadow: false }));
  scene.add(g);

  // --- guidage : à l'approche d'un aiguillage, la voie choisie s'allume en vert (chevrons animés), les autres en rouge ; lampes de signal cohérentes
  const texG = chevronTexture('#3dff7a'), texR = chevronTexture('#ff4a3a');
  const matG = new THREE.MeshBasicMaterial({ map: texG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, opacity: 0.95 });
  const matR = new THREE.MeshBasicMaterial({ map: texR, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, opacity: 0.55 });
  const ribbons = new Map(), shown = new Set();
  // balise : grande flèche flottante dans le sens de la voie + colonne de lumière, visibles de loin
  const arrowGeo = new THREE.ConeGeometry(0.9, 2.4, 4); arrowGeo.rotateX(H); // pointe vers +z
  const beamGeo = new THREE.CylinderGeometry(0.28, 0.28, 14, 8, 1, true); beamGeo.translate(0, 7, 0);
  const aG = new THREE.MeshBasicMaterial({ color: '#3dff7a', toneMapped: false, transparent: true, opacity: 0.95 });
  const aR = new THREE.MeshBasicMaterial({ color: '#ff4a3a', toneMapped: false, transparent: true, opacity: 0.55 });
  const bG = new THREE.MeshBasicMaterial({ color: '#3dff7a', toneMapped: false, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ribbon = (nodeId, edgeId) => {
    const key = nodeId + ':' + edgeId;
    if (!ribbons.has(key)) {
      const e = net.edges[edgeId], m = new THREE.Mesh(ribbonGeometry(e, nodeId), matR); m.renderOrder = 6; m.frustumCulled = false; m.visible = false;
      // position de la balise : ~14 m après le noeud sur cette sortie
      const k = Math.min(7, e.pts.length - 1), idx = e.a === nodeId ? k : e.pts.length - 1 - k, P = e.pts[idx], T = e.tan[idx];
      const arrow = new THREE.Mesh(arrowGeo, aR); arrow.position.set(P.x, P.y + 3.6, P.z); arrow.rotation.y = Math.atan2(e.a === nodeId ? T.x : -T.x, e.a === nodeId ? T.z : -T.z); arrow.frustumCulled = false; m.userData.arrow = arrow; m.userData.baseY = P.y + 3.6;
      const beam = new THREE.Mesh(beamGeo, bG); beam.position.set(P.x, P.y, P.z); beam.frustumCulled = false; m.userData.beam = beam;
      m.add(arrow); m.add(beam); // (positions en repère monde : le ruban reste à l'origine)
      g.add(m); ribbons.set(key, m);
    }
    return ribbons.get(key);
  };
  const lampOff = '#2a8a50';
  let lastT = 0;
  const update = (train, time) => {
    const dt = Math.min(0.1, Math.max(0, time - lastT)); lastT = time;
    texG.offset.y -= dt * 1.1; texR.offset.y -= dt * 0.35;
    for (const m of shown) m.visible = false; shown.clear();
    let ap = null;
    if (train && train.segs && train.segs.length) { ap = train.approach(); if (!ap.node || ap.exits.length < 2) ap = null; }
    const near = ap && ap.dist < 80;
    if (near) for (const ex of ap.exits) {
      const m = ribbon(ap.node, ex.edge), chosen = ex === ap.chosen;
      m.material = chosen ? matG : matR; m.position.y = chosen ? 0.02 : 0; m.visible = true; shown.add(m);
      const ar = m.userData.arrow, bm = m.userData.beam;
      ar.material = chosen ? aG : aR; ar.position.y = m.userData.baseY + Math.sin(time * 3.2) * 0.25; ar.scale.setScalar(chosen ? 1.15 + Math.sin(time * 6) * 0.08 : 0.8);
      bm.visible = chosen;
    }
    for (const l of lamps) {
      if (ap && ap.dist < 160 && l.node === ap.node) l.mat.emissive.set(ap.chosen.branch ? '#ffb347' : '#40ff80');
      else l.mat.emissive.set(lampOff);
    }
  };
  return { group: g, lamps, update };
}

// ---------------------------------------------------------------- ouvrages d'art
// Partout où la voie passe au-dessus du terrain plus bas que son talus de ballast (2,2 m), on bâtit un viaduc :
// piles de pierre jusqu'au sol (fondation enterrée) + chaperon ; aux terminus, un talus en pente douce et un butoir.
export function buildTrestles(scene, net, terrain) {
  const k = new Kit(), stone = mat('#7d7366', { roughness: 0.95, flatShading: true }), cap = mat('#5f574d', { roughness: 0.9, flatShading: true }),
    earth = mat('#5a5048', { roughness: 1, flatShading: true }), steel = mat('#3a3633', { metalness: 0.6, roughness: 0.5 }), red = mat('#b2332a', { roughness: 0.6 });
  let piers = 0;
  const lowest = (x, z, ang) => { let m = 1e9; for (const s of [-3, 0, 3]) for (const f of [-1.2, 1.2]) m = Math.min(m, terrain.heightAt(x + Math.cos(ang) * s + Math.sin(ang) * f, z - Math.sin(ang) * s + Math.cos(ang) * f)); return m; };
  for (const e of net.edges) {
    const n = e.pts.length, every = Math.max(1, Math.round(9 / e.step));
    for (let i = 2; i < n - 2; i += every) {
      const p = e.pts[i], t = e.tan[i], ang = Math.atan2(t.x, t.z), g = lowest(p.x, p.z, ang), bot = p.y - 2.1, gap = bot - g;
      if (gap < 0.25) continue;
      const h = gap + 1.5, yc = g - 1.5 + h / 2;
      k.add(G.box(6.4, h, 1.9), stone, { p: [p.x, yc, p.z], r: [0, ang, 0] });
      k.add(G.box(6.9, 0.35, 2.3), cap, { p: [p.x, bot + 0.05, p.z], r: [0, ang, 0] });
      if (gap > 3) k.add(G.box(7.2, 0.5, 2.6), cap, { p: [p.x, g + 0.2, p.z], r: [0, ang, 0] }); // empattement
      piers++;
    }
  }
  // fins de voie (terminus, épis) : heurtoir complet adossé à un talus de terre
  const bumpers = new THREE.Group(); bumpers.userData.trackPart = true; // ne pas écarter de la voie (passe « voies dégagées »)
  for (const d of deadEnds(net)) if (d.node.kind !== 'hub') bumpers.add(buildBumper(d, terrain));
  scene.add(bumpers);
  const m = k.build(); m.userData.solidFill = false; scene.add(m);
  console.log('Viaducs : piles', piers);
  return m;
}

// ---------------------------------------------------------------- heurtoir (butoir de fin de voie)
// Repère local : +z = au-delà de la fin de voie, x = latéral, y = 0 au niveau de la voie (axe). Les tampons sont dans l'axe des rails.
const BMAT = {};
function bumperMats() {
  if (BMAT.steel) return BMAT;
  Object.assign(BMAT, {
    steel: mat('#34363a', { metalness: 0.7, roughness: 0.42 }), rust: mat('#5b3a28', { metalness: 0.4, roughness: 0.75 }),
    red: mat('#b8291f', { roughness: 0.55 }), white: mat('#ece6d8', { roughness: 0.6 }), brass: MAT.brass(),
    earth: mat('#5a4c40', { roughness: 1, flatShading: true }), stone: mat('#6e665c', { roughness: 0.95, flatShading: true }),
    wood: mat('#4e3422', { roughness: 0.9 }), lens: glow('#ff3020', 3), black: mat('#1b1b1d', { roughness: 0.7 }),
  });
  return BMAT;
}
// talus : tronc de pyramide déformé (base large enterrée, sommet arrondi derrière la poutre)
function moundGeo(bot = -2.4) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 14, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.5, x = p.getX(i), z = p.getZ(i), w = 1 - Math.pow(y, 1.6) * 0.7; // y: 0 (base) .. 1 (sommet)
     p.setXYZ(i, x * 3.6 * w, bot + y * (1.15 - bot), (z * 2.6 + (z > 0 ? 1.2 : 0)) * w + 2.9);
  }
  g.computeVertexNormals(); return g;
}
export function buildBumper(d, terrain) {
  const M = bumperMats(), k = new Kit(), grp = new THREE.Group(), { end, ang } = d;
  // le talus descend toujours sous le sol (même si le terrain derrière est en contrebas) : rien ne flotte
  let gmin = end.y - 2.4; if (terrain) for (const z of [0, 2, 4, 6]) for (const x of [-3, 0, 3]) gmin = Math.min(gmin, terrain.heightAt(end.x + Math.sin(ang) * z + Math.cos(ang) * x, end.z + Math.cos(ang) * z - Math.sin(ang) * x) - 0.6);
  const RY = 0.12 + 0.17; // dessus du rail (local)
  const BH = RY + 0.95;   // hauteur des tampons (axe)
  // talus de terre + ballast, pierres de calage
  k.add(moundGeo(gmin - end.y), M.earth, {});
  for (const [x, z, s] of [[-2.4, 1.6, 0.5], [2.2, 1.9, 0.6], [-1.1, 4.6, 0.7], [1.6, 4.2, 0.45], [0.2, 2.2, 0.4]]) k.add(G.sph(s, 6, 5), M.stone, { p: [x, 0.25 + s * 0.3, z], s: [1.2, 0.7, 1] });
  // deux longerons cintrés (vieux rails relevés) de chaque côté : montant vertical + jambe de force vers l'arrière
  for (const sx of [-0.75, 0.75]) {
    k.add(G.box(0.16, 1.5, 0.22), M.steel, { p: [sx, RY + 0.6, 0.25] });
    k.add(G.box(0.16, 0.2, 2.6), M.steel, { p: [sx, RY + 0.05, 1.3] });
    k.add(G.box(0.14, 0.16, 2.0), M.steel, { p: [sx, RY + 0.75, 0.95], r: [0.68, 0, 0] });
    for (const z of [0.35, 1.25, 2.3]) k.add(G.cyl(0.05, 0.05, 0.08, 6), M.brass, { p: [sx + Math.sign(sx) * 0.09, RY + 0.08, z], r: [0, 0, Math.PI / 2] });
  }
  // entretoises entre longerons
  k.add(G.box(1.5, 0.12, 0.14), M.steel, { p: [0, RY + 0.2, 1.8] });
  k.add(G.box(1.5, 0.12, 0.14), M.steel, { p: [0, RY + 0.55, 0.9], r: [0.68, 0, 0] });
  // poutre de choc rouge / blanche (chevrons) sur toute la largeur
  k.add(G.box(3.1, 0.5, 0.36), M.black, { p: [0, BH, 0.1] });
  for (let s = 0; s < 8; s++) k.add(G.box(0.36, 0.44, 0.04), s % 2 ? M.white : M.red, { p: [-1.33 + s * 0.38, BH, -0.1] });
  // tampons à ressort, dans l'axe des rails : plateau, tige, ressort, corps
  for (const sx of [-0.75, 0.75]) {
    k.add(G.cyl(0.2, 0.22, 0.42, 14), M.steel, { p: [sx, BH, -0.28], r: [Math.PI / 2, 0, 0] });
    k.add(G.cyl(0.09, 0.09, 0.3, 10), M.brass, { p: [sx, BH, -0.62], r: [Math.PI / 2, 0, 0] });
    for (let c = 0; c < 4; c++) k.add(G.tor(0.15, 0.025, 5, 12), M.rust, { p: [sx, BH, -0.5 - c * 0.07] });
    k.add(G.cyl(0.32, 0.32, 0.07, 18), M.steel, { p: [sx, BH, -0.8], r: [Math.PI / 2, 0, 0] });
    k.add(G.cyl(0.24, 0.24, 0.02, 18), M.brass, { p: [sx, BH, -0.84], r: [Math.PI / 2, 0, 0] });
  }
  // cales en bois sur les rails devant le heurtoir
  for (const sx of [-0.75, 0.75]) k.add(G.box(0.24, 0.16, 0.7), M.wood, { p: [sx, RY + 0.08, -0.25] });
  // lanterne rouge de fin de voie sur potence + plaque « FIN DE VOIE » (bandes)
  k.add(G.cyl(0.06, 0.08, 1.9, 6), M.steel, { p: [0, BH + 1.1, 0.25] });
  k.add(G.box(0.36, 0.42, 0.36), M.black, { p: [0, BH + 2.2, 0.25] });
  k.add(G.cone(0.3, 0.24, 4), M.black, { p: [0, BH + 2.53, 0.25], r: [0, Math.PI / 4, 0] });
  k.add(G.cyl(0.13, 0.13, 0.05, 14), M.lens, { p: [0, BH + 2.2, 0.05], r: [Math.PI / 2, 0, 0] });
  k.add(G.box(0.9, 0.9, 0.05), M.white, { p: [0, BH + 0.92, 0.27], r: [0, 0, Math.PI / 4] });
  k.add(G.box(0.62, 0.62, 0.06), M.red, { p: [0, BH + 0.92, 0.24], r: [0, 0, Math.PI / 4] });
  grp.add(k.build());
  grp.position.copy(end); grp.rotation.y = ang; grp.userData.trackPart = true;
  // le talus ne doit pas flotter : on l'abaisse si le sol est plus bas que la voie autour
  COLLIDERS.box(end.x + Math.sin(ang) * 0.4, end.z + Math.cos(ang) * 0.4, 1.6, 0.6, ang, end.y + 2, -99, false);
  return grp;
}
