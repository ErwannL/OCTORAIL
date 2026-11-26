import * as THREE from 'three';
import { buildSteamLoco, buildDraisine, buildWagonModel } from '../world/models.js';


export const LOCOS = {
  draisine: { name: 'Draisine à bras', maxSpeed: 9, accel: 2.2, needsFuel: false },
  vapeur:   { name: 'Vapeur « Vieille-Bouilloire »', maxSpeed: 26, accel: 3.2, needsFuel: true },
};
export const WAGON_TYPES = {
  charbon:  { name: 'Tender à charbon', color: '#2a2a2a', price: 0 },
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

// Un train qui roule sur le graphe. La tête suit (edge, s, dir) ; les wagons suivent un historique de positions.
export class Train {
  constructor(net, scene, { loco = 'draisine', wagons = [], tint = '#8b1e1e', startNode = 'H4', remote = false } = {}) {
    this.net = net; this.scene = scene; this.remote = remote;
    this.root = new THREE.Group(); scene.add(this.root);
    this.speed = 0; this.throttle = 0; this.brake = 0;
    this.pref = 0; // aiguillage : 0 = tout droit, 1 = bifurcation
    this.coal = 0; this.water = 0; this.pressure = 0; this.maxCoal = 40; this.maxWater = 100;
    this.trail = []; // [{p,q,s}] historique pour les wagons
    this.odometer = 0;
    this.events = [];
    this.tint = tint;
    this.setLoco(loco);
    this.setWagons(wagons);
    this.placeAt(startNode);
  }

  setLoco(kind) {
    if (this.loco) this.root.remove(this.loco);
    this.kind = kind; this.def = LOCOS[kind];
    this.loco = buildLoco(kind, this.tint); this.root.add(this.loco);
  }
  setWagons(list) {
    for (const w of this.wagons || []) this.root.remove(w.mesh);
    this.wagons = list.map(type => ({ type, mesh: buildWagon(type) }));
    this.wagons.forEach(w => this.root.add(w.mesh));
  }

  placeAt(nodeId) {
    const n = this.net.nodes.get(nodeId);
    // première arête non-anneau sortant du noeud
    const eid = n.edges.find(id => this.net.edges[id].kind !== 'ring') ?? n.edges[0];
    const e = this.net.edges[eid];
    this.edge = eid; this.dir = e.a === nodeId ? 1 : -1; this.s = e.a === nodeId ? 6 : e.len - 6;
    this.speed = 0; this.trail.length = 0;
    this.prime();
  }

  prime() {
    // remplir l'historique derrière la loco pour poser les wagons
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    this.net.sample(this.edge, this.s, p, t);
    t.multiplyScalar(this.dir);
    for (let k = 60; k >= 0; k--) this.trail.push({ p: p.clone().addScaledVector(t, -k * 1.0), t: t.clone() });
    this.update(0);
  }

  get totalLength() { return this.loco.userData.length + this.wagons.reduce((a, w) => a + w.mesh.userData.length, 0); }

  nextNode() { const e = this.net.edges[this.edge]; return this.dir > 0 ? e.b : e.a; }
  distToNode() { const e = this.net.edges[this.edge]; return this.dir > 0 ? e.len - this.s : this.s; }

  // Choix d'aiguillage prévisionnel
  upcomingExits() {
    const exits = this.net.exits(this.nextNode(), this.edge);
    return exits.filter(x => x.dot > -0.3);
  }

  advance(ds) {
    // déplacement signé le long du graphe
    let remaining = ds;
    let guard = 0;
    while (Math.abs(remaining) > 1e-6 && guard++ < 8) {
      const e = this.net.edges[this.edge];
      const moveDir = Math.sign(remaining) * this.dir;
      const target = this.s + remaining * this.dir;
      if (target >= 0 && target <= e.len) { this.s = target; remaining = 0; break; }
      // on franchit un noeud
      const node = target > e.len ? e.b : e.a;
      const used = target > e.len ? (e.len - this.s) : this.s;
      remaining -= Math.sign(remaining) * used;
      // en marche avant : on suit l'aiguillage ; en marche arrière idem par rapport au sens réel
      const exits = this.net.exits(node, this.edge).filter(x => x.dot > -0.3);
      if (!exits.length) { // butoir
        this.s = target > e.len ? e.len : 0; this.speed = 0; this.events.push('buffer'); return;
      }
      const choice = exits[Math.min(this.pref, exits.length - 1)];
      const ne = this.net.edges[choice.edge];
      const travelForward = moveDir > 0; // sens de parcours de l'arête actuelle
      // nouvelle arête : on y entre par `node`
      const enterAtA = ne.a === node;
      const newEdgeDirection = enterAtA ? 1 : -1; // sens de parcours physique dans la nouvelle arête
      // dir = orientation de la loco par rapport à l'arête. Si on recule, on garde la loco tournée à l'opposé.
      this.dir = Math.sign(remaining) >= 0 ? newEdgeDirection : -newEdgeDirection;
      this.edge = choice.edge; this.s = enterAtA ? 0 : ne.len;
      this.events.push(exits.length > 1 ? 'switch' : 'node');
      void travelForward;
    }
  }

  update(dt, input = null) {
    if (!this.remote && dt > 0) this.physics(dt, input);
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    this.net.sample(this.edge, this.s, p, t); t.multiplyScalar(this.dir);
    // historique (espacé de ~0.5 m)
    const last = this.trail[this.trail.length - 1];
    if (!last || last.p.distanceTo(p) > 0.5) { this.trail.push({ p: p.clone(), t: t.clone() }); if (this.trail.length > 400) this.trail.shift(); }
    else if (this.speed < 0 && this.trail.length > 2) {
      // en recul : on « remonte » l'historique
      while (this.trail.length > 2 && this.trail[this.trail.length - 1].p.distanceTo(p) < 0.25) this.trail.pop();
      this.trail.push({ p: p.clone(), t: t.clone() });
    }
    this.place(this.loco, p, t, this.loco.userData.length / 2);
    // wagons
    let back = this.loco.userData.length;
    for (const w of this.wagons) {
      const L = w.mesh.userData.length; back += L / 2;
      const s = this.trailAt(back, p);
      this.place(w.mesh, s.p, s.t, 0);
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
    this.head = p; this.headT = t;
  }

  trailAt(dist, headP) {
    // marche le long de l'historique depuis la tête
    let acc = 0, prev = headP;
    for (let k = this.trail.length - 1; k >= 0; k--) {
      const q = this.trail[k];
      const d = prev.distanceTo(q.p);
      if (acc + d >= dist) { const f = (dist - acc) / (d || 1); return { p: prev.clone().lerp(q.p, f), t: q.t }; }
      acc += d; prev = q.p;
    }
    const f = this.trail[0]; return { p: f.p.clone(), t: f.t };
  }

  place(mesh, p, t, backOffset) {
    const c = p.clone().addScaledVector(t, -backOffset);
    mesh.position.copy(c);
    mesh.rotation.set(0, Math.atan2(t.x, t.z), 0);
    mesh.rotateX(-Math.asin(Math.max(-1, Math.min(1, t.y))));
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
    this.advance(this.speed * dt);
    this.odometer += Math.abs(this.speed * dt);
  }

  shovel() {
    if (this.kind !== 'vapeur') return false;
    if (this.coal < 1) return 'empty';
    this.coal -= 1; this.coalInFire = Math.min(3, (this.coalInFire || 0) + 1); return true;
  }

  serialize() { return { e: this.edge, s: +this.s.toFixed(2), d: this.dir, v: +this.speed.toFixed(2), k: this.kind, w: this.wagons.map(w => w.type), pr: Math.round(this.pressure) }; }
  applyRemote(o) {
    if (o.k !== this.kind) this.setLoco(o.k);
    if (o.w.join() !== this.wagons.map(w => w.type).join()) this.setWagons(o.w);
    // téléportation si arête différente, sinon lissage
    if (o.e !== this.edge || Math.abs(o.s - this.s) > 30) { this.edge = o.e; this.s = o.s; this.dir = o.d; this.trail.length = 0; this.prime(); }
    else { this.s += (o.s - this.s) * 0.3; this.dir = o.d; }
    this.speed = o.v; this.pressure = o.pr;
  }

  dispose() { this.scene.remove(this.root); }
}
