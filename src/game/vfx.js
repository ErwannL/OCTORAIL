import * as THREE from 'three';

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
}
const TEX = softTex();

// Système de particules générique (pool) : position, vitesse, durée, taille, couleur.
export class Particles {
  constructor(scene, max, { additive = false, gravity = 0, drag = 0.5, grow = 1.5 } = {}) {
    this.max = max; this.gravity = gravity; this.drag = drag; this.grow = grow;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: TEX }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC;
        void main(){ vC=color; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*600./-mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a*t.a); if(gl_FragColor.a<0.01) discard; }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; scene.add(this.points);
    this.p = Array.from({ length: max }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), x: new THREE.Vector3(), s: 1, c: new THREE.Color(), a: 1 }));
    this.i = 0; this.alive = 0;
  }
  emit(x, v, { life = 2, size = 1, color = '#fff', alpha = 1 } = {}) {
    const p = this.p[this.i]; this.i = (this.i + 1) % this.max;
    this.dirty = true; p.x.copy(x); p.v.copy(v); p.life = p.max = life; p.s = size; p.c.set(color); p.a = alpha;
  }
  update(dt) {
    if (!this.dirty && this.alive <= 0) { this.points.visible = false; return; }
    this.points.visible = true;
    this.dirty = false;
    let alive = 0;
    for (let k = 0; k < this.max; k++) {
      const p = this.p[k];
      if (p.life > 0) {
        alive++; p.life -= dt; p.v.y += this.gravity * dt; p.v.multiplyScalar(1 - this.drag * dt); p.x.addScaledVector(p.v, dt);
        const f = Math.max(0, p.life / p.max);
        const i3 = k * 3, i4 = k * 4;
        this.pos[i3] = p.x.x; this.pos[i3 + 1] = p.x.y; this.pos[i3 + 2] = p.x.z;
        this.col[i4] = p.c.r; this.col[i4 + 1] = p.c.g; this.col[i4 + 2] = p.c.b; this.col[i4 + 3] = p.a * Math.min(1, f * 2) * Math.min(1, (1 - f) * 8);
        this.size[k] = p.s * (1 + (1 - f) * this.grow);
      } else if (this.size[k] !== 0) { this.size[k] = 0; this.col[k * 4 + 3] = 0; }
    }
    this.alive = alive;
    const a = this.points.geometry.attributes; a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
  }
}

// Météo : flocons / poussière autour de la caméra
export class Weather {
  constructor(scene, n = 2500) {
    const g = new THREE.BufferGeometry(); this.n = n;
    this.pos = new Float32Array(n * 3); this.base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.base[i * 3] = Math.random() * 120 - 60; this.base[i * 3 + 1] = Math.random() * 60; this.base[i * 3 + 2] = Math.random() * 120 - 60; }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ size: 0.35, map: TEX, transparent: true, depthWrite: false, color: '#ffffff', opacity: 0 });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points);
    this.t = 0; this.use = n;
  }
  setDensity(f) { this.use = Math.max(0, Math.min(this.n, Math.round(this.n * f))); this.points.geometry.setDrawRange(0, this.use); }
  update(dt, cam, kind, amount) {
    this.t += dt;
    this.points.visible = this.mat.opacity > 0.02 || amount > 0;
    if (!this.points.visible) { this.mat.opacity += (amount - this.mat.opacity) * Math.min(1, dt * 1.5); return; }
    const fall = kind === 'snow' ? 3 : 0.5, sway = kind === 'snow' ? 1.5 : 6;
    this.mat.color.set(kind === 'snow' ? '#ffffff' : '#e8b070');
    this.mat.size = kind === 'snow' ? 0.35 : 0.18;
    this.mat.opacity += ((amount) - this.mat.opacity) * Math.min(1, dt * 1.5);
    for (let i = 0; i < this.use; i++) {
      let y = (this.base[i * 3 + 1] - this.t * fall * (0.6 + (i % 7) / 10)) % 60; if (y < 0) y += 60;
      let x = (this.base[i * 3] + Math.sin(this.t * 0.7 + i) * sway + this.t * (kind === 'dust' ? 8 : 0)) % 120; if (x < -60) x += 120; if (x > 60) x -= 120;
      this.pos[i * 3] = cam.x + x; this.pos[i * 3 + 1] = cam.y - 20 + y; this.pos[i * 3 + 2] = cam.z + this.base[i * 3 + 2];
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
