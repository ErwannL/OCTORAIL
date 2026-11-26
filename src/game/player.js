import * as THREE from 'three';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });

export function buildAvatar(color = '#e0703a') {
  const g = new THREE.Group();
  const suit = M(color), dark = M('#2a2a30'), visor = M('#111', { emissive: '#5fe0ff', emissiveIntensity: 1.2, metalness: 0.5, roughness: 0.2 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.7, 4, 10), suit); body.position.y = 0.95; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), M('#e8e2d6')); head.position.y = 1.75; g.add(head);
  const vis = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 8, -0.9, 1.8, 1.0, 0.9), visor); vis.position.set(0, 1.75, 0.08); g.add(vis);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), dark); pack.position.set(0, 1.05, -0.36); g.add(pack);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M('#fff', { emissive: '#ffd080', emissiveIntensity: 4 })); lamp.position.set(0, 1.42, -0.52); g.add(lamp);
  const legs = [];
  for (const x of [-0.17, 0.17]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.45, 4, 8), dark); l.position.set(x, 0.35, 0); g.add(l); legs.push(l); }
  const arms = [];
  for (const x of [-0.5, 0.5]) { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), suit); a.position.set(x, 1.05, 0); g.add(a); arms.push(a); }
  g.userData = { legs, arms, body };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

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
    const sp = input.down('ShiftLeft') ? 9 : 5;
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const want = new THREE.Vector3();
    if (input.down('KeyW') || input.down('KeyZ')) want.add(f);
    if (input.down('KeyS')) want.sub(f);
    if (input.down('KeyD')) want.add(r);
    if (input.down('KeyA') || input.down('KeyQ')) want.sub(r);
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(sp);
    this.vel.x += (want.x - this.vel.x) * Math.min(1, dt * 10);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, dt * 10);
    this.vel.y -= 22 * dt;
    if (this.onGround && input.hit('Space')) { this.vel.y = 8; this.onGround = false; }
    this.pos.addScaledVector(this.vel, dt);
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
    u.legs[0].rotation.x = Math.sin(this.walkPhase * 3) * 0.7 * k; u.legs[1].rotation.x = -u.legs[0].rotation.x;
    u.arms[0].rotation.x = -u.legs[0].rotation.x * 0.8; u.arms[1].rotation.x = u.legs[0].rotation.x * 0.8;
    u.body.position.y = 0.95 + Math.abs(Math.sin(this.walkPhase * 3)) * 0.06 * k;
  }

  look(input) {
    this.yaw -= input.mouse.dx * 0.0025; this.pitch -= input.mouse.dy * 0.0025;
    if (input.down('ArrowLeft')) this.yaw += 0.03; if (input.down('ArrowRight')) this.yaw -= 0.03;
    if (input.down('ArrowUp')) this.pitch += 0.02; if (input.down('ArrowDown')) this.pitch -= 0.02;
    this.pitch = Math.max(-1.2, Math.min(0.5, this.pitch));
  }
}
