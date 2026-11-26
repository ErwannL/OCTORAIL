import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildSheriffModel } from '../world/models.js';
import { buildFindModel } from './finds.js';
import { mulberry } from '../util/noise.js';
import { sectorIndex } from '../world/biomes.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });

export function buildSheriff() { return buildSheriffModel(); }

// ---------- géométries utilitaires (couleurs de sommets => 1 seul draw call par objet)
const PI = Math.PI, H = PI / 2;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function part(geo, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  _m4.compose(new THREE.Vector3(...p), _q.setFromEuler(_e.set(...r)), new THREE.Vector3(...s)); g.applyMatrix4(_m4);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
}
const merge = (parts) => mergeGeometries(parts, false);
const R = (seed) => { let a = seed; return () => (a = (a * 16807) % 2147483647) / 2147483647; };

// Bloc de glace du Shérif : cristal central facetté + éclats + socle givré (origine historique : centre à y=2.6)
export function buildIceBlock() {
  const rnd = R(97);
  const ice = new THREE.MeshStandardMaterial({ color: '#bfe8ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.5, flatShading: true, emissive: '#3a8fc0', emissiveIntensity: 0.25, depthWrite: false });
  const iceGeos = [];
  const main = new THREE.IcosahedronGeometry(2.6, 1); const mp = main.attributes.position;
  for (let i = 0; i < mp.count; i++) { const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i); const f = 0.92 + 0.14 * Math.sin(x * 2.1 + z * 1.7) * Math.cos(y * 1.3); mp.setXYZ(i, x * f, y * 1.35 * f, z * f); }
  main.computeVertexNormals(); iceGeos.push(main);
  // éclats pointus autour du bloc
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * PI * 2 + rnd() * 0.5, d = 2.2 + rnd() * 1.2, h = 1.6 + rnd() * 2.8, r = 0.35 + rnd() * 0.4;
    iceGeos.push(part(new THREE.ConeGeometry(r, h, 5), '#fff', [Math.cos(a) * d, -2.6 + h / 2, Math.sin(a) * d], [(rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5]));
  }
  for (let i = 0; i < 4; i++) iceGeos.push(part(new THREE.ConeGeometry(0.3, 1.8, 5), '#fff', [(rnd() - 0.5) * 3, 3.6, (rnd() - 0.5) * 3], [0.2, 0, 0.2]));
  const iceGeo = mergeGeometries(iceGeos.map(g => { const c = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal') c.deleteAttribute(k); return c; }), false);
  // socle givré (opaque) : disque irrégulier + neige
  const frost = new THREE.MeshStandardMaterial({ color: '#eaf6ff', roughness: 0.8, flatShading: true });
  const fg = []; for (let i = 0; i < 14; i++) { const a = i / 14 * PI * 2; fg.push(part(new THREE.IcosahedronGeometry(0.9 + rnd() * 0.8, 0), '#fff', [Math.cos(a) * (3.1 + rnd()), -2.5, Math.sin(a) * (3.1 + rnd())], [rnd(), rnd(), 0], [1, 0.4, 1])); }
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })); core.scale.set(1, 2.6, 1);
  const grp = new THREE.Group(); grp.position.y = 2.6;
  grp.add(new THREE.Mesh(iceGeo, ice), new THREE.Mesh(merge(fg.map(g => { g.deleteAttribute('color'); return g; })), frost), core);
  grp.children[1].receiveShadow = true;
  return grp;
}

// Or-moteur : pépites vivantes (petits êtres dorés à yeux et pattes) qui sautillent près des voies de l'Ouest
function nuggetGeometry() {
  const body = new THREE.IcosahedronGeometry(0.36, 1); const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) { const x0 = p.getX(i), y0 = p.getY(i), z0 = p.getZ(i), k = 0.88 + 0.22 * Math.abs(Math.sin(x0 * 9.1 + y0 * 6.3 + z0 * 4.7)); p.setXYZ(i, p.getX(i) * k * 1.1, p.getY(i) * k * 0.85, p.getZ(i) * k); }
  const parts = [part(body, '#ffcc33', [0, 0.1, 0])];
  parts.push(part(new THREE.IcosahedronGeometry(0.14, 0), '#ffe27a', [-0.12, 0.3, -0.1]), part(new THREE.IcosahedronGeometry(0.1, 0), '#ffe27a', [0.18, 0.28, 0.0]));   // éclats brillants
  for (const x of [-0.1, 0.1]) {
    parts.push(part(new THREE.SphereGeometry(0.075, 8, 6), '#fff6dc', [x, 0.18, 0.3]), part(new THREE.SphereGeometry(0.04, 6, 5), '#1a1208', [x, 0.18, 0.365]));          // yeux
    parts.push(part(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 6), '#a06a00', [x * 1.5, -0.2, 0.05]), part(new THREE.BoxGeometry(0.11, 0.04, 0.16), '#7a4f00', [x * 1.5, -0.28, 0.1])); // pattes
  }
  parts.push(part(new THREE.BoxGeometry(0.14, 0.03, 0.03), '#a06a00', [0, 0.02, 0.35]));   // sourire
  return merge(parts);
}
export class Nuggets {
  constructor(scene, terrain, net, count = 40) {
    this.list = []; const rnd = mulberry(321);
    const geo = nuggetGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.35, emissive: '#a06a00', emissiveIntensity: 0.25, flatShading: true });
    const edges = net.edges.filter(e => e.biome === 4);
    let tries = 0;
    while (this.list.length < count && tries++ < 2000) {
      const e = edges[Math.floor(rnd() * edges.length)]; const k = Math.floor(rnd() * e.pts.length); const p = e.pts[k];
      const off = (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 14);
      const a = e.pts[Math.max(0, k - 2)], b = e.pts[Math.min(e.pts.length - 1, k + 2)];
      const nx = -(b.z - a.z), nz = b.x - a.x, L = Math.hypot(nx, nz) || 1;
      const x = p.x + nx / L * off, z = p.z + nz / L * off;
      if (sectorIndex(x, z) !== 4 || Math.hypot(x, z) < 150) continue;
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.scale.setScalar(1.15); scene.add(m);
      this.list.push({ m, home: new THREE.Vector3(x, terrain.heightAt(x, z), z), ph: rnd() * 10, alive: true, flee: new THREE.Vector3(), yaw: rnd() * 6 });
    }
    this.terrain = terrain;
  }
  update(dt, t, playerPos) {
    for (const n of this.list) {
      if (!n.alive) continue;
      const d = n.m.position.distanceTo(playerPos);
      const scared = d < 7;
      if (scared) {
        n.flee.subVectors(n.m.position, playerPos).setY(0).normalize().multiplyScalar(3.5 * dt); n.home.add(n.flee); n.home.y = this.terrain.heightAt(n.home.x, n.home.z);
        n.yaw += ((Math.atan2(n.flee.x, n.flee.z) - n.yaw + PI * 3) % (PI * 2) - PI) * Math.min(1, dt * 8);
      } else n.yaw += Math.sin(t * 0.7 + n.ph) * dt * 0.8;
      const sp = scared ? 7 : 3, ph = Math.abs(Math.sin(t * sp + n.ph)), air = Math.sin(t * sp + n.ph) > 0;
      n.m.position.set(n.home.x, n.home.y + 0.4 + ph * (scared ? 1.2 : 0.55), n.home.z);
      n.m.rotation.set(scared && air ? -0.25 : 0, n.yaw, Math.sin(t * sp * 0.5 + n.ph) * 0.12);
      const sq = air ? 1.0 + ph * 0.1 : 1 - (1 - ph) * 0.18;      // étirement en l'air, écrasement à l'atterrissage
      n.m.scale.set(1.15 / Math.sqrt(sq), 1.15 * sq, 1.15 / Math.sqrt(sq));
    }
  }
}

// Glace-mémoire : amas de cristaux bleus sur roche givrée qui chantent un souvenir quand on les mine
function crystalVariant(seed) {
  const rnd = R(seed), parts = [], rock = [];
  const shard = (r, h, p, rot) => { // prisme hexagonal pointu
    const body = new THREE.CylinderGeometry(r * 0.8, r, h * 0.7, 6), tip = new THREE.ConeGeometry(r * 0.8, h * 0.3, 6);
    parts.push(part(body, '#fff', [p[0], p[1] + h * 0.35, p[2]], rot), part(tip, '#fff', [p[0] + Math.sin(rot[2]) * -h * 0.5 * 0, p[1] + h * 0.85, p[2]], rot));
  };
  shard(0.42, 2.6, [0, 0, 0], [0.04, rnd() * 3, 0.03]);
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) { const a = i / n * PI * 2 + rnd(), d = 0.35 + rnd() * 0.4, h = 0.8 + rnd() * 1.3, t = 0.3 + rnd() * 0.35; shard(0.14 + rnd() * 0.1, h, [Math.cos(a) * d, 0.0, Math.sin(a) * d], [Math.sin(a) * t, rnd() * 3, -Math.cos(a) * t]); }
  const crystals = merge(parts.map(g => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }));
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; rock.push(part(new THREE.IcosahedronGeometry(0.4 + rnd() * 0.3, 0), '#cfe3ee', [Math.cos(a) * 0.65, 0.05, Math.sin(a) * 0.65], [rnd(), rnd(), 0], [1, 0.55, 1])); }
  rock.push(part(new THREE.IcosahedronGeometry(0.7, 0), '#8fa6b6', [0, -0.1, 0], [0.3, 0.4, 0], [1.2, 0.5, 1.2]));
  const rockGeo = merge(rock);
  return { crystals, rockGeo };
}
export class Crystals {
  constructor(scene, terrain, net, count = 24) {
    this.list = []; const rnd = mulberry(777);
    const vars = [crystalVariant(11), crystalVariant(23), crystalVariant(37)];
    this.mat = M('#8fe0ff', { emissive: '#2fb0ff', emissiveIntensity: 1.2, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.88, flatShading: true });
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const edges = net.edges.filter(e => e.biome === 5);
    let tries = 0;
    while (this.list.length < count && tries++ < 3000) {
      const e = edges[Math.floor(rnd() * edges.length)]; const k = Math.floor(rnd() * e.pts.length); const p = e.pts[k];
      const off = (rnd() < 0.5 ? -1 : 1) * (6 + rnd() * 16);
      const x = p.x + off * (rnd() - 0.5) * 2, z = p.z + off;
      if (sectorIndex(x, z) !== 5 || Math.hypot(x, z) < 150) continue;
      const v = vars[this.list.length % 3];
      const m = new THREE.Group();
      const cr = new THREE.Mesh(v.crystals, this.mat); cr.castShadow = false; m.add(cr);
      const rk = new THREE.Mesh(v.rockGeo, rockMat); rk.receiveShadow = true; m.add(rk);
      const s = 0.9 + rnd() * 0.7; m.scale.set(s, s * (0.9 + rnd() * 0.3), s);
      m.position.set(x, terrain.heightAt(x, z) + 0.3, z); m.rotation.y = rnd() * 6; scene.add(m);
      this.list.push({ m, hp: 1, alive: true });
    }
  }
  update(t) { this.mat.emissiveIntensity = 1.0 + Math.sin(t * 2) * 0.35; }
}

// Trouvailles : objets uniques à exposer au Hall
export const FINDS = [
  { id: 'fer', name: 'Fer à cheval à ressort', world: 4, lore: '« Pour les chevaux mécaniques de Poussière. Ils sautaient par-dessus les trains. »', color: '#b0b0b0' },
  { id: 'harmonica', name: 'Harmonica des Bâtisseurs', world: 4, lore: '« Il joue tout seul la même mélodie que le noyau du Moyeu. »', color: '#d4a54a' },
  { id: 'billet', name: 'Billet n°0000001', world: 4, lore: '« Passager : [effacé]. Destination : TOUTES. Validité : éternelle. »', color: '#f3e3c0' },
  { id: 'flocon', name: 'Flocon éternel', world: 5, lore: '« Il ne fond pas. Il a l\'air d\'attendre quelque chose. »', color: '#dff6ff' },
  { id: 'boussole', name: 'Boussole du retour', world: 5, lore: '« Elle ne pointe pas le nord. Elle pointe les capsules du Moyeu. »', color: '#c9973f' },
];
export function buildFinds(scene, terrain, net) {
  const rnd = mulberry(4040); const out = [];
  for (const f of FINDS) {
    const edges = net.edges.filter(e => e.biome === f.world);
    for (let tries = 0; tries < 500; tries++) {
      const e = edges[Math.floor(rnd() * edges.length)]; const k = Math.floor(e.pts.length * (0.3 + rnd() * 0.6)); const p = e.pts[k];
      const x = p.x + (rnd() - 0.5) * 50, z = p.z + (rnd() - 0.5) * 50;
      if (sectorIndex(x, z) !== f.world || net.nearest(x, z, 6)) continue;
      const g = new THREE.Group();
      const item = buildFindModel(f.id);
      g.add(item);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 40, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.y = 20; g.add(beam);
      g.position.set(x, terrain.heightAt(x, z) + 1, z); scene.add(g);
      out.push({ ...f, g, item, beam, taken: false });
      break;
    }
  }
  return out;
}

// (studio de test) un exemplaire isolé de chaque modèle
export function __test(what) {
  const g = new THREE.Group(), fake = { heightAt: () => 0 };
  const e = { biome: what === 'nugget' ? 4 : 5, pts: Array.from({ length: 40 }, (_, i) => ({ x: 200 + i * 4, z: 200 })) };
  void fake; void e;
  if (what === 'nugget') { const m = new THREE.Mesh(nuggetGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.35, emissive: '#a06a00', emissiveIntensity: 0.25, flatShading: true })); m.position.y = 0.4; g.add(m); }
  else { const v = crystalVariant(11); const cm = M('#8fe0ff', { emissive: '#2fb0ff', emissiveIntensity: 1.2, transparent: true, opacity: 0.88, flatShading: true }); g.add(new THREE.Mesh(v.crystals, cm), new THREE.Mesh(v.rockGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }))); }
  return g;
}
