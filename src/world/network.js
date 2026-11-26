import * as THREE from 'three';
import { SECTOR } from './biomes.js';
import { mulberry } from '../util/noise.js';

// L'Octave : graphe de voies. Noeuds + arêtes échantillonnées (pas de 2 m).
export const STEP = 2;

const dirVec = i => new THREE.Vector2(Math.cos(i * SECTOR), -Math.sin(i * SECTOR));
const at = (i, r, side = 0) => {
  const d = dirVec(i), n = new THREE.Vector2(-d.y, d.x);
  return new THREE.Vector2(d.x * r + n.x * side, d.y * r + n.y * side);
};

export class Network {
  constructor(seed = 7) {
    this.nodes = new Map();
    this.edges = [];
    this.rnd = mulberry(seed);
    this.build();
  }

  node(id, p, meta = {}) { const n = { id, p, edges: [], ...meta }; this.nodes.set(id, n); return n; }

  // Courbe lissée entre a et b passant par des points intermédiaires ondulés.
  edge(a, b, opts = {}) {
    const A = this.nodes.get(a), B = this.nodes.get(b);
    const ctrl = [A.p.clone()];
    const len = A.p.distanceTo(B.p);
    const segs = Math.max(2, Math.round(len / (opts.ctrlStep || 140)));
    const dir = B.p.clone().sub(A.p).normalize(), nrm = new THREE.Vector2(-dir.y, dir.x);
    for (let k = 1; k < segs; k++) {
      const t = k / segs;
      let q;
      if (opts.arc) { // arc autour du centre
        const r = A.p.length() * (1 - t) + B.p.length() * t;
        let a0 = Math.atan2(A.p.y, A.p.x), a1 = Math.atan2(B.p.y, B.p.x);
        if (a1 - a0 > Math.PI) a1 -= Math.PI * 2; if (a0 - a1 > Math.PI) a1 += Math.PI * 2;
        const ang = a0 + (a1 - a0) * t;
        q = new THREE.Vector2(Math.cos(ang) * r, Math.sin(ang) * r);
      } else q = A.p.clone().lerp(B.p, t);
      const w = (opts.wobble ?? 30) * Math.sin(t * Math.PI);
      q.addScaledVector(nrm, (this.rnd() * 2 - 1) * w);
      ctrl.push(q);
    }
    ctrl.push(B.p.clone());
    const curve = new THREE.CatmullRomCurve3(ctrl.map(v => new THREE.Vector3(v.x, 0, v.y)), false, 'centripetal');
    const L = curve.getLength();
    const n = Math.max(2, Math.ceil(L / STEP));
    const pts = curve.getSpacedPoints(n);
    const e = { id: this.edges.length, a, b, pts, len: L, step: L / n, kind: opts.kind || 'main', biome: opts.biome ?? -1 };
    this.edges.push(e);
    A.edges.push(e.id); B.edges.push(e.id);
    return e;
  }

  build() {
    const OPEN = [4, 5];
    for (let i = 0; i < 8; i++) this.node(`H${i}`, at(i, 52), { kind: 'hub', world: i });
    for (let i = 0; i < 8; i++) this.edge(`H${i}`, `H${(i + 1) % 8}`, { arc: true, wobble: 0, ctrlStep: 20, kind: 'ring' });
    for (let i = 0; i < 8; i++) {
      if (!OPEN.includes(i)) {
        this.node(`B${i}`, at(i, 230), { kind: 'barrier', world: i });
        this.edge(`H${i}`, `B${i}`, { wobble: 6, biome: i });
        continue;
      }
      this.node(`J${i}`, at(i, 520), { kind: 'junction', world: i });
      this.node(`K${i}`, at(i, i === 4 ? 900 : 980), { kind: 'junction', world: i });
      this.node(`T${i}`, at(i, 1320), { kind: 'terminus', world: i });
      this.edge(`H${i}`, `J${i}`, { wobble: 26, biome: i });
      this.edge(`J${i}`, `K${i}`, { wobble: 40, biome: i });
      this.edge(`K${i}`, `T${i}`, { wobble: 30, biome: i });
    }
    // Croisements labyrinthe Western <-> Gelure
    this.edge('J4', 'J5', { arc: true, wobble: 35, kind: 'link' });
    this.edge('K4', 'K5', { arc: true, wobble: 60, kind: 'link' });
  }

  // Applique une hauteur à chaque échantillon (lissée) via la fonction fournie.
  applyHeights(heightFn) {
    for (const e of this.edges) {
      const raw = e.pts.map(p => heightFn(p.x, p.z));
      const W = 18;
      for (let k = 0; k < e.pts.length; k++) {
        let s = 0, c = 0;
        for (let j = -W; j <= W; j++) { const q = raw[k + j]; if (q !== undefined) { s += q; c++; } }
        e.pts[k].y = s / c + 0.6;
      }
    }
    // raccorder les noeuds (même hauteur aux extrémités)
    for (const n of this.nodes.values()) {
      let s = 0, c = 0;
      for (const id of n.edges) { const e = this.edges[id]; const p = e.a === n.id ? e.pts[0] : e.pts[e.pts.length - 1]; s += p.y; c++; }
      n.y = s / c;
      for (const id of n.edges) {
        const e = this.edges[id], first = e.a === n.id;
        const len = e.pts.length;
        for (let k = 0; k < Math.min(25, len); k++) {
          const idx = first ? k : len - 1 - k, t = k / 25;
          e.pts[idx].y = n.y * (1 - t * t * (3 - 2 * t)) + e.pts[idx].y * (t * t * (3 - 2 * t));
        }
      }
    }
    this.buildIndex();
  }

  buildIndex() {
    this.grid = new Map();
    const C = 16;
    this.cell = C;
    for (const e of this.edges) e.pts.forEach((p, k) => {
      const key = `${Math.floor(p.x / C)},${Math.floor(p.z / C)}`;
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push([e.id, k]);
    });
  }

  // Point de voie le plus proche (rayon ~ 32 m)
  nearest(x, z, maxD = 32) {
    const C = this.cell, cx = Math.floor(x / C), cz = Math.floor(z / C), R = Math.ceil(maxD / C);
    let best = null, bd = maxD * maxD;
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const l = this.grid.get(`${cx + i},${cz + j}`); if (!l) continue;
      for (const [eid, k] of l) { const p = this.edges[eid].pts[k]; const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bd) { bd = d; best = { edge: eid, k, d: Math.sqrt(d), y: p.y, dist: k * this.edges[eid].step }; } }
    }
    return best;
  }

  // Position + tangente à distance s sur une arête
  sample(eid, s, outP, outT) {
    const e = this.edges[eid];
    const f = Math.max(0, Math.min(e.pts.length - 1.0001, s / e.step));
    const k = Math.floor(f), t = f - k;
    const a = e.pts[k], b = e.pts[k + 1];
    outP.copy(a).lerp(b, t);
    if (outT) outT.copy(b).sub(a).normalize();
    return outP;
  }

  // Options de sortie à un noeud quand on arrive depuis l'arête `from`.
  exits(nodeId, fromEdge) {
    const n = this.nodes.get(nodeId);
    const inT = this.endTangent(fromEdge, nodeId, true);
    return n.edges.filter(id => id !== fromEdge).map(id => {
      const outT = this.endTangent(id, nodeId, false);
      return { edge: id, dot: inT.x * outT.x + inT.z * outT.z };
    }).sort((a, b) => b.dot - a.dot);
  }

  // tangente dans le sens du déplacement, à l'extrémité `nodeId`
  endTangent(eid, nodeId, arriving) {
    const e = this.edges[eid], P = e.pts, L = P.length;
    const atStart = e.a === nodeId;
    let v;
    if (atStart) v = P[Math.min(3, L - 1)].clone().sub(P[0]); // sortant de a
    else v = P[L - 1].clone().sub(P[Math.max(0, L - 4)]);     // arrivant en b
    if (arriving) { if (atStart) v.negate(); }
    else { if (!atStart) v.negate(); }
    return v.normalize();
  }
}
