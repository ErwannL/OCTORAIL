import * as THREE from 'three';
import { Kit, G, mat, MAT } from './kit.js';
import { sectorIndex } from './biomes.js';
import { mulberry } from '../util/noise.js';
import { COLLIDERS } from './colliders.js';

const PI = Math.PI, H = PI / 2;

export function buildLife(scene, terrain, net, envGetter) {
  const rnd = mulberry(2026);
  const anim = [];
  const pick = (sector, rMin = 160, rMax = 1350, clear = 8) => { for (let t = 0; t < 80; t++) { const r = rMin + rnd() * (rMax - rMin), a = rnd() * PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r; if (sectorIndex(x, z) === sector && !net.nearest(x, z, clear) && !COLLIDERS.blocked(x, 1, z, 2)) return { x, z, y: terrain.heightAt(x, z) }; } return null; };
  const nearTrack = (sector, minO, maxO) => { const edges = net.edges.filter(e => e.biome === sector); for (let t = 0; t < 60; t++) { const e = edges[Math.floor(rnd() * edges.length)]; const k = 5 + Math.floor(rnd() * (e.pts.length - 10)); const p = e.pts[k], a = e.pts[k - 2], b = e.pts[k + 2]; const nx = -(b.z - a.z), nz = b.x - a.x, L = Math.hypot(nx, nz) || 1; const o = (rnd() < 0.5 ? -1 : 1) * (minO + rnd() * (maxO - minO)); const x = p.x + nx / L * o, z = p.z + nz / L * o; if (sectorIndex(x, z) === sector && Math.hypot(x, z) > 140 && !net.nearest(x, z, minO - 1)) return { x, z, y: terrain.heightAt(x, z) }; } return null; };
  const inst = (geo, m, mats, shadow = true) => { const I = new THREE.InstancedMesh(geo, m, mats.length); mats.forEach((q, i) => I.setMatrixAt(i, q)); I.castShadow = shadow; I.receiveShadow = true; scene.add(I); return I; };
  const M4 = (x, y, z, ry, s, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  const perMat = (k) => [...k.parts.entries()].map(([m, geos]) => { const kk = new Kit(); kk.parts.set(m, geos); return [kk.geometry(), m]; });

  // ---------- ARBRES
  // Western : arbres morts tordus + arbres de Josué
  { const k = new Kit(), bark = mat('#6b4a32', { roughness: 0.95 });
    k.add(G.tube([[0, 0, 0], [0.2, 2, 0.1], [-0.3, 4, 0.3], [0.1, 5.5, 0]], 0.28, 12, 7), bark);
    k.add(G.tube([[-0.2, 3.2, 0.2], [-1.4, 4.2, 0.6], [-2.2, 5.4, 0.4]], 0.14, 8, 5), bark);
    k.add(G.tube([[0.1, 4.6, 0], [1.2, 5.6, -0.3], [1.6, 6.6, -0.8]], 0.12, 8, 5), bark);
    k.add(G.tube([[0.15, 2.5, 0.1], [1.0, 3.0, 0.8], [1.5, 3.4, 1.4]], 0.1, 8, 5), bark);
    const L = []; for (let i = 0; i < 160; i++) { const s = pick(4); if (!s) continue; const sc = 0.7 + rnd() * 0.9; L.push(M4(s.x, s.y, s.z, rnd() * 6, sc)); COLLIDERS.circle(s.x, s.z, 0.35 * sc, s.y + 5 * sc); }
    perMat(k).forEach(([g, m]) => inst(g, m, L));
    const j = new Kit(), jb = mat('#7a6040', { roughness: 0.95 }), jl = mat('#5f7a3a', { roughness: 0.8, flatShading: true });
    j.add(G.cyl(0.25, 0.35, 3, 7), jb, { p: [0, 1.5, 0] });
    for (const [x, y, z] of [[0.9, 3.6, 0.2], [-0.8, 4.0, -0.3], [0.2, 4.4, 0.9]]) { j.add(G.tube([[0, 2.8, 0], [x * 0.5, y - 0.4, z * 0.5], [x, y, z]], 0.16, 8, 5), jb); for (let n = 0; n < 7; n++) { const a = n / 7 * PI * 2; j.add(G.cone(0.07, 0.8, 4), jl, { p: [x + Math.cos(a) * 0.15, y + 0.2, z + Math.sin(a) * 0.15], r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] }); } }
    const L2 = []; for (let i = 0; i < 140; i++) { const s = pick(4); if (!s) continue; const sc = 0.8 + rnd() * 0.8; L2.push(M4(s.x, s.y, s.z, rnd() * 6, sc)); COLLIDERS.circle(s.x, s.z, 0.35 * sc, s.y + 4 * sc); }
    perMat(j).forEach(([g, m]) => inst(g, m, L2));
  }
  // Gelure : grands pins chargés de neige + bouleaux givrés
  { const k = new Kit(), bark = mat('#4a3626'), nd = mat('#2f4b3a', { flatShading: true }), sn = mat('#f4fbff', { flatShading: true });
    k.add(G.cyl(0.25, 0.35, 3, 7), bark, { p: [0, 1.5, 0] });
    for (let i = 0; i < 5; i++) { const r = 2.4 - i * 0.42, y = 2.2 + i * 1.5; k.add(G.cone(r, 2.2, 8), nd, { p: [0, y, 0], r: [0, i, 0] }); k.add(G.cone(r * 0.85, 0.8, 8), sn, { p: [0, y + 0.55, 0], r: [0, i, 0] }); }
    const L = []; for (let i = 0; i < 220; i++) { const s = pick(5); if (!s) continue; const sc = 0.8 + rnd() * 1.2; L.push(M4(s.x, s.y, s.z, rnd() * 6, sc)); COLLIDERS.circle(s.x, s.z, 0.45 * sc, s.y + 8 * sc); }
    perMat(k).forEach(([g, m]) => inst(g, m, L));
    const b = new Kit(), wb = mat('#e8e4dc'), fr = mat('#cfefff', { roughness: 0.2, metalness: 0.2, flatShading: true });
    b.add(G.cyl(0.12, 0.16, 6, 6), wb, { p: [0, 3, 0] });
    for (let n = 0; n < 6; n++) { const a = n; b.add(G.cyl(0.04, 0.06, 2, 5), wb, { p: [Math.cos(a) * 0.5, 3.5 + n * 0.4, Math.sin(a) * 0.5], r: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8] }); b.add(G.ico ? G.sph(0.5, 6, 4) : G.sph(0.5, 6, 4), fr, { p: [Math.cos(a) * 1.0, 4.2 + n * 0.4, Math.sin(a) * 1.0] }); }
    const L2 = []; for (let i = 0; i < 120; i++) { const s = pick(5); if (!s) continue; const sc = 0.8 + rnd() * 0.6; L2.push(M4(s.x, s.y, s.z, rnd() * 6, sc)); COLLIDERS.circle(s.x, s.z, 0.25 * sc); }
    perMat(b).forEach(([g, m]) => inst(g, m, L2));
  }
  // Moyeu : arbres d'ornement en pot autour de la place
  { const k = new Kit(); k.add(G.cyl(0.9, 0.7, 1, 10), mat('#8a5a3a'), { p: [0, 0.5, 0] }); k.add(G.cyl(0.12, 0.16, 2.5, 6), mat('#5a3a20'), { p: [0, 2, 0] }); k.add(G.sph(1.4, 10, 8), mat('#4f8a3a', { flatShading: true }), { p: [0, 3.8, 0] }); k.add(G.sph(0.9, 8, 6), mat('#5f9a4a', { flatShading: true }), { p: [0.7, 4.4, 0.4] });
    const L = []; for (let i = 0; i < 8; i++) { const a = i * PI / 4 + PI / 8 + 0.18, x = Math.cos(a) * 24, z = -Math.sin(a) * 24; L.push(M4(x, 0.25, z, i, 1)); COLLIDERS.circle(x, z, 1.0); }
    perMat(k).forEach(([g, m]) => inst(g, m, L));
  }

  // ---------- OISEAUX GELÉS EN PLEIN VOL (Gelure)
  { const ice = new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.3, emissive: '#3a8fc0', emissiveIntensity: 0.25, depthWrite: false, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const s = nearTrack(5, 8, 60); if (!s) continue;
      const g = new THREE.Group(), body = mat(['#e8eef4', '#3a3a44', '#9a6a4a'][i % 3], { roughness: 0.7, side: THREE.DoubleSide });
      const bk = new Kit(); bk.add(G.cap(0.18, 0.6, 4, 8), body, { r: [H, 0, 0] }); bk.add(G.sph(0.17, 8, 6), body, { p: [0, 0.06, 0.45] }); bk.add(G.cone(0.05, 0.2, 4), mat('#e0a030'), { p: [0, 0.04, 0.65], r: [H, 0, 0] });
      const wing = new THREE.Shape(); wing.moveTo(0, 0); wing.lineTo(1.3, 0.25 + rnd() * 0.4); wing.lineTo(1.5, -0.1); wing.lineTo(0.8, -0.35); wing.lineTo(0, -0.3);
      for (const sg of [-1, 1]) bk.add(new THREE.ShapeGeometry(wing), body, { r: [-H + sg * (0.3 + rnd() * 0.6), 0, 0], s: [sg, 1, 1] });
      bk.add(G.cone(0.15, 0.5, 4), body, { p: [0, 0, -0.55], r: [-H, 0, 0], s: [1.6, 1, 0.3] });
      g.add(bk.build({ shadow: false }));
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), ice); shell.scale.set(1.4, 0.8, 1.1); g.add(shell);
      for (let d = 0; d < 3; d++) { const ic = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5 + rnd() * 0.5, 4), ice); ic.position.set((rnd() - 0.5) * 1.2, -0.8, (rnd() - 0.5) * 0.8); ic.rotation.x = PI; g.add(ic); }
      g.position.set(s.x, s.y + 4 + rnd() * 9, s.z); g.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.6);
      scene.add(g); const by = g.position.y; const ph = rnd() * 9;
      anim.push((dt, t) => { g.position.y = by + Math.sin(t * 0.4 + ph) * 0.05; shell.rotation.y = Math.sin(t * 0.2 + ph) * 0.03; });
    }
  }

  // ---------- BOTTES DE FOIN QUI FLOTTENT AU VENT (Western — anomalie de Poussière)
  { const hay = mat('#d9b45a', { roughness: 1 }), hay2 = mat('#b8913f', { roughness: 1 }), cord = mat('#7a4a2a');
    const k = new Kit(); k.add(G.rbox(1.6, 0.9, 1.0, 0.2, 3), hay); for (const x of [-0.4, 0.4]) k.add(G.tor(0.52, 0.035, 4, 16), cord, { p: [x, 0, 0], r: [0, H, 0], s: [1, 0.95, 1.05] });
    for (let n = 0; n < 14; n++) k.add(G.box(0.03, 0.03, 0.3), hay2, { p: [(rnd() - 0.5) * 1.6, 0.45, (rnd() - 0.5) * 1], r: [rnd(), rnd() * 3, 0] });
    const geoParts = perMat(k);
    for (let i = 0; i < 24; i++) {
      const s = nearTrack(4, 6, 70); if (!s) continue;
      const g = new THREE.Group(); geoParts.forEach(([gg, m]) => { const me = new THREE.Mesh(gg, m); me.castShadow = true; g.add(me); });
      scene.add(g);
      const o = { g, home: new THREE.Vector3(s.x, s.y, s.z), h: 2 + rnd() * 10, ph: rnd() * 20, drift: 15 + rnd() * 30, sp: 0.05 + rnd() * 0.08 };
      anim.push((dt, t) => { const a = t * o.sp + o.ph; o.g.position.set(o.home.x + Math.sin(a) * o.drift, o.home.y + o.h + Math.sin(t * 0.7 + o.ph) * 1.2, o.home.z + Math.cos(a * 0.7) * o.drift * 0.6); o.g.rotation.set(Math.sin(t * 0.5 + o.ph) * 0.5, a * 2, Math.cos(t * 0.4 + o.ph) * 0.4); });
      // brins qui s'envolent
    }
    // bottes posées au sol aussi
    const L = []; for (let i = 0; i < 60; i++) { const s = nearTrack(4, 7, 40); if (!s) continue; L.push(M4(s.x, s.y + 0.45, s.z, rnd() * 6, 1)); COLLIDERS.circle(s.x, s.z, 0.8, s.y + 0.9); }
    geoParts.forEach(([g, m]) => inst(g, m, L));
  }

  // ---------- FLAQUES D'EAU (reflètent le ciel) + flaques gelées
  { const water = new THREE.MeshStandardMaterial({ color: '#4a7a9a', roughness: 0.02, metalness: 0.9, transparent: true, opacity: 0.85, envMapIntensity: 1.6 });
    const mud = mat('#6b4a2a', { roughness: 1 });
    const puddleGeo = (seed) => { const sh = new THREE.Shape(); const r = mulberry(seed); const n = 14; for (let i = 0; i <= n; i++) { const a = i / n * PI * 2, rr = 1 + r() * 0.5; i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } const g = new THREE.ShapeGeometry(sh); g.rotateX(-H); return g; };
    const geos = [puddleGeo(1), puddleGeo(2), puddleGeo(3)];
    const W = [], Mu = []; for (let i = 0; i < 70; i++) { const s = nearTrack(4, 6, 50) || pick(4); if (!s) continue; const sc = 1 + rnd() * 3; W.push(M4(s.x, s.y + 0.06, s.z, rnd() * 6, sc)); Mu.push(M4(s.x, s.y + 0.04, s.z, rnd() * 6, sc * 1.25)); }
    geos.forEach((g, i) => { inst(g, mud, Mu.filter((_, j) => j % 3 === i), false); inst(g, water, W.filter((_, j) => j % 3 === i), false); });
    // oasis : grande mare + roseaux
    for (let o = 0; o < 3; o++) { const s = pick(4, 300, 1200, 25); if (!s) continue; const pool = new THREE.Mesh(puddleGeo(10 + o), water); pool.scale.setScalar(9); pool.position.set(s.x, s.y + 0.1, s.z); scene.add(pool); const rim = new THREE.Mesh(puddleGeo(10 + o), mat('#5f7a3a')); rim.scale.setScalar(11); rim.position.set(s.x, s.y + 0.07, s.z); scene.add(rim);
      const rk = new Kit(), reed = mat('#6a8a3a'); for (let n = 0; n < 40; n++) { const a = rnd() * PI * 2, r = 9 + rnd() * 2; rk.add(G.cyl(0.04, 0.05, 1.5 + rnd(), 4), reed, { p: [s.x + Math.cos(a) * r, s.y + 0.7, s.z + Math.sin(a) * r], r: [(rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3] }); rk.add(G.cap(0.07, 0.25, 3, 5), mat('#5a3a20'), { p: [s.x + Math.cos(a) * r, s.y + 1.6, s.z + Math.sin(a) * r] }); }
      scene.add(rk.build({ shadow: false })); }
    const ice = new THREE.MeshStandardMaterial({ color: '#bfe8ff', roughness: 0.05, metalness: 0.6, envMapIntensity: 1.4 });
    const I = []; for (let i = 0; i < 60; i++) { const s = nearTrack(5, 6, 60) || pick(5); if (!s) continue; I.push(M4(s.x, s.y + 0.06, s.z, rnd() * 6, 1.5 + rnd() * 4)); }
    geos.forEach((g, i) => inst(g, ice, I.filter((_, j) => j % 3 === i), false));
  }

  // ---------- PETITES BÊTES : lièvres (Western), papillons (Moyeu), lapins des neiges (Gelure)
  { const mk = (color) => { const k = new Kit(), m = mat(color, { roughness: 0.9 }); k.add(G.sph(0.25, 8, 6), m, { s: [1, 0.85, 1.4] }); k.add(G.sph(0.15, 8, 6), m, { p: [0, 0.15, 0.3] }); for (const x of [-0.06, 0.06]) k.add(G.cap(0.035, 0.25, 3, 5), m, { p: [x, 0.38, 0.28], r: [-0.3, 0, x * 2] }); k.add(G.sph(0.08, 6, 5), mat('#f4f0e6'), { p: [0, 0.05, -0.33] }); return perMat(k); };
    const herd = (sector, color, n) => { const parts = mk(color); for (let i = 0; i < n; i++) { const s = nearTrack(sector, 8, 50); if (!s) continue; const g = new THREE.Group(); parts.forEach(([gg, m]) => g.add(new THREE.Mesh(gg, m))); scene.add(g); const o = { g, home: new THREE.Vector3(s.x, s.y, s.z), dir: rnd() * 6, ph: rnd() * 10, t: 0 }; anim.push((dt, t, player) => { o.t -= dt; const d = player ? o.g.position.distanceTo(player) : 99; if (o.t <= 0) { o.dir += (rnd() - 0.5) * 2; o.t = 1 + rnd() * 3; } if (d < 8) o.dir = Math.atan2(o.g.position.x - player.x, o.g.position.z - player.z); const hop = Math.max(0, Math.sin(t * (d < 8 ? 9 : 4) + o.ph)); const sp = (d < 8 ? 7 : 1.2) * hop * dt; o.home.x += Math.sin(o.dir) * sp; o.home.z += Math.cos(o.dir) * sp; o.g.position.set(o.home.x, terrain.heightAt(o.home.x, o.home.z) + 0.25 + hop * 0.4, o.home.z); o.g.rotation.y = o.dir; }); } };
    herd(4, '#9a7a5a', 16); herd(5, '#f4f6f8', 12);
    const bf = []; const wingG = new THREE.CircleGeometry(0.12, 6);
    for (let i = 0; i < 30; i++) { const g = new THREE.Group(); const m = mat(['#ffd24a', '#e05ab0', '#5fc0ff', '#ff8a3a'][i % 4], { side: THREE.DoubleSide, emissive: '#331a00', emissiveIntensity: 0.2 }); const w1 = new THREE.Mesh(wingG, m), w2 = new THREE.Mesh(wingG, m); w1.position.x = 0.1; w2.position.x = -0.1; g.add(w1, w2); const a = rnd() * PI * 2, r = 18 + rnd() * 26; g.position.set(Math.cos(a) * r, 1 + rnd() * 2, Math.sin(a) * r); scene.add(g); bf.push({ g, w1, w2, c: g.position.clone(), ph: rnd() * 10 }); }
    anim.push((dt, t) => { for (const b of bf) { const f = Math.sin(t * 18 + b.ph); b.w1.rotation.y = f; b.w2.rotation.y = -f; b.g.position.set(b.c.x + Math.sin(t * 0.6 + b.ph) * 3, b.c.y + Math.sin(t * 1.3 + b.ph) * 0.6, b.c.z + Math.cos(t * 0.5 + b.ph) * 3); b.g.rotation.y = t * 0.6 + b.ph; } });
  }

  return { update(dt, t, playerPos) { for (const f of anim) f(dt, t, playerPos); } };
}
