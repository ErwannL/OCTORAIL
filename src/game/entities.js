import * as THREE from 'three';
import { mulberry } from '../util/noise.js';
import { sectorIndex } from '../world/biomes.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });

// SHÉRIF-7 : robot-cowboy en laiton sur monocycle (design original)
export function buildSheriff() {
  const g = new THREE.Group();
  const brass = M('#c9973f', { metalness: 0.85, roughness: 0.3 }), dark = M('#2a1d12', { metalness: 0.4 }), red = M('#8a1f1f');
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 8, 24), dark); wheel.position.y = 0.6; g.add(wheel);
  const hubw = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 10), brass); hubw.rotation.x = Math.PI / 2; hubw.position.y = 0.6; g.add(hubw);
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), brass); fork.position.set(0, 1.1, 0); g.add(fork);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.1, 10), brass); body.position.y = 1.9; g.add(body);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.06, 6, 16), dark); belt.rotation.x = Math.PI / 2; belt.position.y = 1.5; g.add(belt);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), M('#ffd24a', { metalness: 1, roughness: 0.2, emissive: '#7a5a00', emissiveIntensity: 0.5 })); star.position.set(0.22, 2.05, 0.45); star.scale.z = 0.3; g.add(star);
  const scarf = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.35, 4), red); scarf.position.set(0, 2.35, 0.32); scarf.rotation.x = Math.PI; g.add(scarf);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.6), brass); head.position.y = 2.75; g.add(head);
  const eye = M('#111', { emissive: '#ffcc33', emissiveIntensity: 3 });
  for (const x of [-0.16, 0.16]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), eye); e.rotation.x = Math.PI / 2; e.position.set(x, 2.8, 0.31); g.add(e); }
  const moust = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 4, 12, Math.PI), dark); moust.position.set(0, 2.6, 0.31); moust.rotation.z = Math.PI; g.add(moust);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 20), M('#5a3a1e')); brim.position.y = 3.07; g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.45, 16), M('#5a3a1e')); crown.position.y = 3.3; g.add(crown);
  g.userData.hat = [brim, crown];
  const arms = [];
  for (const x of [-0.62, 0.62]) { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.6, 4, 8), brass); a.position.set(x, 1.9, 0); a.rotation.z = x > 0 ? 0.3 : -0.3; g.add(a); arms.push(a); }
  const ant = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M('#f33', { emissive: '#f00', emissiveIntensity: 3 })); ant.position.set(0.25, 3.15, -0.2); g.add(ant);
  g.userData.arms = arms; g.userData.wheel = wheel; g.userData.eyeMat = eye;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function buildIceBlock() {
  const mat = new THREE.MeshPhysicalMaterial({ color: '#bfe8ff', roughness: 0.05, transmission: 0.55, transparent: true, opacity: 0.55, thickness: 1.5, flatShading: true, emissive: '#3a8fc0', emissiveIntensity: 0.2 });
  const geo = new THREE.IcosahedronGeometry(2.6, 1);
  const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.9 + Math.random() * 0.25), p.getY(i) * 1.35 * (0.9 + Math.random() * 0.2), p.getZ(i) * (0.9 + Math.random() * 0.25));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.position.y = 2.6; return m;
}

// Or-moteur : pépites vivantes qui sautillent près des voies de l'Ouest
export class Nuggets {
  constructor(scene, terrain, net, count = 40) {
    this.list = []; const rnd = mulberry(321);
    const geo = new THREE.IcosahedronGeometry(0.35, 0);
    const mat = M('#ffcc33', { metalness: 1, roughness: 0.25, emissive: '#a06a00', emissiveIntensity: 0.6, flatShading: true });
    const edges = net.edges.filter(e => e.biome === 4);
    let tries = 0;
    while (this.list.length < count && tries++ < 2000) {
      const e = edges[Math.floor(rnd() * edges.length)]; const k = Math.floor(rnd() * e.pts.length); const p = e.pts[k];
      const off = (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 14);
      const a = e.pts[Math.max(0, k - 2)], b = e.pts[Math.min(e.pts.length - 1, k + 2)];
      const nx = -(b.z - a.z), nz = b.x - a.x, L = Math.hypot(nx, nz) || 1;
      const x = p.x + nx / L * off, z = p.z + nz / L * off;
      if (sectorIndex(x, z) !== 4 || Math.hypot(x, z) < 150) continue;
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; scene.add(m);
      this.list.push({ m, home: new THREE.Vector3(x, terrain.heightAt(x, z), z), ph: rnd() * 10, alive: true, flee: new THREE.Vector3() });
    }
    this.terrain = terrain;
  }
  update(dt, t, playerPos) {
    for (const n of this.list) {
      if (!n.alive) continue;
      const d = n.m.position.distanceTo(playerPos);
      if (d < 7) { n.flee.subVectors(n.m.position, playerPos).setY(0).normalize().multiplyScalar(3.5 * dt); n.home.add(n.flee); n.home.y = this.terrain.heightAt(n.home.x, n.home.z); }
      const hop = Math.abs(Math.sin(t * 3 + n.ph)) * (d < 7 ? 1.4 : 0.6);
      n.m.position.set(n.home.x, n.home.y + 0.35 + hop, n.home.z);
      n.m.rotation.y += dt * 2; n.m.rotation.x += dt;
    }
  }
}

// Glace-mémoire : cristaux bleus qui chantent un souvenir quand on les mine
export class Crystals {
  constructor(scene, terrain, net, count = 24) {
    this.list = []; const rnd = mulberry(777);
    const geo = new THREE.OctahedronGeometry(0.9, 0);
    const edges = net.edges.filter(e => e.biome === 5);
    let tries = 0;
    while (this.list.length < count && tries++ < 3000) {
      const e = edges[Math.floor(rnd() * edges.length)]; const k = Math.floor(rnd() * e.pts.length); const p = e.pts[k];
      const off = (rnd() < 0.5 ? -1 : 1) * (6 + rnd() * 16);
      const x = p.x + off * (rnd() - 0.5) * 2, z = p.z + off;
      if (sectorIndex(x, z) !== 5 || Math.hypot(x, z) < 150) continue;
      const mat = M('#8fe0ff', { emissive: '#2fb0ff', emissiveIntensity: 1.2, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.9, flatShading: true });
      const m = new THREE.Mesh(geo, mat); m.scale.set(0.8, 1.8, 0.8);
      m.position.set(x, terrain.heightAt(x, z) + 1.4, z); m.rotation.y = rnd() * 3; scene.add(m);
      this.list.push({ m, hp: 1, alive: true });
    }
  }
  update(t) { for (const c of this.list) if (c.alive) c.m.material.emissiveIntensity = 0.9 + Math.sin(t * 2 + c.m.position.x) * 0.4; }
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
      const item = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1, 40, 6), M(f.color, { metalness: 0.8, roughness: 0.2, emissive: f.color, emissiveIntensity: 0.3 }));
      g.add(item);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 40, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.y = 20; g.add(beam);
      g.position.set(x, terrain.heightAt(x, z) + 1, z); scene.add(g);
      out.push({ ...f, g, item, beam, taken: false });
      break;
    }
  }
  return out;
}
