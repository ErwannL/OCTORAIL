import * as THREE from 'three';
import { mulberry } from '../util/noise.js';
import { textSprite } from './tracks.js';
import { BIOMES, sectorIndex } from './biomes.js';
import { cactusGeometry, buildWesternBuilding } from './models.js';
import { Kit, G, mat, MAT, glow } from './kit.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

// --------------------------------------------------------------- LE MOYEU
export function buildHub(scene, interact) {
  const g = new THREE.Group();
  const brass = M('#b8873b', { metalness: 0.8, roughness: 0.35 });
  const stone = M('#9a8b74', { roughness: 0.95 });
  const dark = M('#3b2f26');
  // dalle centrale
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(46, 48, 1.2, 64), stone);
  plaza.position.y = -0.4; plaza.receiveShadow = true; g.add(plaza);
  const inlay = new THREE.Mesh(new THREE.RingGeometry(10, 44, 64, 1), M('#7d6c56'));
  inlay.rotation.x = -Math.PI / 2; inlay.position.y = 0.22; inlay.receiveShadow = true; g.add(inlay);
  // rose des vents : 8 rayons colorés vers chaque monde
  BIOMES.forEach((b, i) => {
    const a = i * Math.PI / 4;
    const ray = new THREE.Mesh(new THREE.BoxGeometry(30, 0.05, 1.4), M(b.skyBot, { emissive: b.skyBot, emissiveIntensity: b.open ? 0.35 : 0.06 }));
    ray.position.set(Math.cos(a) * 27, 0.26, -Math.sin(a) * 27); ray.rotation.y = a; g.add(ray);
    // quai + panneau
    const px = Math.cos(a) * 60, pz = -Math.sin(a) * 60;
    const quay = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 18), stone);
    const off = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)).multiplyScalar(5.5);
    quay.position.set(px + off.x, 0.3, pz + off.z); quay.rotation.y = a + Math.PI / 2; quay.receiveShadow = true; quay.castShadow = true; g.add(quay);
    const tex = textSprite([b.name, b.dir.toUpperCase()], { bg: '#20160f', fg: b.open ? '#ffe9b8' : '#8a7a66', border: b.skyBot, font: 'bold 48px Georgia' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    sign.position.set(px + off.x * 1.6, 4.5, pz + off.z * 1.6); sign.rotation.y = a + Math.PI / 2; g.add(sign);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.5), brass); pole.position.set(sign.position.x, 1.8, sign.position.z); g.add(pole);
  });
  // Dôme central (capsules cryo)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  dome.position.y = 0.3; g.add(dome);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + Math.PI / 8;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(10, 0.18, 6, 24, Math.PI), brass);
    rib.rotation.y = a; rib.position.y = 0.3; g.add(rib);
    // capsules
    const pod = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.5, 16), dark); pod.add(base);
    const glass = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.6, 6, 12), new THREE.MeshStandardMaterial({ color: '#9fe3ff', transparent: true, opacity: 0.3, roughness: 0.05, emissive: '#2a8fb0', emissiveIntensity: 0.6, depthWrite: false }));
    glass.position.y = 1.5; pod.add(glass);
    pod.position.set(Math.cos(a) * 6.5, 0.4, -Math.sin(a) * 6.5); g.add(pod);
  }
  // Coeur du Moyeu : noyau lumineux
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), M('#ffb347', { emissive: '#ff9a2a', emissiveIntensity: 1.6, flatShading: true }));
  core.position.y = 7.5; g.add(core);
  const coreLight = { intensity: 0 }; // pas de lumière dynamique (perf) : émissif + bloom

  // Constructeurs (machines des Bâtisseurs)
  const machines = {};
  const mk = (name, angle, r, build) => {
    const m = new THREE.Group(); build(m);
    m.position.set(Math.cos(angle) * r, 0.2, -Math.sin(angle) * r); m.rotation.y = angle - Math.PI / 2;
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.add(m); machines[name] = m; return m;
  };
  // Charbonnière
  mk('coal', Math.PI * 0.62, 30, m => {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 6, 8), dark); body.position.y = 3; m.add(body);
    const hop = new THREE.Mesh(new THREE.ConeGeometry(3, 2.5, 8, 1, true), brass); hop.position.y = 7.2; hop.rotation.x = Math.PI; m.add(hop);
    const pile = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), M('#1c1c1c', { roughness: 1, flatShading: true })); pile.position.set(0, 0.8, 3.5); pile.scale.y = 0.6; m.add(pile);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.1), M('#f60', { emissive: '#ff5a00', emissiveIntensity: 4 })); glow.position.set(0, 2, 2.55); m.add(glow);
    m.userData.pile = pile;
  });
  // Château d'eau
  mk('water', Math.PI * 0.88, 30, m => {
    for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 7), dark); l.position.set(x, 3.5, z); m.add(l); }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 3.5, 16), M('#6b4a2b')); tank.position.y = 8.6; m.add(tank);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.6, 16), brass); roof.position.y = 11.2; m.add(roof);
  });
  // Comptoir des améliorations
  mk('shop', Math.PI * 0.38, 30, m => {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(6, 1.3, 2), M('#6b4a2b')); desk.position.y = 0.65; m.add(desk);
    const back = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 0.4), M('#4a3220')); back.position.set(0, 2.5, -1.6); m.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 4), brass); roof.position.set(0, 5, -0.4); m.add(roof);
    const tex = textSprite(['COMPTOIR', 'améliorations'], { bg: '#2b1d12', fg: '#ffd88a', border: '#c9a25a' });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: tex })); s.position.set(0, 3.4, -1.35); m.add(s);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), M('#111', { emissive: '#40e0ff', emissiveIntensity: 1.4 })); screen.position.set(0, 1.8, 0.6); screen.rotation.x = -0.4; m.add(screen);
  });
  // Hall des trouvailles (vitrines)
  mk('hall', Math.PI * 1.15, 32, m => {
    const base = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 4), stone); base.position.y = 0.3; m.add(base);
    m.userData.slots = [];
    for (let k = 0; k < 5; k++) {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.2, 8), brass); ped.position.set(-4 + k * 2, 1.2, 0); m.add(ped);
      const cage = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.2), new THREE.MeshStandardMaterial({ color: '#fff', transparent: true, opacity: 0.12, roughness: 0, depthWrite: false })); cage.position.set(-4 + k * 2, 2.5, 0); m.add(cage);
      m.userData.slots.push(new THREE.Vector3(-4 + k * 2, 2.4, 0));
    }
    const tex = textSprite(['HALL DES', 'TROUVAILLES'], { bg: '#162430', fg: '#bfe9ff', border: '#5aa0c9' });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); s.position.set(0, 4.5, -1); m.add(s);
  });

  g.traverse(o => { if (o.isMesh && !o.material.transparent) { o.castShadow ??= true; o.receiveShadow = true; } });
  scene.add(g);

  const wp = (m, dx = 0, dz = 3) => m.localToWorld(new THREE.Vector3(dx, 0, dz));
  g.updateMatrixWorld(true);
  interact.add({ id: 'coal', pos: wp(machines.coal, 0, 4), r: 5, label: 'Charbonnière — [E] prendre du charbon' });
  interact.add({ id: 'water', pos: wp(machines.water, 0, 3), r: 5, label: 'Château d\'eau — [E] remplir le réservoir du train' });
  interact.add({ id: 'shop', pos: wp(machines.shop, 0, 2.2), r: 4.5, label: 'Comptoir — [E] améliorations' });
  interact.add({ id: 'hall', pos: wp(machines.hall, 0, 3), r: 6, label: 'Hall des trouvailles' });
  return { group: g, core, coreLight, machines };
}

// --------------------------------------------------------------- DÉCOR PAR MONDE
export function scatter(scene, terrain, net, rnd, count, inSector, geo, mat, opts = {}) {
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0, tries = 0;
  while (n < count && tries < count * 20) {
    tries++;
    const r = (opts.rMin ?? 120) + rnd() * ((opts.rMax ?? 1380) - (opts.rMin ?? 120));
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!inSector.includes(sectorIndex(x, z))) continue;
    const near = net.nearest(x, z, opts.clear ?? 9);
    if (near) continue;
    const sc = (opts.sMin ?? 0.7) + rnd() * ((opts.sMax ?? 1.4) - (opts.sMin ?? 0.7));
    p.set(x, terrain.heightAt(x, z) + (opts.yOff ?? 0) * sc, z);
    q.setFromEuler(new THREE.Euler(opts.tilt ? (rnd() - 0.5) * opts.tilt : 0, rnd() * Math.PI * 2, opts.tilt ? (rnd() - 0.5) * opts.tilt : 0));
    s.set(sc, sc * (opts.yStretch ? 0.6 + rnd() * opts.yStretch : 1), sc);
    m.compose(p, q, s); inst.setMatrixAt(n++, m);
  }
  inst.count = n; inst.castShadow = !!opts.shadow; inst.receiveShadow = true;
  scene.add(inst);
  return inst;
}

function firGeometry() {
  const k = new Kit(), m = mat('#2f4b3a');
  k.add(G.cyl(0.2, 0.3, 1.4, 6), m, { p: [0, 0.7, 0] });
  for (let i = 0; i < 4; i++) k.add(G.cone(2 - i * 0.4, 2.2, 7), m, { p: [0, 1.6 + i * 1.3, 0], r: [0, i, 0] });
  for (let i = 0; i < 4; i++) k.add(G.cone(1.6 - i * 0.35, 0.6, 7), m, { p: [0, 2.3 + i * 1.3, 0], s: [1, 0.6, 1] });
  return k.geometry();
}
function cactusGeoOld() {
  const parts = [];
  const trunk = new THREE.CapsuleGeometry(0.45, 3.4, 4, 8); trunk.translate(0, 2.1, 0); parts.push(trunk);
  const arm1 = new THREE.CapsuleGeometry(0.3, 1.2, 4, 8); arm1.translate(0.9, 2.6, 0); parts.push(arm1);
  const arm1b = new THREE.CapsuleGeometry(0.28, 0.7, 4, 8); arm1b.rotateZ(Math.PI / 2); arm1b.translate(0.55, 2.0, 0); parts.push(arm1b);
  const arm2 = new THREE.CapsuleGeometry(0.28, 0.9, 4, 8); arm2.translate(-0.85, 3.0, 0); parts.push(arm2);
  const arm2b = new THREE.CapsuleGeometry(0.26, 0.6, 4, 8); arm2b.rotateZ(Math.PI / 2); arm2b.translate(-0.5, 2.55, 0); parts.push(arm2b);
  return mergeSimple(parts);
}
export function mergeSimple(arr) {
  const geos = arr.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; geos.forEach(g => n += g.attributes.position.count);
  const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { g.computeVertexNormals(); P.set(g.attributes.position.array, o * 3); Nn.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(P, 3)); r.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  return r;
}

export function buildWestern(scene, terrain, net, interact) {
  const rnd = mulberry(99);
  scatter(scene, terrain, net, rnd, 700, [4], cactusGeometry(), M('#3f7a3a', { roughness: 0.8 }), { shadow: false, sMin: 0.6, sMax: 1.5 });
  scatter(scene, terrain, net, rnd, 700, [4], new THREE.DodecahedronGeometry(1.2, 0), M('#9a5a35', { flatShading: true }), { sMin: 0.4, sMax: 2.6, yStretch: 0.6, tilt: 0.5 });
  scatter(scene, terrain, net, rnd, 260, [4], new THREE.IcosahedronGeometry(0.9, 0), M('#8a7a3a', { flatShading: true }), { sMin: 0.6, sMax: 1.4, yOff: 0.4 }); // buissons secs

  // Ville : Poussière-sur-Rail, au terminus Ouest
  const T = net.nodes.get('T4');
  const town = new THREE.Group();
  const e = net.edges[T.edges[0]]; const end = e.pts[e.pts.length - 1], prev = e.pts[e.pts.length - 8];
  const ang = Math.atan2(end.x - prev.x, end.z - prev.z);
  town.position.set(end.x, terrain.heightAt(end.x, end.z), end.z); town.rotation.y = ang;
  const woods = ['#8b5a2b', '#a0683a', '#7a4a24', '#b07a48', '#6e4426'];
  const names = ['SALOON', 'BANQUE', 'SHÉRIF', 'HÔTEL', 'FORGE', 'GARE', 'ÉPICERIE', 'BARBIER'];
  for (let k = 0; k < 8; k++) {
    const side = k % 2 ? 1 : -1, row = Math.floor(k / 2);
    const w = 7 + rnd() * 3, h = 5 + rnd() * 3, d = 8;
    const b = buildWesternBuilding(names[k], w, h, d, [woods[k % 5], woods[(k + 2) % 5], ['#3f6b5a', '#7a2a2a', '#2a4a7a'][k % 3]], textSprite);
    b.position.set(side * 14, 0, -26 - row * 14); b.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    b.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    town.add(b);
  }
  // Arche d'entrée
  const archT = textSprite(['POUSSIÈRE-SUR-RAIL', 'pop. 4 cactus · 0 shérif'], { w: 1024, h: 256, bg: '#3a2412', fg: '#f3d9a0', border: '#d9a35a', font: 'bold 80px Georgia' });
  for (const x of [-5, 5]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), M('#5a3a1e')); post.position.set(x, 4.5, -100); post.castShadow = true; town.add(post); }
  const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: archT, side: THREE.DoubleSide })); board.position.set(0, 8.2, -100); town.add(board);
  town.userData.archTex = board;
  // Piédestal du Shérif (où le ramener)
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 1.2, 8), M('#c9a25a', { metalness: 0.7, roughness: 0.3 }));
  ped.position.set(0, 0.6, 18); town.add(ped);
  const pTex = textSprite(['ICI SE TENAIT', 'SHÉRIF-7', 'gardien de Poussière'], { bg: '#3a2412', fg: '#f3d9a0', border: '#d9a35a' });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshBasicMaterial({ map: pTex })); plaque.position.set(0, 2.2, 15.3); plaque.rotation.y = Math.PI; town.add(plaque);
  // Cactus-automates pianistes
  const autos = [];
  for (let k = 0; k < 4; k++) {
    const a = new THREE.Group();
    const c = new THREE.Mesh(cactusGeometry(), M('#4f8a3a', { roughness: 0.8 })); a.add(c);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), M('#000', { emissive: '#ffe060', emissiveIntensity: 3 })); eye.position.set(0.18, 3.2, 0.4); a.add(eye);
    const eye2 = eye.clone(); eye2.position.x = -0.18; a.add(eye2);
    const piano = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 0.8), M('#2a1a10')); piano.position.set(0, 0.6, 1.4); a.add(piano);
    const keys = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.3), M('#f4f0e6')); keys.position.set(0, 1.22, 1.15); a.add(keys);
    a.position.set((k % 2 ? 9 : -9), 0, -40 - k * 9); a.rotation.y = k % 2 ? -0.6 : 0.6;
    a.traverse(o => { if (o.isMesh) o.castShadow = true; });
    town.add(a); autos.push(a);
  }
  scene.add(town);
  town.updateMatrixWorld(true);
  const pedWorld = town.localToWorld(new THREE.Vector3(0, 1.2, 18));
  interact.add({ id: 'pedestal', pos: pedWorld, r: 7, label: 'Piédestal du gardien' });
  return { town, autos, pedestal: pedWorld };
}

export function buildGelure(scene, terrain, net, interact) {
  const rnd = mulberry(55);
  const ice = new THREE.MeshStandardMaterial({ color: '#a9dcf5', roughness: 0.15, metalness: 0.25, emissive: '#3a8fc0', emissiveIntensity: 0.3, flatShading: true });
  scatter(scene, terrain, net, rnd, 700, [5], new THREE.ConeGeometry(1.4, 8, 5), ice, { sMin: 0.5, sMax: 2.4, tilt: 0.6, yOff: 2 });
  scatter(scene, terrain, net, rnd, 500, [5], new THREE.DodecahedronGeometry(1.5, 0), M('#f2fbff', { flatShading: true, roughness: 0.6 }), { sMin: 0.5, sMax: 3, yStretch: 0.4 });
  scatter(scene, terrain, net, rnd, 220, [5], firGeometry(), M('#2f4b3a', { flatShading: true }), { sMin: 0.6, sMax: 1.5, shadow: false }); // sapins gelés

  // LE TSUNAMI GELÉ : vague géante enjambant la voie K5 -> T5
  const e = net.edges.find(x => x.a === 'K5' && x.b === 'T5');
  const mid = e.pts[Math.floor(e.pts.length * 0.33)];
  const a2 = e.pts[Math.floor(e.pts.length * 0.33) + 10];
  const ang = Math.atan2(a2.x - mid.x, a2.z - mid.z);
  const wave = new THREE.Group();
  const shape = new THREE.Shape();
  // profil de déferlante (coupe), extrudé le long de la largeur
  const prof = [[-160, 0], [-120, 40], [-70, 110], [-20, 180], [30, 230], [80, 250], [120, 238], [140, 215], [128, 190], [100, 182], [75, 196], [60, 175], [70, 140], [90, 100], [110, 40], [125, 0]];
  shape.moveTo(prof[0][0], prof[0][1]); prof.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 700, bevelEnabled: false, steps: 24 });
  { const pp = geo.attributes.position; for (let i = 0; i < pp.count; i++) { const z = pp.getZ(i); pp.setY(i, pp.getY(i) * (0.75 + 0.25 * Math.cos(z / 700 * Math.PI * 2 + 1)) ); pp.setX(i, pp.getX(i) + Math.sin(z / 90) * 14); } geo.computeVertexNormals(); }
  geo.translate(0, 0, -350);
  const waveMat = new THREE.MeshStandardMaterial({ color: '#5fb4e0', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.88, side: THREE.DoubleSide, emissive: '#1d6a9a', emissiveIntensity: 0.35, flatShading: true });
  const w = new THREE.Mesh(geo, waveMat); wave.add(w);
  // tunnel creusé : arche sous la vague (la voie passe dedans)
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 300, 24, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#d8f2ff', roughness: 0.2, side: THREE.DoubleSide, emissive: '#5ab0e0', emissiveIntensity: 0.35 }));
  tunnel.rotation.z = Math.PI / 2; tunnel.position.y = 0; wave.add(tunnel);
  // écume figée (sphères)
  for (let k = 0; k < 60; k++) {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + rnd() * 10, 0), M('#ffffff', { flatShading: true, roughness: 0.5 }));
    f.position.set(110 + rnd() * 40, 200 + rnd() * 50, -340 + rnd() * 680); wave.add(f);
  }
  // choses figées dans la vague : bateau, baleine-machine
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(4, 1.5, 22, 6, 1), M('#6b3a1e')); hull.rotation.z = Math.PI / 2; boat.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 18), M('#4a2a14')); mast.position.y = 9; boat.add(mast);
  boat.position.set(-40, 120, 60); boat.rotation.set(0.6, 0.3, 0.8); wave.add(boat);
  const whale = new THREE.Mesh(new THREE.CapsuleGeometry(8, 30, 6, 12), M('#3a4a5a', { metalness: 0.6 }));
  whale.position.set(20, 170, -120); whale.rotation.set(0, 0, 1.1); wave.add(whale);
  wave.position.set(mid.x, terrain.heightAt(mid.x, mid.z) - 2, mid.z);
  wave.rotation.y = ang + Math.PI / 2;
  wave.traverse(o => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
  scene.add(wave);

  // Le bloc de glace du SHÉRIF-7, près du terminus
  const T = net.nodes.get('T5');
  const te = net.edges[T.edges[0]], tEnd = te.pts[te.pts.length - 12], tPrev = te.pts[te.pts.length - 20];
  const tang = new THREE.Vector3().subVectors(tEnd, tPrev).normalize();
  const side = new THREE.Vector3(-tang.z, 0, tang.x);
  const bpos = tEnd.clone().addScaledVector(side, 9); bpos.y = terrain.heightAt(bpos.x, bpos.z);
  interact.add({ id: 'iceblock', pos: bpos.clone(), r: 6, label: 'Un robot figé dans la glace…' });
  return { wave, iceBlockPos: bpos };
}

// Décor léger pour les mondes fermés (aperçu derrière la barrière)
export function buildClosedPreviews(scene, terrain, net) {
  const rnd = mulberry(7);
  const looks = {
    0: [new THREE.SphereGeometry(2, 8, 6), M('#5f8a3a', { flatShading: true })],
    1: [new THREE.BoxGeometry(4, 30, 4), M('#1a1030', { emissive: '#ff3fd0', emissiveIntensity: 0.6 })],
    2: [new THREE.DodecahedronGeometry(6, 0), M('#dff1ff', { flatShading: true })],
    3: [new THREE.TorusGeometry(4, 0.8, 6, 16), M('#c9a24a', { metalness: 0.8, roughness: 0.3 })],
    6: [new THREE.SphereGeometry(3, 10, 8), M('#ff8a2a', { emissive: '#ff5a00', emissiveIntensity: 0.4 })],
    7: [new THREE.ConeGeometry(1.5, 6, 6), M('#7a3fa0', { emissive: '#b060ff', emissiveIntensity: 0.6 })],
  };
  for (const [i, [geo, mat]] of Object.entries(looks)) {
    const k = +i;
    scatter(scene, terrain, net, rnd, 260, [k], geo, mat, {
      sMin: 0.6, sMax: 2, yOff: k === 2 ? 14 : (k === 1 ? 12 : 1), tilt: k === 3 ? 2 : 0, rMin: 240, rMax: 1300, shadow: false,
    });
  }
}
