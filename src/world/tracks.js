import * as THREE from 'three';
import { COLLIDERS } from './colliders.js';
import { Kit, G, mat, MAT, glow } from './kit.js';
import { mulberry } from '../util/noise.js';

const GAUGE = 0.75, PI = Math.PI, H = PI / 2;

// Extrusion d'un profil (polyligne [latéral, hauteur]) le long de pts. Renvoie {pos, idx} fusionnables.
const _up = new THREE.Vector3(0, 1, 0), _t = new THREE.Vector3(), _n = new THREE.Vector3();
function extrude(pts, a0, a1, offset, profile, yOff = 0) {
  const pos = [], idx = [], P = profile.length;
  for (let k = a0; k <= a1; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    _t.copy(b).sub(a).normalize(); _n.crossVectors(_up, _t).normalize();
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
const BALLAST = [[-2.7, -0.42], [-1.75, 0.0], [1.75, 0.0], [2.7, -0.42]];

export function buildTracks(scene, net) {
  const group = new THREE.Group();
  const railMat = new THREE.MeshStandardMaterial({ color: '#a9a39a', metalness: 0.85, roughness: 0.32 });
  const ballastMat = new THREE.MeshStandardMaterial({ color: '#5a5048', roughness: 1, flatShading: true });
  const sleeperMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
  const rnd = mulberry(77), CH = 100;
  const sg = new THREE.BoxGeometry(2.4, 0.2, 0.26);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), col = new THREE.Color();
  const woods = ['#4a2f1c', '#5b3b24', '#6a4a2e', '#3c281a', '#74583a', '#56402c'];
  const plates = new Kit(), plateM = mat('#5a4a3c', { metalness: 0.6, roughness: 0.6 });
  for (const e of net.edges) {
    const n = e.pts.length;
    for (let a0 = 0; a0 < n - 1; a0 += CH) {
      const a1 = Math.min(n - 1, a0 + CH);
      const rails = mergeExt([extrude(e.pts, a0, a1, -GAUGE, RAIL, 0.12), extrude(e.pts, a0, a1, GAUGE, RAIL, 0.12)]);
      const rm = new THREE.Mesh(rails, railMat); rm.castShadow = true; group.add(rm);
      const bm = new THREE.Mesh(mergeExt([extrude(e.pts, a0, a1, 0, BALLAST, 0)]), ballastMat); bm.receiveShadow = true; group.add(bm);
      // traverses : 2 par échantillon, couleurs / longueurs / angles variés
      const cnt = (a1 - a0) * 2;
      const sl = new THREE.InstancedMesh(sg, sleeperMat, cnt); let ii = 0;
      for (let k = a0; k < a1; k++) {
        const A = e.pts[k], B = e.pts[k + 1], ang = Math.atan2(B.x - A.x, B.z - A.z);
        for (let h = 0; h < 2; h++) {
          pp.copy(A).lerp(B, h * 0.5); pp.y += 0.02 + (rnd() - 0.5) * 0.02;
          q.setFromEuler(new THREE.Euler(0, ang + (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.03));
          sc.set(0.92 + rnd() * 0.12, 1, 0.9 + rnd() * 0.25);
          m4.compose(pp, q, sc); sl.setMatrixAt(ii, m4);
          col.set(woods[Math.floor(rnd() * woods.length)]).multiplyScalar(0.85 + rnd() * 0.3); sl.setColorAt(ii++, col);
        }
        // éclisses tous les ~28 m (joint de rail) : deux plaques + boulons par rail
        if (k % 14 === 7) {
          for (const sx of [-1, 1]) { const px = A.x + Math.cos(ang) * sx * GAUGE, pz = A.z - Math.sin(ang) * sx * GAUGE;
            plates.add(G.box(0.06, 0.1, 0.5), plateM, { p: [px, A.y + 0.2, pz], r: [0, ang, 0] });
            plates.add(G.box(0.2, 0.025, 0.4), plateM, { p: [px, A.y + 0.135, pz], r: [0, ang, 0] }); }
        }
      }
      sl.userData.noChunk = true; sl.receiveShadow = true; sl.computeBoundingSphere(); group.add(sl);
    }
  }
  group.add(plates.build({ shadow: false }));
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

export function buildSignals(scene, net, BIOMES) {
  const g = new THREE.Group();
  const steel = mat('#2f3034', { metalness: 0.7, roughness: 0.4 }), brassM = MAT.brass(), wood = mat('#5b3b24', { roughness: 0.9 });
  const redM = mat('#b02a22', { roughness: 0.55 }), whiteM = mat('#e8e2d4', { roughness: 0.7 }), lensR = glow('#ff3a2a', 2.2), lensW = glow('#ffd88a', 1.8);
  const lamps = [];
  const sig = new Kit(), stand = new Kit(), stops = [];
  for (const n of net.nodes.values()) {
    const p = new THREE.Vector3(n.p.x, n.y, n.p.y);
    if (n.kind === 'junction' || (n.kind === 'hub' && n.edges.length > 2)) {
      const e = net.edges[n.edges[0]];
      const first = e.a === n.id, i0 = first ? 0 : e.pts.length - 1, step = first ? 1 : -1;
      const t = new THREE.Vector3().subVectors(e.pts[i0 + step * 6], e.pts[i0]).normalize();
      const side = new THREE.Vector3(t.z, 0, -t.x); // vers la droite du sens de sortie
      const ang = Math.atan2(t.x, t.z);
      // --- mât de signal (même position qu'avant) : fût effilé, échelle, lanterne à auvent, bras de sémaphore
      const sx = p.x + 3.5, sz = p.z + 3.5, sy = p.y;
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
      // --- aiguillage : lames, tringle, support de manœuvre (levier + contrepoids + cible + lanterne)
      for (const id of n.edges) {
        const ee = net.edges[id], f = ee.a === n.id, j0 = f ? 0 : ee.pts.length - 1, st = f ? 1 : -1;
        const a = ee.pts[j0 + st * 4], b = ee.pts[j0 + st * 5], ta = Math.atan2(b.x - a.x, b.z - a.z);
        for (const sgn of [-1, 1]) stand.add(G.box(0.1, 0.1, 1.6), steel, { p: [a.x + Math.cos(ta) * sgn * GAUGE, a.y + 0.22, a.z - Math.sin(ta) * sgn * GAUGE], r: [0, ta + sgn * 0.03, 0] });
        stand.add(G.box(1.5, 0.05, 0.07), steel, { p: [a.x, a.y + 0.2, a.z], r: [0, ta, 0] });
      }
      const bi = i0 + step * 5, b0 = e.pts[bi], bt = Math.atan2(e.pts[bi + step].x - b0.x, e.pts[bi + step].z - b0.z);
      const sp = new THREE.Vector3().copy(b0).addScaledVector(side, 2.3);
      stand.add(G.box(0.8, 0.12, 0.5), wood, { p: [sp.x, b0.y + 0.1, sp.z], r: [0, bt, 0] });
      stand.add(G.cyl(0.05, 0.05, 1.1, 6), steel, { p: [sp.x, b0.y + 0.65, sp.z] });
      stand.add(G.box(0.05, 0.05, 0.9), steel, { p: [sp.x, b0.y + 0.3, sp.z], r: [0, bt, 0] });
      const lx = sp.x + Math.cos(bt) * 0.0, lz = sp.z;
      stand.add(G.cyl(0.03, 0.03, 0.9, 5), steel, { p: [lx + Math.sin(bt) * 0.4, b0.y + 0.8, lz + Math.cos(bt) * 0.4], r: [0.8 * Math.cos(bt), 0, -0.8 * Math.sin(bt)] });
      stand.add(G.sph(0.11, 8, 6), redM, { p: [sp.x + Math.sin(bt) * 0.75, b0.y + 1.15, sp.z + Math.cos(bt) * 0.75] });
      stand.add(G.cyl(0.28, 0.28, 0.04, 12), redM, { p: [sp.x, b0.y + 1.0, sp.z], r: [H, 0, 0] });
      stand.add(G.box(0.2, 0.26, 0.2), steel, { p: [sp.x, b0.y + 1.35, sp.z] });
      stand.add(G.cone(0.17, 0.14, 4), steel, { p: [sp.x, b0.y + 1.55, sp.z], r: [0, PI / 4, 0] });
      stand.add(G.box(0.13, 0.13, 0.04), lensW, { p: [sp.x - Math.sin(bt) * 0.0, b0.y + 1.35, sp.z + 0.11] });
      COLLIDERS.circle(sp.x, sp.z, 0.3, 99, -99, false);
      void ang;
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
  return { group: g, lamps };
}
