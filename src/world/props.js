import * as THREE from 'three';
import { mulberry } from '../util/noise.js';
import { textSprite } from './tracks.js';
import { BIOMES, sectorIndex } from './biomes.js';
import { cactusGeometry } from './models.js';
import { FLORA_MAT, saguaroGeometry, pricklyPearGeometry, barrelCactusGeometry, sageGeometry, snowShrubGeometry, rockShapeGeometry, mesaGeometry, iceCrystalGeometry, pineGeometry } from './flora.js';
import { buildWesternBuilding } from './buildings.js';
import { Kit, G, mat, MAT, glow } from './kit.js';
import { COLLIDERS } from './colliders.js';
import { buildTsunami } from './tsunami.js';
import { heightSpread, overlapsSolid } from './placement.js';

const PI = Math.PI, H = Math.PI / 2;
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

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
    const sc0 = (opts.sMin ?? 0.7) + rnd() * ((opts.sMax ?? 1.4) - (opts.sMin ?? 0.7));
    if (!geo.boundingBox) geo.computeBoundingBox();
    const fp = Math.max(Math.abs(geo.boundingBox.min.x), Math.abs(geo.boundingBox.max.x), Math.abs(geo.boundingBox.min.z), Math.abs(geo.boundingBox.max.z)) * sc0;
    const near = net.nearest(x, z, (opts.clear ?? 9) + fp + 3) || (fp > 6 && net.nearest(x, z, Math.min(200, fp * 2 + 10)));
    if (near) continue;
    const sc = sc0;
    // pas de pente sous l'emprise (sinon l'objet est à moitié enterré ou en porte-à-faux) ni de chevauchement avec un volume déjà posé
    const ground = terrain.heightAt(x, z);
    if (heightSpread(terrain, x, z, Math.max(0.5, Math.min(fp, 7))) > (opts.slopeMax ?? Math.max(0.8, Math.min(fp, 7) * 0.3))) continue;
    if (!opts.noBlock && COLLIDERS.blocked(x, ground + 0.3, z, Math.min(fp, 10) * 0.8)) continue;
    p.set(x, terrain.heightAt(x, z) + (opts.yOff ?? 0) * sc, z);
    q.setFromEuler(new THREE.Euler(opts.tilt ? (rnd() - 0.5) * opts.tilt : 0, rnd() * Math.PI * 2, opts.tilt ? (rnd() - 0.5) * opts.tilt : 0));
    s.set(sc, sc * (opts.yStretch ? 0.6 + rnd() * opts.yStretch : 1), sc);
    m.compose(p, q, s); inst.setMatrixAt(n++, m);
    if (opts.collide) COLLIDERS.circle(x, z, opts.collide * sc, p.y + (opts.collideTop ?? 6) * sc);
  }
  inst.count = n; inst.castShadow = !!opts.shadow; inst.receiveShadow = true;
  if (opts.collide) inst.userData.solidFill = true; // volume plein (rochers, buttes, cactus) : intérieur solide jusqu'au sol
  scene.add(inst);
  return inst;
}

function firGeometry(v = 0) { return pineGeometry(v); }
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
  for (let v = 0; v < 3; v++) scatter(scene, terrain, net, rnd, 7, [4], mesaGeometry(v + 1), FLORA_MAT, { rMin: 200, sMin: 1.5, sMax: 3.8, yOff: 4.2, collide: 3.6, collideTop: 9, shadow: true, slopeMax: 2.5 }); // buttes stratifiées : posées EN PREMIER (les autres objets les évitent)
  for (let v = 0; v < 3; v++) scatter(scene, terrain, net, rnd, 90, [4], saguaroGeometry(v), FLORA_MAT, { shadow: true, sMin: 0.7, sMax: 1.6, collide: 0.6 });
  for (let v = 0; v < 3; v++) scatter(scene, terrain, net, rnd, 45, [4], pricklyPearGeometry(v), FLORA_MAT, { sMin: 0.7, sMax: 1.4, collide: 0.7, collideTop: 1.6 });
  for (let v = 0; v < 3; v++) scatter(scene, terrain, net, rnd, 45, [4], barrelCactusGeometry(v), FLORA_MAT, { sMin: 0.6, sMax: 1.3, collide: 0.6, collideTop: 1.0 });
  for (let v = 0; v < 4; v++) scatter(scene, terrain, net, rnd, 110, [4], rockShapeGeometry(v + 20, 'strata'), FLORA_MAT, { sMin: 0.4, sMax: 2.6, yStretch: 0.6, tilt: 0.25, yOff: 0.3, collide: 0.9, collideTop: 0.7, shadow: v === 0 });
  for (let v = 0; v < 3; v++) scatter(scene, terrain, net, rnd, 45, [4], sageGeometry(v), FLORA_MAT, { sMin: 0.7, sMax: 1.5 }); // armoises et buissons secs

  // Ville : Poussière-sur-Rail, au terminus Ouest
  const T = net.nodes.get('T4');
  const town = new THREE.Group();
  const e = net.edges[T.edges[0]]; const end = e.pts[e.pts.length - 1], prev = e.pts[e.pts.length - 8];
  const ang = Math.atan2(end.x - prev.x, end.z - prev.z);
  town.position.set(end.x, terrain.heightAt(end.x, end.z), end.z); town.rotation.y = ang;
  town.updateMatrixWorld(true);
  const gl = (x, z) => { const v = town.localToWorld(new THREE.Vector3(x, 0, z)); return terrain.heightAt(v.x, v.z) - town.position.y; }; // hauteur du sol réel en repère ville
  const woods = ['#8b5a2b', '#a0683a', '#7a4a24', '#b07a48', '#6e4426'];
  const names = ['SALOON', 'BANQUE', 'SHÉRIF', 'HÔTEL', 'FORGE', 'GARE', 'ÉPICERIE', 'BARBIER'];
  const kinds = ['saloon', 'bank', 'sheriff', 'hotel', 'forge', 'station', 'store', 'barber'];
  const pal = [['#8b5a2b', '#6e4426', '#7a2a2a'], ['#b8a888', '#8a7a62', '#2a4a7a'], ['#a0683a', '#7a4a24', '#3f6b5a'], ['#c9b48a', '#8a6a3a', '#7a2a2a'], ['#7a4a30', '#5a3a28', '#2a4a7a'], ['#3f6b5a', '#2a4a3e', '#9c1f1f'], ['#b07a48', '#8a5a30', '#3f6b5a'], ['#6f8aa0', '#4a6478', '#9c1f1f']];
  for (let k = 0; k < 8; k++) {
    const side = k % 2 ? 1 : -1, row = Math.floor(k / 2);
    const w = 7 + rnd() * 3, h = 5 + rnd() * 3, d = 8;
    const b = buildWesternBuilding(names[k], w, h, d, pal[k], textSprite, kinds[k]);
    b.userData.bw = w; b.userData.bd = d;
    { const bx = side * 14, bz = -26 - row * 14; let mn = 1e9; for (const [ox, oz] of [[0, 0], [4, 4], [-4, 4], [4, -4], [-4, -4], [side * -7, 0]]) mn = Math.min(mn, gl(bx + ox, bz + oz)); b.position.set(bx, mn, bz); } b.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    // fondation en pierre qui descend dans le sol : jamais de bâtiment sur pilotis au-dessus du vide
    { const f = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 4, d + 5.5), M('#8a6a4a', { roughness: 0.95 })); f.position.set(0, -2 + 0.02, 1.8); b.add(f); }
    b.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    town.add(b);
  }
  // Mobilier de rue (fusionné) : lampadaires, abreuvoirs, chariot, puits, tonneaux, caisses, boules de paille
  const sk = new Kit(); { const add0 = sk.add.bind(sk); sk.add = (geo, m, o = {}) => { const p = o.p || [0, 0, 0]; return add0(geo, m, { ...o, p: [p[0], p[1] + gl(p[0], p[2]), p[2]] }); }; }
  const dk = MAT.woodDark(), pl = mat('#7a4c2a', { roughness: 0.9 }), irn = MAT.iron(), brs = MAT.brass();
  for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) { const x = sd * 5.2, z = -30 - i * 11;
    sk.add(G.cyl(0.07, 0.1, 3.6, 6), irn, { p: [x, 1.8, z] }); sk.add(G.box(0.5, 0.05, 0.05), irn, { p: [x - sd * 0.25, 3.5, z] });
    sk.add(G.box(0.26, 0.4, 0.26), irn, { p: [x - sd * 0.5, 3.3, z] }); sk.add(G.box(0.17, 0.28, 0.17), glow('#ffcf7a', 3), { p: [x - sd * 0.5, 3.3, z] }); sk.add(G.cone(0.22, 0.2, 4), irn, { p: [x - sd * 0.5, 3.6, z], r: [0, PI / 4, 0] }); }
  // chariot bâché
  const wagon = (x, z, ry) => { const c = Math.cos(ry), s = Math.sin(ry); const P = (lx, ly, lz) => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
    sk.add(G.box(1.6, 0.2, 3.2), dk, { p: P(0, 0.9, 0), r: [0, ry, 0] });
    for (const sx of [-1, 1]) { sk.add(G.box(0.1, 0.7, 3.2), pl, { p: P(sx * 0.8, 1.3, 0), r: [0, ry, 0] }); for (const lz of [-1.1, 1.1]) { sk.add(G.tor(0.62, 0.06, 5, 16), irn, { p: P(sx * 0.95, 0.65, lz), r: [0, ry + H, 0] }); for (let i = 0; i < 4; i++) sk.add(G.box(0.05, 1.2, 0.05), dk, { p: P(sx * 0.95, 0.65, lz), r: [i * PI / 4, ry + H, 0] }); sk.add(G.cyl(0.08, 0.08, 1.9, 6), irn, { p: P(0, 0.65, lz), r: [0, ry, H] }); } }
    sk.add(G.cyl(0.9, 0.9, 3.0, 10, true), mat('#e4d6b0', { roughness: 0.95, side: THREE.DoubleSide }), { p: P(0, 1.7, -0.1), r: [H, 0, ry], s: [1, 1, 0.8] });
    sk.add(G.box(0.1, 0.1, 2.4), dk, { p: P(0, 0.75, 2.8), r: [0, ry, 0] }); };
  wagon(-7.8, -70, 0.5);
  // puits
  { const x = -7.5, z = -19; sk.add(G.cyl(1.0, 1.05, 0.9, 14), mat('#a8977c', { roughness: 0.95 }), { p: [x, 0.45, z] }); sk.add(G.cyl(0.85, 0.85, 0.05, 14), mat('#1d3a4a', { roughness: 0.2 }), { p: [x, 0.88, z] });
    for (const sx of [-1, 1]) sk.add(G.box(0.12, 2.0, 0.12), dk, { p: [x + sx * 0.95, 1.9, z] }); sk.add(G.box(2.2, 0.12, 0.12), dk, { p: [x, 2.9, z] }); sk.add(G.cone(1.4, 0.9, 4), mat('#5a3a20'), { p: [x, 3.4, z], r: [0, PI / 4, 0], s: [1.2, 1, 0.8] }); sk.add(G.cyl(0.05, 0.05, 0.9, 5), irn, { p: [x, 2.5, z] }); }
  // balles de foin, tonneaux, caisses en grappes
  for (let i = 0; i < 10; i++) { const z = -28 - i * 7.5, sd = i % 2 ? 1 : -1, x = sd * (6 + (i % 3) * 0.4);
    if (i % 3 === 0) sk.add(G.cyl(0.55, 0.55, 0.9, 12), mat('#c8aa5a', { roughness: 1 }), { p: [x, 0.45, z], r: [H, 0, i] });
    else if (i % 3 === 1) { sk.add(G.lathe([[0.32, 0], [0.4, 0.4], [0.32, 0.85], [0, 0.85]], 12), mat('#6b4426'), { p: [x, 0, z] }); sk.add(G.tor(0.37, 0.025, 4, 12), irn, { p: [x, 0.5, z], r: [H, 0, 0] }); }
    else { sk.add(G.box(0.7, 0.7, 0.7), mat('#a07a48', { roughness: 0.9 }), { p: [x, 0.35, z], r: [0, i, 0] }); sk.add(G.box(0.5, 0.5, 0.5), mat('#8a6a3a', { roughness: 0.9 }), { p: [x + 0.2, 0.95, z], r: [0, i * 2, 0] }); } }
  // cactus en pot / buissons secs à l'entrée, rails de fin, panneaux d'avis
  for (const sd of [-1, 1]) { sk.add(G.box(0.12, 2.2, 0.12), dk, { p: [sd * 3.5, 1.1, -12] }); sk.add(G.box(1.0, 0.7, 0.06), mat('#efe2c4'), { p: [sd * 3.5, 1.8, -11.95] }); }
  town.add(sk.build());
  // Arche d'entrée monumentale
  const archT = textSprite(['POUSSIÈRE-SUR-RAIL', 'pop. 4 cactus · 0 shérif'], { w: 1024, h: 256, bg: '#3a2412', fg: '#f3d9a0', border: '#d9a35a', font: 'bold 80px Georgia' });
  const ak = new Kit(), AZ = -100; { const add0 = ak.add.bind(ak); ak.add = (geo, m, o = {}) => { const p = o.p || [0, 0, 0]; return add0(geo, m, { ...o, p: [p[0], p[1] + gl(Math.sign(p[0]) * 5.6, AZ), p[2]] }); }; }
  for (const x of [-5.6, 5.6]) { ak.add(G.rbox(1.3, 0.8, 1.3, 0.08), mat('#8a7a62', { roughness: 1 }), { p: [x, 0.4, AZ] }); ak.add(G.box(0.7, 9, 0.7), dk, { p: [x, 4.8, AZ] }); ak.add(G.box(0.95, 0.4, 0.95), brs, { p: [x, 9.4, AZ] }); ak.add(G.cone(0.5, 0.9, 4), brs, { p: [x, 10.1, AZ], r: [0, PI / 4, 0] });
    for (const sg of [-1, 1]) ak.add(G.box(0.18, 0.18, 2.6), dk, { p: [x, 7.4, AZ + sg * 0.0], r: [0, 0, 0] }); ak.add(G.box(0.18, 3.2, 0.18), dk, { p: [x * 0.82, 7.4, AZ + 1.0], r: [0, 0, x > 0 ? 0.6 : -0.6] }); }
  ak.add(G.box(12.4, 0.5, 0.6), dk, { p: [0, 9.2, AZ] }); ak.add(G.box(12.4, 0.18, 0.7), brs, { p: [0, 9.55, AZ] });
  ak.add(G.box(11.0, 3.0, 0.3), dk, { p: [0, 7.6, AZ - 0.05] });
  for (const x of [-4, 4]) { ak.add(G.cyl(0.025, 0.025, 0.9, 4), irn, { p: [x, 8.7, AZ + 0.4] }); ak.add(G.box(0.4, 0.5, 0.4), irn, { p: [x, 8.0, AZ + 0.5] }); ak.add(G.box(0.26, 0.34, 0.26), glow('#ffcf7a', 3), { p: [x, 8.0, AZ + 0.5] }); }
  // crâne de bovin au sommet
  ak.add(G.sph(0.3, 8, 6), mat('#efe6d0'), { p: [0, 10.1, AZ], s: [1, 0.8, 0.6] }); for (const sd of [-1, 1]) ak.add(G.tube([[sd * 0.2, 10.1, AZ], [sd * 0.8, 10.2, AZ], [sd * 1.3, 10.7, AZ]], 0.07, 8, 5), mat('#efe6d0'));
  town.add(ak.build());
  const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: archT, side: THREE.DoubleSide })); board.position.set(0, 7.6 + gl(5.6, AZ), AZ + 0.12); town.add(board);
  town.userData.archTex = board;
  // Piédestal du Shérif (où le ramener) : gradins + colonnade
  const pk = new Kit(), PZ = 18, gold = mat('#c9a25a', { metalness: 0.7, roughness: 0.3 }), mrb = mat('#cfc6b4', { roughness: 0.8 });
  pk.add(G.cyl(4.4, 4.8, 0.3, 24), mat('#8a7a62', { roughness: 1 }), { p: [0, 0.15, PZ] });
  pk.add(G.cyl(3.4, 3.8, 0.4, 24), mrb, { p: [0, 0.5, PZ] });
  pk.add(G.cyl(2.2, 2.6, 1.2, 8), gold, { p: [0, 0.6, PZ] });
  pk.add(G.tor(2.35, 0.1, 5, 24), gold, { p: [0, 1.2, PZ], r: [H, 0, 0] });
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + PI / 6, x = Math.cos(a) * 3.5, z = PZ + Math.sin(a) * 3.5; pk.add(G.cyl(0.18, 0.22, 3.2, 10), mrb, { p: [x, 2.0, z] }); pk.add(G.box(0.55, 0.2, 0.55), mrb, { p: [x, 3.7, z] }); pk.add(G.sph(0.2, 8, 6), glow('#ffe9a0', 2), { p: [x, 3.95, z] }); }
  pk.add(G.tor(3.5, 0.08, 5, 36), brs, { p: [0, 3.55, PZ], r: [H, 0, 0] });
  for (const sx of [-1, 1]) for (const sz of [0, 1]) pk.add(G.box(0.1, 0.5, 0.1), gold, { p: [sx * 1.0, 1.5, PZ + (sz ? 1.0 : -1.0)] });
  pk.add(G.cyl(4.7, 6.5, 8, 24), mat('#8a7a62', { roughness: 1 }), { p: [0, -3.9, PZ] }); // fondation : le terrain monte derrière le terminus
  town.updateMatrixWorld(true);
  const pedY = terrain.heightAt(...(() => { const v = town.localToWorld(new THREE.Vector3(0, 0, PZ)); return [v.x, v.z]; })()) - town.position.y;
  const pedG = pk.build(); pedG.position.y = Math.max(0, pedY); town.add(pedG);
  const pTex = textSprite(['ICI SE TENAIT', 'SHÉRIF-7', 'gardien de Poussière'], { bg: '#3a2412', fg: '#f3d9a0', border: '#d9a35a' });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshBasicMaterial({ map: pTex })); plaque.position.set(0, 1.6 + Math.max(0, pedY), PZ - 5.0); plaque.rotation.y = Math.PI; town.add(plaque);
  // Cactus-automates pianistes : cactus à bras articulés, laiton, yeux, piano droit avec clavier et tabouret
  const autoGeo = (() => { const k = new Kit(), cg = mat('#4f8a3a', { roughness: 0.8 }), rv = mat('#2a1a10', { roughness: 0.6 });
    const ribbed = (r, hh, seg = 5) => { const gg = new THREE.CylinderGeometry(r, r * 1.05, hh, seg * 2, 2); const p = gg.attributes.position; for (let i = 0; i < p.count; i++) { const an = Math.atan2(p.getZ(i), p.getX(i)); const f = 1 + 0.08 * Math.cos(an * seg); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); } gg.computeVertexNormals(); return gg; };
    k.add(ribbed(0.5, 3.0), cg, { p: [0, 1.7, 0] }); k.add(G.sph(0.52, 10, 4, 0, PI * 2, 0, H), cg, { p: [0, 3.2, 0] });
    // bras vers le clavier (+z)
    for (const sx of [-1, 1]) { k.add(G.tube([[sx * 0.4, 2.2, 0.1], [sx * 0.8, 2.3, 0.4], [sx * 0.7, 1.7, 1.0], [sx * 0.55, 1.5, 1.3]], 0.17, 8, 6), cg); k.add(G.sph(0.2, 8, 6), brs, { p: [sx * 0.55, 1.5, 1.3] }); k.add(G.cyl(0.24, 0.24, 0.12, 10), brs, { p: [sx * 0.8, 2.3, 0.4], r: [0, 0, H] }); }
    // plaque de laiton + rivets + engrenage dorsal + antenne
    k.add(G.rbox(0.8, 0.7, 0.1, 0.04), brs, { p: [0, 2.3, 0.52] }); for (const dx of [-0.3, 0.3]) for (const dy of [-0.25, 0.25]) k.add(G.sph(0.04, 5, 4), irn, { p: [dx, 2.3 + dy, 0.58] });
    k.add(G.tor(0.35, 0.05, 5, 12), brs, { p: [0, 2.4, -0.55] }); for (let i = 0; i < 4; i++) k.add(G.box(0.05, 0.7, 0.05), brs, { p: [0, 2.4, -0.55], r: [0, 0, i * PI / 4] });
    k.add(G.cyl(0.02, 0.02, 0.7, 4), irn, { p: [0.2, 3.9, 0] }); k.add(G.sph(0.06, 6, 5), glow('#ff4a3a', 2), { p: [0.2, 4.25, 0] });
    // pot en terre
    k.add(G.cyl(0.8, 0.6, 0.6, 12), mat('#9a5a35', { roughness: 0.9 }), { p: [0, 0.3, 0] }); k.add(G.tor(0.78, 0.07, 5, 14), mat('#9a5a35'), { p: [0, 0.62, 0], r: [H, 0, 0] });
    // piano droit
    k.add(G.rbox(2.4, 1.5, 0.8, 0.05), rv, { p: [0, 0.8, 1.9] }); k.add(G.box(2.5, 0.08, 0.95), mat('#3a2412'), { p: [0, 1.58, 1.9] });
    k.add(G.box(2.2, 0.06, 0.4), mat('#f4f0e6'), { p: [0, 1.15, 1.35] }); for (let i = 0; i < 11; i++) k.add(G.box(0.06, 0.07, 0.24), rv, { p: [-0.95 + i * 0.19, 1.2, 1.28] });
    k.add(G.box(1.5, 0.7, 0.04), mat('#efe2c4'), { p: [0, 1.55, 2.05], r: [-0.3, 0, 0] });
    for (const dx of [-1.0, 1.0]) k.add(G.cyl(0.05, 0.05, 1.5, 5), brs, { p: [dx, 0.8, 1.5]});
    k.add(G.cyl(0.4, 0.4, 0.1, 10), mat('#7a2a2a'), { p: [0, 0.6, 0.65] }); k.add(G.cyl(0.05, 0.05, 0.5, 5), irn, { p: [0, 0.35, 0.65] });
    // note flottante
    return k.build(); })();
  const eyeM = glow('#ffe060', 3), autos = [];
  for (let k = 0; k < 4; k++) {
    const a = new THREE.Group();
    a.add(autoGeo.clone());
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), eyeM); e.position.set(sx * 0.2, 2.9, 0.48); a.add(e); const r = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 5, 12), MAT.brass()); r.position.set(sx * 0.2, 2.9, 0.48); a.add(r); }
    a.position.set((k % 2 ? 9 : -9), gl(k % 2 ? 9 : -9, -40 - k * 9), -40 - k * 9); a.rotation.y = k % 2 ? -0.6 : 0.6;
    a.traverse(o => { if (o.isMesh) o.castShadow = true; });
    town.add(a); autos.push(a);
  }
  scene.add(town);
  town.updateMatrixWorld(true);
  for (const b of town.children) {
    if (b.userData.bw) { const v = b.getWorldPosition(new THREE.Vector3()); const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())); COLLIDERS.box(v.x + fw.x * 0.1, v.z + fw.z * 0.1, b.userData.bw / 2 + 0.3, b.userData.bd / 2 + 0.3, Math.atan2(fw.x, fw.z)); }
  }
  // porches, poteaux, rambardes, tonneaux des façades : colonnes solides hors de l'emprise des bâtiments
  for (const b of town.children) if (b.userData.bw) COLLIDERS.autoSolid(b, (x, z) => terrain.heightAt(x, z));
  for (const a of autos) { const v = a.getWorldPosition(new THREE.Vector3()); COLLIDERS.circle(v.x, v.z, 1.1); }
  { const v = town.localToWorld(new THREE.Vector3(0, 0, 18)), y0 = terrain.heightAt(v.x, v.z);
    COLLIDERS.floorCircle(v.x, v.z, 4.7, y0 + 0.3); COLLIDERS.floorCircle(v.x, v.z, 3.7, y0 + 0.75); COLLIDERS.floorCircle(v.x, v.z, 2.5, y0 + 1.2);
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + PI / 6; const c = town.localToWorld(new THREE.Vector3(Math.cos(a) * 3.5, 0, 18 + Math.sin(a) * 3.5)); COLLIDERS.circle(c.x, c.z, 0.3); } }
  for (const a of autos) { const v = a.localToWorld(new THREE.Vector3(0, 0, 1.9)); COLLIDERS.circle(v.x, v.z, 0.95); }
  { const v = town.localToWorld(new THREE.Vector3(-7.5, 0, -19)); COLLIDERS.circle(v.x, v.z, 1.1, terrain.heightAt(v.x, v.z) + 1.0); }
  { const v = town.localToWorld(new THREE.Vector3(-7.8, 0, -70)); COLLIDERS.circle(v.x, v.z, 1.4, terrain.heightAt(v.x, v.z) + 1.9); }
  for (const x of [-5.6, 5.6]) { const v = town.localToWorld(new THREE.Vector3(x, 0, -100)); COLLIDERS.circle(v.x, v.z, 0.5); }
  const pedWorld = town.localToWorld(new THREE.Vector3(0, 1.2 + Math.max(0, pedY), 18));
  interact.add({ id: 'pedestal', pos: pedWorld, r: 7, label: 'Piédestal du gardien' });
  return { town, autos, pedestal: pedWorld };
}

export function buildGelure(scene, terrain, net, interact) {
  const rnd = mulberry(55);
  const ice = new THREE.MeshStandardMaterial({ color: '#a9dcf5', roughness: 0.15, metalness: 0.25, emissive: '#3a8fc0', emissiveIntensity: 0.3, flatShading: true });
  for (let v = 0; v < 3; v++) scatter(scene, terrain, net, rnd, 90, [5], iceCrystalGeometry(v + 1), ice, { sMin: 0.5, sMax: 2.2, tilt: 0.2, yOff: -0.3, collide: 1.0, collideTop: 5 });
  for (let v = 0; v < 4; v++) scatter(scene, terrain, net, rnd, 110, [5], rockShapeGeometry(v + 40, 'snow'), FLORA_MAT, { sMin: 0.6, sMax: 3, yStretch: 0.4, yOff: 0.3, collide: 1.2, collideTop: 0.8, shadow: v === 0 });
  for (let v = 0; v < 3; v++) scatter(scene, terrain, net, rnd, 55, [5], pineGeometry(v), FLORA_MAT, { sMin: 0.5, sMax: 1.1, shadow: false, collide: 0.5, collideTop: 5 }); // sapins gelés
  for (let v = 0; v < 2; v++) scatter(scene, terrain, net, rnd, 110, [5], snowShrubGeometry(v), FLORA_MAT, { sMin: 0.7, sMax: 1.6 });

  // LE TSUNAMI GELÉ : vague géante enjambant la voie K5 -> T5 (voir tsunami.js)
  const e = net.edges.find(x => x.a === 'K5' && x.b === 'T5');
  const wave = buildTsunami(scene, terrain, net, e, 0.42);

  // Le bloc de glace du SHÉRIF-7, près du terminus
  const T = net.nodes.get('T5');
  const te = net.edges[T.edges[0]], tEnd = te.pts[te.pts.length - 12], tPrev = te.pts[te.pts.length - 20];
  const tang = new THREE.Vector3().subVectors(tEnd, tPrev).normalize();
  const side = new THREE.Vector3(-tang.z, 0, tang.x);
  const bpos = tEnd.clone().addScaledVector(side, 9); bpos.y = terrain.heightAt(bpos.x, bpos.z);
  interact.add({ id: 'iceblock', pos: bpos.clone(), r: 6, label: 'Un robot figé dans la glace…' });
  return { wave, iceBlockPos: bpos };
}
