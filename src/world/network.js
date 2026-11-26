import * as THREE from 'three';
import { SECTOR } from './biomes.js';
import { mulberry } from '../util/noise.js';

// L'Octave : graphe de voies. Noeuds + arêtes échantillonnées à pas constant (~2 m).
//
// Règle d'or des jonctions : TOUTES les arêtes qui se rejoignent en un noeud partagent la même droite
// tangente (aux signes près). Un noeud est donc soit un aiguillage (une entrée, deux sorties tangentes),
// soit une simple continuité. Aucune bifurcation « à angle droit » : un train ne peut jamais être
// téléporté ni pivoter brutalement en franchissant un noeud.
export const STEP = 2;

const dirVec = i => new THREE.Vector2(Math.cos(i * SECTOR), -Math.sin(i * SECTOR));
const at = (i, r, side = 0) => {
  const d = dirVec(i), n = new THREE.Vector2(-d.y, d.x);
  return new THREE.Vector2(d.x * r + n.x * side, d.y * r + n.y * side);
};

export const RING_R = 52;      // rayon de la boucle du Moyeu
export const STUB_R = 54.5;    // bout de voie (butoir) du quai
export const MERGE_R = 100;    // aiguillage où le raccord de l'anneau rejoint la voie du quai
export const CONN_ARC = 22;    // distance (le long de l'anneau) entre l'aiguillage d'anneau et l'axe du quai

// Hermite cubique par morceaux : passe par les points de contrôle, tangentes imposées aux extrémités.
function hermite(ctrl, tA, tB, k0, k1) {
  const n = ctrl.length, m = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) m.push(tA.clone().multiplyScalar(ctrl[0].distanceTo(ctrl[1]) * k0));
    else if (i === n - 1) m.push(tB.clone().multiplyScalar(ctrl[n - 1].distanceTo(ctrl[n - 2]) * k1));
    else m.push(ctrl[i + 1].clone().sub(ctrl[i - 1]).multiplyScalar(0.5));
  }
  const dense = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[i], p1 = ctrl[i + 1], m0 = m[i], m1 = m[i + 1];
    const c = p0.distanceTo(p1), N = Math.max(8, Math.ceil(c / 1.5));
    for (let j = (i === 0 ? 0 : 1); j <= N; j++) {
      const t = j / N, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      dense.push(new THREE.Vector3(h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x, 0, h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y));
    }
  }
  return dense;
}
// ré-échantillonnage à pas constant (longueur d'arc)
function respace(dense) {
  const acc = [0];
  for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + dense[i].distanceTo(dense[i - 1]));
  const L = acc[acc.length - 1], n = Math.max(2, Math.ceil(L / STEP)), pts = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const d = L * k / n;
    while (j < dense.length - 2 && acc[j + 1] < d) j++;
    const f = (d - acc[j]) / ((acc[j + 1] - acc[j]) || 1);
    pts.push(dense[j].clone().lerp(dense[j + 1], Math.max(0, Math.min(1, f))));
  }
  pts[0].copy(dense[0]); pts[n].copy(dense[dense.length - 1]);
  return { pts, L, n };
}

export class Network {
  constructor(seed = 7) {
    this.nodes = new Map();
    this.edges = [];
    this.rnd = mulberry(seed);
    this.build();
  }

  node(id, p, meta = {}) { const n = { id, p, edges: [], ...meta }; this.nodes.set(id, n); return n; }

  // Arête lissée entre a et b. tA = cap en quittant a, tB = cap en arrivant en b (vecteurs 2D unitaires).
  edge(a, b, opts = {}) {
    const A = this.nodes.get(a), B = this.nodes.get(b);
    const chord = B.p.clone().sub(A.p), len = chord.length(), dir = chord.clone().normalize(), nrm = new THREE.Vector2(-dir.y, dir.x);
    const tA = (opts.tA || dir).clone().normalize(), tB = (opts.tB || dir).clone().normalize();
    const ctrl = [A.p.clone()];
    const segs = opts.straight ? 1 : Math.max(2, Math.round(len / (opts.ctrlStep || 140)));
    for (let k = 1; k < segs; k++) {
      const t = k / segs;
      const w = (opts.wobble ?? 30) * Math.sin(t * Math.PI);
      const q = A.p.clone().lerp(B.p, t).addScaledVector(nrm, (this.rnd() * 2 - 1) * w);
      ctrl.push(q);
    }
    ctrl.push(B.p.clone());
    const { pts, L, n } = respace(hermite(ctrl, tA, tB, opts.k0 ?? opts.k ?? 1.0, opts.k1 ?? opts.k ?? 1.0));
    return this.addEdge(a, b, pts, L, n, tA, tB, opts);
  }

  // arc exact de cercle (anneau) du noeud a vers le noeud b
  arc(a, b, r, p0, p1, opts = {}) {
    const L = Math.abs(p1 - p0) * r, n = Math.max(2, Math.ceil(L / STEP)), pts = [];
    for (let k = 0; k <= n; k++) { const q = p0 + (p1 - p0) * k / n; pts.push(new THREE.Vector3(Math.cos(q) * r, 0, Math.sin(q) * r)); }
    const sg = Math.sign(p1 - p0), tg = q => new THREE.Vector2(-Math.sin(q) * sg, Math.cos(q) * sg);
    return this.addEdge(a, b, pts, L, n, tg(p0), tg(p1), opts);
  }

  addEdge(a, b, pts, L, n, tA, tB, opts) {
    const A = this.nodes.get(a), B = this.nodes.get(b);
    const e = { id: this.edges.length, a, b, pts, len: L, step: L / n, kind: opts.kind || 'main', biome: opts.biome ?? -1, brA: !!opts.brA, brB: !!opts.brB,
      tA: new THREE.Vector3(tA.x, 0, tA.y).normalize(), tB: new THREE.Vector3(tB.x, 0, tB.y).normalize() };
    this.edges.push(e);
    A.edges.push(e.id); B.edges.push(e.id);
    return e;
  }

  build() {
    const OPEN = [4, 5];
    const psi = i => -i * SECTOR; // angle polaire (x = cos, z = sin) de l'axe du monde i
    const ringP = (p, r = RING_R) => new THREE.Vector2(Math.cos(p) * r, Math.sin(p) * r);
    // --- Moyeu : anneau continu A_i -> A_{i+1} (cercle exact) ; A_i est l'aiguillage d'entrée du quai i
    const dA = CONN_ARC / RING_R;
    for (let i = 0; i < 8; i++) this.node(`A${i}`, ringP(psi(i) + dA), { kind: 'switch', world: i });
    for (let i = 0; i < 8; i++) this.arc(`A${i}`, `A${(i + 1) % 8}`, RING_R, psi(i) + dA, psi(i + 1) + dA, { kind: 'ring' });
    for (let i = 0; i < 8; i++) {
      const u = dirVec(i);
      this.node(`H${i}`, at(i, STUB_R), { kind: 'hub', world: i });      // butoir du quai
      this.node(`S${i}`, at(i, MERGE_R), { kind: 'junction', world: i }); // jonction quai / anneau / voie du monde
      // quai : voie droite radiale, du butoir à l'aiguillage
      this.edge(`H${i}`, `S${i}`, { tA: u, tB: u, straight: true, kind: 'main', biome: i });
      // raccord anneau -> voie du monde : tangent à l'anneau en A_i, tangent à l'axe du quai en S_i
      const ringT = this.edges.find(e => e.a === `A${i}` && e.kind === 'ring');
      this.edge(`A${i}`, `S${i}`, { tA: new THREE.Vector2(ringT.tA.x, ringT.tA.z), tB: u, straight: true, kind: 'ring', k: 1.15, brA: true, brB: true });
      if (!OPEN.includes(i)) {
        this.node(`B${i}`, at(i, 230), { kind: 'barrier', world: i });
        this.edge(`S${i}`, `B${i}`, { tA: u, tB: u, wobble: 6, biome: i });
      }
    }
    // --- voies des deux mondes ouverts : S -> J -> K -> T ; J et K sont des aiguillages (raccords labyrinthe)
    const R = { 4: { J: 520, K: 1200 }, 5: { J: 850, K: 980 } };
    for (const i of OPEN) {
      this.node(`J${i}`, at(i, R[i].J), { kind: 'junction', world: i });
      this.node(`K${i}`, at(i, R[i].K), { kind: 'junction', world: i });
      this.node(`T${i}`, at(i, 1320), { kind: 'terminus', world: i });
    }
    for (const i of OPEN) {
      const u = dirVec(i);
      this.edge(`S${i}`, `J${i}`, { tA: u, tB: u, wobble: 26, biome: i });
      this.edge(`J${i}`, `K${i}`, { tA: u, tB: u, wobble: 40, biome: i });
      this.edge(`K${i}`, `T${i}`, { tA: u, tB: u, wobble: i === 4 ? 14 : 30, biome: i });
    }
    // Croisements labyrinthe Western <-> Gelure : deux liaisons à aiguillages tangents (sens sortant)
    this.edge('J4', 'J5', { tA: dirVec(4), tB: dirVec(5), straight: true, kind: 'link', k0: 1.4, k1: 1.0, brA: true, brB: true });
    this.edge('K5', 'K4', { tA: dirVec(5), tB: dirVec(4), straight: true, kind: 'link', k0: 1.4, k1: 0.8, brA: true, brB: true });
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
    // raccorder les noeuds (même hauteur aux extrémités, pente nulle au noeud)
    for (const n of this.nodes.values()) {
      let s = 0, c = 0;
      for (const id of n.edges) { const e = this.edges[id]; const p = e.a === n.id ? e.pts[0] : e.pts[e.pts.length - 1]; s += p.y; c++; }
      n.y = s / c;
      for (const id of n.edges) {
        const e = this.edges[id], first = e.a === n.id;
        const len = e.pts.length, span = Math.min(25, len);
        for (let k = 0; k < span; k++) {
          const idx = first ? k : len - 1 - k, t = k / span;
          const w = t * t * (3 - 2 * t);
          e.pts[idx].y = n.y * (1 - w) + e.pts[idx].y * w;
        }
      }
    }
    this.computeTangents();
    this.buildIndex();
  }

  // tangentes unitaires 3D à chaque échantillon : différences centrées, caps imposés aux extrémités (continuité aux noeuds)
  computeTangents() {
    for (const e of this.edges) {
      const P = e.pts, n = P.length; e.tan = [];
      for (let k = 0; k < n; k++) {
        const t = new THREE.Vector3();
        if (k === 0) t.set(e.tA.x, 0, e.tA.z);
        else if (k === n - 1) t.set(e.tB.x, 0, e.tB.z);
        else t.subVectors(P[k + 1], P[k - 1]).normalize();
        e.tan.push(t);
      }
    }
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

  // Position + tangente (continue, interpolée) à distance s sur une arête
  sample(eid, s, outP, outT) {
    const e = this.edges[eid];
    const f = Math.max(0, Math.min(e.pts.length - 1.0001, s / e.step));
    const k = Math.floor(f), t = f - k;
    const a = e.pts[k], b = e.pts[k + 1];
    outP.copy(a).lerp(b, t);
    if (outT) {
      if (e.tan) outT.copy(e.tan[k]).lerp(e.tan[k + 1], t).normalize();
      else outT.copy(b).sub(a).normalize();
    }
    return outP;
  }

  // Cap de déplacement en arrivant au noeud par l'arête e
  arriveT(e, nodeId) { return e.b === nodeId ? e.tB : e.tA.clone().negate(); }
  // Cap de déplacement en quittant le noeud par l'arête e
  leaveT(e, nodeId) { return e.a === nodeId ? e.tA : e.tB.clone().negate(); }

  // Sorties possibles à un noeud quand on arrive depuis l'arête `fromEdge`.
  // dot = continuité de cap (1 = tangent) ; lat = décalage latéral à ~24 m (>0 à droite du sens de marche).
  exits(nodeId, fromEdge) {
    const n = this.nodes.get(nodeId), fe = this.edges[fromEdge];
    const inT = this.arriveT(fe, nodeId), rx = -inT.z, rz = inT.x;
    const np = n.p;
    return n.edges.filter(id => id !== fromEdge).map(id => {
      const e = this.edges[id], outT = this.leaveT(e, nodeId);
      const k = Math.min(12, e.pts.length - 1), q = e.a === nodeId ? e.pts[k] : e.pts[e.pts.length - 1 - k];
      const lat = (q.x - np.x) * rx + (q.z - np.y) * rz;
      return { edge: id, dot: inT.x * outT.x + inT.z * outT.z, lat, branch: e.a === nodeId ? e.brA : e.brB };
    }).sort((a, b) => (b.dot - a.dot) || (Math.abs(a.lat) - Math.abs(b.lat)));
  }
}
