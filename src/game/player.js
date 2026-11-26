import * as THREE from 'three';
import { buildAvatarModel } from '../world/models.js';
import { COLLIDERS } from '../world/colliders.js';
import { VOX } from '../world/voxcol.js';

const STEP = 0.62, BODY = 1.75, RAD = 0.34;


export function buildAvatar(color) { return buildAvatarModel(color); }

export class Player {
  constructor(scene, terrain, color) {
    this.terrain = terrain;
    this.avatar = buildAvatar(color); scene.add(this.avatar);
    this.pos = new THREE.Vector3(0, 0.3, 0); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = -0.25; this.camDist = 7;
    this.mode = 'foot'; // 'foot' | 'cab' | 'ride'
    this.onGround = true; this.walkPhase = 0;
    this.temp = 100; // chaleur corporelle
    this.bag = []; this.bagMax = 4;
    this.rules = {}; this.charge = 0; this.prep = 0; this.sprinting = false; this.springOut = 0;
    this.onBlocked = null;
    this.buildGadgets();
  }

  // Accessoires d'animation : clé à molette, fiole d'élixir, ressorts télescopiques dans les jambes
  buildGadgets() {
    const u = this.avatar.userData, M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.7, ...o });
    const hand = u.arms[1];
    const wrench = new THREE.Group();
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.03), M('#b8b8c0'));
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 12, Math.PI * 1.4), M('#b8b8c0')); jaw.position.y = 0.21; jaw.rotation.z = 0.8;
    wrench.add(h1, jaw); wrench.position.set(0, -0.66, 0.08); wrench.visible = false; hand.add(wrench);
    const potion = new THREE.Group();
    const bottle = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), new THREE.MeshStandardMaterial({ color: '#5fe0a0', emissive: '#2fa070', emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 8), M('#ddeeff', { metalness: 0.1 })); neck.position.y = 0.1;
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 8), M('#8a5a32', { metalness: 0 })); cork.position.y = 0.15;
    potion.add(bottle, neck, cork); potion.position.set(0, -0.66, 0.06); potion.visible = false; hand.add(potion);
    this.gadgets = { wrench, potion };
    // ressorts (hélice en laiton) cachés dans chaque jambe
    const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120; pts.push(new THREE.Vector3(Math.cos(t * Math.PI * 14) * 0.1, -t * 0.7, Math.sin(t * Math.PI * 14) * 0.1)); }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.018, 5, false);
    this.springs = u.legs.map(hip => { const sp = new THREE.Mesh(geo, M('#d2a24c')); sp.position.y = -0.05; sp.scale.y = 0.01; sp.visible = false; hip.add(sp); return sp; });
  }

  blocked(what) { const msg = this.rules[what]; if (msg && this.onBlocked) this.onBlocked(what, msg); return !!msg; }

  groundAt(x, z) {
    const r = Math.hypot(x, z);
    let h = this.terrain.heightAt(x, z);
    if (r < 47) h = Math.max(h, 0.2);
    return h;
  }

  updateFoot(dt, input, extraColliders) {
    // --- sprint : petite animation de préparation (clé à molette ou élixir) puis sprint
    const wantRun = input.a('run');
    if (!wantRun) { this.sprinting = false; this.prep = 0; }
    else if (!this.sprinting && this.prep <= 0 && !this._runHeld) {
      if (!this.blocked('sprint')) { this.prep = 0.75; this.prepKind = Math.random() < 0.5 ? 'wrench' : 'potion'; }
    }
    this._runHeld = wantRun;
    if (this.prep > 0) { this.prep -= dt; if (this.prep <= 0) { this.sprinting = !this.rules.sprint; this.onSprint?.(); } }
    if (this.rules.sprint) this.sprinting = false;
    const sp = this.sprinting ? 14 : 7.5;
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const want = new THREE.Vector3();
    if (input.a('forward')) want.add(f);
    if (input.a('back')) want.sub(f);
    if (input.a('right')) want.add(r);
    if (input.a('left')) want.sub(r);
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(this.charge > 0.12 ? 1.2 : sp);
    this.vel.x += (want.x - this.vel.x) * Math.min(1, dt * 12);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, dt * 12);
    this.vel.y -= 22 * dt;
    // --- saut : maintenir = les jambes deviennent des ressorts (charge), relâcher = bond
    const holdJ = input.a('jump');
    if (this.onGround && holdJ) {
      if (this.charge === 0 && this.rules.jump) { this.blocked('jump'); this._jBlock = true; }
      else if (!this._jBlock) this.charge = Math.min(1, this.charge + dt / 1.1) || 0.0001;
      if (this.rules.spring && this.charge > 0.12) { this.blocked('spring'); this.charge = 0.12; }
    }
    if (!holdJ) {
      if (this.charge > 0 && this.onGround) {
        const c = this.charge > 0.12 ? this.charge : 0;
        this.vel.y = (8 + 11 * c) * (this.rules.jumpMul || 1); this.onGround = false; this.springOut = c > 0 ? 1 : 0;
        if (c > 0) this.onSpringJump?.(c);
      }
      this.charge = 0; this._jBlock = false;
    }
    // Collision sur la géométrie réelle (VOX) + corps mobiles (trains).
    const P = this.pos;
    const ground = (x, z, feet) => Math.max(this.groundAt(x, z), VOX.floor(x, z, feet, STEP));
    const steep = (x, z, nx, nz) => { if (!this.onGround) return false; const g0 = this.terrain.heightAt(x, z), g1 = this.terrain.heightAt(nx, nz); const d = Math.hypot(nx - x, nz - z) || 1e-6; return g1 > P.y + 0.05 && (g1 - g0) / d > 0.9; };
    const hits = (x, z, feet) => VOX.solid(x, z, feet + STEP, feet + BODY, RAD) || this.trainHit(x, z, feet);
    // coincé (apparition, téléportation) : on se dégage vers la case libre la plus proche, jamais à travers
    const unstick = () => {
      let done = false;
      for (let r = 0.3; r <= 6 && !done; r += 0.3) for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        const f = ground(x, z, P.y + 2);
        if (!hits(x, z, f)) { P.x = x; P.z = z; P.y = f; done = true; break; }
      }
    };
    if (hits(P.x, P.z, P.y)) unstick();
    const startStuck = false;
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vel.x, this.vel.z) * dt / 0.12));
    for (let i = 0; i < steps; i++) {
      const dx = this.vel.x * dt / steps, dz = this.vel.z * dt / steps;
      const ok = (nx, nz) => !hits(nx, nz, P.y) && !steep(P.x, P.z, nx, nz);
      if (startStuck || ok(P.x + dx, P.z + dz)) { P.x += dx; P.z += dz; }
      else if (ok(P.x + dx, P.z)) { P.x += dx; this.vel.z *= 0.5; }
      else if (ok(P.x, P.z + dz)) { P.z += dz; this.vel.x *= 0.5; }
    }
    P.y += this.vel.y * dt;
    // plafond : on ne saute pas à travers un auvent
    if (this.vel.y > 0 && VOX.solid(P.x, P.z, P.y + BODY - 0.05, P.y + BODY + 0.1, RAD * 0.8)) this.vel.y = 0;
    let g = ground(P.x, P.z, P.y);
    for (const c of extraColliders) { const h = c(P.x, P.z); if (h !== null && h > g && h < P.y + 1.2) g = h; }
    if (P.y <= g) { if (!this.onGround) this.springOut = Math.min(this.springOut, 0.25); P.y = g; this.vel.y = 0; this.onGround = true; } else if (P.y > g + 0.05) this.onGround = false;
    if (hits(P.x, P.z, P.y)) unstick(); // descente d'un rebord : jamais de chevauchement
    const R = Math.hypot(this.pos.x, this.pos.z); if (R > 1380) this.pos.multiplyScalar(1380 / R);
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += moving * dt * 1.6;
    if (moving > 0.3) this.facing = Math.atan2(this.vel.x, this.vel.z);
    this.animate(moving, dt);
    this.avatar.position.copy(this.pos);
    if (this.facing !== undefined) this.avatar.rotation.y += ((this.facing - this.avatar.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 12);
    return moving;
  }

  trainHit(x, z, feet) {
    const bodies = COLLIDERS._bodies();
    for (const c of bodies) {
      if (feet > c.top - 0.3) continue;
      if (c.t === 0) { if (Math.hypot(x - c.x, z - c.z) < c.r + RAD) return true; continue; }
      const dx = x - c.x, dz = z - c.z, lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
      if (Math.abs(lx) < c.hx + RAD && Math.abs(lz) < c.hz + RAD) return true;
    }
    return false;
  }

  animate(moving, dt = 0.016) {
    const u = this.avatar.userData, k = Math.min(1, moving / 5);
    // ressorts : sortent avec la charge, se détendent au bond puis se rétractent
    this.springOut = Math.max(0, this.springOut - dt * (this.onGround ? 4 : 1.2));
    const sv = Math.max(this.charge > 0.12 ? this.charge : 0, this.springOut);
    if (this.springs) for (const s2 of this.springs) { s2.visible = sv > 0.02; s2.scale.y = 0.2 + (this.charge > 0.12 ? (1 - this.charge * 0.5) : 1.4 * this.springOut); }
    u.legs.forEach(h => { const leg = h.children[0]; if (leg) leg.scale.y = 1 - Math.min(0.55, sv * 0.6); });
    u.legs[0].rotation.x = Math.sin(this.walkPhase * 3) * 0.6 * k; u.legs[1].rotation.x = -u.legs[0].rotation.x;
    u.arms[0].rotation.x = -u.legs[0].rotation.x * 0.8; u.arms[1].rotation.x = u.legs[0].rotation.x * 0.8;
    u.body.position.y = 0.95 + Math.abs(Math.sin(this.walkPhase * 3)) * 0.06 * k - (this.charge > 0.12 ? this.charge * 0.25 : 0);
    // préparation du sprint : bras droit levé + accessoire
    if (this.gadgets) {
      const on = this.prep > 0;
      this.gadgets.wrench.visible = on && this.prepKind === 'wrench';
      this.gadgets.potion.visible = on && this.prepKind === 'potion';
      if (on) {
        const t = 1 - this.prep / 0.75;
        if (this.prepKind === 'wrench') { const up = Math.min(1, t * 3); u.arms[1].rotation.x = -2.5 * up; u.arms[1].rotation.z = 0.55 * up; this.gadgets.wrench.rotation.set(0, 0, Math.PI / 2 + Math.min(1, Math.max(0, t * 1.6 - 0.3)) * Math.PI * 1.5); u.head && (u.head.rotation.z = -0.15 * up); }
        else { u.arms[1].rotation.x = -2.4 * Math.min(1, t * 2.5); u.arms[1].rotation.z = 0.4; this.gadgets.potion.rotation.x = -t * 1.8; }
      } else { u.arms[1].rotation.z = 0; }
      if (!on && this.sprinting) { u.arms[0].rotation.x *= 1.4; u.arms[1].rotation.x *= 1.4; }
    }
  }

  look(input, sens = 1, inv = false, smooth = false) {
    // sensibilité : 0,0016 rad/pixel × réglage, mouvement par image plafonné (anti-toupie)
    const k = 0.0016 * sens;
    let dx = Math.max(-1500, Math.min(1500, input.mouse.dx)), dy = Math.max(-1500, Math.min(1500, input.mouse.dy));
    // lissage : on écoule une fraction du mouvement accumulé à chaque image (aucune rotation perdue)
    const b = this._lookBuf || (this._lookBuf = { x: 0, y: 0 });
    b.x += dx; b.y += dy;
    const f = smooth ? 0.55 : 1;
    dx = b.x * f; dy = b.y * f; b.x -= dx; b.y -= dy;
    if (Math.abs(b.x) < 0.05) b.x = 0; if (Math.abs(b.y) < 0.05) b.y = 0;
    this.yaw -= dx * k; this.pitch -= dy * k * (inv ? -1 : 1);
    this.yaw = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (input.down('ArrowLeft')) this.yaw += 0.03; if (input.down('ArrowRight')) this.yaw -= 0.03;
    if (input.down('ArrowUp')) this.pitch += 0.02; if (input.down('ArrowDown')) this.pitch -= 0.02;
    this.pitch = Math.max(-1.2, Math.min(this.fp ? 1.2 : 0.5, this.pitch));
  }
}
