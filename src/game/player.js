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
  }

  groundAt(x, z) {
    const r = Math.hypot(x, z);
    let h = this.terrain.heightAt(x, z);
    if (r < 47) h = Math.max(h, 0.2);
    return h;
  }

  updateFoot(dt, input, extraColliders) {
    const sp = input.a('run') ? 14 : 7.5;
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const want = new THREE.Vector3();
    if (input.a('forward')) want.add(f);
    if (input.a('back')) want.sub(f);
    if (input.a('right')) want.add(r);
    if (input.a('left')) want.sub(r);
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(sp);
    this.vel.x += (want.x - this.vel.x) * Math.min(1, dt * 12);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, dt * 12);
    this.vel.y -= 22 * dt;
    if (this.onGround && input.ah('jump')) { this.vel.y = 8; this.onGround = false; }
    // Collision sur la géométrie réelle (VOX) + corps mobiles (trains).
    const P = this.pos;
    const ground = (x, z, feet) => Math.max(this.groundAt(x, z), VOX.floor(x, z, feet, STEP));
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
      if (startStuck || !hits(P.x + dx, P.z + dz, P.y)) { P.x += dx; P.z += dz; }
      else if (!hits(P.x + dx, P.z, P.y)) { P.x += dx; this.vel.z *= 0.5; }
      else if (!hits(P.x, P.z + dz, P.y)) { P.z += dz; this.vel.x *= 0.5; }
    }
    P.y += this.vel.y * dt;
    // plafond : on ne saute pas à travers un auvent
    if (this.vel.y > 0 && VOX.solid(P.x, P.z, P.y + BODY - 0.05, P.y + BODY + 0.1, RAD * 0.8)) this.vel.y = 0;
    let g = ground(P.x, P.z, P.y);
    for (const c of extraColliders) { const h = c(P.x, P.z); if (h !== null && h > g && h < P.y + 1.2) g = h; }
    if (P.y <= g) { P.y = g; this.vel.y = 0; this.onGround = true; } else if (P.y > g + 0.05) this.onGround = false;
    if (hits(P.x, P.z, P.y)) unstick(); // descente d'un rebord : jamais de chevauchement
    const R = Math.hypot(this.pos.x, this.pos.z); if (R > 1380) this.pos.multiplyScalar(1380 / R);
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += moving * dt * 1.6;
    if (moving > 0.3) this.facing = Math.atan2(this.vel.x, this.vel.z);
    this.animate(moving);
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

  animate(moving) {
    const u = this.avatar.userData, k = Math.min(1, moving / 5);
    u.legs[0].rotation.x = Math.sin(this.walkPhase * 3) * 0.6 * k; u.legs[1].rotation.x = -u.legs[0].rotation.x;
    u.arms[0].rotation.x = -u.legs[0].rotation.x * 0.8; u.arms[1].rotation.x = u.legs[0].rotation.x * 0.8;
    u.body.position.y = 0.95 + Math.abs(Math.sin(this.walkPhase * 3)) * 0.06 * k;
  }

  look(input, sens = 1, inv = false, smooth = false) {
    // sensibilité : 0,0016 rad/pixel × réglage, mouvement par image plafonné (anti-toupie)
    const k = 0.0016 * sens;
    let dx = Math.max(-300, Math.min(300, input.mouse.dx)), dy = Math.max(-300, Math.min(300, input.mouse.dy));
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
    this.pitch = Math.max(-1.2, Math.min(0.5, this.pitch));
  }
}
