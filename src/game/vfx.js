import * as THREE from 'three';

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
}
// bouffée de fumée : amas de lobes doux (bord irrégulier, jamais carré) — généré une fois
function puffTex() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * N * 0.2, x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, R = N * (0.12 + rnd() * 0.14);
    const r = g.createRadialGradient(x, y, 0, x, y, R); r.addColorStop(0, 'rgba(255,255,255,0.32)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, N, N);
  }
  // fondu circulaire pour garantir des bords nuls
  const im = g.getImageData(0, 0, N, N), D = im.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2), f = Math.max(0, Math.min(1, (1 - d) * 2.2)); const i = (y * N + x) * 4; D[i] = D[i + 1] = D[i + 2] = 255; D[i + 3] *= f * f; }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); return t;
}
const TEX = softTex(), PUFF = puffTex();
const _c = new THREE.Color();

// Système de particules générique (pool) : position, vitesse, durée, taille, couleur.
// Normal : bouffées texturées qui tournent, gonflent, s'éclaircissent en vieillissant et dérivent avec le vent.
// Additif : étincelles qui refroidissent (jaune -> orange -> rouge sombre).
export class Particles {
  constructor(scene, max, { additive = false, gravity = 0, drag = 0.5, grow = 1.5 } = {}) {
    this.max = max; this.gravity = gravity; this.drag = drag; this.grow = grow; this.additive = additive;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max); this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: additive ? TEX : PUFF } },
      vertexShader: `attribute float size; attribute vec4 color; attribute float rot; varying vec4 vC; varying vec2 vR;
        void main(){ vC=color; vR=vec2(cos(rot),sin(rot)); vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = min(size*600./-mv.z, 512.); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; varying vec2 vR;
        void main(){ vec2 p = gl_PointCoord-0.5; p = vec2(p.x*vR.x-p.y*vR.y, p.x*vR.y+p.y*vR.x)+0.5;
          vec4 t = texture2D(map, p); float a = vC.a*t.a; if(a<0.01) discard;
          gl_FragColor = vec4(vC.rgb*(0.82+0.18*(1.-p.y)), a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; scene.add(this.points);
    this.p = Array.from({ length: max }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), x: new THREE.Vector3(), s: 1, c: new THREE.Color(), c2: new THREE.Color(), a: 1, r: 0, w: 0 }));
    this.i = 0; this.alive = 0;
  }
  // options : to = couleur de fin de vie (sinon automatique), spin = vitesse de rotation
  emit(x, v, { life = 2, size = 1, color = '#fff', alpha = 1, to = null, spin = null } = {}) {
    const p = this.p[this.i]; this.i = (this.i + 1) % this.max;
    this.dirty = true; p.x.copy(x); p.v.copy(v); p.life = p.max = life * (0.85 + Math.random() * 0.3); p.s = size; p.c.set(color); p.a = alpha;
    if (to) p.c2.set(to);
    else if (this.additive) p.c2.copy(p.c).multiply(_c.setRGB(0.9, 0.25, 0.05));   // l'étincelle refroidit
    else { const l = p.c.r * 0.3 + p.c.g * 0.59 + p.c.b * 0.11; p.c2.copy(p.c).lerp(_c.setRGB(l, l, l), 0.5).lerp(_c.setRGB(0.85, 0.86, 0.88), 0.3); } // la fumée se dilue et grisaille
    p.r = Math.random() * 6.283; p.w = spin ?? (Math.random() - 0.5) * (this.additive ? 0 : 1.2);
  }
  update(dt) {
    if (!this.dirty && this.alive <= 0) { this.points.visible = false; return; }
    this.points.visible = true;
    this.dirty = false;
    let alive = 0;
    const W = Particles.wind, wk = this.additive ? 0 : Math.min(1, dt * 0.6);
    for (let k = 0; k < this.max; k++) {
      const p = this.p[k];
      if (p.life > 0) {
        alive++; p.life -= dt; p.v.y += this.gravity * dt; p.v.multiplyScalar(1 - this.drag * dt);
        if (wk) { p.v.x += (W.x - p.v.x) * wk * (1 - p.life / p.max); p.v.z += (W.z - p.v.z) * wk * (1 - p.life / p.max); }
        p.x.addScaledVector(p.v, dt); p.r += p.w * dt;
        const f = Math.max(0, p.life / p.max), g = 1 - f;
        const i3 = k * 3, i4 = k * 4;
        this.pos[i3] = p.x.x; this.pos[i3 + 1] = p.x.y; this.pos[i3 + 2] = p.x.z;
        const e = this.additive ? g * g : g;
        this.col[i4] = p.c.r + (p.c2.r - p.c.r) * e; this.col[i4 + 1] = p.c.g + (p.c2.g - p.c.g) * e; this.col[i4 + 2] = p.c.b + (p.c2.b - p.c.b) * e;
        this.col[i4 + 3] = p.a * Math.min(1, f * 2) * Math.min(1, g * (this.additive ? 20 : 6));
        this.size[k] = p.s * (1 + Math.sqrt(g) * this.grow); this.rot[k] = p.r;
      } else if (this.size[k] !== 0) { this.size[k] = 0; this.col[k * 4 + 3] = 0; }
    }
    this.alive = alive;
    const a = this.points.geometry.attributes; a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.rot.needsUpdate = true;
  }
}
// vent global (m/s) pour la fumée et la vapeur — main.js / la météo peuvent le modifier
Particles.wind = new THREE.Vector3(1.6, 0, 0.7);

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
