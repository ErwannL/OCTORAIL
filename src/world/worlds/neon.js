// Monde « neon » (Néon-Bas) : l'Aiguillage-Monde, rues détrempées, drones-péage, pubs errantes,
// Madame Péage, pluie permanente et « minuit » : les néons se réécrivent et des voies fantômes se redessinent au sol.
import * as THREE from 'three';
import { Kit, G, mat, glow } from '../kit.js';
import { mulberry } from '../../util/noise.js';
import { WORLD_LORE } from '../../data/lore.js';

const PI = Math.PI, AX = PI / 4;
const LORE = WORLD_LORE.find(w => w.id === 'neon');
const NEON = ['#ff2bd6', '#2bf0ff', '#ffb030', '#7cff4a', '#8a5bff'];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const M4 = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s));

function inSector(x, z, r0 = 115, r1 = 1380, da = 0.36) {
  const r = Math.hypot(x, z); if (r < r0 || r > r1) return false;
  let a = Math.atan2(-z, x) - AX; a = Math.atan2(Math.sin(a), Math.cos(a)); return Math.abs(a) < da;
}
const polar = (r, a) => [Math.cos(a) * r, -Math.sin(a) * r];

// Texte néon sur canvas (pubs errantes, écrans)
function textTex(lines, col, bg = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(8, 8, 240, 112);
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((t, i) => { g.font = `bold ${i ? 26 : 40}px sans-serif`; g.fillText(t, 128, 128 / (lines.length + 1) * (i + 1) + (i ? 4 : 0)); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildWorld(scene, terrain, net, ctx) {
  const rnd = mulberry(4501);
  const root = new THREE.Group(); root.name = 'neon'; scene.add(root);
  const H = (x, z) => terrain.heightAt(x, z);
  const groundMin = (x, z, r) => { let h = H(x, z); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; h = Math.min(h, H(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return h; };
  const clearRing = (x, z, r, d) => { if (net.nearest(x, z, r + d)) return false; return true; };
  const placed = []; // pour la vérification numérique (debug)
  const occupied = []; const free = (x, z, r) => occupied.every(o => Math.hypot(o[0] - x, o[1] - z) > o[2] + r);
  const occupy = (x, z, r) => occupied.push([x, z, r]);

  const black = mat('#0b0812', { metalness: 0.85, roughness: 0.18 });
  const darkGlass = mat('#120c22', { metalness: 0.9, roughness: 0.08, emissive: '#2a1050', emissiveIntensity: 0.6 });
  const concrete = mat('#2a2733', { roughness: 0.9 });
  const steel = mat('#3a3946', { metalness: 0.7, roughness: 0.4 });
  const wet = mat('#07060c', { metalness: 0.9, roughness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  // ====================== 1. L'AIGUILLAGE-MONDE ======================
  let T = null;
  for (let r = 640; r <= 900 && !T; r += 20) for (const da of [0.12, -0.12, 0.2, -0.2, 0.05, -0.05, 0.28, -0.28]) {
    const [x, z] = polar(r, AX + da);
    if (!clearRing(x, z, 24, 26) || !inSector(x, z)) continue;
    const hs = [0, 1, 2, 3, 4, 5, 6, 7].map(i => H(x + Math.cos(i * PI / 4) * 22, z + Math.sin(i * PI / 4) * 22));
    if (Math.max(...hs) - Math.min(...hs) > 6) continue;
    T = { x, z, y: Math.min(...hs, H(x, z)) }; break;
  }
  if (!T) { const [x, z] = polar(760, AX + 0.25); T = { x, z, y: groundMin(x, z, 22) }; }
  occupy(T.x, T.z, 40);
  const tower = new THREE.Group(); tower.position.set(T.x, T.y, T.z); root.add(tower);
  const TH = 96; // hauteur du fût
  {
    const k = new Kit();
    // socle à gradins (enfoncé sous le sol)
    k.add(G.cyl(23, 24, 6, 8), concrete, { p: [0, 0, 0], r: [0, PI / 8, 0] });
    k.add(G.cyl(19, 21, 4, 8), black, { p: [0, 4.5, 0], r: [0, PI / 8, 0] });
    k.add(G.cyl(15, 17, 3, 8), concrete, { p: [0, 8, 0], r: [0, PI / 8, 0] });
    // fût octogonal effilé de verre noir
    k.add(G.cyl(7, 11, TH, 8), darkGlass, { p: [0, 9.5 + TH / 2, 0], r: [0, PI / 8, 0] });
    // arêtes d'acier
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2, rr = 9.1; k.add(G.box(0.5, TH, 0.5), steel, { p: [Math.cos(a) * rr, 9.5 + TH / 2, Math.sin(a) * rr], r: [Math.sin(a) * -0.021, 0, Math.cos(a) * 0.021] }); }
    // col + « cerveau » lobé
    k.add(G.cyl(9, 7, 4, 8), black, { p: [0, 9.5 + TH + 2, 0] });
    const brain = G.sph(13, 28, 18); const P = brain.attributes.position;
    for (let i = 0; i < P.count; i++) { _v.fromBufferAttribute(P, i); const n = 1 + 0.07 * Math.sin(_v.x * 0.9) * Math.sin(_v.y * 1.1 + _v.z * 0.7) + (Math.abs(_v.x) < 1 ? -0.08 : 0); P.setXYZ(i, _v.x * n, _v.y * n * 0.8, _v.z * n * 1.1); }
    brain.computeVertexNormals();
    k.add(brain, darkGlass, { p: [0, 9.5 + TH + 12, 0] });
    // aiguillages-rails radiaux au pied (comme des lames d'aiguille)
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2 + PI / 8; k.add(G.box(16, 0.4, 0.35), steel, { p: [Math.cos(a) * 24, 0.2, Math.sin(a) * 24], r: [0, -a, 0] }); k.add(G.box(1.4, 2.2, 1.4), black, { p: [Math.cos(a) * 31.5, 1.0, Math.sin(a) * 31.5], r: [0, -a, 0] }); }
    tower.add(k.build({ shadow: false }));
    // néons : liserés du socle + veines du cerveau + leviers
    const kg = new Kit(), vein = glow('#ff2bd6', 3.2), cy = glow('#2bf0ff', 3);
    kg.add(G.tor(21.05, 0.18, 4, 48), vein, { p: [0, 3.1, 0], r: [PI / 2, 0, 0] });
    kg.add(G.tor(17.1, 0.16, 4, 48), cy, { p: [0, 6.6, 0], r: [PI / 2, 0, 0] });
    for (let i = 0; i < 9; i++) { const dy = (i - 4) * 2.1, rr = 13 * Math.sqrt(Math.max(0.05, 1 - (dy / 10.4) ** 2)) * 1.07 + 0.35; kg.add(G.tor(rr, 0.22, 4, 40), i % 2 ? vein : cy, { p: [0, 9.5 + TH + 12 + dy, 0], r: [PI / 2, 0, 0], s: [1, 1.1, 1] }); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2 + PI / 8; kg.add(G.sph(0.5, 8, 6), i % 2 ? vein : cy, { p: [Math.cos(a) * 31.5, 2.4, Math.sin(a) * 31.5] }); }
    tower.add(kg.build({ shadow: false }));
  }
  // fenêtres-pensées : InstancedMesh avec couleur par instance (clignotent)
  const winGeo = new THREE.PlaneGeometry(2.0, 2.4);
  const winMat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, toneMapped: false });
  const winList = [];
  for (let row = 0; row < 30; row++) {
    const y = 12 + row * 3.1, f = (y - 9.5) / TH, rr = 11 + (7 - 11) * f; // rayon de la face à cette hauteur
    for (let s = 0; s < 8; s++) {
      const a = s / 8 * PI * 2 + PI / 8 + PI / 8, apo = rr * Math.cos(PI / 8) + 0.06, side = 2 * rr * Math.sin(PI / 8);
      for (let c = -1; c <= 1; c++) { const off = c * side * 0.28; winList.push({ x: Math.cos(a) * apo - Math.sin(a) * off, y, z: Math.sin(a) * apo + Math.cos(a) * off, ry: -a + PI / 2, ph: rnd() * 10 }); }
    }
  }
  const wins = new THREE.InstancedMesh(winGeo, winMat, winList.length);
  winList.forEach((w, i) => { _e.set(0.035, w.ry, 0, 'YXZ'); wins.setMatrixAt(i, _m.compose(_s.set(w.x, w.y, w.z), _q.setFromEuler(_e), _v.set(1, 1, 1))); wins.setColorAt(i, _c.set('#2bf0ff')); });
  tower.add(wins);
  // faisceau vers le ciel
  const beamM = new THREE.MeshBasicMaterial({ color: '#ff2bd6', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 4, 260, 12, 1, true), beamM); beam.position.y = 9.5 + TH + 22 + 130; tower.add(beam);
  placed.push({ name: 'tour', x: T.x, z: T.z, y: T.y - 3, r: 24 });

  // ====================== 2. DÉCOR DE RUE (instancié) ======================
  const spots = (n, r0, r1, clr, rad, cb) => { let c = 0; for (let t = 0; t < n * 30 && c < n; t++) { const r = r0 + rnd() * (r1 - r0), a = AX + (rnd() - 0.5) * 0.7; const [x, z] = polar(r, a); if (!inSector(x, z) || net.nearest(x, z, clr) || !free(x, z, rad)) continue; occupy(x, z, rad); cb(x, z, c++); } };
  const inst = (geo, material, list, castShadow = false) => { if (!list.length) return null; const m = new THREE.InstancedMesh(geo, material, list.length); list.forEach((x, i) => m.setMatrixAt(i, x)); m.castShadow = castShadow; m.receiveShadow = true; root.add(m); return m; };
  const kitGeo = fn => { const k = new Kit(); fn(k); return k.geometry(); };

  // réverbères néon (poteau + tête lumineuse colorée par instance)
  const lampPole = kitGeo(k => { k.add(G.cyl(0.12, 0.18, 7, 6), steel, { p: [0, 3.5, 0] }); k.add(G.box(1.8, 0.18, 0.2), steel, { p: [0.8, 6.9, 0] }); k.add(G.cyl(0.45, 0.5, 0.4, 8), steel, { p: [0, 0.1, 0] }); });
  const lampHead = kitGeo(k => { k.add(G.box(0.25, 1.6, 0.25), steel, { p: [1.6, 6.1, 0] }); });
  const lampM = [], lampMH = [];
  spots(70, 140, 1300, 9, 2, (x, z) => { const y = H(x, z) - 0.15, ry = rnd() * PI * 2; lampM.push(M4(x, y, z, ry)); lampMH.push(M4(x, y, z, ry)); placed.push({ name: 'lampe', x, z, y, r: 0.5 }); });
  inst(lampPole, steel, lampM);
  const heads = inst(lampHead, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), lampMH);
  const headCol = lampMH.map((_, i) => i % NEON.length); headCol.forEach((ci, i) => heads.setColorAt(i, _c.set(NEON[ci])));

  // décharges d'enseignes mortes (tas de panneaux inclinés + carcasses)
  const signA = kitGeo(k => { k.add(G.box(4, 1.4, 0.25), steel, { r: [0.2, 0.3, 0.5] }); });
  const junkDark = [], junkGlow = [];
  spots(26, 200, 1250, 12, 7, (x, z) => {
    const n = 5 + Math.floor(rnd() * 6), y0 = groundMin(x, z, 4);
    for (let i = 0; i < n; i++) { const a = rnd() * PI * 2, d = rnd() * 3.5, s = 0.6 + rnd() * 0.8, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      _e.set((rnd() - 0.5) * 1.2, rnd() * PI * 2, (rnd() - 0.5) * 1.2); const m = new THREE.Matrix4().compose(new THREE.Vector3(px, Math.min(y0, H(px, pz)) + 0.25 * s + i * 0.12, pz), new THREE.Quaternion().setFromEuler(_e), new THREE.Vector3(s, s, s));
      (rnd() < 0.3 ? junkGlow : junkDark).push(m); }
    placed.push({ name: 'decharge', x, z, y: y0, r: 4 });
  });
  inst(signA, black, junkDark, true);
  const deadNeon = inst(signA, glow('#ff2bd6', 0.6), junkGlow);

  // flaques miroirs (disques posés au ras du sol, décalage de polygones contre le z-fighting)
  const pud = [];
  spots(60, 130, 1300, 7, 3, (x, z) => { const hs = [H(x, z), H(x + 2, z), H(x - 2, z), H(x, z + 2), H(x, z - 2)]; if (Math.max(...hs) - Math.min(...hs) > 0.25) return; pud.push(M4(x, Math.max(...hs) + 0.03, z, rnd() * 3, [1.5 + rnd() * 2, 1, 1 + rnd() * 1.5])); });
  inst(new THREE.CircleGeometry(1, 14).rotateX(-PI / 2), wet, pud);

  // pylônes à câbles (Câblards) : mât + traverse + câbles pendants
  const pylon = kitGeo(k => { k.add(G.box(0.5, 12, 0.5), steel, { p: [0, 6, 0] }); k.add(G.box(5, 0.3, 0.3), steel, { p: [0, 11.5, 0] }); k.add(G.box(1.4, 0.6, 1.4), concrete, { p: [0, 0.1, 0] });
    for (const sx of [-2.2, 2.2]) k.add(G.tube([[sx, 11.4, 0], [sx * 1.2, 8, 0.6], [sx * 1.6, 5.5, 0.3]], 0.05, 10, 4), steel); });
  const pyl = []; spots(30, 150, 1300, 9, 3, (x, z) => { const y = H(x, z) - 0.2; pyl.push(M4(x, y, z, rnd() * PI)); placed.push({ name: 'pylone', x, z, y, r: 0.7 }); });
  inst(pylon, steel, pyl, true);

  // ====================== 3. VIE ======================
  // 3a. Drones-péage : petits disques volants à balises, en huit au-dessus des rues
  const droneBody = kitGeo(k => { k.add(G.cyl(0.6, 0.8, 0.35, 10), black); k.add(G.box(2.2, 0.08, 0.12), black, { r: [0, PI / 4, 0] }); k.add(G.box(2.2, 0.08, 0.12), black, { r: [0, -PI / 4, 0] }); });
  const droneLight = kitGeo(k => { k.add(G.cyl(0.62, 0.62, 0.08, 10), black, { p: [0, -0.15, 0] }); for (const a of [PI / 4, 3 * PI / 4, 5 * PI / 4, 7 * PI / 4]) k.add(G.sph(0.14, 6, 4), black, { p: [Math.cos(a) * 1.05, 0.06, Math.sin(a) * 1.05] }); });
  const drones = []; spots(14, 160, 1250, 12, 1, (x, z) => drones.push({ x, z, r: 6 + rnd() * 10, ph: rnd() * 10, sp: 0.25 + rnd() * 0.2, h: 7 + rnd() * 9 }));
  const dB = new THREE.InstancedMesh(droneBody, black, drones.length), dL = new THREE.InstancedMesh(droneLight, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), drones.length);
  drones.forEach((d, i) => dL.setColorAt(i, _c.set(i % 2 ? '#2bf0ff' : '#ff2a3a'))); root.add(dB, dL);
  dB.frustumCulled = dL.frustumCulled = false;

  // 3b. Pubs errantes : hologrammes qui flottent au-dessus d'un projecteur et suivent le passant
  const ADS = [['ACHETEZ !', 'quoi ? on ne sait plus'], ['BONJOUR GÉRARD', '… non ? quand même'], ['RIEN', 'à moitié prix'], ['PÉAGE', '12 crédits Octave']];
  const pubs = [];
  spots(6, 170, 1100, 12, 3, (x, z, i) => {
    const g = new THREE.Group(), y = H(x, z); g.position.set(x, y - 0.1, z); root.add(g);
    const pk = new Kit(); pk.add(G.cyl(0.7, 0.9, 0.5, 10), steel, { p: [0, 0.25, 0] }); pk.add(G.cone(0.35, 0.6, 8), steel, { p: [0, 0.75, 0], r: [PI, 0, 0] }); g.add(pk.build());
    const col = NEON[i % 3], tex = textTex(ADS[i % ADS.length], col, 'rgba(10,0,30,0.35)');
    const holo = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    holo.position.y = 3.2; g.add(holo);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2, 2.2, 10, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    cone.position.y = 2.0; g.add(cone);
    pubs.push({ g, holo, cone, ph: rnd() * 6 }); placed.push({ name: 'pub', x, z, y: y - 0.1, r: 0.9 });
  });

  // 3c. Madame Péage : guichet-drone rond aux bras télescopiques, près de la voie au pied de la tour
  let toll = null;
  { let best = null;
    for (let t = 0; t < 400 && !best; t++) { const a = rnd() * PI * 2, d = 50 + rnd() * 60, x = T.x + Math.cos(a) * d, z = T.z + Math.sin(a) * d; const q = net.nearest(x, z, 22); if (q && q.d > 13 && free(x, z, 4)) best = [x, z]; }
    if (best) { const [x, z] = best, y = groundMin(x, z, 3); occupy(x, z, 5);
      const g = new THREE.Group(); g.position.set(x, y - 0.3, z); root.add(g);
      const q = net.nearest(x, z, 24), e = net.edges[q.edge].pts[q.k]; g.rotation.y = Math.atan2(e.x - x, e.z - z);
      const k = new Kit(); k.add(G.box(4, 0.6, 3), concrete, { p: [0, 0.3, 0] }); k.add(G.box(3.4, 3, 0.25), steel, { p: [0, 2.1, -1.2] }); k.add(G.box(4.2, 0.3, 3.2), black, { p: [0, 3.75, 0] });
      for (const sx of [-1.8, 1.8]) k.add(G.box(0.2, 3, 0.2), steel, { p: [sx, 2.1, 1.3] });
      k.add(G.box(0.3, 1.2, 0.3), steel, { p: [2.6, 0.6, 1.6] }); g.add(k.build());
      const kg = new Kit(); kg.add(G.box(4.25, 0.12, 3.25), glow('#ffb030', 3), { p: [0, 3.95, 0] }); kg.add(G.sph(0.25, 8, 6), glow('#ff2a3a', 4), { p: [2.6, 1.3, 1.6] }); g.add(kg.build({ shadow: false }));
      const barrier = new THREE.Mesh(G.box(4, 0.15, 0.15), mat('#d02020', { emissive: '#ff3030', emissiveIntensity: 0.6 })); barrier.position.set(2.6, 1.15, 1.6); barrier.geometry.translate(-2, 0, 0); g.add(barrier);
      // le drone rond
      const md = new THREE.Group(); md.position.set(0, 1.8, 0); g.add(md);
      const mk = new Kit(); mk.add(G.sph(0.8, 16, 12), mat('#e9c46a', { metalness: 0.7, roughness: 0.3 })); mk.add(G.cyl(0.85, 0.85, 0.15, 16), black, { p: [0, 0, 0] });
      md.add(mk.build());
      const eye = new THREE.Mesh(G.box(0.7, 0.18, 0.1), glow('#cfe8ff', 4)); eye.position.set(0, 0.2, 0.78); md.add(eye);
      const arms = [-1, 1].map(sd => { const a = new THREE.Mesh(G.cyl(0.07, 0.07, 1, 6).rotateZ(PI / 2).translate(0.5, 0, 0), steel); a.position.set(sd * 0.75, -0.2, 0.2); a.scale.x = sd; md.add(a); return a; });
      toll = { g, md, arms, barrier, x, z };
      placed.push({ name: 'peage', x, z, y: y - 0.3, r: 2.5 });
    } }

  // ====================== 4. FRAGMENTS (bornes-terminaux) ======================
  const fragPts = []; const edgesHere = net.edges.filter(e => e.pts.some(p => inSector(p.x, p.z)));
  for (let t = 0; t < 4000 && fragPts.length < 6; t++) {
    const e = edgesHere[Math.floor(rnd() * edgesHere.length)]; if (!e) break;
    const k = 3 + Math.floor(rnd() * (e.pts.length - 6)), p = e.pts[k], q = e.pts[k + 1]; if (!inSector(p.x, p.z, 140, 1300)) continue;
    const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1, sd = rnd() < 0.5 ? -1 : 1, x = p.x - dz / L * 12 * sd, z = p.z + dx / L * 12 * sd;
    if (net.nearest(x, z, 10.5) || !free(x, z, 1.5) || fragPts.some(f => Math.hypot(f.x - x, f.z - z) < 120)) continue;
    occupy(x, z, 2); fragPts.push({ x, z, y: H(x, z), ry: Math.atan2(p.x - x, p.z - z) });
  }
  const termBody = kitGeo(k => { k.add(G.box(1.2, 0.3, 0.9), steel, { p: [0, 0.0, 0] }); k.add(G.rbox(0.8, 1.6, 0.5, 0.08), steel, { p: [0, 0.95, 0] }); k.add(G.box(0.9, 0.1, 0.7), steel, { p: [0, 1.8, 0.05], r: [-0.4, 0, 0] }); });
  const termScreen = kitGeo(k => { k.add(G.box(0.6, 0.45, 0.04), steel, { p: [0, 1.3, 0.27] }); k.add(G.box(0.08, 0.08, 0.08), steel, { p: [0, 2.05, 0.1] }); });
  const tB = inst(termBody, black, fragPts.map(f => M4(f.x, f.y - 0.1, f.z, f.ry)), true);
  const tS = inst(termScreen, glow('#e9c46a', 2.4), fragPts.map(f => M4(f.x, f.y - 0.1, f.z, f.ry)));
  fragPts.forEach(f => placed.push({ name: 'fragment', x: f.x, z: f.z, y: f.y - 0.1, r: 0.6 }));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.07, 6, 32).rotateX(PI / 2), new THREE.MeshBasicMaterial({ color: '#e9c46a', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  halo.visible = false; root.add(halo);

  // ====================== 5. RÈGLE : « MINUIT », LES VOIES SE RÉÉCRIVENT ======================
  // voies fantômes lumineuses au sol (hors rails réels), dont les tronçons s'allument selon un motif recalculé à chaque minuit
  const ghostSegs = [];
  for (let t = 0; t < 3000 && ghostSegs.length < 90; t++) {
    const r = 150 + rnd() * 1100, a = AX + (rnd() - 0.5) * 0.66; const [x, z] = polar(r, a); const ang = rnd() < 0.5 ? -AX : AX + PI / 2;
    const L = 14, dx = Math.cos(ang) * L / 2, dz = -Math.sin(ang) * L / 2;
    let ok = true; for (let s = -1; s <= 1; s += 0.5) if (net.nearest(x + dx * s, z + dz * s, 9) || !inSector(x + dx * s, z + dz * s)) ok = false; if (!ok || !free(x, z, 7)) continue;
    const hs = [-1, 0, 1].map(s => H(x + dx * s, z + dz * s)); if (Math.max(...hs) - Math.min(...hs) > 1.2) continue;
    ghostSegs.push({ x, z, y: Math.max(...hs) + 0.06, ang, slope: Math.atan2(hs[2] - hs[0], L), ph: rnd() });
  }
  const ghostM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ghostGeo = kitGeo(k => { k.add(G.box(14, 0.05, 0.12), steel, { p: [0, 0, -0.72] }); k.add(G.box(14, 0.05, 0.12), steel, { p: [0, 0, 0.72] }); for (let i = -3; i <= 3; i++) k.add(G.box(0.15, 0.04, 1.8), steel, { p: [i * 2, -0.01, 0] }); });
  const ghosts = new THREE.InstancedMesh(ghostGeo, ghostM, ghostSegs.length);
  ghostSegs.forEach((s, i) => { _e.set(0, s.ang, s.slope, 'YXZ'); ghosts.setMatrixAt(i, _m.compose(_s.set(s.x, s.y, s.z), _q.setFromEuler(_e), _v.set(1, 1, 1))); ghosts.setColorAt(i, _c.set('#000000')); });
  root.add(ghosts);

  // pluie permanente (1 draw call, animée dans le shader, suit la caméra)
  const RAIN = 2200, rp = new Float32Array(RAIN * 6);
  for (let i = 0; i < RAIN; i++) { const x = (rnd() - 0.5) * 90, y = rnd() * 50, z = (rnd() - 0.5) * 90; rp.set([x, y, z, x + 0.15, y - 1.3, z], i * 6); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rainU = { time: { value: 0 } };
  const rainM = new THREE.ShaderMaterial({ uniforms: rainU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'uniform float time; varying float vA; void main(){ vec3 p=position; float o=mod(p.y - time*28.0, 50.0); p.y = o - 10.0 + (position.y - floor(position.y)) * 0.0; vA = smoothstep(0.0,8.0,o)*smoothstep(50.0,40.0,o); gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0);} ',
    fragmentShader: 'varying float vA; void main(){ gl_FragColor=vec4(0.65,0.75,1.0,0.16*vA);} ' });
  // le bas du trait (vertex impair) doit rester 1.3 m sous le haut : on encode via l'ordre
  for (let i = 0; i < RAIN; i++) { const y = rp[i * 6 + 1]; rp[i * 6 + 4] = y - 1.3; }
  const rain = new THREE.LineSegments(rg, rainM); rain.frustumCulled = false; rain.visible = false; root.add(rain);

  // ====================== DEBUG ======================
  if (typeof window !== "undefined") window.__neon = { placed, tower: T, fragPts, root, toll: () => toll, pubs: () => pubs.map(p => p.g.position), drones };

  // ====================== UPDATE ======================
  let midnight = -1, pattern = 0, lastE = false, winT = 0;
  return {
    update(dt, time, camPos) {
      const near = camPos && Math.hypot(camPos.x - T.x, camPos.z - T.z) < 1500 && inSector(camPos.x, camPos.z, 60, 1600, 0.6);
      root.visible = true;
      rain.visible = !!near;
      if (!near) return;
      rainU.time.value = time % 1000;
      rain.position.set(Math.round(camPos.x), camPos.y - 15, Math.round(camPos.z));
      const camD = Math.hypot(camPos.x - T.x, camPos.z - T.z);

      // cycle « minuit » toutes les 60 s : ré-écriture des néons et des voies fantômes
      const cyc = Math.floor(time / 60), ph = (time % 60) / 60;
      if (cyc !== midnight) {
        midnight = cyc; pattern = cyc * 7919;
        const r = mulberry(pattern);
        headCol.forEach((_, i) => { headCol[i] = Math.floor(r() * NEON.length); heads.setColorAt(i, _c.set(NEON[headCol[i]])); }); heads.instanceColor.needsUpdate = true;
        ghostSegs.forEach(s => { s.on = r() < 0.45; s.col = NEON[Math.floor(r() * 2)]; });
        beamM.color.set(NEON[Math.floor(r() * 3)]);
        if (camD < 700 && ctx.ui && midnight > 0 && ph < 0.02 && Math.hypot(camPos.x - T.x, camPos.z - T.z) < 300) ctx.ui.toast?.('🕛 <b>Minuit à Néon-Bas</b> : l’Aiguillage-Monde réécrit les voies…');
      }
      // voies fantômes : balayage lumineux pendant les 8 s qui suivent minuit puis lueur qui respire
      const sweep = ph * 60;
      ghostSegs.forEach((s, i) => { let k = 0; if (s.on) k = sweep < 8 ? Math.max(0, 1 - Math.abs(sweep / 8 - s.ph) * 3) + 0.3 * (sweep / 8) : 0.35 + 0.25 * Math.sin(time * 2 + s.ph * 6); ghosts.setColorAt(i, _c.set(s.col || '#000').multiplyScalar(k)); });
      ghosts.instanceColor.needsUpdate = true;

      // fenêtres-pensées (rafraîchies 10×/s), orage de calcul juste après minuit
      winT += dt;
      if (winT > 0.1 && camD < 1400) { winT = 0; const storm = sweep < 6;
        winList.forEach((w, i) => { const v = Math.sin(time * (storm ? 9 : 1.3) + w.ph * 3 + w.y * 0.15) * 0.5 + 0.5; _c.set(storm ? NEON[(i + Math.floor(time * 6)) % 3] : (v > 0.8 ? '#ff2bd6' : '#2bf0ff')).multiplyScalar(v > 0.35 ? 0.25 + v * 0.5 : 0.05); wins.setColorAt(i, _c); });
        wins.instanceColor.needsUpdate = true; }
      beamM.opacity = 0.07 + 0.04 * Math.sin(time * 1.7) + (sweep < 6 ? 0.12 : 0);
      deadNeon.material.emissiveIntensity = Math.sin(time * 23) > 0.6 ? 2.5 : 0.4;

      if (camD > 1400) return;
      // drones-péage
      drones.forEach((d, i) => { const t = time * d.sp + d.ph, x = d.x + Math.sin(t) * d.r, z = d.z + Math.sin(t * 2) * d.r * 0.5, y = H(d.x, d.z) + d.h + Math.sin(t * 3) * 0.4;
        _e.set(Math.cos(t * 2) * 0.15, t * 2.5, Math.cos(t) * 0.2); _m.compose(_s.set(x, y, z), _q.setFromEuler(_e), _v.set(1, 1, 1)); dB.setMatrixAt(i, _m); dL.setMatrixAt(i, _m);
        dL.setColorAt(i, _c.set((Math.floor(time * 2 + i) % 2) ? '#2bf0ff' : '#ff2a3a')); });
      dB.instanceMatrix.needsUpdate = dL.instanceMatrix.needsUpdate = true; dL.instanceColor.needsUpdate = true;

      // pubs errantes : se tournent vers le joueur, glitch
      const pp = ctx.player?.pos;
      pubs.forEach(p => { const tgt = pp && Math.hypot(pp.x - p.g.position.x, pp.z - p.g.position.z) < 40 ? pp : camPos; p.holo.rotation.y = Math.atan2(tgt.x - p.g.position.x, tgt.z - p.g.position.z);
        p.holo.position.y = 3.2 + Math.sin(time * 1.5 + p.ph) * 0.25; const gl = Math.sin(time * 17 + p.ph * 5) > 0.93; p.holo.position.x = gl ? 0.15 : 0; p.holo.material.opacity = gl ? 0.4 : 0.85; p.cone.material.opacity = 0.09 + 0.05 * Math.sin(time * 3 + p.ph); });

      // Madame Péage : flotte, bras télescopiques, barrière qui se lève au passage du train
      if (toll) { toll.md.position.y = 1.8 + Math.sin(time * 2) * 0.12; toll.md.rotation.y = Math.sin(time * 0.6) * 0.6; toll.arms.forEach((a, i) => { a.scale.x = (i ? 1 : -1) * (0.6 + 0.9 * (Math.sin(time * 1.3 + i * 2) * 0.5 + 0.5)); });
        const th = ctx.train?.head; const tn = th && Math.hypot(th.x - toll.x, th.z - toll.z) < 40; toll.barrier.rotation.z += ((tn ? 1.4 : 0) - toll.barrier.rotation.z) * Math.min(1, dt * 3); }

      // VFX : étincelles des enseignes mortes / vapeur des bouches d'égout, près de la caméra seulement
      if (camD < 700 && rnd() < dt * 3 && ctx.sparks && junkGlow.length) { const m = junkGlow[Math.floor(rnd() * junkGlow.length)]; _s.setFromMatrixPosition(m);
        if (_s.distanceTo(camPos) < 120) ctx.sparks.emit(_s.clone().add(_v.set(0, 0.6, 0)), new THREE.Vector3((rnd() - 0.5) * 3, 2 + rnd() * 2, (rnd() - 0.5) * 3), { life: 0.7, size: 0.25, color: rnd() < 0.5 ? '#ff2bd6' : '#2bf0ff', alpha: 1 }); }
      if (camD < 300 && rnd() < dt * 4 && ctx.steam) ctx.steam.emit(new THREE.Vector3(T.x + (rnd() - 0.5) * 30, T.y + 9.5 + TH + 26, T.z + (rnd() - 0.5) * 30), new THREE.Vector3(0, 1.5, 0), { life: 3, size: 4, color: '#c79bff', alpha: 0.25 });

      // fragments
      const pl = ctx.player; halo.visible = false;
      if (pl && pl.mode === 'foot') { const e = ctx.input?.ah('interact');
        fragPts.forEach((f, i) => { const d = Math.hypot(pl.pos.x - f.x, pl.pos.z - f.z); if (d > 6) return;
          halo.visible = true; halo.position.set(f.x, f.y + 0.05 + Math.sin(time * 3) * 0.04, f.z); halo.scale.setScalar(1 + Math.sin(time * 4) * 0.08);
          if (d < 3 && e && !lastE) { const fr = LORE.fragments[i]; ctx.ui.say([{ who: fr.title, icon: '✦', color: '#e9c46a', text: fr.text }]); ctx.input.consume?.('interact');
            const S = ctx.S; if (S) { S.fragments ||= []; const id = 'neon-' + i; if (!S.fragments.includes(id)) S.fragments.push(id); } } });
        lastE = !!e; }
    },
  };
}
