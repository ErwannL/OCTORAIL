import * as THREE from 'three';
import { buildAvatarModel } from '../world/models.js';
import { COLLIDERS } from '../world/colliders.js';


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
    // sous-pas : pas de traversée même à bas FPS
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vel.x, this.vel.z) * dt / 0.3));
    for (let i = 0; i < steps; i++) { this.pos.addScaledVector(this.vel, dt / steps); COLLIDERS.resolve(this.pos, 0.42); }
    let g = this.groundAt(this.pos.x, this.pos.z);
    for (const c of extraColliders) { const h = c(this.pos.x, this.pos.z); if (h !== null && h > g && h < this.pos.y + 1.2) g = h; }
    if (this.pos.y <= g) { this.pos.y = g; this.vel.y = 0; this.onGround = true; } else if (this.pos.y > g + 0.05) this.onGround = false;
    const R = Math.hypot(this.pos.x, this.pos.z); if (R > 1380) this.pos.multiplyScalar(1380 / R);
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += moving * dt * 1.6;
    if (moving > 0.3) this.facing = Math.atan2(this.vel.x, this.vel.z);
    this.animate(moving);
    this.avatar.position.copy(this.pos);
    if (this.facing !== undefined) this.avatar.rotation.y += ((this.facing - this.avatar.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 12);
    return moving;
  }

  animate(moving) {
    const u = this.avatar.userData, k = Math.min(1, moving / 5);
    u.legs[0].rotation.x = Math.sin(this.walkPhase * 3) * 0.6 * k; u.legs[1].rotation.x = -u.legs[0].rotation.x;
    u.arms[0].rotation.x = -u.legs[0].rotation.x * 0.8; u.arms[1].rotation.x = u.legs[0].rotation.x * 0.8;
    u.body.position.y = 0.95 + Math.abs(Math.sin(this.walkPhase * 3)) * 0.06 * k;
  }

  look(input, sens = 1, inv = false) {
    // sensibilité : 0,0016 rad/pixel × réglage, mouvement par image plafonné (anti-toupie)
    const k = 0.0016 * sens;
    const dx = Math.max(-300, Math.min(300, input.mouse.dx)), dy = Math.max(-300, Math.min(300, input.mouse.dy));
    this.yaw -= dx * k; this.pitch -= dy * k * (inv ? -1 : 1);
    this.yaw = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (input.down('ArrowLeft')) this.yaw += 0.03; if (input.down('ArrowRight')) this.yaw -= 0.03;
    if (input.down('ArrowUp')) this.pitch += 0.02; if (input.down('ArrowDown')) this.pitch -= 0.02;
    this.pitch = Math.max(-1.2, Math.min(0.5, this.pitch));
  }
}
