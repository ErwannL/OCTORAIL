import * as THREE from 'three';
import { Kit, G, mat, MAT } from './kit.js';
import { sectorIndex } from './biomes.js';
import { mulberry } from '../util/noise.js';
import { COLLIDERS } from './colliders.js';
import { FLORA_MAT, FLORA_MAT_DS, Bits, blob, hareGeometry, butterflyGeometry, frozenBirdGeometry, hayBaleGeometry, strawWispsGeometry, deadTreeGeometry, joshuaGeometry, pineGeometry, birchGeometry, potTreeGeometry } from './flora.js';

const PI = Math.PI, H = PI / 2;

export function buildLife(scene, terrain, net, envGetter) {
  const rnd = mulberry(2026);
  const anim = [];
  const pick = (sector, rMin = 160, rMax = 1350, clear = 8) => { for (let t = 0; t < 80; t++) { const r = rMin + rnd() * (rMax - rMin), a = rnd() * PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r; if (sectorIndex(x, z) === sector && !net.nearest(x, z, clear) && !COLLIDERS.blocked(x, 1, z, 2)) return { x, z, y: terrain.heightAt(x, z) }; } return null; };
  const nearTrack = (sector, minO, maxO) => { const edges = net.edges.filter(e => e.biome === sector); for (let t = 0; t < 60; t++) { const e = edges[Math.floor(rnd() * edges.length)]; const k = 5 + Math.floor(rnd() * (e.pts.length - 10)); const p = e.pts[k], a = e.pts[k - 2], b = e.pts[k + 2]; const nx = -(b.z - a.z), nz = b.x - a.x, L = Math.hypot(nx, nz) || 1; const o = (rnd() < 0.5 ? -1 : 1) * (minO + rnd() * (maxO - minO)); const x = p.x + nx / L * o, z = p.z + nz / L * o; if (sectorIndex(x, z) === sector && Math.hypot(x, z) > 140 && !net.nearest(x, z, minO - 1)) return { x, z, y: terrain.heightAt(x, z) }; } return null; };
  const inst = (geo, m, mats, shadow = true) => { const I = new THREE.InstancedMesh(geo, m, mats.length); mats.forEach((q, i) => I.setMatrixAt(i, q)); I.castShadow = shadow; I.receiveShadow = true; scene.add(I); return I; };
  const M4 = (x, y, z, ry, s, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  const perMat = (k) => [...k.parts.entries()].map(([m, geos]) => { const kk = new Kit(); kk.parts.set(m, geos); return [kk.geometry(), m]; });

  // ---------- ARBRES (modèles poussés : voir flora.js)
  const cleanup = (geo) => geo;
  const placeTrees = (sector, geos, perVariant, scMin, scMax, trunkK, opt = {}) => {
    geos.forEach((geo, vi) => {
      const ud = geo.userData || {}, L = [];
      for (let i = 0; i < perVariant; i++) {
        const s = pick(sector); if (!s) continue; const sc = scMin + rnd() * (scMax - scMin);
        L.push(M4(s.x, s.y, s.z, rnd() * 6, sc));
        COLLIDERS.circle(s.x, s.z, (ud.trunkR || 0.4) * sc * trunkK, s.y + (opt.trunkTop || 6) * sc);
        if (ud.crownR) COLLIDERS.camCircle(s.x, s.z, ud.crownR * sc * 0.85, s.y + ud.crownBottom * sc, s.y + ud.top * sc);
      }
      if (L.length) inst(geo, FLORA_MAT, L, opt.shadow !== false);
    });
  };
  // Western : arbres morts tordus (3 variantes) + arbres de Josué (3 variantes)
  placeTrees(4, [deadTreeGeometry(0), deadTreeGeometry(1), deadTreeGeometry(2)], 50, 0.75, 1.5, 0.8);
  placeTrees(4, [joshuaGeometry(0), joshuaGeometry(1), joshuaGeometry(2)], 42, 0.85, 1.6, 0.9);
  // Gelure : pins/sapins chargés de neige (3 variantes) + bouleaux givrés (3 variantes)
  placeTrees(5, [pineGeometry(0), pineGeometry(1), pineGeometry(2)], 70, 0.8, 1.9, 1.0, { trunkTop: 12 });
  placeTrees(5, [birchGeometry(0), birchGeometry(1), birchGeometry(2)], 42, 0.8, 1.4, 1.0, { trunkTop: 7 });
  // Moyeu : arbres d'ornement en pot autour de la place (érable, cerisier, arbre-nuage doré)
  { const geos = [potTreeGeometry(0), potTreeGeometry(1), potTreeGeometry(2)], Ls = [[], [], []];
    for (let i = 0; i < 8; i++) { const a = i * PI / 4 + PI / 8 + 0.18, x = Math.cos(a) * 24, z = -Math.sin(a) * 24, v = i % 3, sc = 1.0 + (i % 2) * 0.12; Ls[v].push(M4(x, 0.25, z, i * 0.9, sc)); COLLIDERS.circle(x, z, 1.1 * sc, 1.35); COLLIDERS.circle(x, z, 0.35 * sc, 7); const u = geos[v].userData; COLLIDERS.camCircle(x, z, u.crownR * sc * 0.9, 0.25 + u.crownBottom * sc, 0.25 + u.top * sc); }
    geos.forEach((g, v) => Ls[v].length && inst(g, FLORA_MAT, Ls[v]));
  }

  // ---------- OISEAUX GELÉS EN PLEIN VOL (Gelure)
  { const ice = new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.3, emissive: '#3a8fc0', emissiveIntensity: 0.25, depthWrite: false, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const s = nearTrack(5, 8, 60); if (!s) continue;
      const g = new THREE.Group();
      const bm = new THREE.Mesh(frozenBirdGeometry(['#e8eef4', '#3a3a44', '#9a6a4a'][i % 3], 0.1 + rnd() * 0.6, 1.1 + rnd() * 0.5), FLORA_MAT_DS); bm.scale.setScalar(1.3); g.add(bm);
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), ice); shell.scale.set(1.4, 0.8, 1.1); g.add(shell);
      for (let d = 0; d < 3; d++) { const ic = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5 + rnd() * 0.5, 4), ice); ic.position.set((rnd() - 0.5) * 1.2, -0.8, (rnd() - 0.5) * 0.8); ic.rotation.x = PI; g.add(ic); }
      g.position.set(s.x, s.y + 4 + rnd() * 9, s.z); g.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.6);
      scene.add(g); const by = g.position.y; const ph = rnd() * 9;
      anim.push((dt, t) => { g.position.y = by + Math.sin(t * 0.4 + ph) * 0.05; shell.rotation.y = Math.sin(t * 0.2 + ph) * 0.03; });
    }
  }

  // ---------- BOTTES DE FOIN QUI FLOTTENT AU VENT (Western — anomalie de Poussière)
  { const bales = [hayBaleGeometry(0, 1), hayBaleGeometry(0, 2), hayBaleGeometry(1, 3), hayBaleGeometry(1, 4)], wisp = strawWispsGeometry(12, 1);
    for (let i = 0; i < 24; i++) {
      const s = nearTrack(4, 6, 70); if (!s) continue;
      const g = new THREE.Group(), me = new THREE.Mesh(bales[i % 4], FLORA_MAT); me.castShadow = true; g.add(me);
      const wm = new THREE.Mesh(wisp, FLORA_MAT); g.add(wm); scene.add(g);
      const o = { g, wm, home: new THREE.Vector3(s.x, s.y, s.z), h: 2 + rnd() * 10, ph: rnd() * 20, drift: 15 + rnd() * 30, sp: 0.05 + rnd() * 0.08 };
      anim.push((dt, t) => { const a = t * o.sp + o.ph; o.g.position.set(o.home.x + Math.sin(a) * o.drift, o.home.y + o.h + Math.sin(t * 0.7 + o.ph) * 1.2, o.home.z + Math.cos(a * 0.7) * o.drift * 0.6); o.g.rotation.set(Math.sin(t * 0.5 + o.ph) * 0.5, a * 2, Math.cos(t * 0.4 + o.ph) * 0.4); o.wm.rotation.y = t * 0.8 + o.ph; o.wm.rotation.x = Math.sin(t + o.ph) * 0.3; });
    }
    // bottes posées au sol aussi
    const Ls = [[], [], [], []]; for (let i = 0; i < 60; i++) { const s = nearTrack(4, 7, 40); if (!s) continue; const v = i % 4; Ls[v].push(M4(s.x, s.y + (v < 2 ? 0.45 : 0.68), s.z, rnd() * 6, 1)); COLLIDERS.circle(s.x, s.z, v < 2 ? 0.9 : 0.75, s.y + (v < 2 ? 0.9 : 1.3)); }
    Ls.forEach((L, v) => L.length && inst(bales[v], FLORA_MAT, L));
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
      const rb = new Bits(40 + o); for (let n = 0; n < 40; n++) { const a2 = rnd() * PI * 2, r = 9 + rnd() * 2, x = Math.cos(a2) * r, z = Math.sin(a2) * r, hh = 1.4 + rnd() * 1.1, lean = [(rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3]; rb.add(new THREE.ConeGeometry(0.035, hh, 3, 1, true).translate(0, hh / 2, 0), '#6a8a3a', { p: [x, 0, z], r: lean, grad: 0.5 }); if (n % 2) rb.add(new THREE.CapsuleGeometry(0.055, 0.28, 2, 5), '#5a3a20', { p: [x + lean[2] * -hh, hh + 0.1, z + lean[0] * hh * 0.5] }); if (n % 4 === 0) rb.add(blob(0.2, 0, n, 0.3, 1.3, 0.35, 1.3), '#3a7a3a', { p: [x * 0.97, 0.05, z * 0.97] }); }
      const rm = new THREE.Mesh(rb.build(), FLORA_MAT); rm.position.set(s.x, s.y + 0.1, s.z); scene.add(rm); }
    const ice = new THREE.MeshStandardMaterial({ color: '#bfe8ff', roughness: 0.05, metalness: 0.6, envMapIntensity: 1.4 });
    const I = []; for (let i = 0; i < 60; i++) { const s = nearTrack(5, 6, 60) || pick(5); if (!s) continue; I.push(M4(s.x, s.y + 0.06, s.z, rnd() * 6, 1.5 + rnd() * 4)); }
    geos.forEach((g, i) => inst(g, ice, I.filter((_, j) => j % 3 === i), false));
  }

  // ---------- PETITES BÊTES : lièvres (Western), papillons (Moyeu), lapins des neiges (Gelure)
  { const mk = (kind) => [[hareGeometry(kind), FLORA_MAT]];
    const herd = (sector, color, n) => { const parts = mk(color === '#9a7a5a' ? 0 : 1); for (let i = 0; i < n; i++) { const s = nearTrack(sector, 8, 50); if (!s) continue; const g = new THREE.Group(); parts.forEach(([gg, m]) => g.add(new THREE.Mesh(gg, m))); scene.add(g); const o = { g, home: new THREE.Vector3(s.x, s.y, s.z), dir: rnd() * 6, ph: rnd() * 10, t: 0 }; anim.push((dt, t, player) => { o.t -= dt; const d = player ? o.g.position.distanceTo(player) : 99; if (o.t <= 0) { o.dir += (rnd() - 0.5) * 2; o.t = 1 + rnd() * 3; } if (d < 8) o.dir = Math.atan2(o.g.position.x - player.x, o.g.position.z - player.z); const hop = Math.max(0, Math.sin(t * (d < 8 ? 9 : 4) + o.ph)); const sp = (d < 8 ? 7 : 1.2) * hop * dt; o.home.x += Math.sin(o.dir) * sp; o.home.z += Math.cos(o.dir) * sp; o.g.position.set(o.home.x, terrain.heightAt(o.home.x, o.home.z) + 0.25 + hop * 0.4, o.home.z); o.g.rotation.order = 'YXZ'; o.g.rotation.set(-(hop - 0.45) * 0.45, o.dir, 0); }); } };
    herd(4, '#9a7a5a', 16); herd(5, '#f4f6f8', 12);
    const bf = []; const wingG = butterflyGeometry();
    for (let i = 0; i < 30; i++) { const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ vertexColors: true, color: ['#ffd24a', '#e05ab0', '#5fc0ff', '#ff8a3a'][i % 4], side: THREE.DoubleSide, emissive: ['#ffd24a', '#e05ab0', '#5fc0ff', '#ff8a3a'][i % 4], emissiveIntensity: 0.12, roughness: 0.7 }); const w1 = new THREE.Mesh(wingG, m), w2 = new THREE.Mesh(wingG, m); w2.scale.x = -1; g.add(w1, w2); g.scale.setScalar(0.9 + rnd() * 0.7); const a = rnd() * PI * 2, r = 18 + rnd() * 26; g.position.set(Math.cos(a) * r, 1 + rnd() * 2, Math.sin(a) * r); scene.add(g); bf.push({ g, w1, w2, c: g.position.clone(), ph: rnd() * 10 }); }
    anim.push((dt, t) => { for (const b of bf) { const f = Math.sin(t * 18 + b.ph); b.w1.rotation.z = f * 0.9; b.w2.rotation.z = -f * 0.9; b.g.position.set(b.c.x + Math.sin(t * 0.6 + b.ph) * 3, b.c.y + Math.sin(t * 1.3 + b.ph) * 0.6, b.c.z + Math.cos(t * 0.5 + b.ph) * 3); b.g.rotation.y = t * 0.6 + b.ph; } });
  }

  return { update(dt, t, playerPos) { for (const f of anim) f(dt, t, playerPos); } };
}
