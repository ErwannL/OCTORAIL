import * as THREE from 'three';
import { buildSteamLoco, buildDraisine, buildWagonModel } from '../world/models.js';


export const LOCOS = {
  draisine: { name: 'Draisine à bras', maxSpeed: 9, accel: 2.2, needsFuel: false },
  vapeur:   { name: 'Vapeur « Vieille-Bouilloire »', maxSpeed: 26, accel: 3.2, needsFuel: true },
};
export const WAGON_TYPES = {
  charbon:  { name: 'Wagon à charbon', color: '#2a2a2a', price: 0 },
  stockage: { name: 'Wagon-stockage', color: '#7a4a24', price: 40 },
  vitrine:  { name: 'Wagon-vitrine', color: '#c9a25a', price: 80 },
  dortoir:  { name: 'Wagon-dortoir', color: '#3a5a7a', price: 60 },
  isotherme:{ name: 'Wagon-isotherme', color: '#cfe8f5', price: 70 },
  plateau:  { name: 'Wagon-plateau', color: '#6a5a44', price: 90 },
  cryo:     { name: 'Cryo-wagon', color: '#9fd8f0', price: 110 },
};
// hauteur du dessus du rail au-dessus de la ligne de voie (tracks.js : semelle à +0.12, profil RAIL haut de 0.17)
export const RAIL_TOP = 0.12 + 0.17;
const JOINT = 28; // écartement des joints de rail (m)
const _q = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _qt = new THREE.Quaternion(), _sc = new THREE.Vector3(1, 1, 1);
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _v = new THREE.Vector3();
const LINK_GEO = (() => { const g = new THREE.TorusGeometry(0.12, 0.03, 5, 10); g.rotateY(Math.PI / 2); g.scale(1, 1, 2.2); return g; })();
const LINK_MAT = new THREE.MeshStandardMaterial({ color: '#2b2d31', metalness: 0.75, roughness: 0.4 });
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const gauss = (d, w) => Math.exp(-(d * d) / (w * w));
const jointD = (x) => { const m = ((x % JOINT) + JOINT) % JOINT; return m > JOINT / 2 ? m - JOINT : m; };

export function buildLoco(kind, tint = '#8b1e1e') {
  const g = kind === 'draisine' ? buildDraisine() : buildSteamLoco(tint);
  return g;
}
export function buildWagon(type) { return buildWagonModel(type); }

// Un train qui roule sur le graphe.
//
// Le convoi occupe une ROUTE exacte : une liste de tronçons d'arêtes (de l'avant vers l'arrière). Chaque tronçon
// {e, u, a, b} couvre l'arête e entre b (côté arrière) et a (côté avant) ; u = sens de marche de l'avant le long
// de l'arête (+1 : vers b_arête, -1 : vers a_arête). En marche avant, la tête avance et choisit les aiguillages ;
// en marche arrière, c'est l'arrière du convoi qui mène (et choisit) — les wagons restent donc toujours
// exactement sur les rails, jamais de « téléportation » ni de wagon qui passe devant la loco.
// Si la voie manque derrière le convoi (départ au butoir), une extension virtuelle rectiligne (`vlen`) prend le relais.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _d = new THREE.Vector3();

export class Train {
  constructor(net, scene, { loco = 'draisine', wagons = [], tint = '#8b1e1e', startNode = 'H4', remote = false } = {}) {
    this.net = net; this.scene = scene; this.remote = remote;
    this.root = new THREE.Group(); scene.add(this.root);
    this.speed = 0; this.throttle = 0; this.brake = 0;
    this.pref = 0; // aiguillage : 0 = tout droit, -1 = à gauche, +1 = à droite (par rapport au sens de marche)
    this.mv = 1;   // sens de marche courant (+1 avant, -1 arrière)
    this.coal = 0; this.water = 0; this.pressure = 0; this.maxCoal = 40; this.maxWater = 100;
    this.segs = []; this.vlen = 0;
    this.head = new THREE.Vector3(); this.headT = new THREE.Vector3(0, 0, 1);
    this.odometer = 0;
    this.events = [];
    this.tint = tint;
    this.setLoco(loco);
    this.setWagons(wagons);
    this.placeAt(startNode);
  }

  // accès compatibles (arête / abscisse / sens de la tête)
  get edge() { return this.segs[0].e; }
  get s() { return this.segs[0].a; }
  get dir() { return this.segs[0].u; }

  setLoco(kind) {
    if (this.loco) this.root.remove(this.loco);
    this.kind = kind; this.def = LOCOS[kind];
    this.loco = buildLoco(kind, this.tint); this.root.add(this.loco);
    if (this.segs.length) this.refit();
  }
  setWagons(list) {
    for (const w of this.wagons || []) this.root.remove(w.mesh);
    this.wagons = list.map(type => ({ type, mesh: buildWagon(type) }));
    this.wagons.forEach(w => this.root.add(w.mesh));
    if (this.segs.length) this.refit();
  }

  get totalLength() { return this.loco.userData.length + this.wagons.reduce((a, w) => a + w.mesh.userData.length, 0); }

  placeAt(nodeId) {
    const n = this.net.nodes.get(nodeId);
    const eid = n.edges.find(id => this.net.edges[id].kind === 'main') ?? n.edges[0];
    const e = this.net.edges[eid], atA = e.a === nodeId;
    const off = Math.min(Math.max(6, this.totalLength + 1.5), e.len - 2);
    this.speed = 0; this.mv = 1;
    this.placeFront(eid, atA ? off : e.len - off, atA ? 1 : -1);
    this.update(0);
  }

  // pose la tête sur (arête, abscisse, sens) et reconstruit le convoi derrière (au plus droit)
  placeFront(edge, s, u) {
    this.segs = [{ e: edge, u, a: s, b: s }]; this.vlen = 0;
    this.extendRear(this.totalLength);
  }

  routeLen() { let L = this.vlen; for (const sg of this.segs) L += Math.abs(sg.a - sg.b); return L; }
  refit() {
    const d = this.totalLength - this.routeLen();
    if (d > 1e-6) this.extendRear(d); else if (d < -1e-6) this._shrinkRear(-d);
  }

  // arête d'où l'on vient quand on arrive au noeud puis qu'on repart sur `last` : la plus « droite »
  _predecessor(node, last) {
    const n = this.net.nodes.get(node); let best = null, bs = 1e9;
    for (const id of n.edges) {
      if (id === last) continue;
      const ex = this.net.exits(node, id).find(x => x.edge === last && x.dot > 0.5);
      if (!ex) continue;
      const pe = this.net.edges[id], br = (pe.a === node ? pe.brA : pe.brB) ? 100 : 0;
      const sc = br + Math.abs(ex.lat);
      if (sc < bs) { bs = sc; best = id; }
    }
    return best;
  }
  extendRear(amount) {
    const E = this.net.edges;
    for (let g = 0; amount > 1e-6 && g < 24; g++) {
      const sg = this.segs[this.segs.length - 1], e = E[sg.e];
      const t = -sg.u, end = t > 0 ? e.len : 0, room = Math.abs(end - sg.b);
      if (amount <= room) { sg.b += t * amount; return; }
      sg.b = end; amount -= room;
      const node = t > 0 ? e.b : e.a, prev = this._predecessor(node, sg.e);
      if (prev == null) { this.vlen += amount; return; }
      const pe = E[prev], toB = pe.b === node, entry = toB ? pe.len : 0;
      this.segs.push({ e: prev, u: toB ? 1 : -1, a: entry, b: entry });
    }
    if (amount > 1e-6) this.vlen += amount;
  }
  _shrinkRear(amount) { // retire de la longueur à l'arrière du convoi
    if (this.vlen > 0) { const c = Math.min(this.vlen, amount); this.vlen -= c; amount -= c; }
    while (amount > 1e-9) {
      const sg = this.segs[this.segs.length - 1], len = Math.abs(sg.a - sg.b);
      if (len <= amount + 1e-9 && this.segs.length > 1) { amount -= len; this.segs.pop(); }
      else { const c = Math.min(len, amount); sg.b += sg.u * c; break; }
    }
  }
  _shrinkFront(amount) { // retire de la longueur à l'avant du convoi
    while (amount > 1e-9) {
      const sg = this.segs[0], len = Math.abs(sg.a - sg.b);
      if (len <= amount + 1e-9 && this.segs.length > 1) { amount -= len; this.segs.shift(); }
      else { const c = Math.min(len, amount); sg.a -= sg.u * c; break; }
    }
  }

  // Demi-tour sur place (vérin de retournement des Bâtisseurs) : le convoi se soulève, pivote de 180° et repart dans l'autre sens
  canTurn() { return !this.turning && this.vlen < 1e-6 && Math.abs(this.speed) < 0.6; }
  turnAround() {
    if (!this.canTurn()) return false;
    this.segs = this.segs.slice().reverse().map(sg => ({ e: sg.e, u: -sg.u, a: sg.b, b: sg.a }));
    this.speed = 0; this.turning = 1.4; this.turnT = 0;
    // centre du convoi (repère monde) pour l'animation
    const c = new THREE.Vector3(), t = new THREE.Vector3(); this.pointAt(this.totalLength / 2, c, t); this.turnC = c;
    this.events.push('turn');
    return true;
  }
  _buffer() { // butoir : arrêt net (l'événement n'est signalé qu'une fois par choc, pas à chaque image)
    this.speed = 0;
    const now = performance.now(); if (now - (this.lastBuf || 0) > 900) this.events.push('buffer'); this.lastBuf = now;
  }
  _exitsOf(node, edge) { return this.net.exits(node, edge).filter(x => x.dot > 0.5); }
  _pick(ex) {
    if (ex.length < 2) return ex[0] || null;
    const nb = ex.filter(x => !x.branch), pool = nb.length ? nb : ex;
    const straight = pool.reduce((a, b) => Math.abs(b.lat) < Math.abs(a.lat) ? b : a);
    if (this.pref > 0) return ex.filter(x => x !== straight && x.lat > straight.lat).sort((a, b) => b.lat - a.lat)[0] || straight;
    if (this.pref < 0) return ex.filter(x => x !== straight && x.lat < straight.lat).sort((a, b) => a.lat - b.lat)[0] || straight;
    return straight;
  }
  nudgePref(side) { this.pref = Math.max(-1, Math.min(1, this.pref + side)); }

  // prochain noeud franchi par l'extrémité qui MÈNE (tête en marche avant, arrière en marche arrière)
  approach() {
    const rear = this.mv < 0, sg = rear ? this.segs[this.segs.length - 1] : this.segs[0];
    if (rear && this.vlen > 0) return { node: null, dist: 0, exits: [], chosen: null, edge: sg.e };
    const e = this.net.edges[sg.e], t = rear ? -sg.u : sg.u, s = rear ? sg.b : sg.a;
    const node = t > 0 ? e.b : e.a, dist = t > 0 ? e.len - s : s;
    const exits = this._exitsOf(node, sg.e);
    return { node, dist, exits, chosen: this._pick(exits), edge: sg.e };
  }
  nextNode() { return this.approach().node; }
  distToNode() { return this.approach().dist; }
  upcomingExits() { return this.approach().exits; }
  // libellé de l'aiguillage devant : dépend de ce que la voie permet réellement
  switchText() {
    const a = this.approach(); if (a.exits.length < 2) return 'TOUT DROIT';
    const nb = a.exits.filter(x => !x.branch), pool = nb.length ? nb : a.exits;
    const straight = pool.reduce((x, y) => Math.abs(y.lat) < Math.abs(x.lat) ? y : x);
    if (a.chosen === straight) return 'TOUT DROIT';
    return a.chosen.lat > straight.lat ? 'À DROITE' : 'À GAUCHE';
  }

  advance(ds) {
    if (ds > 0) this._advFront(ds); else if (ds < 0) this._advRear(-ds);
    const d = this.totalLength - this.routeLen(); if (Math.abs(d) > 0.02) this.refit();
  }
  _advFront(d) {
    const E = this.net.edges;
    for (let rem = d, g = 0; rem > 1e-9 && g < 16; g++) {
      const sg = this.segs[0], e = E[sg.e], end = sg.u > 0 ? e.len : 0, room = Math.abs(end - sg.a);
      if (rem <= room) { sg.a += sg.u * rem; this._shrinkRear(rem); return; }
      sg.a = end; this._shrinkRear(room); rem -= room;
      const node = sg.u > 0 ? e.b : e.a, ex = this._exitsOf(node, sg.e);
      if (!ex.length) { this._buffer(); return; }
      const ch = this._pick(ex), ne = E[ch.edge], enter = ne.a === node, st = enter ? 0 : ne.len;
      this.segs.unshift({ e: ch.edge, u: enter ? 1 : -1, a: st, b: st });
      this.events.push(ex.length > 1 ? 'switch' : 'node');
      if (ex.length > 1) this.pref = 0; // l'aiguillage se remet tout droit une fois franchi
    }
  }
  _advRear(d) {
    const E = this.net.edges;
    if (this.vlen > 1e-6) { this._buffer(); return; } // l'arrière est au butoir
    for (let rem = d, g = 0; rem > 1e-9 && g < 16; g++) {
      const sg = this.segs[this.segs.length - 1], e = E[sg.e], t = -sg.u, end = t > 0 ? e.len : 0, room = Math.abs(end - sg.b);
      if (rem <= room) { sg.b += t * rem; this._shrinkFront(rem); return; }
      sg.b = end; this._shrinkFront(room); rem -= room;
      const node = t > 0 ? e.b : e.a, ex = this._exitsOf(node, sg.e);
      if (!ex.length) { this._buffer(); return; }
      const ch = this._pick(ex), ne = E[ch.edge], enter = ne.a === node, st = enter ? 0 : ne.len;
      this.segs.push({ e: ch.edge, u: enter ? -1 : 1, a: st, b: st });
      this.events.push(ex.length > 1 ? 'switch' : 'node');
      if (ex.length > 1) this.pref = 0;
    }
  }

  // position + cap (sens de la marche avant) à `dist` mètres derrière la tête, le long de la route
  pointAt(dist, outP, outT) {
    let d = dist;
    for (const sg of this.segs) {
      const len = Math.abs(sg.a - sg.b);
      if (d <= len + 1e-9) { this.net.sample(sg.e, sg.a - sg.u * Math.min(d, len), outP, outT); outT.multiplyScalar(sg.u); return outP; }
      d -= len;
    }
    const sg = this.segs[this.segs.length - 1];
    this.net.sample(sg.e, sg.b, outP, outT); outT.multiplyScalar(sg.u); outP.addScaledVector(outT, -d);
    return outP;
  }
  // pose un véhicule centré à `c` m de la tête : orienté selon la corde entre ses deux boggies
  placeVeh(mesh, c, L) {
    const h = Math.max(0.5, L / 2 - 1.1);
    this.pointAt(Math.max(0, c - h), _a, _ta); this.pointAt(c + h, _b, _tb);
    _d.subVectors(_a, _b); if (_d.lengthSq() < 1e-6) _d.copy(_ta); _d.normalize();
    mesh.position.addVectors(_a, _b).multiplyScalar(0.5);
    mesh.position.y += RAIL_TOP; // bandage des roues posé sur le champignon du rail (y local 0 = dessus du rail)
    mesh.rotation.set(0, Math.atan2(_d.x, _d.z), 0);
    mesh.rotateX(-Math.asin(Math.max(-1, Math.min(1, _d.y))));
    return wrapA(Math.atan2(_ta.x, _ta.z) - Math.atan2(_tb.x, _tb.z)) / (2 * h); // courbure signée (>0 : virage à gauche)
  }
  // dynamique visuelle d'un véhicule : roulis (dévers de suspension), tangage aux joints, vibrations, balancement en retard
  _dyn(mesh, c, L, kap, dt, stiff) {
    const u = mesh.userData, st = u._dyn || (u._dyn = { r: 0, rv: 0, y: 0 });
    const v = this.speed, av = Math.abs(v), h = Math.max(0.5, L / 2 - 1.1);
    const lat = v * v * kap; // accélération latérale (m/s²)
    const tgt = Math.max(-0.05, Math.min(0.05, lat * 0.0032 / stiff));
    if (dt > 0) {
      const k = 22 * stiff, cd = 4 * Math.sqrt(stiff);
      st.rv += (k * (tgt - st.r) - cd * st.rv) * Math.min(dt, 0.05);
      st.r += st.rv * Math.min(dt, 0.05);
    }
    // joints de rail : petits chocs sous chaque boggie
    const amp = 0.022 * Math.min(1, av / 12), jf = jointD(this.travel - (c - h)), jr = jointD(this.travel - (c + h));
    const bf = -amp * gauss(jf, 0.45), br = -amp * gauss(jr, 0.45);
    if (dt > 0 && av > 2 && (Math.abs(jf) < 0.5 || Math.abs(jr) < 0.5) && !st.kick) { st.rv += (Math.random() - 0.5) * 0.05 * Math.min(1, av / 20) / stiff; st.kick = 1; }
    if (Math.abs(jf) > 0.6 && Math.abs(jr) > 0.6) st.kick = 0;
    const buzz = av > 0.5 ? Math.sin(this.travel * 7.3 + c) * 0.0025 * Math.min(1, av / 20) : 0;
    mesh.position.y += (bf + br) / 2 + buzz;
    mesh.rotateX((bf - br) / (2 * h) * 0.5);
    mesh.rotateZ(st.r);
    // roues : compensent le roulis de caisse pour rester posées sur le rail
    const cr = Math.cos(-st.r), sr = Math.sin(-st.r);
    for (const w of u.wheels) { const b = w.userData.base; if (!b) continue; w.position.set(b.x * cr - b.y * sr, b.x * sr + b.y * cr, b.z); w.rotation.z = -st.r; }
    return st.r;
  }

  update(dt, input = null) {
    if (!this.remote && dt > 0) this.physics(dt, input);
    this.travel = (this.travel || 0) + this.speed * dt;
    this.pointAt(0, this.head, this.headT);
    const Lc = this.loco.userData.length, vehs = [this.loco, ...this.wagons.map(w => w.mesh)];
    this._dyn(this.loco, Lc / 2, Lc, this.placeVeh(this.loco, Lc / 2, Lc), dt, 1.8);
    let back = Lc;
    for (const w of this.wagons) {
      const L = w.mesh.userData.length; back += L / 2;
      this._dyn(w.mesh, back, L, this.placeVeh(w.mesh, back, L), dt, 1);
      back += L / 2;
    }
    // animation du demi-tour : soulever, pivoter autour du centre, reposer
    if (this.turning) {
      this.turnT += dt; const k = Math.min(1, this.turnT / this.turning), e = k * k * (3 - 2 * k), C = this.turnC, ang = (1 - e) * Math.PI;
      this.root.rotation.y = ang; const c = Math.cos(ang), s2 = Math.sin(ang);
      this.root.position.set(C.x - (c * C.x + s2 * C.z), Math.sin(k * Math.PI) * 1.6, C.z - (-s2 * C.x + c * C.z));
      if (k >= 1) { this.turning = 0; this.root.rotation.y = 0; this.root.position.set(0, 0, 0); }
    }
    this._links(vehs);
    // patinage : forte admission à basse vitesse avec pleine pression -> les roues motrices patinent
    const U = this.loco.userData;
    const slipT = this.kind === 'vapeur' && !this.remote && Math.abs(this.throttle) > 0.85 && this.pressure > 55 && Math.abs(this.speed) < 3.5 ? 1 : 0;
    this.slip = (this.slip || 0) + (slipT - (this.slip || 0)) * Math.min(1, dt * 4);
    // roues : rotation = distance / rayon (chaque roue selon son rayon) ; frein serré à basse vitesse = roues bloquées
    const locked = this.brake && Math.abs(this.speed) > 6 && Math.abs(this.speed) < 9 ? 0.2 : 1;
    for (const m of vehs) for (const wh of m.userData.wheels) {
      const drv = m === this.loco && wh.userData.drive;
      wh.rotation.x += this.speed * dt / (wh.userData.r || 0.6) * locked + (drv ? this.slip * Math.sign(this.throttle) * dt * 14 : 0);
    }
    if (U.crank) this._rods(U);
    if (U.lever) U.lever.rotation.x = Math.sin((this.travel || 0) / 0.42 * 0.5) * 0.35;
    this.fireFlash = Math.max(0, (this.fireFlash || 0) - dt * 2.5);
    if (U.firebox) { U.firebox.scale.setScalar(0.6 + this.pressure / 120 + Math.random() * 0.1 + this.fireFlash * 0.4); U.firebox.material.emissiveIntensity = 2 + this.pressure / 50 + Math.random() * 0.6 + this.fireFlash * 8; }
    this._lamp(U);
    this._fx(dt, vehs);
    // tas de charbon visible
    const tender = this.wagons.find(w => w.type === 'charbon');
    if (tender) tender.mesh.userData.pile.scale.y = Math.max(0.05, this.coal / this.maxCoal);
  }

  // bielles motrices : manivelles calées à 90° entre gauche et droite (lues sur la rotation réelle des roues)
  _rods(U) {
    for (const R of U.crank) {
      const a = R.wheel.rotation.x, py = R.wy - R.c * Math.cos(a), pz = R.wz - R.c * Math.sin(a);
      R.coupling.position.set(R.coupling.position.x, R.cy - R.c * Math.cos(a), R.cz - R.c * Math.sin(a));
      // bielle motrice : du bouton de manivelle à la crosse (qui coulisse dans la glissière)
      const dy = R.xy - py, dz = Math.sqrt(Math.max(0.01, R.len * R.len - dy * dy));
      R.main.position.set(R.main.position.x, py, pz); R.main.rotation.x = -Math.atan2(dy, dz);
      R.cross.position.z = pz + dz;
    }
  }
  // phare : cône de lumière + halo plus visibles quand il fait sombre (brouillard sombre = nuit / tunnel)
  _lamp(U) {
    if (!U.beam) return;
    const f = this.scene.fog?.color, lum = f ? f.r * 0.3 + f.g * 0.59 + f.b * 0.11 : 0.6, dark = Math.max(0, Math.min(1, (0.55 - lum) / 0.4));
    U.beam.material.opacity = 0.02 + dark * 0.07;
    if (U.halo) { U.halo.material.opacity = 0.25 + dark * 0.6; U.halo.scale.setScalar(1.6 + dark * 1.6); }
  }
  // attelages : un maillon (InstancedMesh, 1 draw call) entre chaque paire de véhicules
  _links(vehs) {
    const n = vehs.length - 1;
    if (!this.linkMesh || this.linkMesh.count !== n) {
      if (this.linkMesh) this.root.remove(this.linkMesh);
      this.linkMesh = new THREE.InstancedMesh(LINK_GEO, LINK_MAT, Math.max(1, n)); this.linkMesh.count = n; this.linkMesh.frustumCulled = false;
      this.linkMesh.userData.noCollide = true; this.root.add(this.linkMesh);
    }
    for (let i = 0; i < n; i++) {
      const A = vehs[i], B = vehs[i + 1];
      A.localToWorld(_p1.set(0, A.userData.hookY ?? 0.66, A.userData.hookRear ?? -A.userData.length / 2));
      B.localToWorld(_p2.set(0, B.userData.hookY ?? 0.66, B.userData.hookFront ?? B.userData.length / 2));
      this.root.worldToLocal(_p1); this.root.worldToLocal(_p2);
      _v.subVectors(_p1, _p2); const d = _v.length() || 1; _v.multiplyScalar(1 / d);
      _qt.setFromUnitVectors(_q.set(0, 0, 1), _v);
      _m4.compose(_q.addVectors(_p1, _p2).multiplyScalar(0.5), _qt, _sc.set(1, 1, Math.max(0.3, d / 0.6)));
      this.linkMesh.setMatrixAt(i, _m4);
    }
    this.linkMesh.instanceMatrix.needsUpdate = true;
  }
  // effets liés au train (particules partagées de main.js, exposées via window.__oct)
  _fx(dt, vehs) {
    const O = globalThis.__oct; if (!O || !O.steam || dt <= 0) return;
    const av = Math.abs(this.speed), U = this.loco.userData;
    // vapeur des purgeurs de cylindres au démarrage : une bouffée par quart de tour de roue
    if (this.kind === 'vapeur' && U.drains) {
      const ph = Math.floor((U.crank?.[0]?.wheel.rotation.x || 0) / (Math.PI / 2));
      if (ph !== this._ph) { this._ph = ph;
        if (av < 5 && Math.abs(this.throttle) > 0.05 && this.pressure > 8) for (const d of U.drains) for (let k = 0; k < 3; k++) {
          const p = this.loco.localToWorld(_p1.copy(d)), s = Math.sign(d.x);
          O.steam.emit(p, _v.set(s * (3 + Math.random() * 3), 0.3 + Math.random(), (Math.random() - 0.5) * 2).applyQuaternion(this.loco.quaternion), { life: 1.1, size: 0.9, color: '#f2f6f8', alpha: 0.55 });
        }
      }
      // patinage : étincelles au contact roue/rail + sable
      if (this.slip > 0.3 && O.sparks) for (const w of U.wheels) if (w.userData.drive && Math.random() < 0.25) { const p = this._contact(this.loco, w, _p1); O.sparks.emit(p, _v.set((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3), { life: 0.35, size: 0.22, color: '#ffd27a' }); }
      // soupapes : petit panache quand la pression est au maximum
      if (this.pressure > 96 && U.safety && Math.random() < 0.4) O.steam.emit(this.loco.localToWorld(_p1.copy(U.safety)), _v.set((Math.random() - 0.5) * 0.6, 4 + Math.random() * 2, (Math.random() - 0.5) * 0.6), { life: 0.9, size: 0.7, color: '#ffffff', alpha: 0.5 });
    }
    // freinage : gerbes d'étincelles au contact roue/rail des wagons (la loco est gérée par main.js)
    if (this.brake && av > 4 && O.sparks) for (const m of vehs) if (m !== this.loco) for (const w of m.userData.wheels) if (Math.random() < 0.06 * Math.min(1, av / 12)) {
      const p = this._contact(m, w, _p1); _v.set(0, 0, -Math.sign(this.speed) * (2 + Math.random() * 4)).applyQuaternion(m.quaternion); _v.y = Math.random() * 2;
      O.sparks.emit(p, _v, { life: 0.3, size: 0.18, color: Math.random() < 0.5 ? '#ffb347' : '#fff0b0' });
    }
    // cryo-wagon : vapeur froide qui retombe des évents
    for (const m of vehs) if (m.userData.vents && Math.random() < 0.3) { const v = m.userData.vents[(Math.random() * m.userData.vents.length) | 0]; O.steam.emit(m.localToWorld(_p1.copy(v)), _v.set((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8), { life: 1.6, size: 0.8, color: '#d8f4ff', alpha: 0.35 }); }
  }
  _contact(m, w, out) { return m.localToWorld(out.set(w.position.x, 0.02, w.position.z + (Math.random() - 0.5) * 0.2)); }

  // position de l'avatar dans la cabine, en repère local de la loco. f = 0 : debout face à l'avant ; f = 1 : face à l'arrière
  cabLocal(f, out = new THREE.Vector3()) {
    const u = this.loco.userData, a = u.cab, b = u.cabBack || a;
    out.copy(a).lerp(b, f);
    if (u.cabSwing) out.x += Math.sin(f * Math.PI) * u.cabSwing; // contourne le balancier en passant d'un bout à l'autre
    return out;
  }

  physics(dt, input) {
    if (this.turning) { this.speed = 0; return; }
    const d = this.def;
    let thrust = 0;
    if (input) { this.throttle = input.throttle; this.brake = input.brake; }
    if (this.kind === 'draisine') {
      // il faut pomper ! (input.pump = impulsions)
      if (input?.pump) this.pumpPower = Math.min(1, (this.pumpPower || 0) + 0.35);
      this.pumpPower = Math.max(0, (this.pumpPower || 0) - dt * 0.6);
      thrust = this.throttle * this.pumpPower * d.accel * 2.2;
    } else {
      // vapeur : pression = puissance ; charbon + eau la maintiennent
      const burning = this.coalInFire || 0;
      if (burning > 0 && this.water > 0) {
        this.pressure = Math.min(100, this.pressure + dt * 9 * Math.min(1, burning));
        this.coalInFire = Math.max(0, burning - dt * 0.12);
        this.water = Math.max(0, this.water - dt * 0.35 * (0.2 + Math.abs(this.throttle)));
      } else this.pressure = Math.max(0, this.pressure - dt * 2.5);
      this.pressure = Math.max(0, this.pressure - dt * Math.abs(this.throttle * this.speed) * 0.035);
      thrust = this.throttle * d.accel * Math.min(1, this.pressure / 35);
    }
    const drag = this.speed * 0.02 + Math.sign(this.speed) * 0.25;
    // pente
    const slope = this.headT ? this.headT.y : 0;
    const load = 1 + this.wagons.length * 0.18;
    this.speed += (thrust / load - drag - slope * 9.8 * 0.6) * dt;
    if (this.brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 12 * dt);
    if (Math.abs(this.speed) < 0.05 && !thrust) this.speed = 0;
    this.speed = Math.max(-d.maxSpeed * 0.5, Math.min(d.maxSpeed, this.speed));
    if (Math.abs(this.speed) > 0.05) this.mv = Math.sign(this.speed);
    this.advance(this.speed * dt);
    this.odometer += Math.abs(this.speed * dt);
  }

  shovel() {
    if (this.kind !== 'vapeur') return false;
    if (this.coal < 1) return 'empty';
    this.coal -= 1; this.fireFlash = 1; this.coalInFire = Math.min(3, (this.coalInFire || 0) + 1); return true;
  }

  serialize() { const sg = this.segs[0]; return { e: sg.e, s: +sg.a.toFixed(2), d: sg.u, v: +this.speed.toFixed(2), k: this.kind, w: this.wagons.map(w => w.type), pr: Math.round(this.pressure) }; }
  applyRemote(o) {
    if (o.k !== this.kind) this.setLoco(o.k);
    if (o.w.join() !== this.wagons.map(w => w.type).join()) this.setWagons(o.w);
    const sg = this.segs[0];
    // reconstruction si arête différente, sinon lissage le long de l'arête
    if (o.e !== sg.e || o.d !== sg.u || Math.abs(o.s - sg.a) > 30) this.placeFront(o.e, o.s, o.d);
    else { sg.a = Math.max(0, Math.min(this.net.edges[sg.e].len, sg.a + (o.s - sg.a) * 0.3)); this.refit(); }
    this.speed = o.v; this.pressure = o.pr;
    if (Math.abs(o.v) > 0.05) this.mv = Math.sign(o.v);
  }

  dispose() { this.scene.remove(this.root); this.linkMesh?.dispose(); }
}
