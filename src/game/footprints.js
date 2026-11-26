import * as THREE from 'three';
import { sectorIndex } from '../world/biomes.js';

// Traces de pas : petites empreintes posées au sol (sable, neige), qui s'effacent lentement.
export class Footprints {
  constructor(scene, terrain, max = 260) {
    this.terrain = terrain; this.max = max; this.i = 0; this.life = new Float32Array(max); this.alpha = new Float32Array(max);
    const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 40, 4, 32, 44, 30); grad.addColorStop(0, 'rgba(0,0,0,0.75)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.beginPath(); g.ellipse(32, 44, 20, 34, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.5)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(18 + k * 9, 12, 3, 4, 0, 0, 7); g.fill(); } // crampons
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(0.3, 0.46); geo.rotateX(-Math.PI / 2);
    geo.setAttribute('a', new THREE.InstancedBufferAttribute(this.alpha, 1));
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: '#2a160a', polygonOffset: true, polygonOffsetFactor: -2 });
    this.mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float a; varying float vA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = a;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vA;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vA;');
    };
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max); this.mesh.frustumCulled = false; this.mesh.userData.noCollide = true;
    const m = new THREE.Matrix4().makeScale(0, 0, 0); for (let k = 0; k < max; k++) this.mesh.setMatrixAt(k, m);
    scene.add(this.mesh);
    this.acc = 0; this.side = 1; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  update(dt, player) {
    let dirty = false;
    for (let k = 0; k < this.max; k++) if (this.life[k] > 0) { this.life[k] -= dt; this.alpha[k] = Math.max(0, Math.min(1, this.life[k] / 6)); dirty = true; }
    const P = player.pos, moving = Math.hypot(player.vel.x, player.vel.z);
    if (player.mode === 'foot' && player.onGround && moving > 0.5 && Math.hypot(P.x, P.z) > 48) {
      this.acc += moving * dt;
      const stride = player.sprinting ? 1.3 : 0.75;
      if (this.acc > stride) {
        this.acc = 0; this.side = -this.side;
        const yaw = Math.atan2(player.vel.x, player.vel.z), sx = Math.cos(yaw) * 0.14 * this.side, sz = -Math.sin(yaw) * 0.14 * this.side;
        const x = P.x + sx, z = P.z + sz, y = this.terrain.heightAt(x, z);
        if (Math.abs(y - P.y) < 0.25) { // seulement sur le sol naturel (pas sur les quais / planchers)
          const snow = sectorIndex(x, z) === 5;
          this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); this._p.set(x, y + 0.02, z);
          this._m.compose(this._p, this._q, this._s); this.mesh.setMatrixAt(this.i, this._m);
          this.life[this.i] = snow ? 40 : 22; this.alpha[this.i] = 1; this.i = (this.i + 1) % this.max;
          this.mesh.instanceMatrix.needsUpdate = true; dirty = true;
        }
      }
    }
    if (dirty) this.mesh.geometry.attributes.a.needsUpdate = true;
  }
}
