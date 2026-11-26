import * as THREE from 'three';
import { Kit, G, mat, MAT } from './kit.js';
import { sectorIndex, BIOMES } from './biomes.js';
import { mulberry } from '../util/noise.js';

const PI = Math.PI;

// Carte d'environnement (reflets réalistes du laiton/acier) générée depuis un ciel simple.
export class EnvLighting {
  constructor(renderer, scene) {
    this.pmrem = new THREE.PMREMGenerator(renderer); this.scene = scene;
    this.envScene = new THREE.Scene();
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, ground: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; uniform vec3 ground; varying vec3 v; void main(){ vec3 c = v.y > 0. ? mix(bot, top, pow(v.y, .6)) : mix(bot, ground, min(1., -v.y*4.)); float s = pow(max(dot(v, normalize(vec3(.45,.75,.35))),0.), 300.)*30.; gl_FragColor = vec4(c + s, 1.); }',
    });
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.mat));
    this.rt = null; this.key = '';
  }
  update(top, bot, ground) {
    const key = top.getHexString() + bot.getHexString();
    if (key === this.key) return; this.key = key;
    this.mat.uniforms.top.value.copy(top); this.mat.uniforms.bot.value.copy(bot); this.mat.uniforms.ground.value.copy(ground);
    const old = this.rt; this.rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    this.scene.environment = this.rt.texture; this.scene.environmentIntensity = 0.55;
    old?.dispose();
  }
}

// Étalonnage : vignette + contraste doux + grain léger (passe plein écran)
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.32 }, warm: { value: 0.03 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float vignette; uniform float warm; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - .5; float v = 1. - dot(d, d) * vignette * 2.2;
      c.rgb *= v;
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3. - 2. * c.rgb), 0.18); // contraste en S
      c.r += warm; c.b -= warm * .6;
      c.rgb += (h(vUv * 800.) - .5) * 0.018;
      gl_FragColor = c;
    }`,
};

// Touffes d'herbe sèche / de neige / fleurs du Moyeu (instanciées)
export function buildGrass(scene, terrain, net, density = 1) {
  const rnd = mulberry(77);
  const tuft = (color, h, n = 5) => { const k = new Kit(), m = mat(color, { roughness: 0.9, side: THREE.DoubleSide }); for (let i = 0; i < n; i++) { const a = i / n * PI * 2; const bh = h * (0.6 + 0.4 * ((i * 37) % 10) / 10); k.add(new THREE.ConeGeometry(0.06, bh, 3, 1, true), m, { p: [Math.cos(a) * 0.12, h * 0.4, Math.sin(a) * 0.12], r: [Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35] }); } return [k.geometry(), m]; };
  const spread = (geo, m, sector, count, rMin, near) => {
    count = Math.max(0, Math.round(count * density)); if (!count) return;
    const inst = new THREE.InstancedMesh(geo, m, count); const M = new THREE.Matrix4(); let c = 0;
    const edges = near ? net.edges.filter(q => q.biome === sector) : null;
    for (let t = 0; t < count * 10 && c < count; t++) {
      let x, z;
      if (near && rnd() < 0.7) { const ed = edges[Math.floor(rnd() * edges.length)]; const p = ed.pts[Math.floor(rnd() * ed.pts.length)]; x = p.x + (rnd() - 0.5) * 60; z = p.z + (rnd() - 0.5) * 60; }
      else { const r = rMin + rnd() * 1250, a = rnd() * PI * 2; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      if (sectorIndex(x, z) !== sector || Math.hypot(x, z) < rMin || net.nearest(x, z, 3.2)) continue;
      const s = 0.7 + rnd() * 1.1;
      M.compose(new THREE.Vector3(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(s, s, s)); inst.setMatrixAt(c++, M);
    }
    inst.count = c; inst.receiveShadow = true; scene.add(inst);
  };
  const [g1, m1] = tuft('#c9a35a', 0.9); spread(g1, m1, 4, 3500, 120, true);
  const [g2, m2] = tuft('#8a7a3a', 0.6, 6); spread(g2, m2, 4, 1500, 120, true);
  const [g3, m3] = tuft('#f4fbff', 0.5, 5); spread(g3, m3, 5, 2500, 120, true);
  const [g4, m4] = tuft('#6a8a5a', 0.7, 5); spread(g4, m4, 5, 600, 120, true);
}

// Vautours qui tournent au-dessus du western, corbeaux des neiges en Gelure
export function buildBirds(scene, terrain) {
  const birds = [];
  const make = (color) => {
    const g = new THREE.Group(), m = mat(color, { roughness: 0.8, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.9, 4, 8), m); body.rotation.x = PI / 2; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(color === '#2a2420' ? '#c96a5a' : '#222')); head.position.z = 0.75; g.add(head);
    const wings = [];
    for (const s of [-1, 1]) { const w = new THREE.Group(); const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(2.4, 0.3); sh.lineTo(2.8, -0.2); sh.lineTo(1.6, -0.6); sh.lineTo(0, -0.5); const mesh = new THREE.Mesh(new THREE.ShapeGeometry(sh), m); mesh.rotation.x = -PI / 2; mesh.scale.x = s; w.add(mesh); g.add(w); wings.push(w); }
    g.userData.wings = wings; return g;
  };
  const flock = (center, n, color, r0) => { for (let i = 0; i < n; i++) { const b = make(color); scene.add(b); birds.push({ b, c: center, r: r0 + Math.random() * 30, h: 45 + Math.random() * 25, sp: 0.15 + Math.random() * 0.1, ph: Math.random() * 7 }); } };
  const W = new THREE.Vector3(Math.cos(PI) * 700, 0, -Math.sin(PI) * 700); W.y = terrain.heightAt(W.x, W.z);
  const W2 = new THREE.Vector3(Math.cos(PI) * 1150, 0, 0); W2.y = terrain.heightAt(W2.x, W2.z);
  const S = new THREE.Vector3(Math.cos(PI * 1.25) * 900, 0, -Math.sin(PI * 1.25) * 900); S.y = terrain.heightAt(S.x, S.z);
  flock(W, 5, '#2a2420', 40); flock(W2, 4, '#2a2420', 30); flock(S, 6, '#e8eef4', 50);
  return { update(dt, t) { for (const o of birds) { const a = t * o.sp + o.ph; o.b.position.set(o.c.x + Math.cos(a) * o.r, o.c.y + o.h + Math.sin(t * 0.5 + o.ph) * 4, o.c.z + Math.sin(a) * o.r); o.b.rotation.set(0, -a, 0.35); const f = Math.sin(t * 3 + o.ph); o.b.userData.wings[0].rotation.z = f * 0.25; o.b.userData.wings[1].rotation.z = -f * 0.25; } } };
}

// Drapeaux des mondes qui flottent au Moyeu (géométrie animée)
export function buildFlags(scene) {
  const flags = [];
  BIOMES.forEach((b, i) => {
    const a = i * PI / 4 + PI / 8, r = 45;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 10, 8), MAT.iron()); pole.position.set(Math.cos(a) * r, 5, -Math.sin(a) * r); pole.castShadow = true; scene.add(pole);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), MAT.brass()); tip.position.set(pole.position.x, 10.1, pole.position.z); scene.add(tip);
    const geo = new THREE.PlaneGeometry(3.2, 1.8, 16, 6); geo.translate(1.6, 0, 0);
    const m = new THREE.Mesh(geo, mat(b.skyBot, { roughness: 0.85, side: THREE.DoubleSide, emissive: b.skyBot, emissiveIntensity: b.open ? 0.25 : 0.05 }));
    m.position.set(pole.position.x, 9, pole.position.z); scene.add(m);
    flags.push({ m, base: geo.attributes.position.array.slice(), ph: i });
  });
  let tick = 0;
  return { update(t, cam) {
    if (cam && cam.x * cam.x + cam.z * cam.z > 180 * 180) return; // drapeaux invisibles loin du Moyeu
    const doN = !(tick++ & 1);
    for (const f of flags) { const p = f.m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = f.base[i * 3]; p.setZ(i, Math.sin(x * 1.6 - t * 5 + f.ph) * 0.25 * (x / 3.2)); p.setY(i, f.base[i * 3 + 1] - (x / 3.2) * 0.2); } p.needsUpdate = true; if (doN) f.m.geometry.computeVertexNormals(); f.m.rotation.y = 0.4 + Math.sin(t * 0.3 + f.ph) * 0.3; } } };
}

// Lampadaires du Moyeu (bulbes émissifs, pas de lumière dynamique)
export function buildLamps(scene) {
  const k = new Kit(), iron = MAT.iron(), brass = MAT.brass(), bulb = mat('#000', { emissive: '#ffcf7a', emissiveIntensity: 3 });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * PI * 2 + PI / 16, r = 38, x = Math.cos(a) * r, z = -Math.sin(a) * r;
    k.add(G.cyl(0.12, 0.2, 5, 8), iron, { p: [x, 2.5, z] }); k.add(G.cyl(0.3, 0.35, 0.4, 8), iron, { p: [x, 0.3, z] });
    k.add(G.tor(0.4, 0.05, 4, 10, PI), iron, { p: [x + Math.cos(a) * 0.4, 5.1, z - Math.sin(a) * 0.4], r: [0, a, 0] });
    k.add(G.lathe([[0.3, 0], [0.35, 0.1], [0.15, 0.5], [0, 0.55]], 10), brass, { p: [x + Math.cos(a) * 0.8, 5.35, z - Math.sin(a) * 0.8] });
    k.add(G.sph(0.18, 10, 8), bulb, { p: [x + Math.cos(a) * 0.8, 5.25, z - Math.sin(a) * 0.8] });
    // jardinière fleurie
    k.add(G.cyl(0.6, 0.5, 0.6, 10), mat('#8a5a3a'), { p: [x - Math.sin(a) * 2, 0.5, z - Math.cos(a) * 2] });
    for (let f = 0; f < 6; f++) k.add(G.sph(0.14, 6, 5), mat(['#e05ab0', '#ffd24a', '#ff7a5a'][f % 3]), { p: [x - Math.sin(a) * 2 + Math.cos(f) * 0.35, 0.95, z - Math.cos(a) * 2 + Math.sin(f) * 0.35] });
    k.add(G.sph(0.45, 8, 6), mat('#4f8a3a', { flatShading: true }), { p: [x - Math.sin(a) * 2, 0.85, z - Math.cos(a) * 2], s: [1, 0.5, 1] });
  }
  scene.add(k.build());
}
