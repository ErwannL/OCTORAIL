import * as THREE from 'three';
import { Kit, G, mat, MAT, glow } from './kit.js';
import { BIOMES } from './biomes.js';
import { textSprite } from './tracks.js';

const PI = Math.PI, H = PI / 2;
const at = (a, r) => [Math.cos(a) * r, -Math.sin(a) * r];

// ------------------------------------------------------------------ LE MOYEU (base des Bâtisseurs)
export function buildHub(scene, interact) {
  const g = new THREE.Group();
  const stone = mat('#a8977c', { roughness: 0.95 }), stoneDark = mat('#7d6c56', { roughness: 0.95 }), brass = MAT.brass(), iron = MAT.iron(), steel = MAT.steel(), wood = MAT.wood();

  // --- Dalle en anneaux de pierre + pavés
  const k = new Kit();
  k.add(G.cyl(48, 49, 1.2, 96), stone, { p: [0, -0.4, 0] });
  k.add(G.cyl(46.5, 46.5, 0.1, 96), stoneDark, { p: [0, 0.21, 0] });
  k.add(G.cyl(44, 44, 0.12, 96), stone, { p: [0, 0.22, 0] });
  for (let ring = 0; ring < 4; ring++) { const r = 14 + ring * 8; k.add(G.tor(r, 0.12, 4, 96), stoneDark, { p: [0, 0.27, 0], r: [H, 0, 0] }); }
  for (let i = 0; i < 48; i++) { const a = i / 48 * PI * 2; const [x, z] = at(a, 29); k.add(G.box(0.18, 0.06, 30), stoneDark, { p: [x, 0.27, z], r: [0, a + H, 0] }); }
  // bordure + marches + balustrade
  k.add(G.tor(48.2, 0.5, 6, 96), stoneDark, { p: [0, 0.2, 0], r: [H, 0, 0] });
  for (let i = 0; i < 64; i++) { const a = i / 64 * PI * 2; if (Math.abs(((a / (PI / 4)) % 1) - 0) < 0.12 || Math.abs(((a / (PI / 4)) % 1) - 1) < 0.12) continue; const [x, z] = at(a, 47.4); k.add(G.cyl(0.18, 0.22, 1.1, 8), stone, { p: [x, 0.75, z] }); }
  k.add(G.tor(47.4, 0.12, 4, 96), brass, { p: [0, 1.32, 0], r: [H, 0, 0] });
  // rose des vents gravée : 8 rayons de couleur
  BIOMES.forEach((b, i) => {
    const a = i * PI / 4;
    const c = b.open ? mat(b.skyBot, { emissive: b.skyBot, emissiveIntensity: 0.45, roughness: 0.6 }) : mat('#' + new THREE.Color(b.skyBot).lerp(new THREE.Color('#a8977c'), 0.6).getHexString(), { roughness: 0.8 });
    for (let s = 0; s < 6; s++) { const [x, z] = at(a, 12 + s * 5); k.add(G.box(3.6, 0.08, 1.1 - s * 0.12), c, { p: [x, 0.28, z], r: [0, a, 0] }); }
    const [x, z] = at(a, 42); k.add(G.cyl(1.2, 1.2, 0.1, 6), c, { p: [x, 0.29, z] });
  });
  // --- Quais des 8 voies : quai, auvent, lampadaires, bancs, horloge
  BIOMES.forEach((b, i) => {
    const a = i * PI / 4, tan = [-Math.sin(a), -Math.cos(a)];
    const side = (d) => { const [x, z] = at(a, 60); return [x + tan[0] * d, z + tan[1] * d]; };
    const [qx, qz] = side(5.6);
    k.add(G.rbox(4.6, 1.0, 20, 0.1), stone, { p: [qx, 0.3, qz], r: [0, a + H, 0] });
    k.add(G.box(4.7, 0.12, 20.2), mat('#e8c84a', { roughness: 0.6 }), { p: [qx - tan[0] * 2.1, 0.82, qz - tan[1] * 2.1], r: [0, a + H, 0], s: [0.08, 1, 1] });
    // auvent en fer forgé
    for (const d of [-7, 0, 7]) {
      const ax = qx + Math.cos(a) * d, az = qz - Math.sin(a) * d;
      k.add(G.cyl(0.12, 0.16, 4.2, 10), iron, { p: [ax, 2.9, az] });
      k.add(G.tor(0.5, 0.05, 4, 12, PI), iron, { p: [ax, 4.5, az], r: [0, a, 0] });
    }
    k.add(G.box(5.6, 0.12, 19), mat(b.open ? '#3a5a4a' : '#4a4a4a', { roughness: 0.6, metalness: 0.3 }), { p: [qx - tan[0] * 0.4, 5.1, qz - tan[1] * 0.4], r: [0.12, a + H, 0] });
    for (const d of [-9, -4.5, 0, 4.5, 9]) { const ax = qx + Math.cos(a) * d - tan[0] * 0.4, az = qz - Math.sin(a) * d - tan[1] * 0.4; k.add(G.box(5.6, 0.1, 0.1), brass, { p: [ax, 5.05, az], r: [0, a + H, 0] }); }
    // banc
    const bx = qx + tan[0] * 1.2, bz = qz + tan[1] * 1.2;
    k.add(G.box(0.5, 0.08, 2.2), wood, { p: [bx, 1.3, bz], r: [0, a, 0] });
    k.add(G.box(0.08, 0.5, 2.2), wood, { p: [bx + tan[0] * 0.25, 1.55, bz + tan[1] * 0.25], r: [0, a, 0] });
    // horloge sur poteau
    const [cx, cz] = side(9.5);
    k.add(G.cyl(0.1, 0.12, 4, 8), iron, { p: [cx, 2.8, cz] });
    k.add(G.cyl(0.5, 0.5, 0.25, 20), brass, { p: [cx, 4.9, cz], r: [H, 0, a + H] });
    k.add(G.cyl(0.42, 0.42, 0.27, 20), mat('#f6ecd2'), { p: [cx, 4.9, cz], r: [H, 0, a + H] });
  });
  // --- Dôme des capsules : armature en fer + verrière
  for (let i = 0; i < 12; i++) k.add(G.tor(10, 0.14, 6, 32, PI), iron, { p: [0, 0.3, 0], r: [0, i * PI / 12, 0] });
  for (const y of [3.5, 6.6, 8.9]) { const r = Math.sqrt(100 - y * y); k.add(G.tor(r, 0.1, 4, 48), brass, { p: [0, 0.3 + y, 0], r: [H, 0, 0] }); }
  k.add(G.cyl(10.4, 10.6, 0.6, 48), stoneDark, { p: [0, 0.3, 0] });
  // capsules cryo détaillées
  for (let p = 0; p < 8; p++) {
    const a = p * PI / 4 + PI / 8; const [x, z] = at(a, 6.6);
    k.add(G.cyl(1.0, 1.15, 0.5, 20), iron, { p: [x, 0.75, z] });
    k.add(G.tor(0.82, 0.08, 6, 24), brass, { p: [x, 1.05, z], r: [H, 0, 0] });
    k.add(G.tor(0.82, 0.08, 6, 24), brass, { p: [x, 3.2, z], r: [H, 0, 0] });
    k.add(G.lathe([[0.85, 0], [0.7, 0.25], [0.3, 0.45], [0, 0.5]], 20), iron, { p: [x, 3.25, z] });
    for (const d of [-1, 1]) k.add(G.tube([[x + Math.cos(a + d * 0.4) * 1.0, 0.8, z - Math.sin(a + d * 0.4) * 1.0], [x * 0.75, 0.55, z * 0.75], [x * 0.4, 0.45, z * 0.4]], 0.07, 12, 6), MAT.copper());
    k.add(G.rbox(0.4, 0.3, 0.1, 0.03), glow(p === 3 ? '#ff8a3a' : '#5fe0ff', 1.5), { p: [x + Math.cos(a) * 1.05, 1.0, z - Math.sin(a) * 1.05], r: [0, a + H, 0] });
  }
  g.add(k.build());
  const verriere = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16, 0, PI * 2, 0, H), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.1, roughness: 0.1, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  verriere.position.y = 0.3; g.add(verriere);
  const podGlass = new THREE.MeshStandardMaterial({ color: '#9fe3ff', transparent: true, opacity: 0.28, roughness: 0.05, emissive: '#2a8fb0', emissiveIntensity: 0.5, depthWrite: false });
  for (let p = 0; p < 8; p++) { const a = p * PI / 4 + PI / 8; const [x, z] = at(a, 6.6); const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.15, 20, 1, true), podGlass); gl.position.set(x, 2.12, z); g.add(gl); }

  // --- Coeur du Moyeu : noyau + anneaux gyroscopiques
  const core = new THREE.Group(); core.position.y = 6.5; g.add(core);
  const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 2), mat('#ffb347', { emissive: '#ff9a2a', emissiveIntensity: 2.2, flatShading: true })); core.add(nucleus);
  const rings = [];
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.3 + i * 0.35, 0.05, 6, 48), brass); r.rotation.set(i * 0.9, i * 0.5, 0); core.add(r); rings.push(r); }
  core.userData.rings = rings;
  const ck = new Kit(); ck.add(G.cyl(0.08, 0.08, 6, 8), iron, { p: [0, 3.5, 0] }); for (let i = 0; i < 4; i++) ck.add(G.cyl(0.05, 0.05, 6, 6), iron, { p: [Math.cos(i * H) * 1.5, 3.3, Math.sin(i * H) * 1.5], r: [Math.sin(i * H) * 0.25, 0, -Math.cos(i * H) * 0.25] });
  const cables = ck.build(); g.add(cables);

  // --- Machines des Bâtisseurs
  const machines = {};
  const place = (name, angle, r, grp) => { const [x, z] = at(angle, r); grp.position.set(x, 0.25, z); grp.rotation.y = angle - H; g.add(grp); machines[name] = grp; return grp; };
  place('coal', PI * 0.62, 30, coalMachine());
  place('water', PI * 0.88, 30, waterTower());
  place('shop', PI * 0.38, 30, shopKiosk());
  place('hall', PI * 1.15, 32, findsHall());

  scene.add(g);
  g.updateMatrixWorld(true);
  const wp = (m, dx = 0, dz = 3) => m.localToWorld(new THREE.Vector3(dx, 0, dz));
  interact.add({ id: 'coal', pos: wp(machines.coal, 0, 4.5), r: 5, label: 'Charbonnière — [E] prendre du charbon' });
  interact.add({ id: 'water', pos: wp(machines.water, 0, 3.5), r: 5, label: 'Château d\'eau — [E] remplir le réservoir du train' });
  interact.add({ id: 'shop', pos: wp(machines.shop, 0, 3.2), r: 4.5, label: 'Comptoir — [E] améliorations' });
  interact.add({ id: 'hall', pos: wp(machines.hall, 0, 4), r: 6, label: 'Hall des trouvailles' });
  return { group: g, core, coreLight: { intensity: 0 }, machines, nucleus };
}

function coalMachine() {
  const grp = new THREE.Group(), k = new Kit();
  const iron = MAT.iron(), brass = MAT.brass(), rust = mat('#6b3a22', { roughness: 0.8, metalness: 0.3 });
  // silo riveté
  k.add(G.cyl(2.6, 2.6, 6.5, 24), rust, { p: [0, 4.0, -1] });
  for (let y = 1.2; y < 7; y += 1.1) k.add(G.tor(2.62, 0.06, 4, 32), iron, { p: [0, y, -1], r: [H, 0, 0] });
  k.add(G.lathe([[2.7, 0], [2.4, 0.6], [1.2, 1.4], [0.3, 1.7], [0, 1.7]], 24), iron, { p: [0, 7.25, -1] });
  k.add(G.cone(2.6, 2.2, 24), iron, { p: [0, 0.4, -1], r: [PI, 0, 0] });
  for (const [x, z] of [[-2, -3], [2, -3], [-2, 1], [2, 1]]) k.add(G.box(0.3, 3, 0.3), iron, { p: [x, 1.5, z] });
  // tapis convoyeur incliné vers le quai
  k.add(G.box(1.2, 0.2, 6), iron, { p: [0, 1.9, 3.0], r: [0.35, 0, 0] });
  k.add(G.box(1.0, 0.06, 6), mat('#202020', { roughness: 1 }), { p: [0, 2.03, 3.0], r: [0.35, 0, 0] });
  for (let i = 0; i < 6; i++) k.add(G.cyl(0.12, 0.12, 1.25, 10), MAT.steel(), { p: [0, 0.95 + i * 0.37, 5.6 - i * 1.0], r: [0, 0, H] });
  for (const z of [1.2, 4.5]) for (const x of [-0.6, 0.6]) k.add(G.box(0.12, 2.2 - (z > 3 ? 1.1 : 0), 0.12), iron, { p: [x, 0.9 - (z > 3 ? 0.4 : 0), z] });
  // chariot de charbon
  k.add(G.rbox(1.6, 0.9, 2.2, 0.08), rust, { p: [2.8, 0.75, 3.8] });
  for (const z of [3.1, 4.5]) for (const x of [2.2, 3.4]) k.add(G.cyl(0.3, 0.3, 0.12, 12), iron, { p: [x, 0.3, z], r: [0, 0, H] });
  // tas de charbon
  for (let i = 0; i < 18; i++) k.add(G.box(0.6, 0.6, 0.6), MAT.coal(), { p: [-2.4 + Math.sin(i * 7) * 1.2, 0.3 + (i % 3) * 0.25, 4 + Math.cos(i * 5) * 1.1], r: [i, i * 2, 0] });
  // moteur à vapeur latéral + volant
  k.add(G.rbox(1.6, 1.4, 2.0, 0.1), MAT.steel(), { p: [-3.4, 0.9, -1] });
  k.add(G.cyl(0.2, 0.2, 2.6, 10), brass, { p: [-3.4, 2.6, -1.6] });
  k.add(G.rbox(0.9, 0.5, 0.06, 0.03), glow('#ff5a00', 2.5), { p: [-3.4, 0.9, 0.02] });
  // plaque
  grp.add(k.build());
  const fly = new THREE.Group(); fly.position.set(-4.4, 1.3, -1);
  const fk = new Kit(); fk.add(G.tor(1.0, 0.12, 6, 28), iron, { r: [0, H, 0] }); for (let i = 0; i < 6; i++) fk.add(G.box(0.08, 1.9, 0.12), iron, { r: [i * PI / 6, 0, 0] });
  fly.add(fk.build()); grp.add(fly); grp.userData.fly = fly;
  const tex = textSprite(['CHARBONNIÈRE', 'Constructeur n°1'], { bg: '#20160f', fg: '#ffd88a', border: '#c9a25a' });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), new THREE.MeshBasicMaterial({ map: tex })); s.position.set(0, 3.6, 1.62); grp.add(s);
  return grp;
}

function waterTower() {
  const grp = new THREE.Group(), k = new Kit();
  const wood = MAT.wood(), dark = MAT.woodDark(), iron = MAT.iron(), brass = MAT.brass();
  // pieds en bois croisés
  const legs = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
  for (const [x, z] of legs) k.add(G.box(0.4, 8, 0.4), dark, { p: [x * 0.92, 4, z * 0.92], r: [z * 0.02, 0, -x * 0.02] });
  for (const y of [2.5, 5.5]) { k.add(G.box(4.2, 0.2, 0.2), dark, { p: [0, y, -1.9] }); k.add(G.box(4.2, 0.2, 0.2), dark, { p: [0, y, 1.9] }); k.add(G.box(0.2, 0.2, 4.2), dark, { p: [-1.9, y, 0] }); k.add(G.box(0.2, 0.2, 4.2), dark, { p: [1.9, y, 0] }); }
  for (const s of [-1, 1]) { k.add(G.box(0.12, 4.5, 0.12), dark, { p: [0, 4, s * 1.9], r: [0, 0, 0.85] }); k.add(G.box(0.12, 4.5, 0.12), dark, { p: [s * 1.9, 4, 0], r: [0.85, 0, 0] }); }
  // cuve en douelles + cerclages
  for (let i = 0; i < 28; i++) { const a = i / 28 * PI * 2; k.add(G.box(0.62, 4, 0.18), i % 2 ? wood : mat('#8a5a32', { roughness: 0.85 }), { p: [Math.cos(a) * 2.9, 10, Math.sin(a) * 2.9], r: [0, -a + H, 0] }); }
  for (const y of [8.4, 9.6, 10.8, 11.8]) k.add(G.tor(3.0, 0.07, 4, 32), iron, { p: [0, y, 0], r: [H, 0, 0] });
  k.add(G.cyl(2.95, 2.95, 0.2, 28), dark, { p: [0, 8.05, 0] });
  k.add(G.cone(3.4, 2.0, 28), mat('#5a3a20', { roughness: 0.8 }), { p: [0, 13.0, 0] });
  k.add(G.sph(0.25, 10, 8), brass, { p: [0, 14.1, 0] });
  // bec verseur articulé vers la voie
  k.add(G.cyl(0.3, 0.3, 3.2, 12), iron, { p: [0, 9.0, 3.6], r: [0.9, 0, 0] });
  k.add(G.cyl(0.22, 0.3, 0.6, 12), iron, { p: [0, 7.9, 4.95], r: [0.2, 0, 0] });
  for (let i = 0; i < 10; i++) k.add(G.box(0.6, 0.06, 0.06), iron, { p: [2.3, 0.6 + i * 0.75, 2.3], r: [0, -PI / 4, 0] });
  k.add(G.box(0.06, 7.8, 0.06), iron, { p: [2.05, 4.2, 2.5] }); k.add(G.box(0.06, 7.8, 0.06), iron, { p: [2.5, 4.2, 2.05] });
  // jauge
  k.add(G.cyl(0.35, 0.35, 0.1, 18), brass, { p: [0, 10, 3.0], r: [H, 0, 0] }); k.add(G.cyl(0.28, 0.28, 0.12, 18), mat('#f6ecd2'), { p: [0, 10, 3.02], r: [H, 0, 0] });
  grp.add(k.build());
  return grp;
}

function shopKiosk() {
  const grp = new THREE.Group(), k = new Kit();
  const wood = mat('#6b4a2b', { roughness: 0.8 }), dark = MAT.woodDark(), brass = MAT.brass(), cloth = mat('#8a1f2a', { roughness: 0.9 }), cloth2 = mat('#e9d9b4', { roughness: 0.9 });
  k.add(G.rbox(7, 1.3, 2.2, 0.1), wood, { p: [0, 0.65, 0.6] });
  for (let i = 0; i < 7; i++) k.add(G.box(0.9, 1.1, 0.05), dark, { p: [-3 + i, 0.65, 1.72] });
  k.add(G.rbox(7.4, 0.12, 2.6, 0.04), brass, { p: [0, 1.35, 0.6] });
  k.add(G.box(7, 5.2, 0.4), dark, { p: [0, 2.6, -1.6] });
  for (const x of [-3.4, 3.4]) k.add(G.cyl(0.15, 0.18, 5, 10), brass, { p: [x, 2.5, 1.4] });
  // auvent rayé
  for (let i = 0; i < 10; i++) k.add(G.box(0.76, 0.06, 3.6), i % 2 ? cloth : cloth2, { p: [-3.42 + i * 0.76, 5.2, 0.1], r: [-0.25, 0, 0] });
  for (let i = 0; i < 10; i++) k.add(G.cone(0.38, 0.5, 3), i % 2 ? cloth : cloth2, { p: [-3.42 + i * 0.76, 4.5, 1.85], r: [PI, 0, 0] });
  // étagères avec bocaux et pièces
  for (const y of [2.0, 3.0, 4.0]) { k.add(G.box(6, 0.08, 0.5), wood, { p: [0, y, -1.2] }); for (let i = 0; i < 9; i++) k.add(i % 3 ? G.cyl(0.15, 0.15, 0.35, 10) : G.box(0.3, 0.3, 0.3), i % 2 ? brass : mat(['#3fa0e0', '#7ad05a', '#e05ab0'][i % 3], { roughness: 0.3 }), { p: [-2.6 + i * 0.65, y + 0.22, -1.2] }); }
  // balance + terminal
  k.add(G.cyl(0.06, 0.06, 0.8, 8), brass, { p: [-2, 1.8, 0.6] }); k.add(G.box(1.0, 0.04, 0.04), brass, { p: [-2, 2.2, 0.6] });
  for (const x of [-2.45, -1.55]) k.add(G.cyl(0.22, 0.12, 0.08, 12), brass, { p: [x, 1.95, 0.6] });
  k.add(G.rbox(1.4, 0.9, 0.3, 0.05), MAT.iron(), { p: [1.6, 1.85, 0.8], r: [-0.4, 0, 0] });
  k.add(G.box(1.2, 0.7, 0.05), glow('#40e0ff', 1.2), { p: [1.6, 1.88, 0.97], r: [-0.4, 0, 0] });
  // lanternes
  for (const x of [-3.4, 3.4]) { k.add(G.box(0.35, 0.5, 0.35), MAT.iron(), { p: [x, 4.2, 1.8] }); k.add(G.box(0.25, 0.35, 0.25), glow('#ffcf7a', 3), { p: [x, 4.2, 1.8] }); }
  grp.add(k.build());
  const tex = textSprite(['COMPTOIR', 'améliorations'], { bg: '#2b1d12', fg: '#ffd88a', border: '#c9a25a' });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: tex })); s.position.set(0, 4.9, -1.38); grp.add(s);
  return grp;
}

function findsHall() {
  const grp = new THREE.Group(), k = new Kit();
  const stone = mat('#c9b99a', { roughness: 0.9 }), brass = MAT.brass(), dark = MAT.iron();
  k.add(G.rbox(12, 0.6, 5, 0.1), stone, { p: [0, 0.3, 0] });
  k.add(G.rbox(12.6, 0.3, 5.6, 0.08), mat('#a8977c'), { p: [0, 0.05, 0] });
  // colonnes doriques + fronton
  for (const x of [-5.5, -2.75, 0, 2.75, 5.5]) { k.add(G.cyl(0.32, 0.38, 5, 16), stone, { p: [x, 3.1, -1.9] }); k.add(G.box(0.9, 0.3, 0.9), stone, { p: [x, 5.7, -1.9] }); k.add(G.box(0.9, 0.3, 0.9), stone, { p: [x, 0.75, -1.9] }); }
  k.add(G.box(12.4, 0.6, 1.6), stone, { p: [0, 6.1, -1.9] });
  const tri = new THREE.Shape(); tri.moveTo(-6.4, 0); tri.lineTo(6.4, 0); tri.lineTo(0, 1.8); tri.lineTo(-6.4, 0);
  k.add(new THREE.ExtrudeGeometry(tri, { depth: 1.2, bevelEnabled: false }), stone, { p: [0, 6.4, -2.5] });
  // vitrines
  grp.userData.slots = [];
  for (let i = 0; i < 5; i++) {
    const x = -4 + i * 2;
    k.add(G.lathe([[0.55, 0], [0.5, 0.15], [0.35, 0.3], [0.35, 1.0], [0.5, 1.15], [0.55, 1.3], [0, 1.3]], 16), brass, { p: [x, 0.6, 0.6] });
    for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) k.add(G.box(0.05, 1.5, 0.05), brass, { p: [x + dx, 2.65, 0.6 + dz] });
    k.add(G.rbox(1.25, 0.1, 1.25, 0.03), brass, { p: [x, 3.42, 0.6] });
    grp.userData.slots.push(new THREE.Vector3(x, 2.5, 0.6));
  }
  grp.add(k.build());
  const glass = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, roughness: 0, metalness: 0.5, depthWrite: false });
  for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.5, 1.15), glass); c.position.set(-4 + i * 2, 2.65, 0.6); grp.add(c); }
  const tex = textSprite(['HALL DES', 'TROUVAILLES'], { bg: '#162430', fg: '#bfe9ff', border: '#5aa0c9' });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.6), new THREE.MeshBasicMaterial({ map: tex })); s.position.set(0, 6.1, -1.08); grp.add(s);
  return grp;
}
