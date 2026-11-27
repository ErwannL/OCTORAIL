// Monde « entrailles » (Sud-Est) : la Cathédrale-Spore, forêt de champignons bioluminescents,
// nappes de brouillard toxique, mares de boue chaude, ver-foreuse, Lumignons et Taupe-Chef Orvald.
import * as THREE from 'three';
import { Kit, G, mat, glow, MAT } from '../kit.js';
import { mulberry } from '../../util/noise.js';
import { WORLD_LORE } from '../../data/lore.js';

const AX = Math.SQRT1_2; // axe du secteur : (cos45°, +sin45°) en (x, z)
const LORE = WORLD_LORE.find(w => w.id === 'entrailles');

// Matériau émissif qui « pulse » : onde bioluminescente partant de la Cathédrale (position monde par instance)
function pulseMat(color, emissive, U, intensity = 1.6) {
  const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.55, flatShading: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uT = U.t; sh.uniforms.uC = U.c;
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 wpp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wpp = instanceMatrix * wpp;
      #endif
      vWP = (modelMatrix * wpp).xyz;`);
    sh.fragmentShader = 'uniform float uT; uniform vec3 uC; varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float dd = length(vWP.xz - uC.xz);
      float wv = 0.5 + 0.5 * sin(dd * 0.035 - uT * 1.7);
      totalEmissiveRadiance *= 0.3 + 1.1 * wv * wv * wv + 0.12 * sin(vWP.y * 0.8 + uT * 2.3);`);
  };
  m.customProgramCacheKey = () => 'entr-pulse';
  return m;
}

function radialTex(inner = '#ffffff') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildWorld(scene, terrain, net, ctx) {
  const rnd = mulberry(70077);
  const H = (x, z) => terrain.heightAt(x, z);
  const clear = (x, z, d) => net.nearest(x, z, d) === null;
  const inSector = (x, z) => { const r = Math.hypot(x, z), a = Math.atan2(z, x) * 180 / Math.PI; return r > 110 && r < 1400 && Math.abs(a - 45) < 21; };
  const footClear = (x, z, rad, d) => { if (!clear(x, z, d)) return false; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (!clear(x + Math.cos(a) * rad, z + Math.sin(a) * rad, d)) return false; } return true; };
  const gmin = (x, z, rad) => { let m = H(x, z); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; m = Math.min(m, H(x + Math.cos(a) * rad, z + Math.sin(a) * rad), H(x + Math.cos(a) * rad * 0.5, z + Math.sin(a) * rad * 0.5)); } return m; };
  // cherche un emplacement libre en spirale autour d'une cible
  const findSpot = (tx, tz, rad, d) => { for (let i = 0; i < 400; i++) { const a = i * 2.4, r = Math.sqrt(i) * 6; const x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r; if (inSector(x, z) && footClear(x, z, rad, d)) return [x, z]; } return null; };
  const scatter = (n, rMin, rMax, d, cb) => { let c = 0; for (let t = 0; t < n * 25 && c < n; t++) { const r = rMin + rnd() * (rMax - rMin), a = (45 + (rnd() - 0.5) * 40) * Math.PI / 180; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (!clear(x, z, d)) continue; if (cb(x, z, c) !== false) c++; } };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
  const m4 = (x, y, z, ry = 0, s = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s));
  const inst = (geo, material, list, shadow = false) => { const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length)); list.forEach((m, i) => im.setMatrixAt(i, m)); im.count = list.length; im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); return im; };
  const placed = []; // [nom, x, yBase, z] pour vérifications
  window.__entr = { placed };

  const U = { t: { value: 0 }, c: { value: new THREE.Vector3() } };
  const C = { cream: mat('#d9cdb4', { roughness: 0.8, flatShading: true }), stemDark: mat('#a99a86', { roughness: 0.85, flatShading: true }),
    capV: mat('#5a2a78', { roughness: 0.6, flatShading: true }), rock: mat('#3a2a44', { roughness: 0.95, flatShading: true }),
    rock2: mat('#4b3a52', { roughness: 0.95, flatShading: true }), dark: mat('#0d0812', { roughness: 1 }), verdigris: mat('#4f8f7a', { metalness: 0.6, roughness: 0.45 }) };

  // ======================= 1. LA CATHÉDRALE-SPORE =======================
  const [CX, CZ] = findSpot(800, 585, 95, 25) || [800, 585];
  const CB = gmin(CX, CZ, 34) - 2.5; // base enfoncée
  U.c.value.set(CX, CB, CZ);
  const gillMat = new THREE.MeshStandardMaterial({ color: '#2b3a12', emissive: '#b6ff4a', emissiveIntensity: 0.8, roughness: 0.6, flatShading: true });
  const winMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#7dffb0', emissiveIntensity: 1.4 });
  const spotMat = pulseMat('#9fe03a', '#b6ff4a', U, 1.8);
  {
    const k = new Kit(), CAPY = 150;
    // pied creux (céramique) qui s'évase en racines
    k.add(G.lathe([[30, -3], [26, 2], [20, 10], [16, 28], [14, 60], [13.2, 100], [14.5, 125], [19, 140], [24, CAPY - 6], [0.1, CAPY - 6]], 28), C.cream);
    // racines-contreforts : chaque extrémité posée au sol
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + 0.2, ca = Math.cos(a), sa = Math.sin(a), R = 44 + rnd() * 10;
      const ex = CX + ca * R, ez = CZ + sa * R, ey = H(ex, ez) - CB - 1.6;
      k.add(G.tube([[ca * 14, 30, sa * 14], [ca * 24, 14, sa * 24], [ca * (R - 8), Math.max(ey + 2, 4), sa * (R - 8)], [ca * R, ey, sa * R]], 3.2, 20, 7), C.stemDark);
      placed.push(['racine', ex, CB + ey - 3.2, ez]);
    }
    // portails (gare souterraine) : 4 arches sombres cerclées de laiton
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a), ry = -a + Math.PI / 2;
      const by = H(CX + ca * 25, CZ + sa * 25) - CB;
      k.add(G.box(9, 14, 6), C.dark, { p: [ca * 23.5, by + 5, sa * 23.5], r: [0, ry, 0] });
      k.add(G.tor(5.2, 0.6, 6, 18, Math.PI), MAT.brass(), { p: [ca * 26.3, by + 10.5, sa * 26.3], r: [0, ry, 0] });
      for (const s of [-1, 1]) k.add(G.box(1.2, 11, 1.2), MAT.brass(), { p: [ca * 26.3 - sa * s * 5.2, by + 5, sa * 26.3 + ca * s * 5.2] });
      k.add(G.box(12, 0.6, 3), MAT.brass(), { p: [ca * 27.5, by + 15.6, sa * 27.5], r: [0, ry, 0] });
      // lanternes-spores de part et d'autre
      for (const s of [-1, 1]) k.add(G.sph(1.1, 8, 6), winMat, { p: [ca * 27.2 - sa * s * 7, by + 9, sa * 27.2 + ca * s * 7] });
    }
    // fenêtres en spirale sur le pied + balcons
    for (let j = 0; j < 7; j++) {
      const y = 26 + j * 15, r = j < 5 ? 14.6 - j * 0.25 : 13.6;
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + j * 0.31; k.add(G.box(1.6, 3.4, 1), winMat, { p: [Math.cos(a) * r, y, Math.sin(a) * r], r: [0, -a + Math.PI / 2, 0] }); }
    }
    for (const y of [52, 96]) { k.add(G.tor(16.5, 0.7, 6, 40), MAT.brass(), { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }); k.add(G.cyl(16.6, 16.6, 0.6, 36), MAT.iron(), { p: [0, y - 0.6, 0] }); }
    // chapeau
    const capPts = [[18, CAPY - 8], [40, CAPY - 4], [64, CAPY + 1], [86, CAPY + 8], [90, CAPY + 13], [86, CAPY + 22], [72, CAPY + 38], [52, CAPY + 54], [28, CAPY + 63], [0.1, CAPY + 66]];
    k.add(G.lathe(capPts, 36), C.capV);
    // pois luminescents posés sur le dôme
    for (let i = 0; i < 46; i++) {
      const f = 4 + rnd() * 4.2, j = Math.floor(f), t = f - j, a = rnd() * Math.PI * 2;
      const r = capPts[j][0] + (capPts[j + 1][0] - capPts[j][0]) * t, y = capPts[j][1] + (capPts[j + 1][1] - capPts[j][1]) * t, s = 2.2 + rnd() * 3.5;
      k.add(G.sph(1, 10, 6), spotMat, { p: [Math.cos(a) * (r - 0.4), y - 0.3, Math.sin(a) * (r - 0.4)], s: [s, s * 0.45, s], r: [0, 0, 0] });
    }
    // lamelles sous le chapeau (s'allument à l'approche d'un train)
    for (let i = 0; i < 90; i++) {
      const a = i / 90 * Math.PI * 2, r0 = 22, r1 = 86, y0 = CAPY - 7.5, y1 = CAPY + 7.5, rm = (r0 + r1) / 2;
      const len = Math.hypot(r1 - r0, y1 - y0), tilt = Math.atan2(y1 - y0, r1 - r0);
      // la lame est orientée le long du rayon : rotation Y puis inclinaison
      const g = G.box(len, 2.2, 0.45); g.rotateZ(tilt); g.translate(rm, (y0 + y1) / 2 - 1.6, 0); g.rotateY(-a);
      k.add(g, gillMat);
    }
    const grp = k.build(); grp.position.set(CX, CB, CZ); scene.add(grp);
    placed.push(['cathedrale', CX, CB, CZ]);
  }
  // spores flottantes autour de la cathédrale (shader, aucun coût CPU)
  const sporeMat = new THREE.ShaderMaterial({
    uniforms: { uT: U.t, map: { value: radialTex() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uT; attribute float ph; varying float vA;
      void main(){ vec3 p = position; float t = uT * 0.15 + ph * 10.0; p.y = mod(p.y - uT * 2.2 + ph * 150.0, 150.0);
        p.x += sin(t + p.y * 0.05) * 6.0; p.z += cos(t * 0.8 + p.y * 0.04) * 6.0; vA = smoothstep(0.0, 25.0, p.y) * (0.55 + 0.45 * sin(uT * 3.0 + ph * 40.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = min(650.0 / -mv.z, 14.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(0.72, 1.0, 0.3) * t.a * vA, 1.0); }`,
  });
  { const N = 320, pos = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = rnd() * Math.PI * 2, r = 20 + Math.sqrt(rnd()) * 95; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = rnd() * 150; pos[i * 3 + 2] = Math.sin(a) * r; ph[i] = rnd(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 75, 0), 140);
    const pts = new THREE.Points(g, sporeMat); pts.position.set(CX, CB, CZ); scene.add(pts); }

  // ======================= 2. HABILLAGE DU SOL =======================
  const capMat = pulseMat('#6b2fa3', '#b6ff4a', U, 1.3), capMat2 = pulseMat('#2a7a8a', '#4affe0', U, 1.5), gillSmall = pulseMat('#3d4a1a', '#d4ff6a', U, 1.2);
  // champignon dôme (à pois) et champignon-lampe effilé
  const shroomA = { stem: new Kit().add(G.lathe([[0.55, -0.4], [0.5, 0.5], [0.36, 2.2], [0.42, 3.2], [0.01, 3.3]], 9), C.cream).geometry(),
    cap: new Kit().add(G.lathe([[0.3, 3.0], [1.6, 3.15], [1.75, 3.45], [1.3, 4.0], [0.6, 4.35], [0.01, 4.4]], 11), capMat).geometry(),
    gill: new Kit().add(G.cyl(1.55, 0.35, 0.22, 11), gillSmall, { p: [0, 3.06, 0] }).geometry() };
  const shroomB = { stem: new Kit().add(G.lathe([[0.4, -0.4], [0.32, 1], [0.22, 4.4], [0.01, 4.5]], 7), C.cream).geometry(),
    cap: new Kit().add(G.lathe([[0.2, 4.0], [0.85, 4.2], [0.75, 5.0], [0.35, 6.1], [0.01, 6.5]], 9), capMat2).geometry() };
  const lA = [], lB = [];
  const tufts = (x, z, n, big) => { for (let i = 0; i < n; i++) { const x2 = x + (rnd() - 0.5) * 12, z2 = z + (rnd() - 0.5) * 12; if (!clear(x2, z2, 9 + (big ? 6 : 0))) continue;
    const s = big ? 2.2 + rnd() * 3.5 : 0.6 + rnd() * 1.2, m = m4(x2, H(x2, z2) - 0.15 * s, z2, rnd() * 6, s, (rnd() - 0.5) * 0.18, (rnd() - 0.5) * 0.18);
    (rnd() < 0.6 ? lA : lB).push(m); placed.push(['champi', x2, H(x2, z2) - 0.15 * s, z2]); } };
  scatter(95, 120, 1250, 12, (x, z) => tufts(x, z, 3 + Math.floor(rnd() * 5), rnd() < 0.3));
  // bosquet géant autour de la cathédrale
  for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, r = 100 + rnd() * 60; tufts(CX + Math.cos(a) * r, CZ + Math.sin(a) * r, 2, true); }
  inst(shroomA.stem, C.cream, [...lA]); inst(shroomA.cap, capMat, lA); inst(shroomA.gill, gillSmall, lA);
  inst(shroomB.stem, C.cream, lB); inst(shroomB.cap, capMat2, lB);

  // rochers violets + aiguilles de roche (enfoncés)
  { const rk = [], sp = [];
    scatter(160, 115, 1350, 10, (x, z) => { const s = 1 + rnd() * 3.2; rk.push(m4(x, H(x, z) - s * 0.35, z, rnd() * 6, [s * (1 + rnd() * 0.6), s * (0.6 + rnd() * 0.5), s], rnd() * 0.4, rnd() * 0.4)); placed.push(['rocher', x, H(x, z) - s * 0.35, z]); });
    scatter(45, 180, 1350, 16, (x, z) => { const s = 1.5 + rnd() * 2; sp.push(m4(x, gmin(x, z, 2 * s) - 1.2, z, rnd() * 6, [s, s * (2.5 + rnd() * 3), s], (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2)); placed.push(['aiguille', x, gmin(x, z, 2 * s) - 1.2, z]); });
    inst(new THREE.DodecahedronGeometry(1, 0), C.rock, rk, true);
    const spike = new THREE.ConeGeometry(1, 3, 6); spike.translate(0, 1.5, 0); inst(spike, C.rock2, sp, true); }

  // ======================= 3. MARES DE BOUE CHAUDE =======================
  const mudMat = new THREE.MeshStandardMaterial({ color: '#4a2a18', emissive: '#ff6a20', emissiveIntensity: 0.5, roughness: 0.35, flatShading: true });
  const pools = [];
  { const k = new Kit(), rimRocks = [];
    for (const [tx, tz] of [[620, 330], [300, 470], [880, 690], [1050, 820], [470, 270]]) {
      const sp = findSpot(tx, tz, 12, 18); if (!sp) continue; const [x, z] = sp, R = 7 + rnd() * 4;
      let mx = -1e9, mn = 1e9; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; const h = H(x + Math.cos(a) * R, z + Math.sin(a) * R); mx = Math.max(mx, h); mn = Math.min(mn, h); }
      const y = Math.min(mn + 0.25, H(x, z) + 0.25);
      // cuvette : la boue est un disque bombé, les bords sont couverts de pierres enfoncées
      const g = new THREE.CircleGeometry(R, 20); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i)); p.setY(i, (1 - d / R) * 0.35 + Math.sin(i * 1.7) * 0.05); }
      k.add(g, mudMat, { p: [x, y, z] });
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + rnd() * 0.3, rx = x + Math.cos(a) * R, rz = z + Math.sin(a) * R, s = 1.2 + rnd() * 1.4, by = Math.min(H(rx, rz), y + 0.3) - s * 0.4;
        rimRocks.push(m4(rx, by, rz, rnd() * 6, [s * 1.3, s * 0.8 + (H(rx, rz) - y) * 0.6, s], rnd() * 0.3, rnd() * 0.3)); }
      pools.push(new THREE.Vector3(x, y + 0.3, z)); placed.push(['boue', x, y, z]);
    }
    const grp = k.build({ shadow: false }); scene.add(grp);
    inst(new THREE.DodecahedronGeometry(1, 0), C.rock2, rimRocks, true); }

  // ======================= 4. NAPPES DE BROUILLARD TOXIQUE =======================
  const fogMat = new THREE.MeshBasicMaterial({ color: '#b46cff', map: radialTex(), transparent: true, opacity: 0.13, depthWrite: false, fog: true, side: THREE.DoubleSide });
  const fogs = [];
  const avoid = [[CX, CZ, 110], [520, 380, 40], ...pools.map(p => [p.x, p.z, 25])];
  scatter(24, 160, 1300, 30, (x, z) => { const R = 28 + rnd() * 30; if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar + R)) return false; const y = gmin(x, z, R * 0.4); if (H(x, z) - y > 6) return false; fogs.push({ x, z, y, R, ph: rnd() * 6.28, sp: 0.2 + rnd() * 0.3 }); });
  const fogIM = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), fogMat, fogs.length * 3);
  fogIM.frustumCulled = false; fogIM.renderOrder = 2; scene.add(fogIM);
  const updFog = (t) => { let i = 0; for (const f of fogs) for (let l = 0; l < 3; l++) {
    const rise = 1.6 + l * 2.2 + 1.8 * Math.sin(t * 0.12 + f.ph), dx = Math.sin(t * 0.05 * f.sp + f.ph + l) * 10, dz = Math.cos(t * 0.04 + f.ph * 2 + l) * 10, s = f.R * (1 - l * 0.25) * (1 + 0.08 * Math.sin(t * 0.3 + f.ph));
    fogIM.setMatrixAt(i++, M.compose(V.set(f.x + dx, f.y + rise, f.z + dz), Q.setFromEuler(E.set(0, t * 0.02 * (l ? -1 : 1) + f.ph, 0)), S.set(s, 1, s))); }
    fogIM.instanceMatrix.needsUpdate = true; };
  updFog(0);

  // ======================= 5. VER-FOREUSE =======================
  const worm = (() => {
    let A = null, B = null;
    for (let i = 0; i < 200 && !A; i++) { // trajectoire : une longue arche loin des voies
      const a = (45 + (rnd() - 0.5) * 36) * Math.PI / 180, r = 500 + rnd() * 600, x = Math.cos(a) * r, z = Math.sin(a) * r, h = rnd() * Math.PI;
      const ax = x - Math.cos(h) * 70, az = z - Math.sin(h) * 70, bx = x + Math.cos(h) * 70, bz = z + Math.sin(h) * 70;
      let ok = true; for (let k = 0; k <= 10 && ok; k++) { const px = ax + (bx - ax) * k / 10, pz = az + (bz - az) * k / 10; ok = inSector(px, pz) && clear(px, pz, 30) && Math.hypot(px - CX, pz - CZ) > 110; }
      if (ok) { A = new THREE.Vector3(ax, 0, az); B = new THREE.Vector3(bx, 0, bz); }
    }
    if (!A) return null;
    const NS = 30, SEG = 3.0, L = A.distanceTo(B), HGT = 22, RAD = 2.6;
    const body = new THREE.InstancedMesh(G.sph(1, 12, 8), mat('#8a4a5e', { roughness: 0.55, flatShading: true }), NS);
    const ring = new THREE.InstancedMesh(G.tor(1, 0.18, 5, 14), mat('#5a3240', { roughness: 0.7, metalness: 0.2 }), NS);
    body.frustumCulled = ring.frustumCulled = false; scene.add(body, ring);
    const hk = new Kit();
    hk.add(G.cyl(RAD * 1.05, RAD * 1.1, 2.4, 14), MAT.brass(), { r: [Math.PI / 2, 0, 0] });
    for (const s of [-1, 1]) hk.add(G.sph(0.45, 8, 6), glow('#ffcf4a', 3), { p: [s * 1.6, 1.4, 0.4] });
    const head = hk.build(); const drill = new Kit().add(G.cone(RAD, 5, 10), MAT.steel(), { p: [0, 2.5 + 1.2, 0] }).add(G.tor(1.6, 0.25, 4, 12), MAT.copper(), { p: [0, 2.2, 0], r: [Math.PI / 2, 0, 0] }).build();
    const drillPivot = new THREE.Group(); drillPivot.rotation.x = Math.PI / 2; drillPivot.add(drill); head.add(drillPivot);
    scene.add(head);
    const dir = B.clone().sub(A).normalize();
    const st = { phase: -20, fw: true, A, B, L, mid: A.clone().lerp(B, 0.5), head };
    const P = (s, out) => { const u = s / L; const a = st.fw ? A : B, b = st.fw ? B : A; out.copy(a).lerp(b, Math.max(0, Math.min(1, u)));
      const g = H(out.x, out.z); out.y = (u <= 0 || u >= 1) ? g - 12 : g - 6 + (HGT + 6) * Math.sin(Math.PI * u); return out; };
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    return { st, update(dt, t, near, emit) {
      st.phase += dt * 11; if (st.phase > L + NS * SEG + 40) { st.phase = -30; st.fw = !st.fw; }
      if (!near) return;
      for (let i = 0; i < NS; i++) {
        const s = st.phase - i * SEG; P(s, p0); P(s + 0.5, p1); const r = RAD * (i < 3 ? 1 : 1 - Math.max(0, i - 18) / 16);
        Q.setFromUnitVectors(up, p1.sub(p0).normalize());
        body.setMatrixAt(i, M.compose(p0, Q, S.set(r, r * 1.1, r))); ring.setMatrixAt(i, M.compose(p0, Q.multiply(new THREE.Quaternion().setFromAxisAngle(V.set(1, 0, 0), Math.PI / 2)), S.set(r * 1.02, r * 1.02, r * 1.4)));
      }
      body.instanceMatrix.needsUpdate = ring.instanceMatrix.needsUpdate = true;
      P(st.phase + 1.5, head.position); P(st.phase + 2.5, p1); head.lookAt(p1); drill.rotation.y += dt * 18;
      // poussière aux points d'émergence
      const u = st.phase / L; if (emit && Math.random() < 0.6) for (const uu of [0.04, 0.96]) {
        const lo = Math.max(0, (st.phase - NS * SEG) / L); if (uu < u + 0.02 && uu > lo - 0.02) { P(uu * L, V); V.y = H(V.x, V.z) + 1; emit(V); } }
    } };
  })();

  // ======================= 6. LUMIGNONS =======================
  const swarms = [];
  const lumi = new THREE.InstancedMesh(G.sph(0.22, 6, 4), glow('#d8ff6a', 4), 160); lumi.frustumCulled = false; scene.add(lumi);

  // ======================= 7. TAUPE-CHEF ORVALD + mine =======================
  const orv = (() => {
    const sp = findSpot(520, 380, 16, 14); if (!sp) return null; const [mx, mz] = sp;
    const ang = Math.atan2(-(0 - mz), -(0 - mx)); // l'entrée regarde vers l'extérieur
    const k = new Kit(), by = gmin(mx, mz, 10);
    // butte rocheuse et portail étayé
    k.add(G.sph(11, 9, 7, 0, Math.PI * 2, 0, Math.PI / 2), C.rock, { p: [0, -2.5, -4], s: [1.2, 0.9, 1] });
    k.add(G.box(4.2, 4.6, 3), C.dark, { p: [0, 1.6, 6.2] });
    for (const s of [-1, 1]) k.add(G.box(0.6, 6, 0.6), MAT.woodDark(), { p: [s * 2.4, 2.2, 7.6] });
    k.add(G.box(6, 0.7, 0.8), MAT.woodDark(), { p: [0, 5.2, 7.6] });
    k.add(G.sph(0.35, 8, 6), glow('#ffb84a', 3), { p: [0, 4.5, 8.1] });
    k.add(G.box(2.4, 1.2, 0.15), MAT.wood(), { p: [3.6, 3, 7.8], r: [0, 0, 0.1] });
    // wagonnet de minerai luminescent
    k.add(G.box(2, 1.2, 1.4), MAT.iron(), { p: [-6, 0.9, 10] }); for (const s of [-1, 1]) for (const t of [-1, 1]) k.add(G.cyl(0.35, 0.35, 0.2, 10), MAT.steel(), { p: [-6 + s * 0.7, 0.35, 10 + t * 0.75], r: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 5; i++) k.add(new THREE.OctahedronGeometry(0.4), glow('#7dffb0', 2), { p: [-6 + (i - 2) * 0.35, 1.6, 10 + (i % 2) * 0.3] });
    const mine = k.build(); mine.position.set(mx, by - 0.4, mz); mine.rotation.y = -ang + Math.PI / 2; scene.add(mine);
    placed.push(['mine', mx, by - 0.4, mz]);
    // Orvald : bleu de travail, nez-foreuse, casque à lampe
    const bk = new Kit();
    bk.add(G.cap(0.42, 0.6, 4, 10), mat('#2f4f8a', { roughness: 0.8 }), { p: [0, 1.25, 0] });
    bk.add(G.sph(0.4, 12, 9), mat('#5a4636', { roughness: 0.9 }), { p: [0, 1.95, 0.05] });
    bk.add(G.cone(0.16, 0.55, 8), MAT.steel(), { p: [0, 1.9, 0.6], r: [Math.PI / 2, 0, 0] });
    bk.add(G.sph(0.44, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#d2a24c', { metalness: 0.6, roughness: 0.4 }), { p: [0, 2.1, 0] });
    bk.add(G.sph(0.11, 8, 6), glow('#fff2a0', 4), { p: [0, 2.32, 0.38] });
    for (const s of [-1, 1]) bk.add(G.cap(0.11, 0.5, 3, 6), mat('#2f4f8a', { roughness: 0.8 }), { p: [s * 0.52, 1.3, 0.05], r: [0.4, 0, s * 0.2] });
    const body = bk.build();
    const legs = []; for (const s of [-1, 1]) { const l = new Kit().add(G.cap(0.13, 0.45, 3, 6), mat('#24406e'), { p: [0, -0.35, 0] }).add(G.box(0.24, 0.12, 0.34), MAT.woodDark(), { p: [0, -0.7, 0.06] }).build(); l.position.set(s * 0.2, 0.75, 0); body.add(l); legs.push(l); }
    scene.add(body);
    const fw = new THREE.Vector3(Math.sin(mine.rotation.y), 0, Math.cos(mine.rotation.y)), rt = new THREE.Vector3(fw.z, 0, -fw.x);
    const a = new THREE.Vector3(mx, 0, mz).addScaledVector(fw, 10), b = a.clone().addScaledVector(rt, 12).addScaledVector(fw, 6);
    for (const p of [a, b]) placed.push(['orvald-chemin', p.x, H(p.x, p.z), p.z]);
    return { body, legs, a, b, pos: new THREE.Vector3(), talkT: 0 };
  })();

  // ======================= 8. FRAGMENTS (plaques-spores) =======================
  const frags = [];
  { const k = new Kit(), wanted = [[72, 0.7, 1], [73, 0.5, -1], [78, 0.45, 1], [75, 0.5, 1], [77, 0.55, -1], [79, 0.6, 1]];
    wanted.forEach(([eid, f, side], idx) => {
      const e = net.edges[eid]; if (!e) return; let got = null;
      for (let dk = 0; dk < 40 && !got; dk++) for (const sg of [1, -1]) { const kk = Math.round(e.pts.length * f) + dk * sg; if (kk < 2 || kk > e.pts.length - 3) continue;
        for (const off of [12, 14, 16]) for (const sd of [side, -side]) { const p = e.pts[kk], t = e.tan ? e.tan[kk] : e.pts[kk + 1].clone().sub(p).normalize();
          const x = p.x - t.z * off * sd, z = p.z + t.x * off * sd; if (got || !inSector(x, z) || !footClear(x, z, 1.2, 10.5)) continue; got = { x, z, ry: Math.atan2(p.x - x, p.z - z) }; } }
      if (!got) return; const { x, z, ry } = got, y = gmin(x, z, 1.2);
      const add = (g, m, o) => { const gg = g.clone(); const r = o.r || [0, 0, 0], sc = o.s || [1, 1, 1];
        gg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...(o.p || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...sc)));
        gg.rotateY(ry); gg.translate(x, y, z); k.add(gg, m); };
      add(G.cyl(0.9, 1.1, 0.5, 8), C.rock2, { p: [0, -0.1, 0] });
      add(G.cyl(0.12, 0.16, 1.9, 8), C.verdigris, { p: [0, 1, 0] });
      add(G.rbox(1.3, 0.9, 0.1, 0.04), MAT.brass(), { p: [0, 1.55, 0.14], r: [-0.35, 0, 0] });
      add(G.box(1.1, 0.7, 0.04), mat('#3a2a14', { roughness: 0.7 }), { p: [0, 1.56, 0.2], r: [-0.35, 0, 0] });
      add(G.sph(0.22, 10, 8), glow('#b6ff4a', 2.6), { p: [0, 2.14, 0] });
      add(G.sph(0.32, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), capMat, { p: [0, 2.2, 0], s: [1, 0.7, 1] });
      frags.push({ id: 'entrailles:' + idx, f: LORE.fragments[idx], pos: new THREE.Vector3(x, y, z) }); placed.push(['plaque', x, y - 0.35, z]);
      swarms.push({ c: new THREE.Vector3(x, y + 2.6, z), n: 8, r: 1.6 });
    });
    scene.add(k.build()); }
  const halo = new THREE.Mesh(G.tor(1.3, 0.06, 6, 32), glow('#e9c46a', 3)); halo.rotation.x = Math.PI / 2; halo.visible = false; scene.add(halo);

  // essaims de Lumignons : portails de la cathédrale, mine, mares
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; swarms.push({ c: new THREE.Vector3(CX + Math.cos(a) * 31, H(CX + Math.cos(a) * 31, CZ + Math.sin(a) * 31) + 6, CZ + Math.sin(a) * 31), n: 18, r: 5 }); }
  if (orv) swarms.push({ c: new THREE.Vector3(orv.a.x, H(orv.a.x, orv.a.z) + 3, orv.a.z), n: 14, r: 3.5 });
  for (const p of pools) swarms.push({ c: p.clone().setY(p.y + 3), n: 8, r: 4 });
  let li = 0; for (const s of swarms) { s.o = li; s.n = Math.min(s.n, 160 - li); li += s.n; } lumi.count = li;
  swarms.forEach(s => { s.ph = Array.from({ length: s.n }, () => [rnd() * 6.28, 0.6 + rnd() * 1.4, rnd() * 6.28]); });

  Object.assign(window.__entr, { worm: worm?.st, fogs, pools, orv: orv?.a });
  // ======================= UPDATE =======================
  const center = new THREE.Vector3(800, 0, 800); let bubbleT = 0, wasNear = -1;
  const tmp = new THREE.Vector3();
  return { update(dt, time, camPos) {
    U.t.value = time;
    const dC = Math.hypot(camPos.x - 700, camPos.z - 700); if (dC > 1100) return; // loin du secteur : rien
    // lamelles : s'illuminent quand un train approche
    const tr = ctx.train, th = tr?.head; const dT = th ? Math.hypot(th.x - CX, th.z - CZ) : 1e9;
    const k = Math.max(0, Math.min(1, (420 - dT) / 260));
    gillMat.emissiveIntensity = 0.5 + 3.2 * k + 0.25 * Math.sin(time * 2.1) + (k > 0.5 ? 0.3 * Math.sin(time * 9) : 0);
    winMat.emissiveIntensity = 1.1 + 0.6 * k; mudMat.emissiveIntensity = 0.45 + 0.25 * Math.sin(time * 0.9) + 0.1 * Math.sin(time * 3.7);
    updFog(time);
    const near = Math.hypot(camPos.x - (worm?.st.mid.x ?? 0), camPos.z - (worm?.st.mid.z ?? 0)) < 700;
    worm?.update(dt, time, near, p => ctx.smoke?.emit(p, tmp.set((Math.random() - 0.5) * 3, 3 + Math.random() * 3, (Math.random() - 0.5) * 3), { life: 2.5, size: 5, color: '#6b4a5a', alpha: 0.55 }));
    // lumignons
    for (const s of swarms) { const close = s.c.distanceToSquared(camPos) < 490000;
      for (let i = 0; i < s.n; i++) { const [p, w, q] = s.ph[i]; const tt = time * w + p;
        V.set(s.c.x + Math.sin(tt) * s.r * Math.cos(q + tt * 0.3), s.c.y + Math.sin(tt * 1.7 + q) * s.r * 0.4, s.c.z + Math.cos(tt * 1.1) * s.r * Math.sin(q + tt * 0.2));
        const sc = close ? 0.8 + 0.5 * Math.sin(time * 6 + p * 9) : 0; lumi.setMatrixAt(s.o + i, M.compose(V, Q.identity(), S.set(sc, sc, sc))); } }
    lumi.instanceMatrix.needsUpdate = true;
    // bulles de boue + vapeurs violettes
    bubbleT -= dt; if (bubbleT < 0) { bubbleT = 0.18;
      for (const p of pools) { if (p.distanceToSquared(camPos) > 360000) continue; const a = Math.random() * 6.28, r = Math.random() * 5;
        tmp.set(p.x + Math.cos(a) * r, p.y + 0.1, p.z + Math.sin(a) * r);
        ctx.sparks?.emit(tmp, V.set(0, 4 + Math.random() * 2, 0), { life: 0.35, size: 0.6, color: '#ff9a40', to: '#5a2a10' });
        if (Math.random() < 0.5) ctx.steam?.emit(tmp, V.set(0, 1.5, 0), { life: 3, size: 3, color: '#b07ad8', alpha: 0.35 }); }
      for (const f of fogs) if (Math.random() < 0.08 && Math.hypot(f.x - camPos.x, f.z - camPos.z) < 400) ctx.steam?.emit(tmp.set(f.x + (Math.random() - 0.5) * f.R, f.y + 3, f.z + (Math.random() - 0.5) * f.R), V.set(0, 0.6, 0), { life: 6, size: 9, color: '#9b5ad0', alpha: 0.25 });
    }
    // Orvald fait la navette entre la mine et le wagonnet
    const pl = ctx.player;
    if (orv && orv.a.distanceTo(camPos) < 500) {
      const cyc = 34, u = (time % cyc) / cyc, w = u < 0.4 ? u / 0.4 : u < 0.5 ? 1 : u < 0.9 ? 1 - (u - 0.5) / 0.4 : 0, walking = (u < 0.4 || (u >= 0.5 && u < 0.9));
      const talk = pl && pl.mode === 'foot' && pl.pos.distanceTo(orv.body.position) < 5;
      if (!talk) orv.pos.copy(orv.a).lerp(orv.b, w * w * (3 - 2 * w));
      orv.body.position.set(orv.pos.x, H(orv.pos.x, orv.pos.z) + (walking && !talk ? Math.abs(Math.sin(time * 7)) * 0.08 : 0), orv.pos.z);
      const tgt = talk ? pl.pos : (u < 0.5 ? orv.b : orv.a); orv.body.rotation.y = Math.atan2(tgt.x - orv.pos.x, tgt.z - orv.pos.z);
      orv.legs.forEach((l, i) => l.rotation.x = walking && !talk ? Math.sin(time * 7 + i * Math.PI) * 0.5 : 0);
      if (talk && ctx.input?.ah('interact')) { const n = LORE.npcs[0]; ctx.ui.say([{ who: n.name, icon: '⛏', color: '#7da3d8', text: n.lines[orv.talkT++ % n.lines.length] }]); return; }
    }
    // fragments
    let best = null, bd = 6;
    for (const f of frags) { const d = pl ? Math.hypot(pl.pos.x - f.pos.x, pl.pos.z - f.pos.z) : 99; if (d < bd) { bd = d; best = f; } }
    halo.visible = !!best && pl?.mode === 'foot';
    if (halo.visible) { halo.position.set(best.pos.x, best.pos.y + 0.12 + 0.05 * Math.sin(time * 3), best.pos.z); const s = 1 + 0.15 * Math.sin(time * 4); halo.scale.set(s, s, s);
      if (bd < 3 && ctx.input?.ah('interact')) {
        ctx.ui.say([{ who: best.f.title, icon: '✦', color: '#e9c46a', text: best.f.text }]);
        const S0 = ctx.S; if (S0) { S0.fragments ||= []; if (!S0.fragments.includes(best.id)) S0.fragments.push(best.id); }
        for (let i = 0; i < 14; i++) ctx.sparks?.emit(tmp.copy(best.pos).setY(best.pos.y + 2.1), V.set((Math.random() - 0.5) * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 4), { life: 0.8, size: 0.5, color: '#d8ff6a' });
      } }
  } };
}
