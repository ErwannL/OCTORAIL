// Monde « chrono » : Chronocline (Nord-Ouest) — jungle d'horloges où le temps file, traîne ou rembobine.
// Repère : le Grand Régulateur (tour à trois cadrans en désaccord, aiguilles-ponts, sablier sommital qui se retourne).
// Habitants : le Coucou (maisons-coucous), Dame Minute (marchande de secondes), les Toi-d'avant (échos translucides).
// Règle : zones lentes (dômes dorés, poussière figée) et zones de rembobinage (feuilles qui remontent).
// Perf : tout le statique est fusionné par matériau (Kit) ou instancié ; l'animation touche peu d'objets.
import * as THREE from 'three';
import { Kit, G, MAT, mat, glow } from '../kit.js';
import { mulberry } from '../../util/noise.js';
import { WORLD_LORE } from '../../data/lore.js';

const PI = Math.PI, H = PI / 2;
const AX = Math.atan2(-1, -1);              // axe du secteur (x = cos, z = sin) : Nord-Ouest
const SPAN = 20 * PI / 180;                 // demi-ouverture utile (±20°, marge sur ±22,5°)
const LORE = WORLD_LORE.find(w => w.id === 'chrono');

// ---------- utilitaires ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function M4(x, y, z, ry = 0, s = 1, rx = 0, rz = 0) {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  const sc = Array.isArray(s) ? s : [s, s, s];
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, _s.set(sc[0], sc[1], sc[2]));
}
// Un Kit -> un InstancedMesh par matériau (mêmes matrices)
function instKit(scene, kit, list, { shadow = true } = {}) {
  const out = [];
  if (!list.length) return out;
  for (const [material, geos] of kit.parts) {
    const k = new Kit(); k.parts.set(material, geos);
    const im = new THREE.InstancedMesh(k.geometry(), material, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = shadow && !material.transparent; im.receiveShadow = true;
    im.computeBoundingSphere(); scene.add(im); out.push(im);
  }
  return out;
}
function gearGeo(teeth = 16, depth = 0.16, hole = 0.22, spokes = 5) {
  const s = new THREE.Shape(), n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = i / n * PI * 2, r = (i % 4 === 1 || i % 4 === 2) ? 1 : 0.86;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const h = new THREE.Path(); h.absarc(0, 0, hole, 0, PI * 2, true); s.holes.push(h);
  for (let k = 0; k < spokes; k++) {
    const a0 = k / spokes * PI * 2 + 0.25, a1 = a0 + PI * 2 / spokes - 0.5, p = new THREE.Path();
    p.absarc(0, 0, 0.7, a0, a1, false); p.absarc(0, 0, 0.34, a1, a0, true); s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2); return g;
}
function dialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const gr = x.createRadialGradient(256, 256, 40, 256, 256, 256); gr.addColorStop(0, '#fbf1d6'); gr.addColorStop(1, '#d9c08a');
  x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#3a2a12'; x.lineWidth = 10; x.beginPath(); x.arc(256, 256, 244, 0, PI * 2); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.arc(256, 256, 200, 0, PI * 2); x.stroke();
  for (let i = 0; i < 60; i++) { const a = i / 60 * PI * 2, r0 = i % 5 ? 228 : 212; x.lineWidth = i % 5 ? 3 : 8; x.beginPath(); x.moveTo(256 + Math.sin(a) * r0, 256 - Math.cos(a) * r0); x.lineTo(256 + Math.sin(a) * 240, 256 - Math.cos(a) * 240); x.stroke(); }
  const R = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  x.fillStyle = '#2a1c0a'; x.font = 'bold 44px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  R.forEach((t, i) => { const a = i / 12 * PI * 2; x.fillText(t, 256 + Math.sin(a) * 170, 256 - Math.cos(a) * 170); });
  x.font = 'italic 22px Georgia, serif'; x.fillStyle = '#6b4a1a'; x.fillText('Chronocline', 256, 330);
  x.strokeStyle = '#b08d3a'; x.lineWidth = 2; for (let r = 60; r < 130; r += 14) { x.beginPath(); x.arc(256, 256, r, 0, PI * 2); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildWorld(scene, terrain, net, ctx) {
  const rnd = mulberry(30303);
  const H0 = (x, z) => terrain.heightAt(x, z);
  const minH = (x, z, r) => { let m = H0(x, z); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; m = Math.min(m, H0(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return m; };
  const free = (x, z, d) => net.nearest(x, z, d) === null;
  const inSector = (x, z) => { const r = Math.hypot(x, z); let d = Math.atan2(z, x) - AX; d = Math.atan2(Math.sin(d), Math.cos(d)); return r > 125 && r < 1380 && Math.abs(d) < SPAN; };
  const placed = [];   // pour vérification (base, sol)
  const rec = (kind, x, z, base, r = 0) => placed.push({ kind, x, z, base, ground: r ? minH(x, z, r) : H0(x, z) });
  const blockers = []; // disques déjà occupés {x,z,r}
  const clearOf = (x, z, r) => blockers.every(b => Math.hypot(x - b.x, z - b.z) > b.r + r);
  function pick(n, rMin, rMax, radius, trackGap, fn, tries = 40) {
    let k = 0;
    for (let t = 0; t < n * tries && k < n; t++) {
      const r = Math.sqrt(rMin * rMin + rnd() * (rMax * rMax - rMin * rMin)), a = AX + (rnd() * 2 - 1) * SPAN;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!inSector(x, z) || !free(x, z, trackGap + radius) || !clearOf(x, z, radius)) continue;
      if (fn(x, z, k) !== false) k++;
    }
  }

  // ---------- matériaux ----------
  const stone = mat('#8a7550', { roughness: 0.9, flatShading: true }), stoneD = mat('#5e4c30', { roughness: 0.95, flatShading: true });
  const brass = MAT.brass(), copper = MAT.copper(), iron = MAT.iron();
  const verd = mat('#4f8f7a', { metalness: 0.55, roughness: 0.45 });
  const brassD = mat('#8a6a2c', { metalness: 0.8, roughness: 0.42 });
  const cream = mat('#efe2bf', { roughness: 0.5, emissive: '#ffd890', emissiveIntensity: 0.18 });
  const glassM = new THREE.MeshStandardMaterial({ color: '#d8f0ff', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const sandM = mat('#e2b862', { roughness: 0.95, emissive: '#6b4a10', emissiveIntensity: 0.15 });

  // =====================================================================================
  // 1. LE GRAND RÉGULATEUR
  // =====================================================================================
  const FOOT = 42; // rayon d'emprise au sol
  let L = null;
  { let best = -1e9;
    for (let r = 380; r <= 1150; r += 20) for (let a = -18; a <= 18; a += 1.5) {
      const ang = AX + a * PI / 180, x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (!inSector(x, z) || !free(x, z, FOOT + 27)) continue;
      const q = net.nearest(x, z, 140), d = q ? q.d : 140;
      const sc = -Math.abs(d - (FOOT + 34)) - Math.abs(r - 620) * 0.06;
      if (sc > best) { best = sc; L = { x, z, q }; }
    } }
  const reg = { dials: [], pend: null, gears: null, glass: null, t: 0 };
  if (L) {
    const { x: lx, z: lz } = L, y0 = minH(lx, lz, FOOT) ;
    blockers.push({ x: lx, z: lz, r: FOOT + 8 });
    // face 0 tournée vers la voie la plus proche
    let tx = -lx, tz = -lz; if (L.q) { const p = net.edges[L.q.edge].pts[L.q.k]; tx = p.x - lx; tz = p.z - lz; }
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const yaw = Math.atan2(-tx, -tz);
    const grp = new THREE.Group(); grp.position.set(lx, y0, lz); grp.rotation.y = yaw; scene.add(grp);
    const k = new Kit();
    // socle hexagonal à gradins (fondations enterrées)
    k.add(G.cyl(FOOT, FOOT + 2, 12, 6), stoneD, { p: [0, -5.5, 0], r: [0, PI / 6, 0] });
    k.add(G.cyl(FOOT - 5, FOOT - 3, 4, 6), stone, { p: [0, 2.5, 0], r: [0, PI / 6, 0] });
    k.add(G.cyl(FOOT - 9, FOOT - 7, 4, 6), stoneD, { p: [0, 6.5, 0], r: [0, PI / 6, 0] });
    // escaliers d'accès sur trois côtés
    for (let i = 0; i < 3; i++) { const a = PI + i * 2 * PI / 3; for (let s = 0; s < 6; s++) k.add(G.box(12, 1.4 * (s + 1) + 3, 2.8), stone, { p: [Math.sin(a) * (FOOT + 2 - s * 2.4), (1.4 * (s + 1) - 3) / 2, Math.cos(a) * (FOOT + 2 - s * 2.4)], r: [0, a, 0] }); }
    // fût triangulaire
    const SH = 130; k.add(G.cyl(27, 32, SH - 8, 3), stone, { p: [0, 8 + (SH - 8) / 2, 0] });
    for (let yb = 20; yb < SH; yb += 22) k.add(G.cyl(31.5 - yb * 0.035, 32.5 - yb * 0.035, 1.4, 3), brass, { p: [0, yb, 0] });
    // contreforts d'angle (aux 3 arêtes)
    for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3; k.add(G.box(5, SH - 6, 5), stoneD, { p: [Math.sin(a) * 30.5, 5 + (SH - 6) / 2, Math.cos(a) * 30.5], r: [0, a, 0] }); k.add(G.cone(3.6, 10, 4), verd, { p: [Math.sin(a) * 30.5, SH + 2, Math.cos(a) * 30.5], r: [0, a + PI / 4, 0] }); }
    // encorbellement + chambre des cadrans
    k.add(G.cyl(56, 30, 16, 3), stoneD, { p: [0, SH + 8, 0] });
    k.add(G.cyl(56, 56, 60, 3), stone, { p: [0, SH + 46, 0] });
    k.add(G.cyl(60, 58, 3, 3), brass, { p: [0, SH + 16.5, 0] });
    k.add(G.cyl(61, 61, 4, 3), brass, { p: [0, SH + 78, 0] });
    // toit vert-de-gris + lanterne
    k.add(G.cyl(40, 60, 26, 3), verd, { p: [0, SH + 93, 0] });
    k.add(G.cyl(14, 40, 18, 3), verd, { p: [0, SH + 115, 0] });
    k.add(G.cyl(15, 15, 2, 12), brass, { p: [0, SH + 125, 0] });
    for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3 + PI / 3; k.add(G.cyl(0.8, 0.8, 26, 6), brass, { p: [Math.sin(a) * 14.2, SH + 138, Math.cos(a) * 14.2] }); }
    k.add(G.cyl(15, 15, 2, 12), brass, { p: [0, SH + 151, 0] });
    k.add(G.cone(6, 20, 8), verd, { p: [0, SH + 162, 0] }); k.add(G.sph(2, 10, 8), brass, { p: [0, SH + 173, 0] });
    // cadrans : trois faces (apothème 28)
    const AP = 28, DY = SH + 46, DR = 24;
    for (let f = 0; f < 3; f++) {
      const a = PI + f * 2 * PI / 3, nx = Math.sin(a), nz = Math.cos(a);
      k.add(G.tor(DR + 0.6, 1.1, 8, 48), brass, { p: [nx * (AP + 0.3), DY, nz * (AP + 0.3)], r: [0, a, 0] });
      // petites lucarnes au-dessus
      k.add(G.tor(3.2, 0.45, 6, 20), brass, { p: [nx * (AP + 0.3), DY + 25, nz * (AP + 0.3)], r: [0, a, 0] }); k.add(new THREE.CircleGeometry(3.2, 20), iron, { p: [nx * (AP + 0.15), DY + 25, nz * (AP + 0.15)], r: [0, a, 0] });
      reg.dials.push({ a, nx, nz });
    }
    const body = k.build(); grp.add(body);
    const dialM = new THREE.MeshStandardMaterial({ map: dialTexture(), emissive: '#ffcf80', emissiveIntensity: 0.35, roughness: 0.6 });
    dialM.emissiveMap = dialM.map;
    { const geos = reg.dials.map(d => { const g = new THREE.CircleGeometry(DR, 48); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(d.nx * (AP + 0.25), DY, d.nz * (AP + 0.25)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, d.a, 0)), new THREE.Vector3(1, 1, 1))); return g; });
      const kk = new Kit(); kk.parts.set(dialM, geos); const dm = new THREE.Mesh(kk.geometry(), dialM); dm.receiveShadow = true; grp.add(dm); }
    // aiguilles-ponts (treillis + voie sur le dessus)
    function handGeo(Lh, w) {
      const hk = new Kit(), m0 = iron;
      for (const sx of [-1, 1]) hk.add(G.box(0.5, Lh, 0.9), m0, { p: [sx * w / 2, Lh / 2, 0] });
      const n = Math.floor(Lh / 2.4);
      for (let i = 0; i < n; i++) { const y = (i + 0.5) * Lh / n, ang = Math.atan2(w, Lh / n) * (i % 2 ? 1 : -1); hk.add(G.box(0.3, Math.hypot(w, Lh / n), 0.5), m0, { p: [0, y, 0], r: [0, 0, ang] }); }
      hk.add(G.box(w + 0.6, Lh, 0.25), m0, { p: [0, Lh / 2, 0.55] });
      for (let i = 0; i < Lh; i += 1.1) hk.add(G.box(w * 0.9, 0.35, 0.2), m0, { p: [0, i + 0.4, 0.75] });
      for (const sx of [-0.45, 0.45]) hk.add(G.box(0.16, Lh, 0.22), m0, { p: [sx * w * 0.6, Lh / 2, 0.95] });
      hk.add(G.cone(w * 1.1, 4, 4), m0, { p: [0, Lh + 1.8, 0], r: [0, 0, 0], s: [1, 1, 0.25] });
      hk.add(G.box(w * 0.9, 6, 0.6), m0, { p: [0, -3, 0] }); hk.add(G.cyl(2.6, 2.6, 0.8, 16), m0, { p: [0, -6, 0], r: [H, 0, 0] });
      hk.add(G.cyl(1.6, 1.6, 2.4, 16), m0, { p: [0, 0, 0], r: [H, 0, 0] });
      return hk.geometry();
    }
    const hourG = handGeo(15, 2.0), minG = handGeo(22, 1.5), handM = mat('#141518', { metalness: 0.7, roughness: 0.35 });
    reg.dials.forEach((d, i) => {
      const dg = new THREE.Group(); dg.position.set(d.nx * (AP + 0.4), DY, d.nz * (AP + 0.4)); dg.rotation.y = d.a; grp.add(dg);
      const hh = new THREE.Mesh(hourG, handM); hh.position.z = 1.0; hh.castShadow = true;
      const mm = new THREE.Mesh(minG, handM); mm.position.z = 2.6; mm.castShadow = true;
      const cap = new THREE.Mesh(G.cyl(2.2, 2.2, 6, 16), brass); cap.rotation.x = H; cap.position.z = 2.5;
      dg.add(hh, mm, cap); d.hh = hh; d.mm = mm; d.speed = [1 / 14, 1 / 260, -1 / 30][i]; d.ph = i * 2.1;
    });
    // engrenages muraux tournants (faces 1 et 2), instanciés
    { const gg = gearGeo(22, 1.6, 0.18, 6), im = new THREE.InstancedMesh(gg, brassD, 4); im.castShadow = true; im.receiveShadow = true;
      reg.gearSpots = [];
      [1, 2].forEach(f => { const d = reg.dials[f], sx = Math.cos(d.a), sz = -Math.sin(d.a);
        for (const [off, r, yy, sp] of [[-12, 13, 70, 1], [10.5, 9, 92, -13 / 9]]) {
          const ap = (32 - 5 * (yy - 8) / (SH - 8)) / 2 + 0.9;
          reg.gearSpots.push({ p: new THREE.Vector3(d.nx * ap + sx * off, yy, d.nz * ap + sz * off), a: d.a, r, sp });
        } });
      grp.add(im); reg.gears = im; }
    // balancier géant devant la face 0 (vers la voie)
    { const pk = new Kit(); const RL = 64;
      pk.add(G.box(1.2, RL, 0.8), brass, { p: [0, -RL / 2, 0] }); pk.add(G.box(0.5, RL, 0.5), brassD, { p: [1.4, -RL / 2, 0] }); pk.add(G.box(0.5, RL, 0.5), brassD, { p: [-1.4, -RL / 2, 0] });
      pk.add(G.cyl(8, 8, 2.2, 32), brass, { p: [0, -RL, 0], r: [H, 0, 0] }); pk.add(G.tor(8, 0.7, 8, 32), brassD, { p: [0, -RL, 0] });
      pk.add(G.cyl(1.6, 1.6, 4, 12), brassD, { p: [0, 0, -1], r: [H, 0, 0] });
      const pm = pk.build(); const d = reg.dials[0], ap = (27 + 5 * (1 - (SH + 2 - 8) / (SH - 8))) / 2;
      const piv = new THREE.Group(); piv.position.set(d.nx * (ap + 5.2), SH + 4, d.nz * (ap + 5.2)); piv.rotation.y = d.a; grp.add(piv);
      const sw = new THREE.Group(); sw.add(pm); piv.add(sw); reg.pend = sw;
      // console de suspension (fixée à l'encorbellement)
      const bk = new Kit(); bk.add(G.box(3, 2, 8), brassD, { p: [0, 0, -3] }); const bm = bk.build(); bm.position.copy(piv.position); bm.rotation.y = d.a; grp.add(bm); }
    // sablier sommital qui se retourne
    { const hg = new THREE.Group(); hg.position.set(0, SH + 138, 0); grp.add(hg);
      const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12, y = -11 + t * 22, r = 2 + 8 * Math.pow(Math.abs(y) / 11, 1.4); prof.push([r * 0.95, y]); }
      const gl = new THREE.Mesh(G.lathe(prof, 24), glassM); hg.add(gl);
      const bg = G.cone(8.2, 8, 20); bg.translate(0, 4, 0);
      const bot = new THREE.Mesh(bg, sandM); bot.position.y = -10.5;
      const top = new THREE.Mesh(bg, sandM); top.rotation.x = PI; top.position.y = 10.5;
      const stream = new THREE.Mesh(G.cyl(0.25, 0.25, 20, 6), sandM); hg.add(top, bot, stream);
      reg.glass = { hg, top, bot, stream, flip: 0 };
    }
    // ombres/visibilité
    grp.traverse(o => { if (o.isMesh) { o.castShadow = o.material !== glassM; o.receiveShadow = true; } });
    reg.grp = grp; reg.y0 = y0; reg.center = new THREE.Vector3(lx, y0 + 120, lz);
    rec('regulateur', lx, lz, y0 - 11.5, FOOT); placed[placed.length - 1].base = y0 - 11.5; placed[placed.length - 1].sunk = true;
  }

  // =====================================================================================
  // 2. HABILLAGE DU SOL
  // =====================================================================================
  // 2a. Arbres-horloges (jungle d'horloges)
  { const k = new Kit(), trunk = mat('#4a3320', { roughness: 0.9, flatShading: true }), leaf = mat('#6f8a2e', { roughness: 0.85, flatShading: true }), leaf2 = leaf;
    k.add(G.cyl(0.35, 0.6, 9, 7), trunk, { p: [0, 3.5, 0] }); k.add(G.cone(1.3, 2.2, 7), trunk, { p: [0, 0.1, 0] });
    k.add(G.cyl(0.12, 0.2, 3.5, 5), trunk, { p: [0.9, 6.8, 0], r: [0, 0, -0.8] }); k.add(G.cyl(0.12, 0.2, 3, 5), trunk, { p: [-0.8, 7.4, 0.3], r: [0.3, 0, 0.8] });
    for (const [x, y, z, s] of [[0, 9.5, 0, 3.2], [1.9, 8.4, 0.6, 2.2], [-1.7, 8.8, -0.4, 2.4], [0.3, 8.2, -1.8, 2.0], [-0.4, 11.2, 0.4, 2.0]]) k.add(new THREE.IcosahedronGeometry(s, 0), leaf2, { p: [x, y, z] });
    k.add(G.cyl(0.95, 0.95, 0.25, 20), cream, { p: [0, 3.6, 0.62], r: [H, 0, 0] }); k.add(G.tor(0.95, 0.09, 5, 20), brass, { p: [0, 3.6, 0.72] });
    k.add(G.box(0.08, 0.7, 0.05), iron, { p: [0.18, 3.85, 0.78], r: [0, 0, -0.5] }); k.add(G.box(0.06, 0.5, 0.05), iron, { p: [-0.15, 3.5, 0.78], r: [0, 0, 2.1] });
    const list = [];
    pick(150, 140, 1360, 3, 9, (x, z) => { const s = 0.8 + rnd() * 0.9, y = minH(x, z, 1.2 * s); list.push(M4(x, y - 0.4 * s, z, rnd() * 6, s)); blockers.push({ x, z, r: 2.5 * s }); rec('arbre', x, z, y - 0.4 * s, 1.2 * s); });
    instKit(scene, k, list);
  }
  // 2b. Rochers
  { const k = new Kit(), rock = mat('#7a6640', { roughness: 0.95, flatShading: true }); k.add(new THREE.DodecahedronGeometry(1, 0), rock, {});
    const list = []; pick(160, 130, 1370, 2, 9, (x, z) => { const s = 0.6 + rnd() * rnd() * 3.5, y = minH(x, z, s); list.push(M4(x, y - 0.1 * s, z, rnd() * 6, [s * (1 + rnd() * 0.6), s * (0.5 + rnd() * 0.4), s], rnd() * 0.3, rnd() * 0.3)); rec('rocher', x, z, y - 0.1 * s, s); });
    instKit(scene, k, list); }
  // 2c. Touffes de fougères dorées
  { const k = new Kit(), fern = mat('#9a8f34', { roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; k.add(G.cone(0.18, 1.6, 3), fern, { p: [Math.cos(a) * 0.35, 0.65, Math.sin(a) * 0.35], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] }); }
    const list = []; pick(300, 130, 1370, 1, 9, (x, z) => { const s = 0.7 + rnd() * 0.9, y = H0(x, z); list.push(M4(x, y - 0.12, z, rnd() * 6, s)); rec('fougere', x, z, y - 0.12); });
    instKit(scene, k, list, { shadow: false }); }
  // 2d. Engrenages à demi enterrés (debout, de chant)
  { const k = new Kit(); k.add(gearGeo(14, 0.22, 0.2, 5), brassD, {});
    const list = []; pick(36, 150, 1350, 6, 10, (x, z) => { const r = 2.5 + rnd() * 5, yaw = rnd() * 6, cx = Math.cos(yaw), sz = -Math.sin(yaw);
      let g = H0(x, z); for (const t of [-1, -0.5, 0.5, 1]) g = Math.min(g, H0(x + cx * r * t, z + sz * r * t));
      const y = g + r * 0.45; list.push(M4(x, y, z, yaw, r, 0, rnd() * 6)); blockers.push({ x, z, r }); rec('engrenage', x, z, y - r, 0); placed[placed.length - 1].sunk = true; });
    instKit(scene, k, list); }
  // 2e. Sabliers-montagnes
  { const k = new Kit(), wd = MAT.woodDark();
    k.add(G.cyl(1, 1.05, 0.08, 24), wd, { p: [0, 0.04, 0] }); k.add(G.cyl(1, 1, 0.08, 24), wd, { p: [0, 1.0, 0] });
    for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; k.add(G.cyl(0.05, 0.05, 0.92, 8), brass, { p: [Math.cos(a) * 0.88, 0.52, Math.sin(a) * 0.88] }); }
    const prof = []; for (let i = 0; i <= 10; i++) { const y = 0.08 + i / 10 * 0.84, t = Math.abs(y - 0.5) / 0.42; prof.push([0.08 + 0.72 * Math.pow(t, 1.3), y]); }
    k.add(G.lathe(prof, 20), glassM, {}); k.add(G.cone(0.72, 0.3, 20), sandM, { p: [0, 0.23, 0] }); k.add(G.cone(0.6, 0.3, 20), sandM, { p: [0, 0.7, 0], r: [PI, 0, 0] }); k.add(G.cyl(0.015, 0.015, 0.36, 4), sandM, { p: [0, 0.5, 0] });
    const list = []; reg.sabliers = [];
    pick(6, 450, 1340, 26, 25, (x, z) => { const s = 34 + rnd() * 26, R = s * 1.05, y = minH(x, z, R), tilt = (rnd() - 0.5) * 0.14;
      list.push(M4(x, y - 1.5 - Math.abs(Math.sin(tilt)) * R, z, rnd() * 6, s, 0, tilt)); blockers.push({ x, z, r: R + 4 }); rec('sablier', x, z, y - 1.5 - Math.abs(Math.sin(tilt)) * R, R); placed[placed.length - 1].sunk = true; reg.sabliers.push(new THREE.Vector3(x, y + s * 0.5, z)); }, 400);
    instKit(scene, k, list); }

  // =====================================================================================
  // 3. VIE : Coucous, Dame Minute, Toi-d'avant
  // =====================================================================================
  // points le long des voies du secteur (pour placer près des rails)
  const trackSpots = [];
  for (const e of net.edges) { if (!e || !e.pts) continue; for (let i = 4; i < e.pts.length - 4; i += 6) { const p = e.pts[i]; if (!inSector(p.x, p.z)) continue; const q = e.pts[i + 2], tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1; trackSpots.push({ x: p.x, z: p.z, tx: tx / tl, tz: tz / tl, r: Math.hypot(p.x, p.z) }); } }
  const sideSpot = (sp, dist, side) => ({ x: sp.x - sp.tz * dist * side, z: sp.z + sp.tx * dist * side });
  function spotNear(rTarget, dist, rad, minGap = 10) {
    const cand = trackSpots.slice().sort((a, b) => Math.abs(a.r - rTarget) - Math.abs(b.r - rTarget));
    for (const sp of cand.slice(0, 80)) for (const side of [1, -1]) for (const dd of [dist, dist + 3, dist + 6]) { const p = sideSpot(sp, dd, side);
      if (free(p.x, p.z, minGap + rad) && clearOf(p.x, p.z, rad) && Math.abs(H0(p.x, p.z) - minH(p.x, p.z, rad)) < 0.8) return { ...p, sp }; }
    return null;
  }
  // 3a. Maisons-coucous sur souches
  const cuckoos = [];
  { const k = new Kit(), stump = mat('#4a3320', { roughness: 0.9, flatShading: true }), wd = MAT.wood(), roof = mat('#7a2a1c', { roughness: 0.7 });
    k.add(G.cyl(0.55, 0.85, 3.2, 8), stump, { p: [0, 1.3, 0] }); k.add(G.cone(1.4, 1.2, 8), stump, { p: [0, 0.3, 0] });
    k.add(G.box(1.5, 1.6, 1.1), wd, { p: [0, 3.6, 0] }); k.add(G.box(1.9, 0.12, 1.4), roof, { p: [-0.48, 4.75, 0], r: [0, 0, 0.75] }); k.add(G.box(1.9, 0.12, 1.4), roof, { p: [0.48, 4.75, 0], r: [0, 0, -0.75] });
    k.add(G.cyl(0.45, 0.45, 0.08, 20), cream, { p: [0, 3.45, 0.56], r: [H, 0, 0] }); k.add(G.box(0.5, 0.5, 0.06), MAT.woodDark(), { p: [0, 4.15, 0.56] });
    k.add(G.cyl(0.03, 0.03, 1.2, 4), brass, { p: [-0.3, 2.3, 0.5] }); k.add(G.cyl(0.03, 0.03, 1.0, 4), brass, { p: [0.3, 2.4, 0.5] });
    k.add(G.cone(0.12, 0.35, 6), brass, { p: [-0.3, 1.6, 0.5], r: [PI, 0, 0] }); k.add(G.cone(0.12, 0.35, 6), brass, { p: [0.3, 1.8, 0.5], r: [PI, 0, 0] });
    const list = [];
    for (let i = 0; i < 9; i++) { const p = spotNear(150 + i * 130, 12, 1.5); if (!p) continue; const y = minH(p.x, p.z, 1.0);
      const yaw = Math.atan2(p.sp.x - p.x, p.sp.z - p.z); // porte tournée vers la voie
      list.push(M4(p.x, y - 0.3, p.z, yaw)); blockers.push({ x: p.x, z: p.z, r: 2.5 }); rec('coucou', p.x, p.z, y - 0.3, 1.0);
      cuckoos.push({ x: p.x, y: y - 0.3, z: p.z, yaw, ph: rnd() * 9 }); }
    instKit(scene, k, list);
    const bk = new Kit(), bird = mat('#e0a23a', { roughness: 0.5, metalness: 0.3 });
    bk.add(G.sph(0.22, 10, 8), bird, { s: [1, 1, 1.3] }); bk.add(G.sph(0.15, 8, 6), bird, { p: [0, 0.2, 0.18] }); bk.add(G.cone(0.06, 0.22, 6), mat('#9c1f1f'), { p: [0, 0.2, 0.38], r: [H, 0, 0] });
    bk.add(G.box(0.3, 0.04, 0.3), bird, { p: [0, 0.05, -0.32], r: [0.4, 0, 0] }); bk.add(G.box(0.02, 0.02, 0.6), brass, { p: [0, -0.05, -0.2] });
    reg.birds = instKit(scene, bk, cuckoos.map(c => M4(c.x, c.y + 4.15, c.z, c.yaw)), { shadow: false });
    reg.birds.forEach(b => b.instanceMatrix.setUsage(THREE.DynamicDrawUsage));
  }
  // 3b. Dame Minute et son étal de secondes
  const dame = { g: null, stall: null };
  { const p = spotNear(330, 15, 4.5); if (p) {
    const y = minH(p.x, p.z, 4.5), yaw = Math.atan2(p.sp.x - p.x, p.sp.z - p.z);
    const sk = new Kit(), wd = MAT.wood(), cloth = mat('#7b2d5a', { roughness: 0.8, side: THREE.DoubleSide }), clothB = mat('#e9c46a', { roughness: 0.8, side: THREE.DoubleSide }), crys = glow('#9fe8ff', 1.6);
    sk.add(G.box(4.2, 0.3, 1.8), wd, { p: [0, 1.05, 0.4] }); for (const sx of [-1.9, 1.9]) for (const sz of [-0.4, 1.2]) sk.add(G.box(0.18, sz < 0 ? 3.2 : 1.1, 0.18), wd, { p: [sx, sz < 0 ? 1.6 - 0.25 : 0.4, sz] });
    sk.add(G.box(4.2, 0.9, 0.2), wd, { p: [0, 0.6, 1.25] });
    for (let i = 0; i < 6; i++) sk.add(G.box(0.72, 0.06, 2.4), i % 2 ? cloth : clothB, { p: [-1.8 + i * 0.72, 3.05, 0.4], r: [0.28, 0, 0] });
    for (let i = 0; i < 7; i++) sk.add(new THREE.OctahedronGeometry(0.16, 0), crys, { p: [-1.6 + i * 0.53, 1.38, 0.3 + (i % 2) * 0.35], s: [1, 1.6, 1] });
    for (let i = 0; i < 3; i++) { sk.add(G.cyl(0.18, 0.18, 0.05, 10), brass, { p: [-1.2 + i * 1.2, 1.24, 0.95] }); sk.add(G.cyl(0.02, 0.12, 0.2, 8), glassM, { p: [-1.2 + i * 1.2, 1.36, 0.95] }); sk.add(G.cyl(0.12, 0.02, 0.2, 8), glassM, { p: [-1.2 + i * 1.2, 1.56, 0.95] }); }
    sk.add(G.box(1.6, 0.5, 0.06), clothB, { p: [0, 2.45, 1.32] });
    const st = sk.build(); st.position.set(p.x, y - 0.15, p.z); st.rotation.y = yaw; scene.add(st); rec('etal', p.x, p.z, y - 0.15, 2.4);
    blockers.push({ x: p.x, z: p.z, r: 6 });
    // Dame Minute
    const dk = new Kit(), robe = mat('#6b1f3a', { roughness: 0.7 }), skin = mat('#e8c4a0', { roughness: 0.6 }), hat = mat('#1f1a22', { roughness: 0.6 });
    dk.add(G.lathe([[0, 0], [0.62, 0], [0.55, 0.3], [0.38, 0.9], [0.24, 1.25], [0.2, 1.35], [0, 1.36]], 14), robe, {});
    dk.add(G.cyl(0.19, 0.22, 0.32, 10), robe, { p: [0, 1.5, 0] }); dk.add(G.sph(0.16, 12, 10), skin, { p: [0, 1.82, 0] });
    dk.add(G.cyl(0.26, 0.26, 0.03, 14), hat, { p: [0, 1.96, 0] }); dk.add(G.cyl(0.11, 0.13, 0.22, 10), hat, { p: [0, 2.08, 0] }); dk.add(G.tor(0.12, 0.02, 5, 14), brass, { p: [0, 2.0, 0], r: [H, 0, 0] });
    for (let i = 0; i < 9; i++) { const a = i * 2.4, yy = 0.25 + (i % 3) * 0.3, rr = 0.6 - yy * 0.25; dk.add(G.cyl(0.02, 0.07, 0.09, 6), brass, { p: [Math.cos(a) * rr, yy, Math.sin(a) * rr] }); dk.add(G.cyl(0.07, 0.02, 0.09, 6), brass, { p: [Math.cos(a) * rr, yy + 0.09, Math.sin(a) * rr] }); }
    for (const sx of [-1, 1]) dk.add(G.cap(0.05, 0.45, 4, 6), robe, { p: [sx * 0.27, 1.35, 0.12], r: [-0.9, 0, sx * 0.3] });
    dk.add(G.box(0.22, 0.14, 0.14), mat('#c9a14a', { metalness: 0.6, roughness: 0.4 }), { p: [0.3, 1.1, 0.42] });
    const dm = dk.build(); scene.add(dm); dame.g = dm;
    const fw = (yaw - 0.0), base = new THREE.Vector3(p.x + Math.sin(yaw) * 1.6, 0, p.z + Math.cos(yaw) * 1.6);
    dame.a = base; dame.side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); dame.fwd = new THREE.Vector3(Math.sin(fw), 0, Math.cos(fw)); dame.t = 0; dame.say = -99; dame.p = p;
  } }
  // 3c. Toi-d'avant : échos translucides qui marchent puis rembobinent
  const echoes = [];
  const echoM = new THREE.MeshStandardMaterial({ color: '#8fe3ff', emissive: '#4fc8ff', emissiveIntensity: 0.9, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.3 });
  const echoGeo = (() => { const k = new Kit(); k.add(G.cap(0.28, 0.75, 4, 10), echoM, { p: [0, 0.95, 0] }); k.add(G.sph(0.2, 12, 10), echoM, { p: [0, 1.72, 0] });
    k.add(G.cyl(0.25, 0.25, 0.04, 12), echoM, { p: [0, 1.88, 0] }); k.add(G.cyl(0.17, 0.19, 0.2, 12), echoM, { p: [0, 1.99, 0] });
    for (const sx of [-1, 1]) { k.add(G.cap(0.09, 0.5, 3, 6), echoM, { p: [sx * 0.11, 0.3, 0] }); k.add(G.cap(0.07, 0.45, 3, 6), echoM, { p: [sx * 0.36, 1.05, 0], r: [0, 0, sx * 0.15] }); }
    return k.geometry(); })();
  const echoIM = new THREE.InstancedMesh(echoGeo, echoM, 8); echoIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); echoIM.frustumCulled = false; scene.add(echoIM);
  for (let i = 0; i < 7; i++) { const p = spotNear(200 + i * 160, 11, 1); if (!p) continue; echoes.push({ x: p.x, z: p.z, dx: p.sp.tx, dz: p.sp.tz, ph: rnd() * 20, len: 12 }); blockers.push({ x: p.x, z: p.z, r: 3 }); }
  echoIM.count = echoes.length + 1;
  const trail = []; // positions passées du joueur (écho personnel)
  for (let i = 0; i < 8; i++) echoIM.setMatrixAt(i, M4(0, -999, 0, 0, 0.0001));

  // =====================================================================================
  // 5. RÈGLE : zones lentes (dômes) et zones de rembobinage
  // =====================================================================================
  const zones = [];
  { const dk = new Kit(), ringK = new Kit();
    const domeM = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ringM = new THREE.MeshBasicMaterial({ color: '#ffcc66', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    pick(4, 220, 1300, 20, 16, (x, z, i) => { const R = 15 + rnd() * 6, y = H0(x, z); const slow = i % 2 === 0;
      if (Math.abs(y - minH(x, z, R)) > 3.5) return false;
      dk.add(G.sph(R, 28, 12, 0, PI * 2, 0, PI / 2), domeM, { p: [x, y - 1.2, z], s: [1, 0.7, 1] });
      for (let j = 0; j < 24; j++) { const a = j / 24 * PI * 2, gx = x + Math.cos(a) * R, gz = z + Math.sin(a) * R; ringK.add(G.box(0.25, 0.08, j % 2 ? 1.4 : 2.6), ringM, { p: [gx, H0(gx, gz) + 0.04, gz], r: [0, -a, 0] }); }
      zones.push({ x, y, z, R, slow }); blockers.push({ x, z, r: R }); }, 200);
    const dm = dk.build({ shadow: false }); dm.renderOrder = 2; scene.add(dm);
    const rm = ringK.build({ shadow: false }); scene.add(rm);
    reg.zoneMats = { domeM, ringM };
  }

  // =====================================================================================
  // 4. FRAGMENTS DE LORE : six lutrins-horloges près des voies
  // =====================================================================================
  const frags = [];
  { const k = new Kit();
    k.add(G.cyl(0.42, 0.55, 1.1, 8), stone, { p: [0, 0.35, 0] }); k.add(G.cyl(0.7, 0.75, 0.25, 8), stoneD, { p: [0, -0.05, 0] });
    k.add(G.box(0.9, 0.06, 0.62), brass, { p: [0, 1.02, 0.05], r: [-0.5, 0, 0] }); k.add(G.box(0.8, 0.05, 0.52), cream, { p: [0, 1.04, 0.06], r: [-0.5, 0, 0] });
    k.add(G.cyl(0.04, 0.04, 0.9, 6), brass, { p: [0, 1.4, -0.3] }); k.add(G.cyl(0.24, 0.24, 0.06, 16), cream, { p: [0, 1.9, -0.3], r: [H, 0, 0] }); k.add(G.tor(0.24, 0.035, 5, 16), brass, { p: [0, 1.9, -0.26] });
    const list = [];
    LORE.fragments.forEach((f, i) => { const p = spotNear(180 + i * 190, 12.5, 0.8, 10); if (!p) return; const y = minH(p.x, p.z, 0.75);
      const yaw = Math.atan2(p.sp.x - p.x, p.sp.z - p.z);
      list.push(M4(p.x, y + 0.02, p.z, yaw)); blockers.push({ x: p.x, z: p.z, r: 2 }); rec('fragment', p.x, p.z, y - 0.18, 0.75);
      frags.push({ f, id: 'chrono-' + i, pos: new THREE.Vector3(p.x, y, p.z) }); });
    instKit(scene, k, list);
  }
  const haloM = new THREE.MeshBasicMaterial({ color: '#e9c46a', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const halo = new THREE.Group(); { const ring = new THREE.Mesh(G.tor(1.1, 0.05, 6, 32), haloM); ring.rotation.x = H; ring.position.y = 0.08; const beam = new THREE.Mesh(G.cyl(0.55, 0.9, 3.2, 16, true), haloM); beam.position.y = 1.6; halo.add(ring, beam); }
  halo.visible = false; scene.add(halo);

  if (typeof window !== 'undefined') window.__chrono = { placed, landmark: L, frags, zones, cuckoos, echoes };

  // =====================================================================================
  // ANIMATION
  // =====================================================================================
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  let wasDown = false, nextCoucou = 0, emitAcc = 0;
  // horloge locale : accélère, ralentit, rembobine (cycle de 40 s)
  const warp = t => { const c = (t % 40) / 40; return c < 0.45 ? 1 + Math.sin(c / 0.45 * PI) * 2.5 : c < 0.8 ? 0.25 : -3; };
  let localT = 0;
  return {
    update(dt, time, camPos) {
      if (!camPos) return;
      dt = Math.min(dt, 0.1);
      const camR = Math.hypot(camPos.x, camPos.z);
      let cd = Math.atan2(camPos.z, camPos.x) - AX; cd = Math.atan2(Math.sin(cd), Math.cos(cd));
      const near = camR > 60 && Math.abs(cd) < 0.75;      // caméra vers le secteur (pour l'animation)
      if (!near) { halo.visible = false; return; }
      const w = warp(time); localT += dt * w;

      // --- Grand Régulateur
      if (L && camPos.distanceTo(reg.center) < 1600) {
        reg.dials.forEach((d, i) => { const t = (i === 2 ? time : localT) * d.speed * PI * 2 + d.ph; d.mm.rotation.z = -t; d.hh.rotation.z = -t / 12 - i * 1.3; });
        reg.pend.rotation.z = Math.sin(localT * 1.05) * 0.2;
        if (reg.gears) { reg.gearSpots.forEach((g, i) => { reg.gears.setMatrixAt(i, M4(g.p.x, g.p.y, g.p.z, g.a, g.r, 0, localT * 0.15 * g.sp)); }); reg.gears.instanceMatrix.needsUpdate = true; }
        const gs = reg.glass, cyc = (time % 45) / 45;   // 42 s d'écoulement puis 3 s de retournement
        if (cyc < 42 / 45) { const f = cyc / (42 / 45); gs.top.scale.set(Math.max(0.05, Math.sqrt(1 - f)), Math.max(0.05, 1 - f), Math.max(0.05, Math.sqrt(1 - f))); gs.bot.scale.set(Math.max(0.05, Math.sqrt(f)), Math.max(0.05, f), Math.max(0.05, Math.sqrt(f))); gs.stream.visible = f < 0.98; gs.hg.rotation.z = 0; }
        else { const f = (cyc - 42 / 45) / (3 / 45); gs.hg.rotation.z = f * PI; gs.stream.visible = false; if (f > 0.97) { gs.top.scale.set(1, 1, 1); gs.bot.scale.set(0.05, 0.05, 0.05); } }
      }
      // --- Coucous
      if (reg.birds && reg.birds.length) {
        const im = reg.birds[0];
        cuckoos.forEach((c, i) => { const ct = (time + c.ph) % 9; let o = 0; if (ct < 2.2) o = Math.min(1, ct / 0.25) * Math.min(1, (2.2 - ct) / 0.3);
          const bob = o > 0.9 ? Math.abs(Math.sin(ct * 14)) * 0.12 : 0;
          const m = M4(c.x + Math.sin(c.yaw) * (0.35 + o * 0.6), c.y + 4.15 + bob, c.z + Math.cos(c.yaw) * (0.35 + o * 0.6), c.yaw, o > 0.02 ? 1 : 0.001, -bob * 2);
          reg.birds.forEach(b => b.setMatrixAt(i, m));
          if (o > 0.95 && ct > 0.4 && ct < 0.45) { tmp.set(c.x, c.y + 4.4, c.z); if (tmp.distanceTo(camPos) < 120 && ctx.sparks) for (let s = 0; s < 4; s++) ctx.sparks.emit(tmp, tmp2.set((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2), { life: 0.8, size: 0.25, color: '#ffe08a' }); }
        });
        reg.birds.forEach(b => { b.instanceMatrix.needsUpdate = true; });
      }
      const pl = ctx.player, onFoot = pl && pl.mode === 'foot';
      if (onFoot && time > nextCoucou) { for (const c of cuckoos) { const ct = (time + c.ph) % 9; if (ct < 0.3 && Math.hypot(pl.pos.x - c.x, pl.pos.z - c.z) < 14) { const ln = LORE.npcs[1].lines; ctx.ui?.toast(`🐦 ${ln[Math.floor(Math.random() * ln.length)]}`); nextCoucou = time + 25; break; } } }
      // --- Dame Minute : va-et-vient pressé devant son étal
      if (dame.g) { const t = time * 0.55, s = Math.sin(t), dir = Math.cos(t) >= 0 ? 1 : -1;
        const x = dame.a.x + dame.side.x * s * 3.2 + dame.fwd.x * (1.2 + Math.sin(t * 2.3) * 0.5), z = dame.a.z + dame.side.z * s * 3.2 + dame.fwd.z * (1.2 + Math.sin(t * 2.3) * 0.5);
        dame.g.position.set(x, H0(x, z) + Math.abs(Math.sin(time * 9)) * 0.06, z);
        dame.g.rotation.y = Math.atan2(dame.side.x * dir, dame.side.z * dir) + Math.sin(time * 9) * 0.08;
        if (onFoot && time - dame.say > 30 && Math.hypot(pl.pos.x - x, pl.pos.z - z) < 6) { dame.say = time; ctx.ui?.say?.([{ who: 'Dame Minute', icon: '⌛', color: '#c86b9a', text: LORE.npcs[0].lines[Math.floor(Math.random() * 2)] }]); }
      }
      // --- Toi-d'avant
      { let n = 0;
        for (const e of echoes) { const c = (time + e.ph) % 14; let s; if (c < 10) s = c / 10; else s = 1 - (c - 10) / 4; // marche 10 s, rembobine 4 s
          const x = e.x + e.dx * (s - 0.5) * e.len, z = e.z + e.dz * (s - 0.5) * e.len, back = c >= 10;
          const yaw = Math.atan2(e.dx, e.dz) + (back ? 0 : 0), flick = back && Math.random() < 0.25 ? 0.0001 : 1;
          echoIM.setMatrixAt(n++, M4(x, H0(x, z) + Math.abs(Math.sin(time * (back ? 14 : 6))) * 0.05, z, yaw, flick, 0, Math.sin(time * 6) * 0.05)); }
        // écho personnel : le joueur, 2,5 s en retard
        if (onFoot && inSector(pl.pos.x, pl.pos.z)) { trail.push([time, pl.pos.x, pl.pos.y, pl.pos.z]); while (trail.length && trail[0][0] < time - 2.5) { var old = trail.shift(); } const o = old || trail[0];
          const mv = trail.length > 1 ? Math.hypot(trail[trail.length - 1][1] - o[1], trail[trail.length - 1][3] - o[3]) : 0;
          echoIM.setMatrixAt(n, M4(o[1], o[2], o[3], trail.length > 1 ? Math.atan2(trail[1][1] - o[1], trail[1][3] - o[3]) : 0, mv > 0.8 ? 1 : 0.0001)); }
        else { trail.length = 0; echoIM.setMatrixAt(n, M4(0, -999, 0, 0, 0.0001)); }
        echoIM.instanceMatrix.needsUpdate = true; echoM.opacity = 0.3 + Math.sin(time * 3) * 0.08; }
      // --- Zones lentes / rembobinage (particules)
      reg.zoneMats.ringM.opacity = 0.4 + Math.sin(time * (w > 0 ? 1.5 : -4)) * 0.2;
      emitAcc += dt;
      if (emitAcc > 0.12) { emitAcc = 0;
        for (const zn of zones) { const d = Math.hypot(camPos.x - zn.x, camPos.z - zn.z); if (d > 700) continue;
          const n = d < 200 ? 3 : 1;
          for (let i = 0; i < n; i++) { const a = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * zn.R * 0.85; tmp.set(zn.x + Math.cos(a) * r, 0, zn.z + Math.sin(a) * r);
            if (zn.slow) { tmp.y = H0(tmp.x, tmp.z) + 0.5 + Math.random() * 8; ctx.sparks?.emit(tmp, tmp2.set(0, 0.04, 0), { life: 6, size: 0.35, color: '#ffe6a0', to: '#ffb040' }); }
            else { tmp.y = H0(tmp.x, tmp.z) + 0.2; ctx.smoke?.emit(tmp, tmp2.set((Math.random() - 0.5) * 0.3, 2.2 + Math.random(), (Math.random() - 0.5) * 0.3), { life: 4, size: 0.6, color: '#9ab040', alpha: 0.5, to: '#e9c46a' }); } } }
        // sable qui file du sablier sommital
        if (L && reg.glass.stream.visible && camPos.distanceTo(reg.center) < 700) { reg.glass.hg.getWorldPosition(tmp); tmp.y -= 1; ctx.sparks?.emit(tmp, tmp2.set(0, -3, 0), { life: 1.2, size: 0.6, color: '#ffd27a' }); }
      }
      // --- Fragments
      let best = null, bd = 1e9;
      if (pl) for (const fr of frags) { const d = Math.hypot(pl.pos.x - fr.pos.x, pl.pos.z - fr.pos.z); if (d < bd) { bd = d; best = fr; } }
      if (best && bd < 25) {
        halo.visible = true; halo.position.copy(best.pos); halo.rotation.y = time * 0.8;
        const got = (ctx.S?.fragments || []).includes(best.id);
        haloM.opacity = (bd < 3 ? 0.7 : 0.25) * (got ? 0.5 : 1) * (0.75 + Math.sin(time * 4) * 0.25);
        const down = onFoot && bd < 3 && ctx.input?.ah('interact');
        if (down && !wasDown) {
          ctx.ui.say([{ who: best.f.title, icon: '✦', color: '#e9c46a', text: best.f.text }]);
          if (ctx.S) { (ctx.S.fragments ||= []); if (!ctx.S.fragments.includes(best.id)) ctx.S.fragments.push(best.id); }
        }
        wasDown = !!down;
      } else { halo.visible = false; wasDown = false; }
    },
  };
}
