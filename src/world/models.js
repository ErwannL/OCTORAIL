import * as THREE from 'three';
import { Kit, MAT, G, mat, glow } from './kit.js';

const PI = Math.PI, H = PI / 2;

// ------------------------------------------------------------------ Roues à rayons (axe X)
const wheelCache = new Map();
export function wheel(r = 0.75, { spokes = 12, paint = '#9c1f1f', counter = true } = {}) {
  const key = r + paint + spokes + counter;
  if (!wheelCache.has(key)) {
    const k = new Kit(), red = mat(paint, { roughness: 0.45, metalness: 0.2 }), steel = MAT.steel();
    k.add(G.tor(r * 0.9, r * 0.09, 8, 32), red, { r: [0, H, 0] });
    k.add(G.cyl(r, r, 0.16, 32), steel, { r: [0, 0, H] });               // bandage
    k.add(G.cyl(r * 1.06, r * 1.06, 0.05, 32), steel, { p: [-0.08, 0, 0], r: [0, 0, H] }); // boudin
    k.add(G.cyl(r * 0.22, r * 0.22, 0.24, 16), red, { r: [0, 0, H] });
    k.add(G.cyl(r * 0.1, r * 0.1, 0.3, 10), MAT.brass(), { r: [0, 0, H] });
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * PI * 2;
      k.add(G.box(0.06, r * 0.75, r * 0.07), red, { p: [0, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5], r: [a, 0, 0] });
    }
    if (counter) k.add(G.cyl(r * 0.6, r * 0.6, 0.08, 16, false), red, { p: [0, r * 0.45, 0], r: [0, 0, H], s: [1, 1, 0.45] });
    wheelCache.set(key, k);
  }
  return wheelCache.get(key).build();
}

// ------------------------------------------------------------------ Locomotive à vapeur
export function buildSteamLoco(tint = '#8b1e1e') {
  const g = new THREE.Group();
  const k = new Kit();
  const body = mat(tint, { roughness: 0.42, metalness: 0.25 });
  const black = MAT.iron(), steel = MAT.steel(), brass = MAT.brass(), red = MAT.red(), wood = MAT.woodDark();

  // châssis et traverses
  k.add(G.rbox(2.1, 0.36, 8.6, 0.05), black, { p: [0, 1.0, 0.2] });
  k.add(G.rbox(2.7, 0.55, 0.28, 0.05), red, { p: [0, 1.05, 4.45] });
  k.add(G.rbox(2.7, 0.45, 0.26, 0.05), red, { p: [0, 1.0, -4.0] });
  for (const x of [-0.85, 0.85]) {
    k.add(G.cyl(0.13, 0.13, 0.4, 12), steel, { p: [x, 1.05, 4.75], r: [H, 0, 0] });
    k.add(G.cyl(0.24, 0.24, 0.06, 18), steel, { p: [x, 1.05, 4.96], r: [H, 0, 0] });
  }
  // chasse-buffles (lattes)
  for (let i = -4; i <= 4; i++) {
    const x = i * 0.27;
    k.add(G.box(0.08, 0.06, 1.25), red, { p: [x, 0.62, 5.05], r: [-0.62, Math.atan(x * 0.35), 0] });
  }
  k.add(G.box(2.4, 0.1, 0.1), red, { p: [0, 0.88, 4.65] });
  // chaudière
  k.add(G.cyl(1.0, 1.0, 4.6, 32), body, { p: [0, 2.25, 1.0], r: [H, 0, 0] });
  for (const z of [-0.9, 0.3, 1.5, 2.7]) k.add(G.tor(1.015, 0.045, 6, 32), brass, { p: [0, 2.25, z] });
  // boîte à fumée + porte
  k.add(G.cyl(1.06, 1.06, 0.95, 32), black, { p: [0, 2.25, 3.65], r: [H, 0, 0] });
  k.add(G.lathe([[0, 0.18], [0.5, 0.15], [0.92, 0.05], [1.02, 0]], 32), black, { p: [0, 2.25, 4.12], r: [H, 0, 0] });
  k.add(G.cyl(0.32, 0.32, 0.05, 24), brass, { p: [0, 2.25, 4.32], r: [H, 0, 0] });
  k.add(G.box(0.7, 0.05, 0.06), brass, { p: [0, 2.0, 4.31] });
  // cheminée diamant
  k.add(G.lathe([[0.3, 0], [0.3, 0.7], [0.36, 0.9], [0.72, 1.45], [0.78, 1.62], [0.6, 1.7], [0.5, 1.68], [0.5, 1.3], [0, 1.3]], 28), black, { p: [0, 3.1, 3.6] });
  k.add(G.tor(0.75, 0.04, 6, 28), brass, { p: [0, 4.72, 3.6], r: [H, 0, 0] });
  // dômes : vapeur (laiton), sable (rouge), cloche
  k.add(G.lathe([[0.55, 0], [0.5, 0.25], [0.42, 0.5], [0.3, 0.62], [0, 0.66]], 24), brass, { p: [0, 3.12, 1.2] });
  k.add(G.lathe([[0.48, 0], [0.42, 0.25], [0.32, 0.42], [0, 0.46]], 24), body, { p: [0, 3.12, 2.4] });
  k.add(G.lathe([[0.22, 0], [0.18, 0.08], [0.12, 0.3], [0.04, 0.36], [0, 0.4]], 16), brass, { p: [0, 3.45, 0.1] });
  k.add(G.box(0.06, 0.25, 0.5), black, { p: [0, 3.35, 0.1] });
  // phare
  k.add(G.rbox(0.62, 0.62, 0.62, 0.06), black, { p: [0, 3.55, 4.0] });
  k.add(G.cyl(0.22, 0.26, 0.2, 18), brass, { p: [0, 3.55, 4.36], r: [H, 0, 0] });
  k.add(G.cone(0.08, 0.25, 8), black, { p: [0, 3.95, 4.0] });
  // cylindres / pistons
  for (const s of [-1, 1]) {
    k.add(G.cyl(0.34, 0.34, 1.2, 20), black, { p: [s * 1.18, 1.18, 3.3], r: [H, 0, 0] });
    k.add(G.cyl(0.36, 0.36, 0.08, 20), brass, { p: [s * 1.18, 1.18, 3.92], r: [H, 0, 0] });
    k.add(G.cyl(0.36, 0.36, 0.08, 20), brass, { p: [s * 1.18, 1.18, 2.68], r: [H, 0, 0] });
    k.add(G.box(0.12, 0.12, 1.6), steel, { p: [s * 1.18, 1.18, 2.0] });              // glissière
    // tablier et main courante
    k.add(G.box(0.5, 0.06, 5.2), black, { p: [s * 1.3, 1.5, 1.2] });
    k.add(G.cyl(0.03, 0.03, 4.6, 6), brass, { p: [s * 0.98, 2.95, 1.0], r: [H, 0, 0] });
    for (const z of [-0.8, 0.8, 2.4]) k.add(G.cyl(0.02, 0.02, 0.2, 6), brass, { p: [s * 1.0, 2.86, z], r: [0, 0, s * 0.7] });
    // tuyau d'injecteur
    k.add(G.tube([[s * 0.9, 1.7, -1.3], [s * 1.05, 1.9, 0], [s * 1.02, 1.6, 1.6], [s * 0.7, 1.35, 2.8]], 0.05, 24, 6), MAT.copper());
    // marchepied
    k.add(G.box(0.4, 0.05, 0.4), steel, { p: [s * 1.25, 0.6, -3.2] });
    k.add(G.box(0.05, 0.6, 0.05), steel, { p: [s * 1.25, 0.9, -3.0] });
  }
  // cabine
  const cz = -2.45, cw = 2.6, ch = 2.5, cy = 1.2;
  k.add(G.box(cw, ch, 0.12), body, { p: [0, cy + ch / 2, cz + 1.15] });          // façade
  for (const x of [-0.65, 0.65]) {
    k.add(G.tor(0.26, 0.05, 6, 20), brass, { p: [x, cy + 1.75, cz + 1.22] });
    k.add(G.cyl(0.25, 0.25, 0.02, 20), MAT.glass(), { p: [x, cy + 1.75, cz + 1.22], r: [H, 0, 0] });
  }
  for (const s of [-1, 1]) {
    const x = s * (cw / 2 - 0.06);
    k.add(G.box(0.12, 1.2, 2.4), body, { p: [x, cy + 0.6, cz] });               // bas
    k.add(G.box(0.12, 0.35, 2.4), body, { p: [x, cy + ch - 0.18, cz] });        // linteau
    k.add(G.box(0.12, ch - 1.55, 0.35), body, { p: [x, cy + 1.48 + (ch - 1.55) / 2 - 0.25, cz + 1.0] });
    k.add(G.box(0.12, ch - 1.55, 0.25), body, { p: [x, cy + 1.48 + (ch - 1.55) / 2 - 0.25, cz - 1.1] });
    k.add(G.box(0.14, 0.05, 2.4), brass, { p: [x, cy + 1.2, cz] });
    k.add(G.rbox(0.15, 0.5, 1.0, 0.04), mat('#f1e3c2'), { p: [x + s * 0.02, cy + 0.65, cz] }); // plaque n°
  }
  g.add(k.build());
  // toit bombé (arc) avec débord
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 3.0, 24, 1, true, PI - 0.85, 1.7), mat('#1a1b1e', { metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }));
  roof.rotation.x = H; roof.position.set(0, cy + ch + 0.15 - 1.75, cz); roof.castShadow = true;
  g.add(roof);
  // intérieur cabine : foyer lumineux
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), glow('#ff5a00', 3)); fire.position.set(0, 1.85, cz + 1.08); fire.rotation.y = PI; g.add(fire);
  g.userData.firebox = fire;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18), glow('#ffe7b0', 5)); lens.position.set(0, 3.55, 4.47); g.add(lens);
  // faisceau du phare (factice, additif, sans lumière dynamique)
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.5, 26, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.rotation.x = -H; beam.position.set(0, 3.0, 4.5 + 13); g.add(beam);
  g.userData.beam = beam;

  // roues
  const wheels = [];
  for (const [z, r] of [[3.1, 0.48], [1.25, 0.78], [-0.4, 0.78], [-2.05, 0.78]]) for (const s of [-1, 1]) {
    const w = wheel(r, { spokes: r > 0.6 ? 14 : 8, counter: r > 0.6 }); w.position.set(s * 0.95, r, z); g.add(w); wheels.push(w);
  }
  // bielles d'accouplement + bielle motrice (animées)
  const rods = [];
  for (const s of [-1, 1]) {
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 3.4), MAT.steel()); rod.position.set(s * 1.1, 0.78, -0.4); g.add(rod); rods.push(rod);
    const main = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 2.2), MAT.steel()); main.position.set(s * 1.16, 0.95, 1.95); g.add(main); rods.push(main);
  }
  g.userData.rods = rods;
  g.userData.wheels = wheels;
  g.userData.chimney = new THREE.Vector3(0, 4.85, 3.6);
  g.userData.whistle = new THREE.Vector3(0.4, 3.6, -1.0);
  g.userData.cab = new THREE.Vector3(0, 1.45, cz);
  g.userData.length = 9.4;
  return g;
}

// ------------------------------------------------------------------ Draisine à bras
export function buildDraisine() {
  const g = new THREE.Group(), k = new Kit();
  const wood = MAT.wood(), dark = MAT.iron(), brass = MAT.brass();
  k.add(G.rbox(1.9, 0.18, 3.4, 0.04), dark, { p: [0, 0.78, 0] });
  for (let i = 0; i < 7; i++) k.add(G.rbox(2.3, 0.1, 0.42, 0.03), wood, { p: [0, 0.92, -1.45 + i * 0.48] });
  for (const z of [-1.75, 1.75]) k.add(G.rbox(2.4, 0.25, 0.18, 0.03), MAT.red(), { p: [0, 0.8, z] });
  // chevalet de pompe
  for (const z of [-0.25, 0.25]) for (const s of [-1, 1]) k.add(G.box(0.1, 1.3, 0.1), dark, { p: [s * 0.18, 1.5, z], r: [0, 0, -s * 0.18] });
  k.add(G.cyl(0.07, 0.07, 0.7, 10), brass, { p: [0, 2.12, 0], r: [H, 0, 0] });
  // garde-corps
  for (const s of [-1, 1]) { k.add(G.cyl(0.03, 0.03, 3.0, 6), brass, { p: [s * 1.1, 1.45, 0], r: [H, 0, 0] }); for (const z of [-1.4, 0, 1.4]) k.add(G.cyl(0.03, 0.03, 0.5, 6), brass, { p: [s * 1.1, 1.2, z] }); }
  k.add(G.rbox(0.3, 0.3, 0.3, 0.04), dark, { p: [0, 1.15, 1.6] });
  g.add(k.build());
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), glow('#ffd27a', 4)); lamp.position.set(0, 1.15, 1.76); g.add(lamp);
  // balancier (pivot animé)
  const lever = new THREE.Group(); lever.position.set(0, 2.12, 0);
  const lk = new Kit();
  lk.add(G.rbox(0.12, 0.12, 2.6, 0.03), wood, {});
  for (const z of [-1.25, 1.25]) { lk.add(G.cyl(0.05, 0.05, 1.3, 8), brass, { p: [0, 0, z], r: [0, 0, H] }); lk.add(G.sph(0.07, 8, 6), MAT.red(), { p: [0.68, 0, z] }); lk.add(G.sph(0.07, 8, 6), MAT.red(), { p: [-0.68, 0, z] }); }
  lever.add(lk.build());
  g.add(lever); g.userData.lever = lever;
  const wheels = [];
  for (const z of [-1.2, 1.2]) for (const s of [-1, 1]) { const w = wheel(0.42, { spokes: 8, counter: false, paint: '#3a3a3a' }); w.position.set(s * 0.75, 0.42, z); g.add(w); wheels.push(w); }
  g.userData.wheels = wheels; g.userData.cab = new THREE.Vector3(0, 1.0, -0.9); g.userData.length = 3.8;
  return g;
}

// ------------------------------------------------------------------ Wagons
function bogies(k, len) { for (const z of [-len / 2 + 1.2, len / 2 - 1.2]) { k.add(G.rbox(1.9, 0.35, 1.9, 0.05), MAT.iron(), { p: [0, 0.55, z] }); for (const s of [-1, 1]) k.add(G.box(0.08, 0.3, 1.6), MAT.steel(), { p: [s * 0.96, 0.5, z] }); } }
function underframe(k, len, color) {
  k.add(G.rbox(2.3, 0.3, len, 0.04), MAT.iron(), { p: [0, 0.95, 0] });
  for (const z of [-len / 2 - 0.2, len / 2 + 0.2]) { k.add(G.box(0.25, 0.25, 0.5), MAT.steel(), { p: [0, 0.95, z] }); for (const x of [-0.8, 0.8]) { k.add(G.cyl(0.1, 0.1, 0.35, 10), MAT.steel(), { p: [x, 0.95, z + Math.sign(z) * 0.1], r: [H, 0, 0] }); k.add(G.cyl(0.2, 0.2, 0.05, 14), MAT.steel(), { p: [x, 0.95, z + Math.sign(z) * 0.3], r: [H, 0, 0] }); } }
  k.add(G.box(2.32, 0.08, len), mat(color, { roughness: 0.5 }), { p: [0, 1.12, 0] });
}

export function buildWagonModel(type, colorHint) {
  const g = new THREE.Group(), k = new Kit(); const L = 6.2;
  underframe(k, L, '#3a2a20'); bogies(k, L);
  const extra = {};
  if (type === 'charbon') {
    const body = mat('#2f2620', { roughness: 0.7, metalness: 0.2 });
    k.add(G.rbox(2.4, 1.4, L - 0.2, 0.12), body, { p: [0, 1.85, 0] });
    for (const z of [-2.2, -1.1, 0, 1.1, 2.2]) for (const s of [-1, 1]) k.add(G.box(0.04, 1.4, 0.08), MAT.iron(), { p: [s * 1.22, 1.85, z] });
    k.add(G.rbox(2.42, 0.1, L - 0.1, 0.03), MAT.brass(), { p: [0, 2.55, 0] });
    k.add(G.cyl(0.6, 0.6, 1.6, 20), mat('#4a5866', { metalness: 0.5, roughness: 0.4 }), { p: [0, 2.7, -2.0], r: [0, 0, H] });
    g.add(k.build());
    // tas de charbon (mise à l'échelle selon le stock)
    const pk = new Kit(); const rnd = (a) => Math.sin(a * 12.9898) * 0.5 + 0.5;
    for (let i = 0; i < 26; i++) pk.add(G.box(0.5, 0.5, 0.5), MAT.coal(), { p: [(rnd(i) - 0.5) * 1.8, rnd(i + 3) * 0.4, -1.1 + rnd(i + 7) * 3.6], r: [rnd(i + 1) * 3, rnd(i + 2) * 3, 0], s: [1 + rnd(i + 4), 0.8, 1 + rnd(i + 5)] });
    const pile = pk.build(); pile.position.y = 2.3; g.add(pile); extra.pile = pile;
  } else if (type === 'vitrine') {
    const gold = MAT.brass();
    k.add(G.rbox(2.4, 0.5, L - 0.3, 0.08), mat('#6b1e2a', { roughness: 0.4 }), { p: [0, 1.4, 0] });
    for (const x of [-1.1, 1.1]) for (const z of [-2.2, -0.75, 0.75, 2.2]) k.add(G.cyl(0.06, 0.06, 2.6, 8), gold, { p: [x, 2.95, z] });
    k.add(G.rbox(2.5, 0.18, L - 0.4, 0.05), gold, { p: [0, 4.3, 0] });
    k.add(G.lathe([[1.0, 0], [0.8, 0.3], [0.4, 0.5], [0, 0.55]], 20), gold, { p: [0, 4.38, 0] });
    k.add(G.sph(0.15, 10, 8), gold, { p: [0, 4.95, 0] });
    g.add(k.build());
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, L - 0.5), new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.3, depthWrite: false }));
    glass.position.y = 2.95; g.add(glass);
    extra.slot = new THREE.Vector3(0, 1.65, 0);
  } else if (type === 'dortoir') {
    const c = mat('#2f4f6b', { roughness: 0.45 });
    k.add(G.rbox(2.5, 2.4, L, 0.15), c, { p: [0, 2.35, 0] });
    k.add(G.box(2.52, 0.12, L), MAT.brass(), { p: [0, 1.75, 0] });
    for (const z of [-2.0, -0.7, 0.6, 1.9]) for (const s of [-1, 1]) {
      k.add(G.rbox(0.06, 0.8, 0.9, 0.03), MAT.brass(), { p: [s * 1.26, 2.6, z] });
      k.add(G.box(0.04, 0.68, 0.78), glow('#ffcf7a', 1.4), { p: [s * 1.28, 2.6, z] });
    }
    k.add(G.cyl(1.4, 1.4, L + 0.1, 24, false), mat('#3a3a3a', { roughness: 0.7 }), { p: [0, 3.0, 0], r: [H, 0, 0], s: [1, 0.35, 1] });
    for (const z of [-1.5, 1.5]) k.add(G.cyl(0.12, 0.15, 0.4, 10), MAT.iron(), { p: [0.4, 3.75, z] });
    g.add(k.build());
  } else { // stockage / isotherme
    const white = type === 'isotherme';
    const c = mat(white ? '#dfeef5' : '#7a4a24', { roughness: 0.75 });
    k.add(G.rbox(2.5, 2.4, L, 0.08), c, { p: [0, 2.35, 0] });
    for (let i = 0; i < 14; i++) for (const s of [-1, 1]) k.add(G.box(0.03, 2.3, 0.05), white ? mat('#9ec9dc') : MAT.woodDark(), { p: [s * 1.26, 2.35, -L / 2 + 0.25 + i * (L - 0.5) / 13] });
    for (const s of [-1, 1]) { k.add(G.rbox(0.08, 2.0, 1.6, 0.03), white ? mat('#8fd0ee') : mat('#5a3418'), { p: [s * 1.27, 2.25, 0] }); k.add(G.box(0.1, 0.06, 2.4), MAT.iron(), { p: [s * 1.3, 3.35, 0] }); }
    k.add(G.cyl(1.5, 1.5, L + 0.1, 24, false), mat('#3a3a3a', { roughness: 0.7 }), { p: [0, 3.05, 0], r: [H, 0, 0], s: [1, 0.3, 1] });
    if (white) k.add(G.box(2.56, 0.25, L), glow('#5fd0ff', 0.6), { p: [0, 1.9, 0] });
    g.add(k.build());
  }
  const wheels = [];
  for (const z of [-L / 2 + 0.75, -L / 2 + 1.65, L / 2 - 1.65, L / 2 - 0.75]) for (const s of [-1, 1]) { const w = wheel(0.45, { spokes: 8, counter: false, paint: '#2b2b2b' }); w.position.set(s * 0.95, 0.45, z); g.add(w); wheels.push(w); }
  g.userData = { ...extra, wheels, length: L + 0.9 };
  return g;
}

// ------------------------------------------------------------------ Passager (avatar)
export function buildAvatarModel(color = '#e0703a') {
  const g = new THREE.Group();
  const suit = mat(color, { roughness: 0.55 }), dark = mat('#2a2b33', { roughness: 0.7 }), light = mat('#e9e3d6', { roughness: 0.4 });
  const visor = mat('#0a1a22', { metalness: 0.6, roughness: 0.1, emissive: '#3fd8ff', emissiveIntensity: 0.9 });
  const body = new THREE.Group(); body.position.y = 0.95; g.add(body);
  const bk = new Kit();
  bk.add(G.rbox(0.62, 0.72, 0.42, 0.16, 3), suit, { p: [0, 0.12, 0] });
  bk.add(G.rbox(0.66, 0.12, 0.46, 0.05), dark, { p: [0, -0.2, 0] });               // ceinture
  bk.add(G.rbox(0.14, 0.1, 0.05, 0.02), MAT.brass(), { p: [0, -0.2, 0.24] });
  bk.add(G.rbox(0.36, 0.2, 0.05, 0.03), light, { p: [0.08, 0.28, 0.215] });         // badge
  bk.add(G.rbox(0.5, 0.62, 0.3, 0.08), dark, { p: [0, 0.12, -0.34] });              // sac
  bk.add(G.cyl(0.11, 0.11, 0.62, 14), MAT.copper(), { p: [0.15, 0.14, -0.5] });
  bk.add(G.cyl(0.11, 0.11, 0.62, 14), MAT.copper(), { p: [-0.15, 0.14, -0.5] });
  bk.add(G.tor(0.36, 0.05, 6, 20), dark, { p: [0, 0.5, 0], r: [H, 0, 0] });          // col
  bk.add(G.tor(0.3, 0.09, 8, 20), mat('#c94a3a', { roughness: 0.9 }), { p: [0, 0.48, 0.02], r: [H + 0.15, 0, 0] }); // écharpe
  bk.add(G.box(0.14, 0.42, 0.06), mat('#c94a3a', { roughness: 0.9 }), { p: [0.16, 0.25, 0.28], r: [0.1, 0, 0.15] });
  for (const s of [-1, 1]) {
    bk.add(G.sph(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark, { p: [s * 0.36, 0.42, 0], s: [1.1, 0.7, 1] }); // épaulettes
    bk.add(G.rbox(0.16, 0.18, 0.1, 0.03), mat('#5a4030'), { p: [s * 0.22, -0.32, 0.22] });                  // poches
    bk.add(G.box(0.04, 0.6, 0.03), dark, { p: [s * 0.18, 0.15, 0.215] });                                   // bretelles
  }
  bk.add(G.cyl(0.04, 0.04, 0.5, 6), MAT.copper(), { p: [0, 0.5, -0.45], r: [0.6, 0, 0] });                  // tuyau d'air
  bk.add(G.rbox(0.16, 0.1, 0.06, 0.02), glow('#6fe39a', 1.5), { p: [-0.18, 0.12, 0.22] });                  // voyant de vie
  body.add(bk.build());
  const head = new THREE.Group(); head.position.y = 0.82; body.add(head);
  const hk = new Kit();
  hk.add(G.sph(0.34, 24, 18), light, {});
  hk.add(G.sph(0.3, 24, 12, -1.0, 2.0, 0.95, 1.05), visor, { p: [0, 0, 0.07] });
  hk.add(G.tor(0.34, 0.035, 6, 24), dark, { r: [0, 0, 0] });
  hk.add(G.cyl(0.015, 0.015, 0.35, 6), dark, { p: [0.18, 0.38, -0.05] });
  for (const s of [-1, 1]) { hk.add(G.cyl(0.09, 0.09, 0.08, 14), dark, { p: [s * 0.33, 0, 0], r: [0, 0, H] }); hk.add(G.cyl(0.05, 0.05, 0.1, 10), MAT.brass(), { p: [s * 0.37, 0, 0], r: [0, 0, H] }); }
  hk.add(G.box(0.05, 0.12, 0.05), MAT.brass(), { p: [0, 0.33, 0.12] });
  head.add(hk.build());
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glow('#ffb347', 3)); tip.position.set(0.18, 0.57, -0.05); head.add(tip);
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), glow('#ffffff', 2)); eye.position.set(s * 0.09, 0.02, 0.27); head.add(eye); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glow('#ffe0a0', 4)); lamp.position.set(0, 0.52, -0.52); body.add(lamp);
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.16, 0.72, 0); g.add(hip);
    const lk = new Kit(); lk.add(G.cap(0.12, 0.38, 4, 10), dark, { p: [0, -0.3, 0] }); lk.add(G.rbox(0.24, 0.2, 0.36, 0.06), mat('#4a3020'), { p: [0, -0.62, 0.05] }); lk.add(G.box(0.26, 0.05, 0.4), MAT.iron(), { p: [0, -0.73, 0.06] }); lk.add(G.sph(0.11, 10, 8), mat(color, { roughness: 0.55 }), { p: [0, -0.3, 0.07], s: [1, 0.9, 0.7] }); lk.add(G.tor(0.12, 0.025, 4, 12), MAT.brass(), { p: [0, -0.5, 0], r: [H, 0, 0] });
    hip.add(lk.build()); legs.push(hip);
    const sh = new THREE.Group(); sh.position.set(s * 0.4, 1.33, 0); g.add(sh);
    const ak = new Kit(); ak.add(G.cap(0.1, 0.42, 4, 10), suit, { p: [0, -0.27, 0] }); ak.add(G.rbox(0.2, 0.2, 0.18, 0.06), dark, { p: [0, -0.56, 0] }); ak.add(G.cap(0.035, 0.08, 3, 6), dark, { p: [0, -0.62, 0.09], r: [0.6, 0, 0] }); ak.add(G.tor(0.11, 0.03, 4, 12), dark, { p: [0, -0.42, 0], r: [H, 0, 0] }); if (s > 0) ak.add(G.rbox(0.12, 0.08, 0.14, 0.02), glow('#5fe0ff', 1.2), { p: [0.08, -0.35, 0.02] });
    sh.add(ak.build()); arms.push(sh);
  }
  g.userData = { legs, arms, body };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ------------------------------------------------------------------ SHÉRIF-7
export function buildSheriffModel() {
  const g = new THREE.Group();
  const brass = MAT.brass(), dark = mat('#2a1d12', { metalness: 0.4, roughness: 0.6 }), red = MAT.red(), leather = mat('#5a3a1e', { roughness: 0.8 });
  const eye = mat('#111', { emissive: '#ffcc33', emissiveIntensity: 3 });
  const wheelG = new THREE.Group(); wheelG.position.y = 0.6; g.add(wheelG);
  const wk = new Kit(); wk.add(G.tor(0.52, 0.12, 10, 28), dark, { r: [0, H, 0] }); wk.add(G.cyl(0.13, 0.13, 0.3, 12), brass, { r: [0, 0, H] });
  for (let i = 0; i < 6; i++) wk.add(G.box(0.05, 0.9, 0.05), brass, { r: [i * PI / 6 * 2 / 2, 0, 0] });
  wheelG.add(wk.build());
  const k = new Kit();
  k.add(G.box(0.08, 0.9, 0.08), brass, { p: [0.18, 1.1, 0], r: [0, 0, 0.12] }); k.add(G.box(0.08, 0.9, 0.08), brass, { p: [-0.18, 1.1, 0], r: [0, 0, -0.12] });
  k.add(G.lathe([[0.3, 0], [0.5, 0.15], [0.58, 0.55], [0.52, 0.95], [0.36, 1.1], [0, 1.12]], 24), brass, { p: [0, 1.45, 0] });
  k.add(G.tor(0.56, 0.06, 6, 24), leather, { p: [0, 1.62, 0], r: [H, 0, 0] });
  k.add(G.rbox(0.18, 0.14, 0.06, 0.03), MAT.brass(), { p: [0, 1.62, 0.57] });
  k.add(G.cyl(0.08, 0.1, 0.36, 10), leather, { p: [0.55, 1.5, 0.1] });              // étui
  k.add(G.cone(0.32, 0.4, 4), red, { p: [0, 2.42, 0.28], r: [PI + 0.3, PI / 4, 0] });
  k.add(G.rbox(0.72, 0.56, 0.62, 0.12, 3), brass, { p: [0, 2.85, 0] });
  for (const x of [-0.17, 0.17]) { k.add(G.cyl(0.12, 0.12, 0.06, 16), dark, { p: [x, 2.9, 0.31], r: [H, 0, 0] }); }
  k.add(G.tor(0.15, 0.035, 6, 14, PI), dark, { p: [0, 2.7, 0.32], r: [0, 0, PI] });
  for (const x of [-0.38, 0.38]) k.add(G.cyl(0.07, 0.07, 0.12, 10), dark, { p: [x, 2.85, 0], r: [0, 0, H] });
  k.add(G.cyl(0.015, 0.015, 0.4, 6), dark, { p: [0.25, 3.25, -0.2] });
  g.add(k.build());
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), mat('#ffd24a', { metalness: 1, roughness: 0.2, emissive: '#7a5a00', emissiveIntensity: 0.6 })); star.position.set(0.24, 2.15, 0.55); star.scale.z = 0.35; g.add(star);
  for (const x of [-0.17, 0.17]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.08, 14), eye); e.position.set(x, 2.9, 0.345); g.add(e); }
  const ant = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glow('#ff2a2a', 3)); ant.position.set(0.25, 3.47, -0.2); g.add(ant);
  const hatK = new Kit();
  hatK.add(G.lathe([[0.82, 0], [0.8, 0.05], [0.5, 0.06], [0.44, 0.1], [0.42, 0.42], [0.3, 0.5], [0, 0.46]], 28), leather, {});
  hatK.add(G.tor(0.44, 0.04, 6, 24), red, { p: [0, 0.14, 0], r: [H, 0, 0] });
  const hat = hatK.build(); hat.position.y = 3.12; hat.rotation.z = 0.1; g.add(hat);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.6, 2.25, 0); g.add(sh);
    const ak = new Kit(); ak.add(G.cyl(0.07, 0.07, 0.6, 8), brass, { p: [0, -0.3, 0] }); ak.add(G.sph(0.1, 10, 8), dark, { p: [0, -0.6, 0] }); ak.add(G.tor(0.09, 0.03, 6, 12), dark, { p: [0, -0.68, 0] });
    sh.add(ak.build()); sh.rotation.z = s * 0.35; arms.push(sh);
  }
  g.userData = { arms, wheel: wheelG, eyeMat: eye, hat: [hat, hat] };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ------------------------------------------------------------------ Décor
export function cactusGeometry() {
  const k = new Kit(), green = mat('#3f7a3a', { roughness: 0.8 });
  const ribbed = (r, h, seg = 10) => { const geo = new THREE.CylinderGeometry(r, r * 1.05, h, seg * 2, 4); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const f = 1 + 0.09 * Math.cos(a * seg); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); } geo.computeVertexNormals(); return geo; };
  k.add(ribbed(0.45, 3.6), green, { p: [0, 1.8, 0] });
  k.add(G.sph(0.47, 16, 8, 0, PI * 2, 0, H), green, { p: [0, 3.6, 0] });
  k.add(G.tube([[0.35, 1.7, 0], [0.95, 1.75, 0], [1.05, 2.3, 0], [1.05, 2.9, 0]], 0.28, 16, 10), green);
  k.add(G.sph(0.28, 12, 8, 0, PI * 2, 0, H), green, { p: [1.05, 2.9, 0] });
  k.add(G.tube([[-0.35, 2.2, 0], [-0.85, 2.25, 0.1], [-0.92, 2.7, 0.1], [-0.92, 3.1, 0.1]], 0.24, 16, 10), green);
  k.add(G.sph(0.24, 12, 8, 0, PI * 2, 0, H), green, { p: [-0.92, 3.1, 0.1] });
  return k.geometry();
}

export function buildWesternBuilding(name, w, h, d, colors, textSprite) {
  const k = new Kit();
  const [c1, c2, c3] = colors.map(c => mat(c, { roughness: 0.85 }));
  const trim = mat('#efe2c4', { roughness: 0.7 }), dark = MAT.woodDark(), glass = glow('#ffcf7a', 0.9);
  k.add(G.box(w, h, d), c1, { p: [0, h / 2, 0] });
  // planches horizontales
  for (let y = 0.4; y < h; y += 0.45) k.add(G.box(w + 0.04, 0.04, d + 0.04), c2, { p: [0, y, 0] });
  // fausse façade
  const fh = h + 2.4;
  k.add(G.box(w + 0.6, fh, 0.3), c2, { p: [0, fh / 2, d / 2 + 0.1] });
  k.add(G.box(w + 0.9, 0.3, 0.5), trim, { p: [0, fh, d / 2 + 0.12] });
  k.add(G.box(w + 0.7, 0.18, 0.4), trim, { p: [0, fh - 0.45, d / 2 + 0.15] });
  for (const s of [-1, 1]) k.add(G.box(0.25, fh, 0.4), trim, { p: [s * (w / 2 + 0.2), fh / 2, d / 2 + 0.15] });
  // porte + fenêtres
  k.add(G.box(1.3, 2.3, 0.1), dark, { p: [0, 1.15, d / 2 + 0.27] });
  k.add(G.box(1.5, 0.15, 0.15), trim, { p: [0, 2.35, d / 2 + 0.3] });
  for (const s of [-1, 1]) {
    const x = s * Math.min(w / 2 - 1.1, 2.2);
    k.add(G.box(1.2, 1.3, 0.06), glass, { p: [x, 1.6, d / 2 + 0.27] });
    k.add(G.box(1.4, 0.12, 0.12), trim, { p: [x, 2.3, d / 2 + 0.3] }); k.add(G.box(1.4, 0.12, 0.2), trim, { p: [x, 0.9, d / 2 + 0.3] });
    k.add(G.box(0.08, 1.3, 0.1), trim, { p: [x, 1.6, d / 2 + 0.3] });
    k.add(G.box(0.4, 1.4, 0.06), c3, { p: [x - 0.85, 1.6, d / 2 + 0.3], r: [0, 0.4, 0] });
    k.add(G.box(0.4, 1.4, 0.06), c3, { p: [x + 0.85, 1.6, d / 2 + 0.3], r: [0, -0.4, 0] });
    // étage
    k.add(G.box(1.0, 1.0, 0.06), glow('#ffd88a', 0.5), { p: [x, h - 1.0, d / 2 + 0.27] });
    k.add(G.box(1.15, 1.15, 0.05), trim, { p: [x, h - 1.0, d / 2 + 0.25] });
  }
  // auvent + poteaux + trottoir en planches
  k.add(G.box(w + 0.6, 0.12, 2.6), dark, { p: [0, 3.1, d / 2 + 1.5], r: [0.12, 0, 0] });
  for (const x of [-w / 2, -w / 6, w / 6, w / 2]) k.add(G.box(0.16, 3.0, 0.16), dark, { p: [x, 1.5, d / 2 + 2.6] });
  k.add(G.box(w + 0.8, 0.15, 2.9), mat('#6b4a2b', { roughness: 0.9 }), { p: [0, 0.08, d / 2 + 1.5] });
  // toit
  k.add(G.box(w + 0.2, 0.2, d + 0.4), dark, { p: [0, h + 0.1, 0] });
  // tonneaux
  for (const x of [-w / 2 + 0.5, w / 2 - 0.6]) { k.add(G.lathe([[0.32, 0], [0.38, 0.4], [0.32, 0.8], [0, 0.8]], 14), mat('#6b4426'), { p: [x, 0.15, d / 2 + 2.2] }); k.add(G.tor(0.36, 0.025, 4, 14), MAT.iron(), { p: [x, 0.35, d / 2 + 2.2], r: [H, 0, 0] }); }
  const grp = k.build();
  const tex = textSprite(name, { w: 512, h: 128, bg: '#3a2412', fg: '#f3d9a0', border: '#d9a35a', font: 'bold 70px Georgia' });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, w * 0.2), new THREE.MeshBasicMaterial({ map: tex }));
  sg.position.set(0, h + 1.0, d / 2 + 0.27); grp.add(sg);
  return grp;
}
