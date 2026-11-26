import * as THREE from 'three';
import { Kit, G, mat, MAT, glow } from './kit.js';
import { sectorIndex } from './biomes.js';
import { mulberry } from '../util/noise.js';
import { COLLIDERS } from './colliders.js';

const PI = Math.PI, H = PI / 2;

// Texture de détail du sol (grain, cailloux) — multipliée par les couleurs de biome
export function groundDetailTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const img = g.createImageData(S, S); const r = mulberry(5);
  for (let i = 0; i < S * S; i++) { const v = 215 + r() * 40; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`; g.beginPath(); g.ellipse(r() * S, r() * S, 1 + r() * 4, 1 + r() * 3, r() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.1})`; g.fillRect(r() * S, r() * S, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(260, 260); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Poteaux télégraphiques + fils le long des voies (sensation de vitesse !)
export function buildTrackside(scene, net, terrain) {
  const poleK = new Kit(), wood = mat('#5a3a20', { roughness: 0.9 }), white = mat('#e8e2d6'), glass = mat('#7fd0e8', { roughness: 0.1, metalness: 0.2 });
  poleK.add(G.cyl(0.13, 0.17, 7.5, 7), wood, { p: [0, 3.75, 0] });
  poleK.add(G.box(2.0, 0.16, 0.16), wood, { p: [0, 6.9, 0] });
  poleK.add(G.box(1.4, 0.14, 0.14), wood, { p: [0, 6.3, 0] });
  for (const x of [-0.85, -0.3, 0.3, 0.85]) poleK.add(G.cyl(0.06, 0.08, 0.2, 8), glass, { p: [x, 7.08, 0] });
  for (const x of [-0.55, 0.55]) poleK.add(G.cyl(0.06, 0.08, 0.2, 8), glass, { p: [x, 6.47, 0] });
  const poleGeo = poleK.geometry();
  const iceCap = new Kit(); iceCap.add(G.box(2.1, 0.25, 0.3), mat('#f4fbff'), { p: [0, 7.05, 0] }); iceCap.add(G.cone(0.08, 0.5, 5), mat('#cfefff'), { p: [-0.6, 6.7, 0], r: [PI, 0, 0] }); iceCap.add(G.cone(0.06, 0.4, 5), mat('#cfefff'), { p: [0.4, 6.75, 0], r: [PI, 0, 0] });
  const posts = []; const wires = [];
  for (const e of net.edges) {
    if (e.kind === 'ring') continue;
    const every = 16; // échantillons (~32 m)
    let prev = null;
    for (let k = 10; k < e.pts.length - 6; k += every) {
      const a = e.pts[k - 1], b = e.pts[k + 1], p = e.pts[k];
      const nx = -(b.z - a.z), nz = b.x - a.x, L = Math.hypot(nx, nz) || 1;
      const x = p.x + nx / L * 5.2, z = p.z + nz / L * 5.2;
      if (Math.hypot(x, z) < 75) { prev = null; continue; }
      const y = terrain.heightAt(x, z);
      const ang = Math.atan2(b.x - a.x, b.z - a.z) + H;
      const sec = sectorIndex(x, z);
      posts.push({ x, y, z, ang, ice: sec === 5 });
      const top = new THREE.Vector3(x, y + 7.08, z);
      if (prev) {
        for (const off of [-0.85, -0.3, 0.3, 0.85]) {
          const dx = Math.cos(-ang) * off, dz = Math.sin(-ang) * off; void dz;
          const A = prev.top.clone().add(new THREE.Vector3(Math.cos(prev.ang) * off, 0, -Math.sin(prev.ang) * off));
          const B = top.clone().add(new THREE.Vector3(Math.cos(ang) * off, 0, -Math.sin(ang) * off));
          let last = A;
          for (let s = 1; s <= 4; s++) { const t = s / 4; const q = A.clone().lerp(B, t); q.y -= Math.sin(t * PI) * 0.9; wires.push(last.x, last.y, last.z, q.x, q.y, q.z); last = q; }
          void dx;
        }
      }
      prev = { top, ang };
    }
  }
  const inst = new THREE.InstancedMesh(poleGeo, wood, posts.length);
  const ice = new THREE.InstancedMesh(iceCap.geometry(), mat('#f4fbff'), posts.filter(p => p.ice).length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  let ii = 0;
  posts.forEach((p, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.ang); m.compose(new THREE.Vector3(p.x, p.y, p.z), q, one); inst.setMatrixAt(i, m); if (p.ice) ice.setMatrixAt(ii++, m); });
  inst.castShadow = true; scene.add(inst); scene.add(ice);
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const lines = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2a2420', transparent: true, opacity: 0.7 }));
  scene.add(lines);
}

// Rocher irrégulier (déformé) réutilisable
export function rockGeometry(seed = 1, detail = 1) {
  const geo = new THREE.IcosahedronGeometry(1, detail); const r = mulberry(seed); const p = geo.attributes.position;
  const offs = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!offs.has(key)) offs.set(key, 0.75 + r() * 0.5);
    const f = offs.get(key); p.setXYZ(i, p.getX(i) * f * 1.3, p.getY(i) * f * 0.8, p.getZ(i) * f);
  }
  geo.computeVertexNormals(); return geo;
}

// ------------------------------------------------------------------ Western : moulin, épave, barrières, virevoltants
export function buildWesternDecor(scene, terrain, net) {
  const rnd = mulberry(1234); const anim = { windmills: [], tumbles: [] };
  const edges = net.edges.filter(e => e.biome === 4);
  const spot = (minOff, maxOff) => { for (let t = 0; t < 50; t++) { const e = edges[Math.floor(rnd() * edges.length)]; const k = 10 + Math.floor(rnd() * (e.pts.length - 20)); const p = e.pts[k], a = e.pts[k - 2], b = e.pts[k + 2]; const nx = -(b.z - a.z), nz = b.x - a.x, L = Math.hypot(nx, nz) || 1; const off = (rnd() < 0.5 ? -1 : 1) * (minOff + rnd() * (maxOff - minOff)); const x = p.x + nx / L * off, z = p.z + nz / L * off; if (sectorIndex(x, z) === 4 && Math.hypot(x, z) > 160 && !net.nearest(x, z, minOff - 2)) return { x, z, y: terrain.heightAt(x, z), ang: Math.atan2(b.x - a.x, b.z - a.z) }; } return null; };
  // Éoliennes de ranch (animées)
  for (let i = 0; i < 5; i++) {
    const s = spot(14, 40); if (!s) continue;
    const grp = new THREE.Group(), k = new Kit(), iron = MAT.iron(), wood = MAT.woodDark();
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(G.box(0.12, 11, 0.12), iron, { p: [x * 0.6, 5.5, z * 0.6], r: [z * 0.08, 0, -x * 0.08] });
    for (let y = 1; y < 10; y += 2) { k.add(G.box(1.6 - y * 0.08, 0.06, 0.06), iron, { p: [0, y, 1 - y * 0.05] }); k.add(G.box(0.06, 0.06, 1.6 - y * 0.08), iron, { p: [1 - y * 0.05, y, 0] }); }
    k.add(G.box(1.4, 0.2, 1.4), wood, { p: [0, 11, 0] });
    k.add(G.box(0.15, 0.15, 3), iron, { p: [0, 11.6, -1.2] });
    k.add(G.box(0.05, 1.4, 1.6), mat('#9a3a2a'), { p: [0, 11.6, -2.6] });
    // abreuvoir
    k.add(G.rbox(3, 0.8, 1.2, 0.08), wood, { p: [2.5, 0.4, 0] }); k.add(G.box(2.7, 0.05, 0.9), mat('#3a6a8a', { roughness: 0.1, metalness: 0.3 }), { p: [2.5, 0.72, 0] });
    grp.add(k.build());
    const rotor = new THREE.Group(); rotor.position.set(0, 11.6, 0.6);
    const rk = new Kit(); for (let b = 0; b < 16; b++) rk.add(G.box(0.4, 1.8, 0.04), mat('#c9b99a', { roughness: 0.8 }), { p: [Math.cos(b / 16 * PI * 2) * 1.2, Math.sin(b / 16 * PI * 2) * 1.2, 0], r: [0, 0.3, b / 16 * PI * 2 - H] }); rk.add(G.cyl(0.2, 0.2, 0.4, 10), iron, { r: [H, 0, 0] }); rk.add(G.tor(2.0, 0.04, 4, 32), iron, {});
    rotor.add(rk.build()); grp.add(rotor);
    grp.position.set(s.x, s.y, s.z); grp.rotation.y = rnd() * PI * 2; scene.add(grp);
    COLLIDERS.circle(s.x, s.z, 1.0); { const v = grp.localToWorld(new THREE.Vector3(2.5, 0, 0)); COLLIDERS.box(v.x, v.z, 1.5, 0.6, grp.rotation.y, s.y + 0.8); }
    anim.windmills.push(rotor);
  }
  // Épave de wagon renversé + squelette de bison
  for (let i = 0; i < 3; i++) {
    const s = spot(10, 25); if (!s) continue;
    const k = new Kit(), rust = mat('#7a3a1c', { roughness: 0.9, metalness: 0.3 });
    k.add(G.rbox(2.6, 2.4, 6, 0.1), rust, { p: [0, 1.0, 0], r: [0, 0, 1.4] });
    for (let p = 0; p < 7; p++) k.add(G.box(0.1, 2.3, 0.08), MAT.woodDark(), { p: [-1.25, 1.1, -2.6 + p * 0.85], r: [0, 0, 1.4] });
    for (const z of [-2, 2]) for (const y of [0.2, 2.0]) k.add(G.tor(0.45, 0.08, 6, 14), MAT.iron(), { p: [1.4, y, z], r: [0, H, 0] });
    const bone = mat('#efe6d0', { roughness: 0.7 });
    k.add(G.sph(0.5, 10, 8), bone, { p: [4, 0.4, 1], s: [1.4, 0.8, 1] });
    for (const sgn of [-1, 1]) k.add(G.tube([[4 + sgn * 0.4, 0.6, 1], [4 + sgn * 0.9, 0.9, 1.2], [4 + sgn * 1.1, 1.3, 1.0]], 0.06, 8, 5), bone);
    for (let r2 = 0; r2 < 6; r2++) k.add(G.tor(0.7, 0.05, 4, 10, PI), bone, { p: [4, 0.1, 2.0 + r2 * 0.35], r: [0, H, 0] });
    const w = k.build(); w.position.set(s.x, s.y, s.z); w.rotation.y = s.ang + 0.4; scene.add(w);
    COLLIDERS.box(s.x, s.z, 1.6, 3.1, s.ang + 0.4);
  }
  // Clôtures de ranch par tronçons
  const fk = new Kit(), fw = mat('#7a5232', { roughness: 0.9 });
  for (let i = 0; i < 14; i++) {
    const s = spot(9, 12); if (!s) continue;
    for (let p = 0; p < 6; p++) {
      const dx = Math.sin(s.ang) * p * 3, dz = Math.cos(s.ang) * p * 3;
      const y = terrain.heightAt(s.x + dx, s.z + dz);
      fk.add(G.box(0.18, 1.4, 0.18), fw, { p: [s.x + dx, y + 0.7, s.z + dz], r: [0, s.ang, (rnd() - 0.5) * 0.15] });
      if (p < 5) for (const h of [0.55, 1.1]) fk.add(G.box(0.08, 0.12, 3.1), fw, { p: [s.x + dx + Math.sin(s.ang) * 1.5, y + h, s.z + dz + Math.cos(s.ang) * 1.5], r: [0, s.ang, 0] });
    }
  }
  scene.add(fk.build({ shadow: false }));
  // Rochers sculptés (remplace les blocs)
  const rocks = [rockGeometry(1), rockGeometry(2), rockGeometry(3)];
  const rmat = mat('#a0583a', { roughness: 0.95, flatShading: true });
  rocks.forEach((geo, gi) => {
    const n = 140, inst = new THREE.InstancedMesh(geo, rmat, n); const m4 = new THREE.Matrix4(); let c = 0;
    for (let t = 0; t < n * 8 && c < n; t++) { const r = 150 + rnd() * 1200, a = rnd() * PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r; if (sectorIndex(x, z) !== 4 || net.nearest(x, z, 9)) continue; const sc = 0.6 + rnd() * rnd() * 4; m4.compose(new THREE.Vector3(x, terrain.heightAt(x, z) + sc * 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(sc, sc * (0.6 + rnd() * 0.6), sc)); inst.setMatrixAt(c++, m4); }
    inst.count = c; inst.receiveShadow = true; inst.castShadow = gi === 0; scene.add(inst);
  });
  // Virevoltants (boules d'herbes sèches qui roulent)
  const tg = new THREE.IcosahedronGeometry(0.7, 1); const tp = tg.attributes.position; for (let i = 0; i < tp.count; i++) tp.setXYZ(i, tp.getX(i) * (0.8 + Math.random() * 0.4), tp.getY(i) * (0.8 + Math.random() * 0.4), tp.getZ(i) * (0.8 + Math.random() * 0.4));
  const tmat = new THREE.MeshStandardMaterial({ color: '#a08050', wireframe: true });
  for (let i = 0; i < 14; i++) { const s = spot(6, 40); if (!s) continue; const m = new THREE.Mesh(tg, tmat); m.position.set(s.x, s.y + 0.7, s.z); scene.add(m); anim.tumbles.push({ m, v: new THREE.Vector3(1.5 + rnd() * 3, 0, (rnd() - 0.5) * 2), home: new THREE.Vector3(s.x, 0, s.z), ph: rnd() * 10 }); }
  return {
    update(dt, t) {
      anim.windmills.forEach((r, i) => r.rotation.z += dt * (1.2 + Math.sin(t * 0.3 + i) * 0.6));
      for (const tw of anim.tumbles) {
        tw.m.position.addScaledVector(tw.v, dt);
        if (tw.m.position.distanceTo(tw.home) > 120) tw.m.position.set(tw.home.x, 0, tw.home.z);
        const gy = terrain.heightAt(tw.m.position.x, tw.m.position.z);
        tw.m.position.y = gy + 0.7 + Math.abs(Math.sin(t * 3 + tw.ph)) * 0.8;
        tw.m.rotation.z -= dt * tw.v.x * 1.5; tw.m.rotation.x += dt * tw.v.z * 1.5;
      }
    },
  };
}

// ------------------------------------------------------------------ Gelure : navire pris dans la glace, avant-poste, arches
export function buildGelureDecor(scene, terrain, net) {
  const rnd = mulberry(4321);
  const edges = net.edges.filter(e => e.biome === 5);
  const spot = (minOff, maxOff, frac = null) => { for (let t = 0; t < 60; t++) { const e = edges[Math.floor(rnd() * edges.length)]; const k = frac != null ? Math.floor(e.pts.length * frac) : 10 + Math.floor(rnd() * (e.pts.length - 20)); const p = e.pts[k], a = e.pts[Math.max(0, k - 2)], b = e.pts[Math.min(e.pts.length - 1, k + 2)]; const nx = -(b.z - a.z), nz = b.x - a.x, L = Math.hypot(nx, nz) || 1; const off = (rnd() < 0.5 ? -1 : 1) * (minOff + rnd() * (maxOff - minOff)); const x = p.x + nx / L * off, z = p.z + nz / L * off; if (sectorIndex(x, z) === 5 && Math.hypot(x, z) > 160 && !net.nearest(x, z, minOff - 2)) return { x, z, y: terrain.heightAt(x, z), ang: Math.atan2(b.x - a.x, b.z - a.z) }; } return null; };
  const snow = mat('#f4fbff', { roughness: 0.7 }), ice = mat('#9fd8f5', { roughness: 0.1, metalness: 0.2, emissive: '#2a6f9a', emissiveIntensity: 0.25 });
  // Trois-mâts pris dans la banquise
  for (let i = 0; i < 2; i++) {
    const s = spot(22, 45); if (!s) continue;
    const k = new Kit(), hull = mat('#5a2e18', { roughness: 0.85 }), hullD = mat('#3a1e10'), sail = mat('#e8e2d0', { roughness: 0.9, side: THREE.DoubleSide });
    const sh = new THREE.Shape(); sh.moveTo(-11, 3); sh.quadraticCurveTo(-10, -1, -6, -2.5); sh.lineTo(7, -2.5); sh.quadraticCurveTo(11, -1, 13, 4); sh.lineTo(-11, 3);
    k.add(new THREE.ExtrudeGeometry(sh, { depth: 5, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 }), hull, { p: [0, 2, -2.5] });
    for (let p = 0; p < 10; p++) k.add(G.box(22, 0.08, 0.1), hullD, { p: [0.5, 1.2 + p * 0.45, 2.8] });
    k.add(G.box(20, 0.3, 4.6), mat('#8a6a42'), { p: [0, 5.1, 0] });
    for (const [x, h] of [[-6, 16], [1, 20], [8, 14]]) {
      k.add(G.cyl(0.25, 0.35, h, 10), hullD, { p: [x, 5 + h / 2, 0] });
      k.add(G.cyl(0.12, 0.12, 6, 8), hullD, { p: [x, 5 + h * 0.75, 0], r: [H, 0, 0] });
      k.add(G.box(0.1, h * 0.35, 5), sail, { p: [x + 0.3, 5 + h * 0.55, 0], r: [0, 0, 0.1] });
      k.add(G.box(0.3, 0.2, 0.3), snow, { p: [x, 5 + h + 0.1, 0] });
    }
    k.add(G.cyl(0.18, 0.18, 9, 8), hullD, { p: [15, 7, 0], r: [0, 0, 1.1] }); // beaupré
    // stalactites + gangue de glace
    for (let p = 0; p < 30; p++) k.add(G.cone(0.15 + rnd() * 0.2, 0.8 + rnd() * 1.6, 5), ice, { p: [-10 + rnd() * 22, 4.6, (rnd() < 0.5 ? -1 : 1) * 2.9], r: [PI, 0, 0] });
    k.add(G.cyl(16, 18, 3, 24), snow, { p: [0, 0.3, 0], s: [1, 1, 0.45] });
    for (let p = 0; p < 14; p++) k.add(rockGeometry(p + 50), ice, { p: [-14 + rnd() * 28, 1 + rnd() * 2, (rnd() - 0.5) * 12], s: [2 + rnd() * 3, 1.5 + rnd() * 2.5, 2 + rnd() * 2] });
    const ship = k.build(); ship.position.set(s.x, s.y - 1, s.z); ship.rotation.set(0.12, s.ang + 0.6, -0.18); scene.add(ship);
    COLLIDERS.box(s.x, s.z, 13, 4, s.ang + 0.6 + PI / 2);
  }
  // Avant-poste de cabanes enneigées + feu de camp
  const s = spot(14, 18, 0.25);
  if (s) {
    const out = new THREE.Group(), k = new Kit(), wood = mat('#5a3a22', { roughness: 0.9 });
    for (let c = 0; c < 3; c++) {
      const x = c * 9 - 9;
      for (let l = 0; l < 7; l++) { k.add(G.cyl(0.25, 0.25, 6, 8), wood, { p: [x, 0.25 + l * 0.5, -2.2], r: [0, 0, H] }); k.add(G.cyl(0.25, 0.25, 6, 8), wood, { p: [x, 0.25 + l * 0.5, 2.2], r: [0, 0, H] }); k.add(G.cyl(0.25, 0.25, 4.8, 8), wood, { p: [x - 2.8, 0.5 + l * 0.5, 0], r: [H, 0, 0] }); k.add(G.cyl(0.25, 0.25, 4.8, 8), wood, { p: [x + 2.8, 0.5 + l * 0.5, 0], r: [H, 0, 0] }); }
      for (const sgn of [-1, 1]) { k.add(G.box(6.8, 0.25, 3.4), wood, { p: [x, 4.4, sgn * 1.3], r: [sgn * 0.6, 0, 0] }); k.add(G.box(6.9, 0.35, 3.4), snow, { p: [x, 4.65, sgn * 1.38], r: [sgn * 0.6, 0, 0] }); }
      k.add(G.box(1.2, 2, 0.1), MAT.woodDark(), { p: [x, 1, 2.48] }); k.add(G.box(0.8, 0.7, 0.08), glow('#ffb35a', 1.5), { p: [x + 1.8, 1.8, 2.5] });
      k.add(G.cyl(0.3, 0.3, 1.6, 8), MAT.iron(), { p: [x + 1.8, 5.4, -0.8] });
    }
    k.add(G.tor(0.9, 0.25, 6, 10), mat('#5a5a5a', { flatShading: true }), { p: [0, 0.2, 6], r: [H, 0, 0] });
    for (let l = 0; l < 5; l++) k.add(G.cyl(0.12, 0.12, 1.6, 6), wood, { p: [0, 0.4, 6], r: [0.4, l * 1.25, H] });
    k.add(G.cone(0.6, 1.4, 7), glow('#ff7a2a', 3), { p: [0, 0.9, 6] });
    out.add(k.build()); out.position.set(s.x, s.y, s.z); out.rotation.y = s.ang; scene.add(out);
    out.updateMatrixWorld(true); for (const cx of [-9, 0, 9]) { const v = out.localToWorld(new THREE.Vector3(cx, 0, 0)); COLLIDERS.box(v.x, v.z, 3.0, 2.5, s.ang); }
  }
  // Arches de glace au-dessus de la voie
  const archK = new Kit();
  for (let i = 0; i < 6; i++) {
    const e = edges[i % edges.length]; const k = Math.floor(e.pts.length * (0.15 + 0.7 * rnd())); const p = e.pts[k], b = e.pts[Math.min(e.pts.length - 1, k + 3)];
    if (sectorIndex(p.x, p.z) !== 5 || Math.hypot(p.x, p.z) < 180) continue;
    const ang = Math.atan2(b.x - p.x, b.z - p.z);
    archK.add(G.tor(7, 1.1 + rnd() * 0.6, 7, 18, PI), ice, { p: [p.x, p.y - 0.5, p.z], r: [0, ang, 0] });
    for (let d = 0; d < 6; d++) archK.add(G.cone(0.25, 1.4, 5), ice, { p: [p.x + Math.cos(-ang) * (-5 + d * 2), p.y + 5.4 + Math.sin(d) * 0.8, p.z + Math.sin(-ang) * (-5 + d * 2)], r: [PI, 0, 0] });
  }
  scene.add(archK.build({ shadow: false }));
  return { update() {} };
}

// ------------------------------------------------------------------ Aperçus des 6 mondes fermés (derrière les barrières)
export function buildClosedWorlds(scene, terrain, net) {
  const rnd = mulberry(99);
  const place = (sector, n, rMin, rMax, cb) => { let c = 0; for (let t = 0; t < n * 20 && c < n; t++) { const r = rMin + rnd() * (rMax - rMin), a = sector * PI / 4 + (rnd() - 0.5) * PI / 4 * 0.9; const x = Math.cos(a) * r, z = -Math.sin(a) * r; if (sectorIndex(x, z) !== sector || net.nearest(x, z, 12)) continue; cb(x, terrain.heightAt(x, z), z, c++); } };
  const instanced = (geo, material, list, shadow = false) => { const inst = new THREE.InstancedMesh(geo, material, list.length); list.forEach((m, i) => inst.setMatrixAt(i, m)); inst.castShadow = shadow; inst.receiveShadow = true; scene.add(inst); return inst; };
  const M4 = (x, y, z, ry = 0, s = [1, 1, 1], rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...s));

  // Néon-Bas : gratte-ciels à fenêtres lumineuses + antennes
  { const tw = [], win = [], win2 = [];
    place(1, 90, 260, 1300, (x, y, z) => { const h = 20 + rnd() * 70, w = 6 + rnd() * 8; const ry = rnd() * PI; tw.push(M4(x, y + h / 2, z, ry, [w, h, w])); win.push(M4(x, y + h / 2, z, ry, [w * 1.01, h * 0.98, w * 1.01])); if (rnd() < 0.4) win2.push(M4(x, y + h + 4, z, ry, [0.4, 8, 0.4])); });
    instanced(new THREE.BoxGeometry(1, 1, 1), mat('#120a1e', { roughness: 0.4, metalness: 0.6 }), tw);
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 256);
    for (let y = 4; y < 256; y += 10) for (let x = 4; x < 64; x += 10) if (Math.random() < 0.55) { g.fillStyle = Math.random() < 0.5 ? '#ff3fd0' : '#3fe0ff'; g.fillRect(x, y, 5, 5); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
    instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 1.6, transparent: true, opacity: 0.95, alphaMap: t, depthWrite: false }), win);
    instanced(new THREE.CylinderGeometry(1, 1, 1, 6), mat('#000', { emissive: '#ff2a6a', emissiveIntensity: 3 }), win2);
  }
  // Archipel suspendu : îles flottantes (roche + herbe + arbre)
  { const k = new Kit(); k.add(G.cone(1, 1.6, 9), mat('#7a6a5a', { flatShading: true }), { p: [0, -0.8, 0], r: [PI, 0, 0] }); k.add(G.cyl(1.02, 1.0, 0.18, 9), mat('#6fb04a', { flatShading: true }), { p: [0, 0.05, 0] });
    k.add(G.cyl(0.04, 0.05, 0.5, 5), mat('#5a3a20'), { p: [0.3, 0.35, 0.1] }); k.add(G.sph(0.22, 7, 5), mat('#4f9a3a', { flatShading: true }), { p: [0.3, 0.65, 0.1] });
    const list = []; place(2, 70, 250, 1300, (x, y, z) => { const s = 5 + rnd() * 14; list.push(M4(x, y + 18 + rnd() * 50, z, rnd() * 6, [s, s, s])); });
    const geo = k.geometry(); const inst = new THREE.InstancedMesh(geo, mat('#ffffff', { vertexColors: false }), list.length); scene.remove(inst);
    // une instance par matériau
    for (const [m, geos] of k.parts) instanced(mergeParts(geos), m, list, true);
  }
  // Chronocline : engrenages géants à moitié enterrés
  { const k = new Kit(), brass = MAT.brass(); k.add(G.tor(1, 0.18, 6, 32), brass); k.add(G.cyl(0.25, 0.25, 0.3, 12), brass, { r: [H, 0, 0] }); for (let i = 0; i < 4; i++) k.add(G.box(1.8, 0.12, 0.12), brass, { r: [0, 0, i * PI / 4] }); for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; k.add(G.box(0.25, 0.3, 0.32), brass, { p: [Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0], r: [0, 0, a] }); }
    const list = []; place(3, 60, 250, 1300, (x, y, z) => { const s = 4 + rnd() * 14; list.push(M4(x, y + s * 0.5, z, rnd() * 6, [s, s, s], (rnd() - 0.5) * 0.6)); });
    instanced(k.geometry(), brass, list, true);
    const clocks = []; place(3, 8, 400, 1200, (x, y, z) => clocks.push(M4(x, y + 30, z, rnd() * 6, [6, 60, 6])));
    instanced(new THREE.CylinderGeometry(1, 1.2, 1, 8), mat('#5a4a2a', { roughness: 0.8 }), clocks);
  }
  // Le Colosse : défenses et côtes géantes, rochers moussus
  { const bone = mat('#e9dfc6', { roughness: 0.7 }); const tusk = G.tube([[0, 0, 0], [0.3, 1.2, 0], [1.2, 2.2, 0], [2.6, 2.6, 0]], 0.25, 20, 8);
    const list = []; place(0, 50, 260, 1300, (x, y, z) => { const s = 5 + rnd() * 10; list.push(M4(x, y - 1, z, rnd() * 6, [s, s, s])); });
    instanced(tusk, bone, list, true);
    const moss = []; place(0, 120, 240, 1300, (x, y, z) => { const s = 2 + rnd() * 6; moss.push(M4(x, y, z, rnd() * 6, [s, s * 0.7, s])); });
    instanced(rockGeometry(7), mat('#5f7a3a', { flatShading: true, roughness: 0.95 }), moss);
  }
  // Fonderie-Rêve : coulées de cire fondue lumineuses
  { const drip = G.lathe([[0, 0], [1.2, 0], [1.0, 0.4], [0.7, 1.2], [0.75, 2.2], [0.5, 3.0], [0.55, 3.6], [0.2, 4.2], [0, 4.3]], 16);
    const list = []; place(6, 90, 250, 1300, (x, y, z) => { const s = 2 + rnd() * 7; list.push(M4(x, y - 0.5, z, rnd() * 6, [s, s * (0.6 + rnd()), s], (rnd() - 0.5) * 0.4)); });
    instanced(drip, mat('#ff9a3a', { emissive: '#ff5a00', emissiveIntensity: 0.35, roughness: 0.3 }), list, true);
  }
  // Les Entrailles : champignons géants phosphorescents
  { const k = new Kit(); k.add(G.cyl(0.18, 0.28, 2, 10), mat('#d8c8e8'), { p: [0, 1, 0] }); k.add(G.sph(1, 16, 10, 0, PI * 2, 0, H), mat('#7a3fa0'), { p: [0, 1.9, 0], s: [1, 0.55, 1] });
    const list = []; place(7, 120, 240, 1300, (x, y, z) => { const s = 1.5 + rnd() * 6; list.push(M4(x, y, z, rnd() * 6, [s, s, s], (rnd() - 0.5) * 0.3)); });
    const parts = [...k.parts]; instanced(mergeParts(parts[0][1]), parts[0][0], list); instanced(mergeParts(parts[1][1]), mat('#7a3fa0', { emissive: '#b060ff', emissiveIntensity: 0.9 }), list);
  }
}
function mergeParts(geos) { const k = new Kit(); k.parts.set('x', geos); return k.geometry(); }
