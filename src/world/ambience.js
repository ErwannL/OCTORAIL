import * as THREE from 'three';
import { Kit, G, mat, MAT } from './kit.js';
import { sectorIndex, BIOMES } from './biomes.js';
import { mulberry } from '../util/noise.js';
import { FLORA_MAT_DS, FLORA_MAT, grassTuftGeometry, flowerPatchGeometry, birdParts } from './flora.js';

const PI = Math.PI, H = Math.PI / 2;

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
  const spread = (geo, m, sector, count, rMin, near) => {
    count = Math.max(0, Math.round(count * density)); if (!count) return;
    const inst = new THREE.InstancedMesh(geo, m, count); const tint = new THREE.Color(); const M = new THREE.Matrix4(); let c = 0;
    const edges = near ? net.edges.filter(q => q.biome === sector) : null;
    for (let t = 0; t < count * 10 && c < count; t++) {
      let x, z;
      if (near && rnd() < 0.7) { const ed = edges[Math.floor(rnd() * edges.length)]; const p = ed.pts[Math.floor(rnd() * ed.pts.length)]; x = p.x + (rnd() - 0.5) * 60; z = p.z + (rnd() - 0.5) * 60; }
      else { const r = rMin + rnd() * 1250, a = rnd() * PI * 2; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      if (sectorIndex(x, z) !== sector || Math.hypot(x, z) < rMin || net.nearest(x, z, 3.2)) continue;
      const s = 0.7 + rnd() * 1.1;
      M.compose(new THREE.Vector3(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(s, s, s)); inst.setMatrixAt(c, M); inst.setColorAt(c, tint.setScalar(0.8 + rnd() * 0.4)); c++;
    }
    inst.count = c; inst.receiveShadow = true; scene.add(inst);
  };
  spread(grassTuftGeometry('#7a6228', '#d8bc6a', 1.0, 10, 1, true), FLORA_MAT_DS, 4, 3200, 120, true);
  spread(grassTuftGeometry('#6a5a28', '#b09a50', 0.65, 9, 2), FLORA_MAT_DS, 4, 1600, 120, true);
  spread(grassTuftGeometry('#8a8a50', '#e0d49a', 1.3, 7, 3, true), FLORA_MAT_DS, 4, 700, 120, true);
  spread(flowerPatchGeometry(['#f0903a', '#c050c0', '#f0d040'], 1), FLORA_MAT, 4, 260, 120, true);
  spread(grassTuftGeometry('#9ab0b8', '#f4fbff', 0.6, 9, 4), FLORA_MAT_DS, 5, 2400, 120, true);
  spread(grassTuftGeometry('#3a5a48', '#9ac0a8', 0.8, 8, 5, true), FLORA_MAT_DS, 5, 700, 120, true);
  spread(flowerPatchGeometry(['#9ad0ff', '#e8f4ff', '#c0a0ff'], 2), FLORA_MAT, 5, 160, 120, true);
}

// Vautours qui tournent au-dessus du western, corbeaux des neiges en Gelure
export function buildBirds(scene, terrain) {
  const birds = [];
  const parts = {
    '#2a2420': birdParts({ plume: '#2a2420', head: '#c96a5a', belly: '#3a302a', tip: '#6a5a4a', beak: '#d8c8a0', span: 3.4, size: 1.1 }),
    '#e8eef4': birdParts({ plume: '#e8eef4', head: '#dfe6ec', belly: '#f8fbfd', tip: '#4a4a56', beak: '#e0a030', span: 2.6, size: 0.9, hooked: false }),
  };
  const make = (color) => {
    const g = new THREE.Group(), P = parts[color];
    g.add(new THREE.Mesh(P.body, FLORA_MAT));
    const wings = [];
    for (const s of [-1, 1]) { const w = new THREE.Group(), mesh = new THREE.Mesh(P.wing, FLORA_MAT_DS); mesh.scale.x = s; w.add(mesh); w.position.set(s * 0.18, 0.12, 0.1); g.add(w); wings.push(w); }
    g.userData.wings = wings; return g;
  };
  const flock = (center, n, color, r0) => { for (let i = 0; i < n; i++) { const b = make(color); scene.add(b); birds.push({ b, c: center, r: r0 + Math.random() * 30, h: 45 + Math.random() * 25, sp: 0.15 + Math.random() * 0.1, ph: Math.random() * 7 }); } };
  const W = new THREE.Vector3(Math.cos(PI) * 700, 0, -Math.sin(PI) * 700); W.y = terrain.heightAt(W.x, W.z);
  const W2 = new THREE.Vector3(Math.cos(PI) * 1150, 0, 0); W2.y = terrain.heightAt(W2.x, W2.z);
  const S = new THREE.Vector3(Math.cos(PI * 1.25) * 900, 0, -Math.sin(PI * 1.25) * 900); S.y = terrain.heightAt(S.x, S.z);
  flock(W, 5, '#2a2420', 40); flock(W2, 4, '#2a2420', 30); flock(S, 6, '#e8eef4', 50);
  return { update(dt, t) { for (const o of birds) { const a = t * o.sp + o.ph; o.b.position.set(o.c.x + Math.cos(a) * o.r, o.c.y + o.h + Math.sin(t * 0.5 + o.ph) * 4, o.c.z + Math.sin(a) * o.r); o.b.rotation.set(0, -a, 0.35); const f = Math.sin(t * 3 + o.ph); o.b.userData.wings[0].rotation.z = -f * 0.22 - 0.05; o.b.userData.wings[1].rotation.z = f * 0.22 + 0.05; } } };
}

// Drapeaux des mondes qui flottent au Moyeu (géométrie animée)
export function buildFlags(scene) {
  const flags = [], fk = new Kit(), iron = MAT.iron(), brass = MAT.brass(), stoneM = mat('#7d6c56', { roughness: 0.95 });
  BIOMES.forEach((b, i) => {
    const a = i * PI / 4 + PI / 8, r = 45, x = Math.cos(a) * r, z = -Math.sin(a) * r;
    // mât ouvragé : socle en pierre, fût fuselé, anneaux, balcon d'étai, poulie, vrille, boule de laiton
    fk.add(G.cyl(0.7, 0.9, 0.8, 8), stoneM, { p: [x, 0.8, z] }); fk.add(G.cyl(0.45, 0.6, 0.5, 8), brass, { p: [x, 1.45, z] });
    fk.add(G.cyl(0.07, 0.14, 8.8, 10), iron, { p: [x, 5.6, z] });
    for (const y of [3, 6.5]) fk.add(G.tor(0.17, 0.045, 4, 10), brass, { p: [x, y, z], r: [H, 0, 0] });
    for (let k2 = 0; k2 < 3; k2++) { const aa = k2 * PI * 2 / 3; fk.add(G.box(0.07, 1.6, 0.07), iron, { p: [x + Math.cos(aa) * 0.55, 2.2, z + Math.sin(aa) * 0.55], r: [Math.sin(aa) * 0.3, 0, -Math.cos(aa) * 0.3] }); }
    fk.add(G.sph(0.2, 10, 8), brass, { p: [x, 10.1, z] }); fk.add(G.cone(0.1, 0.5, 6), brass, { p: [x, 10.45, z] });
    fk.add(G.box(0.07, 0.07, 1.0), iron, { p: [x, 9.6, z] });
    const geo = new THREE.PlaneGeometry(3.2, 1.8, 16, 6); geo.translate(1.6, 0, 0);
    const m = new THREE.Mesh(geo, mat(b.skyBot, { roughness: 0.85, side: THREE.DoubleSide, emissive: b.skyBot, emissiveIntensity: b.open ? 0.25 : 0.05 }));
    m.position.set(x, 9, z); scene.add(m);
    flags.push({ m, base: geo.attributes.position.array.slice(), ph: i });
  });
  const fg = fk.build(); scene.add(fg);
  let tick = 0;
  return { update(t, cam) {
    if (cam && cam.x * cam.x + cam.z * cam.z > 180 * 180) return; // drapeaux invisibles loin du Moyeu
    const doN = !(tick++ & 1);
    for (const f of flags) { const p = f.m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = f.base[i * 3]; p.setZ(i, Math.sin(x * 1.6 - t * 5 + f.ph) * 0.25 * (x / 3.2)); p.setY(i, f.base[i * 3 + 1] - (x / 3.2) * 0.2); } p.needsUpdate = true; if (doN) f.m.geometry.computeVertexNormals(); f.m.rotation.y = 0.4 + Math.sin(t * 0.3 + f.ph) * 0.3; } } };
}

// Lampadaires du Moyeu (bulbes émissifs, pas de lumière dynamique)
export function buildLamps(scene) {
  const k = new Kit(), iron = MAT.iron(), brass = MAT.brass(), bulb = mat('#000', { emissive: '#ffcf7a', emissiveIntensity: 3 }), stone = mat('#a8977c', { roughness: 0.95 });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * PI * 2 + PI / 16, r = 38, x = Math.cos(a) * r, z = -Math.sin(a) * r, ca = Math.cos(a), sa = Math.sin(a);
    // fût cannelé sur piédestal, collerettes en laiton, console courbée, lanterne à 4 faces et chapeau
    k.add(G.cyl(0.38, 0.45, 0.5, 8), stone, { p: [x, 0.45, z] }); k.add(G.cyl(0.26, 0.34, 0.4, 8), iron, { p: [x, 0.9, z] });
    k.add(G.cyl(0.1, 0.18, 4.4, 8), iron, { p: [x, 3.1, z] }); for (const y of [1.4, 3.0, 4.9]) k.add(G.tor(0.15, 0.04, 4, 10), brass, { p: [x, y, z], r: [H, 0, 0] });
    k.add(G.sph(0.17, 8, 6), brass, { p: [x, 5.35, z] });
    k.add(G.tor(0.55, 0.045, 4, 12, PI), iron, { p: [x + ca * 0.55, 5.45, z - sa * 0.55], r: [0, a, 0] });
    const lx = x + ca * 1.1, lz = z - sa * 1.1;
    k.add(G.cyl(0.04, 0.04, 0.3, 5), iron, { p: [lx, 5.6, lz] }); k.add(G.cyl(0.32, 0.18, 0.12, 6), brass, { p: [lx, 5.3, lz] });
    k.add(G.cyl(0.26, 0.2, 0.55, 6), bulb, { p: [lx, 5.0, lz] }); k.add(G.cyl(0.1, 0.1, 0.1, 6), brass, { p: [lx, 4.68, lz] });
    for (let c = 0; c < 6; c++) { const cc = c * PI / 3; k.add(G.box(0.03, 0.6, 0.03), iron, { p: [lx + Math.cos(cc) * 0.24, 5.0, lz + Math.sin(cc) * 0.24] }); }
    k.add(G.cone(0.34, 0.35, 6), iron, { p: [lx, 5.5, lz] });
    // banc de pierre et jardinière fleurie
    const px = x - sa * 2, pz = z - ca * 2;
    k.add(G.cyl(0.6, 0.5, 0.6, 10), mat('#8a5a3a'), { p: [px, 0.5, pz] }); k.add(G.tor(0.6, 0.05, 4, 10), brass, { p: [px, 0.8, pz], r: [H, 0, 0] });
    for (let f = 0; f < 6; f++) k.add(G.sph(0.14, 6, 5), mat(['#e05ab0', '#ffd24a', '#ff7a5a'][f % 3]), { p: [px + Math.cos(f) * 0.35, 0.95, pz + Math.sin(f) * 0.35] });
    k.add(G.sph(0.45, 8, 6), mat('#4f8a3a', { flatShading: true }), { p: [px, 0.85, pz], s: [1, 0.5, 1] });
  }
  scene.add(k.build());
}
