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
};

export function buildLoco(kind, tint = '#8b1e1e') {
  const g = kind === 'draisine' ? buildDraisine() : buildSteamLoco(tint);
  if (g.userData.rods) g.userData.rods.forEach(r => r.userData.base = r.position.clone());
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
    mesh.rotation.set(0, Math.atan2(_d.x, _d.z), 0);
    mesh.rotateX(-Math.asin(Math.max(-1, Math.min(1, _d.y))));
  }

  update(dt, input = null) {
    if (!this.remote && dt > 0) this.physics(dt, input);
    this.pointAt(0, this.head, this.headT);
    const Lc = this.loco.userData.length;
    this.placeVeh(this.loco, Lc / 2, Lc);
    let back = Lc;
    for (const w of this.wagons) {
      const L = w.mesh.userData.length; back += L / 2;
      this.placeVeh(w.mesh, back, L);
      back += L / 2;
    }
    // roues + bielles
    const spin = this.speed * dt / 0.6;
    for (const m of [this.loco, ...this.wagons.map(w => w.mesh)]) for (const wh of m.userData.wheels) wh.rotation.x += spin;
    this.wheelPhase = (this.wheelPhase || 0) + spin;
    if (this.loco.userData.rods) this.loco.userData.rods.forEach((r, i) => { const ph = this.wheelPhase + (i < 2 ? 0 : Math.PI / 2) * (i % 2 ? 1 : 1) + (i >= 2 ? Math.PI / 2 : 0); const b = r.userData.base; r.position.y = b.y + Math.sin(ph) * 0.28; r.position.z = b.z + Math.cos(ph) * 0.28 * (i % 2 ? 0.5 : 1); });
    if (this.loco.userData.lever) this.loco.userData.lever.rotation.x = Math.sin(this.wheelPhase * 0.5) * 0.35;
    if (this.loco.userData.firebox) this.loco.userData.firebox.scale.setScalar(0.6 + this.pressure / 120 + Math.random() * 0.1);
    // tas de charbon visible
    const tender = this.wagons.find(w => w.type === 'charbon');
    if (tender) tender.mesh.userData.pile.scale.y = Math.max(0.05, this.coal / this.maxCoal);
  }

  // position de l'avatar dans la cabine, en repère local de la loco. f = 0 : debout face à l'avant ; f = 1 : face à l'arrière
  cabLocal(f, out = new THREE.Vector3()) {
    const u = this.loco.userData, a = u.cab, b = u.cabBack || a;
    out.copy(a).lerp(b, f);
    if (u.cabSwing) out.x += Math.sin(f * Math.PI) * u.cabSwing; // contourne le balancier en passant d'un bout à l'autre
    return out;
  }

  physics(dt, input) {
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
    this.coal -= 1; this.coalInFire = Math.min(3, (this.coalInFire || 0) + 1); return true;
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

  dispose() { this.scene.remove(this.root); }
}
