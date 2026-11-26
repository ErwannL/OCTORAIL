import * as THREE from 'three';
import { Kit, G, mat, MAT, glow } from './kit.js';
import { mulberry } from '../util/noise.js';
import { COLLIDERS } from './colliders.js';
import { textSprite } from './tracks.js';
import { galleon, gearGeometry } from './decor.js';

// LE TSUNAMI GELÉ — déferlante de glace de ~210 m de haut, sous laquelle la voie s'enfonce.
// Modèle : feuille épaisse définie par deux surfaces (dessus H, dessous L) sur une grille (x le long de la voie, ζ en travers).
//  - coque translucide (glace claire, écume blanche en crête) ; noyau opaque bleu profond décalé vers l'intérieur
//    => les objets figés (baleine-machine, galions, poissons) apparaissent « dans » la glace ;
//  - la lèvre surplombe un grand porche (le « tube »), puis un tunnel creusé suit la voie jusqu'à la face arrière.
const PI = Math.PI, H = PI / 2;
const SX = 0.55, SY = 0.85, GR = -8; // échelles (x, hauteur) et niveau « sous terre » relatif à la voie
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function table(ctrl) { // [x,y] strictement croissants -> fonction lissée (Catmull-Rom échantillonnée)
  const pts = new THREE.SplineCurve(ctrl.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(600);
  const x0 = ctrl[0][0], x1 = ctrl[ctrl.length - 1][0];
  return x => { if (x <= x0 || x >= x1) return GR; let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].x <= x) lo = m; else hi = m; } const a = pts[lo], b = pts[hi], t = (x - a.x) / ((b.x - a.x) || 1); return a.y + (b.y - a.y) * t; };
}
const HTOP = table([[-196, GR], [-170, 2], [-130, 22], [-90, 55], [-45, 105], [0, 165], [35, 212], [70, 240], [105, 246], [135, 232], [160, 208], [178, 190], [196, 158], [208, 124], [214, 100], [215, 97]]);
const LBOT = table([[-196, GR], [56, GR], [58, 0], [62, 6], [68, 28], [76, 60], [88, 95], [104, 122], [124, 142], [146, 158], [168, 164], [188, 152], [202, 128], [212, 104], [215, 97]]);
const hash = (x, z) => Math.sin(x * 0.173 + z * 0.091) * Math.sin(x * 0.067 - z * 0.139 + 1.3) + 0.5 * Math.sin(x * 0.41 + z * 0.37 + 2.1) * Math.sin(z * 0.23 - x * 0.19);

// zone occupée par la vague (repère local) pour écarter poteaux et décors
export const TSUNAMI_ZONE = { set: false, test: () => false };
export function buildTsunami(scene, terrain, net, edge, frac = 0.42) {
  const rnd = mulberry(2024);
  const ki = Math.floor(edge.pts.length * frac), mid = edge.pts[ki], a2 = edge.pts[ki + 10];
  const ang = Math.atan2(a2.x - mid.x, a2.z - mid.z), th = ang + H;
  const cth = Math.cos(th), sth = Math.sin(th), oy = mid.y;
  // voie exprimée dans le repère de la vague : (lx, lz, ly) triés par lx croissant
  const tr = edge.pts.map(p => { const dx = p.x - mid.x, dz = p.z - mid.z; return [dx * cth - dz * sth, dx * sth + dz * cth, p.y - oy]; }).sort((a, b) => a[0] - b[0]);
  const track = lx => { if (lx <= tr[0][0]) return tr[0]; if (lx >= tr[tr.length - 1][0]) return tr[tr.length - 1]; let lo = 0, hi = tr.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tr[m][0] <= lx) lo = m; else hi = m; } const a = tr[lo], b = tr[hi], t = (lx - a[0]) / ((b[0] - a[0]) || 1); return [lx, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  const RT = 9.2; // demi-largeur du tunnel
  const arch = z => { const u = Math.abs(z) / RT; return u >= 1 ? 0 : 9.6 * Math.pow(1 - Math.pow(u, 3.5), 1 / 3.5); };

  // hauteurs (relatives à la voie) en un point de la grille : xd = x de conception, zeta = abscisse transversale (m)
  function surf(xd, zeta) {
    const env = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(zeta) / 350, 3.2)), 0.8);
    const m1 = 1 + 0.10 * Math.sin(zeta / 66 + 1) + 0.07 * Math.sin(zeta / 29);
    const shift = 22 * Math.sin(zeta / 120 + 0.5) + 7 * Math.sin(zeta / 41) + 7 * Math.sin(zeta / 17) * smooth(100, 170, xd);
    const xs = xd - shift, n = hash(xd, zeta) * 3.2;
    let h = HTOP(xs), l = LBOT(xs);
    const solid = h > GR + 0.5;
    if (solid) { h = (h + n) * env * m1; if (l > GR + 1) l = (l + n * 0.8) * env * m1 + (1 - env) * 0; h = Math.max(GR, h); }
    if (l > GR + 8) l += 3.5 * Math.sin(l * 0.3 + zeta * 0.02) + 2 * Math.sin(l * 0.8 + zeta * 0.05);
    h = h * SY; l = l > GR + 0.5 ? l * SY : GR;
    if (l >= h) l = h - 0.01;
    return [h, l];
  }

  // maillage -----------------------------------------------------------------------------
  const xs = []; for (let x = -200; x < -100; x += 8) xs.push(x); for (let x = -100; x < 56; x += 5) xs.push(x); for (let x = 56; x < 182; x += 4) xs.push(x); for (let x = 182; x < 220; x += 4) xs.push(x); for (let x = 220; x <= 252; x += 8) xs.push(x);
  const zl = [0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5, 12.5, 15, 18, 22, 27, 33, 40, 49, 60, 74, 90, 110, 132, 156, 184, 214, 246, 280, 316, 352];
  const zs = []; for (let i = zl.length - 1; i > 0; i--) zs.push(-zl[i]); for (let i = 0; i < zl.length; i++) zs.push(zl[i]);
  const NX = xs.length, NZ = zs.length;
  const grid = []; // grid[i][j] = {x,y(base),z, h, l, hc, lc}
  for (let i = 0; i < NX; i++) { const row = []; const lx = xs[i] * SX, t = track(lx), c = t[1], base = t[2]; for (let j = 0; j < NZ; j++) {
    const zeta = zs[j], [h0, l0] = surf(xs[i], zeta); let h = h0, l = l0;
    const jt = (Math.abs(zeta) > 14 ? 1 : 0.2) * (rnd() - 0.5) * 3.5; if (h > 3) h += jt; if (l > 8) l += (rnd() - 0.5) * 3.5 * (Math.abs(zeta) > 14 ? 1 : 0);
    // creusement du tunnel le long de la voie
    const a = arch(zeta); if (a > 0 && h > a + 1.5) l = Math.max(l, a); else if (l > h) l = h;
    if (h < a + 1.2 && a > 0) { h = Math.max(h, GR); }
    const z = zeta + c * (1 - smooth(30, 130, Math.abs(zeta)));
    // noyau intérieur
    const D = 34; let hc = h - D * smooth(0, 40, h), lc = l + D * smooth(28, 70, l);
    if (hc < lc) { hc = lc = (hc + lc) / 2; }
    row.push({ x: lx, z, base, h: h + base, l: l + base, hc: hc + base, lc: lc + base, hr: h, lr: l });
  } grid.push(row); }

  const col = new THREE.Color(), cA = new THREE.Color(), cB = new THREE.Color();
  function build(topKey, botKey, skipBot, colorFn) {
    const pos = [], cols = [], idx = []; const vi = new Map();
    const V = (i, j, key) => { const k = key + (i * NZ + j); if (vi.has(k)) return vi.get(k); const g = grid[i][j]; const y = g[key]; pos.push(g.x, y, g.z); colorFn(col, g, key, i, j); cols.push(col.r, col.g, col.b); const n = pos.length / 3 - 1; vi.set(k, n); return n; };
    for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NZ - 1; j++) {
      const g00 = grid[i][j], g10 = grid[i + 1][j], g01 = grid[i][j + 1], g11 = grid[i + 1][j + 1];
      // dessus : normale vers le haut (x croissant, z croissant)
      if (Math.max(g00[topKey], g10[topKey], g01[topKey], g11[topKey]) > g00.base + GR + 0.6 || true) {
        const hs = [g00, g10, g01, g11].map(g => g[topKey] - g.base); if (Math.max(...hs) > GR + 0.8) {
          const a = V(i, j, topKey), b = V(i + 1, j, topKey), c = V(i, j + 1, topKey), d = V(i + 1, j + 1, topKey); idx.push(a, c, b, b, c, d); }
      }
      const ls = [g00, g10, g01, g11].map(g => g[botKey] - g.base);
      if (!skipBot(ls, [g00, g10, g01, g11])) { const a = V(i, j, botKey), b = V(i + 1, j, botKey), c = V(i, j + 1, botKey), d = V(i + 1, j + 1, botKey); idx.push(a, b, c, b, d, c); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // couleurs : dégradé en hauteur + stries horizontales (couches de glace) ; écume blanche vers la crête et la lèvre
  const shellCol = (c, g, key) => { const y = g[key] - g.base, t = smooth(0, 190, y), band = 0.94 + 0.06 * Math.sin(y * 0.45 + g.z * 0.01); cA.set('#7fc6ec'); cB.set('#f2fbff'); c.copy(cA).lerp(cB, t * t).multiplyScalar(band); if (key === 'h' && y > 120) c.lerp(cB.set('#ffffff'), 0.4 * smooth(120, 200, y)); };
  const coreCol = (c, g, key) => { const y = g[key] - g.base, t = smooth(-5, 200, y); cA.set('#2a73a8'); cB.set('#8ccff0'); c.copy(cA).lerp(cB, t).multiplyScalar(0.8 + 0.25 * Math.sin(y * 0.6) + 0.25 * hash(g.x * 1.7, g.z * 1.3)); if (key === 'lc' && y < 12) c.set('#4fa4d4').multiplyScalar(0.8 + 0.2 * Math.sin(g.x * 0.5)); };
  const wave = new THREE.Group();
  const shellGeo = build('h', 'l', ls => Math.min(...ls) < 40, shellCol);
  const coreGeo = build('hc', 'lc', ls => Math.max(...ls) < GR + 2, coreCol);
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.46, emissive: '#3a9ad0', emissiveIntensity: 0.28, flatShading: true }));
  const core = new THREE.Mesh(coreGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.15, emissive: '#2a80c0', emissiveIntensity: 0.45, flatShading: true }));
  core.castShadow = true; core.receiveShadow = true; shell.renderOrder = 2; wave.add(core, shell);

  // aide : hauteur (relative à la voie) du dessus/dessous en coordonnées locales (lx, lz)
  const cAt = lx => track(lx)[1];
  const heights = (lx, lz) => { const zeta = lz - cAt(lx) * (1 - smooth(30, 130, Math.abs(lz))); return surf(lx / SX, zeta); };
  const toWorldY = (lx, y) => y + track(lx)[2];

  // écume figée sur la crête, la lèvre et le dos de la vague + gouttelettes + stalactites de la voûte ---
  const foamG = new THREE.IcosahedronGeometry(1, 0), foamM = mat('#ffffff', { roughness: 0.55, flatShading: true, emissive: '#bfe4ff', emissiveIntensity: 0.25 });
  const iceM = mat('#bfeaff', { roughness: 0.15, metalness: 0.1, flatShading: true, emissive: '#4aa8e0', emissiveIntensity: 0.4 });
  const foamL = [], dropL = [], coneL = [], spikeL = [];
  const M4 = (x, y, z, s, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])));
  for (let zz = -320; zz <= 320; zz += 5 + rnd() * 5) {
    const env = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(zz) / 350, 3.2)), 0.8); if (env < 0.12) continue;
    // lèvre : points le long du profil supérieur de x = 70..176
    const n = 3 + Math.floor(rnd() * 4);
    for (let q = 0; q < n; q++) { const xd = 78 + rnd() * 136, [h] = surf(xd, zz); const lx = xd * SX; if (h < 40) continue; const s = (3 + rnd() * 7) * (0.5 + env); foamL.push(M4(lx + (rnd() - 0.3) * 2, toWorldY(lx, h) - 1 + rnd() * 3, zz + (rnd() - 0.5) * 6, [s * 1.3, s * 0.8, s], rnd() * 3, rnd() * 6, rnd() * 3)); }
    // écume sur le dos : taches plus claires
    if (rnd() < 0.7) { const xd = -80 + rnd() * 150, [h] = surf(xd, zz), lx = xd * SX; const s = 4 + rnd() * 8; foamL.push(M4(lx, toWorldY(lx, h) - 0.5, zz, [s * 1.6, s * 0.5, s * 1.2], 0, rnd() * 6, 0)); }
    // pointes de glace sur la crête
    if (rnd() < 0.55) { const xd = 20 + rnd() * 120, [h] = surf(xd, zz), lx = xd * SX, s = 4 + rnd() * 10; spikeL.push(M4(lx, toWorldY(lx, h) + s * 0.7, zz, [s * 0.35, s, s * 0.35], (rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5 - 0.35)); }
    // stalactites sous la lèvre (le tube)
    const ns = 1 + Math.floor(rnd() * 3);
    for (let q = 0; q < ns; q++) { const xd = 100 + rnd() * 112, [h, l] = surf(xd, zz + (rnd() - 0.5) * 5); if (l < 60 || h - l < 14) continue; const lx = xd * SX, len = 6 + rnd() * 26, w = 0.7 + rnd() * 1.6; coneL.push(M4(lx, toWorldY(lx, l) - len / 2 + 1, zz, [w, len / 2, w], (rnd() - 0.5) * 0.1, rnd() * 6, (rnd() - 0.5) * 0.1)); }
    // épines de glace sur la paroi du fond du porche
    for (let q = 0; q < 2; q++) if (rnd() < 0.7) { const xd = 60 + rnd() * 34, [, l] = surf(xd, zz); if (l > 6) { const lx = xd * SX, len = 5 + rnd() * 14; coneL.push(M4(lx + len * 0.35, toWorldY(lx, l) - len * 0.2, zz, [0.9 + rnd(), len / 2, 0.9 + rnd()], 0, rnd() * 6, -1.1 + rnd() * 0.4)); } }
    // gouttelettes figées en éclaboussure devant la lèvre
    if (rnd() < 0.45) { const lx = (210 + rnd() * 50) * SX, y0 = (60 + rnd() * 100) * SY * env, s = 1.2 + rnd() * 3.5; dropL.push(M4(lx, toWorldY(lx, 0) + y0, zz + (rnd() - 0.5) * 8, [s, s * (1 + rnd() * 1.4), s], rnd(), rnd() * 6, rnd())); }
  }
  const inst = (geo, m, list, shadow = false) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach((mm, i) => im.setMatrixAt(i, mm)); im.castShadow = shadow; im.receiveShadow = true; wave.add(im); };
  inst(foamG, foamM, foamL, true); inst(new THREE.IcosahedronGeometry(1, 1), iceM, dropL); inst(new THREE.ConeGeometry(1, 2, 5), iceM, coneL); inst(new THREE.ConeGeometry(1, 2, 4), foamM, spikeL, true);
  for (const im of wave.children) if (im.isInstancedMesh) im.userData.noCull = false;

  // objets figés dans la glace -----------------------------------------------------------------
  const frozen = new THREE.Group();
  // baleine-machine : coque en plaques, hublots, évents à engrenage, queue à ailerons, œil lumineux
  { const k = new Kit(), plate = mat('#3f5163', { metalness: 0.6, roughness: 0.45, flatShading: true }), plate2 = mat('#2c3a49', { metalness: 0.6, roughness: 0.5, flatShading: true, side: THREE.DoubleSide }), br = MAT.brass(), eye = glow('#7ff0ff', 3), port = glow('#ffcf70', 2);
    // le corps est modélisé le long de +z (longueur ~66 m), centré
    const body = new THREE.SphereGeometry(1, 20, 14); body.scale(7.2, 6.8, 20); k.add(body, plate, { p: [0, 0, 6] });
    const head = new THREE.SphereGeometry(1, 16, 12); head.scale(6.2, 5.4, 14); k.add(head, plate, { p: [0, -0.4, 20] });
    const tail = taper(); k.add(tail, plate, { p: [0, 0.2, -14] });
    for (let i = 0; i < 8; i++) { const z = -8 + i * 4.6, r = 7.2 * Math.sqrt(Math.max(0.05, 1 - ((z - 6) / 20) ** 2)); k.add(G.tor(r * 0.96, 0.22, 4, 22), br, { p: [0, 0, z], r: [0, 0, 0], s: [1, 6.8 / 7.2, 1] }); }
    for (const sx of [-1, 1]) {
      k.add(G.box(0.4, 9, 4.5), plate2, { p: [sx * 8.6, -3.2, 10], r: [0, 0.2 * sx, sx * 0.9] });                       // nageoire pectorale
      k.add(G.sph(0.9, 8, 6), eye, { p: [sx * 5.3, 1.6, 27.5] }); k.add(G.tor(1.3, 0.18, 4, 12), br, { p: [sx * 5.35, 1.6, 27.3], r: [0, H * 0.85 * sx, 0] });
      for (let i = 0; i < 6; i++) k.add(G.sph(0.55, 7, 5), port, { p: [sx * (7.0 - Math.abs(i - 2.5) * 0.12), 0.2, 2 + i * 3.2], s: [0.5, 1, 1] });
      const fl = new THREE.ExtrudeGeometry(finShape(), { depth: 0.8, bevelEnabled: false }); k.add(fl, plate2, { p: [sx * 0.2, 0.4, -29], r: [0, 0, sx * 0.0], s: [sx, 1, 1] });
    }
    k.add(new THREE.ExtrudeGeometry(dorsalShape(), { depth: 0.9, bevelEnabled: false }), plate2, { p: [0, 6.3, 2], r: [0, H, 0] });
    k.add(G.cyl(0.9, 1.2, 4.6, 8), br, { p: [0, 8.2, 12] }); k.add(G.cyl(1.4, 1.4, 0.3, 8), plate2, { p: [0, 10.5, 12] });
    k.add(gearGeometry(14, 3.6, 3.0, 5, 0.9), br, { p: [0, 8.5, -3], r: [0, H, 0] }); k.add(G.cyl(0.4, 0.4, 1.8, 6), plate2, { p: [0, 8.5, -3], r: [0, 0, H] });
    k.add(G.box(7.5, 0.4, 14), plate2, { p: [0, -6.7, 6] });                                                          // gorge cannelée
    for (let i = 0; i < 10; i++) k.add(G.box(7, 0.18, 0.18), plate2, { p: [0, -6.5, -2 + i * 2.2] });
    const w = k.build(); const lx = 82, lz = -48, [, l] = heights(lx, lz);
    w.position.set(lx, toWorldY(lx, l) + 13.5, lz); w.rotation.set(0.03, 0.35, 0.0); frozen.add(w);
  }
  // galions pris dans le dos de la vague et sous la lèvre
  { const g1 = galleon(rnd), lx = -38, lz = 70, [h] = heights(lx, lz); g1.scale.setScalar(1.6); g1.position.set(lx, toWorldY(lx, h) - 12, lz); g1.rotation.set(0.1, 2.2, -0.5); frozen.add(g1);
    const g2 = galleon(rnd), lx2 = 74, lz2 = 92, [, l2] = heights(lx2, lz2); g2.scale.setScalar(1.15); g2.position.set(lx2, toWorldY(lx2, l2) + 15, lz2); g2.rotation.set(0.0, 0.5, 3.0); frozen.add(g2);
    const g3 = galleon(rnd), lx3 = -88, lz3 = -150, [h3] = heights(lx3, lz3); g3.scale.setScalar(1.3); g3.position.set(lx3, toWorldY(lx3, h3) - 10, lz3); g3.rotation.set(0.25, -0.9, 0.9); frozen.add(g3); }
  // banc de poissons-automates sur la paroi du fond du porche
  { const k = new Kit(), fm = mat('#a8b4bd', { metalness: 0.7, roughness: 0.4 }), fe = glow('#7ff0ff', 2.5);
    for (let i = 0; i < 26; i++) { const lx = (66 + rnd() * 30) * SX, lz = -30 + rnd() * 160, [, l] = heights(lx, lz); if (l < 8) continue; const y = toWorldY(lx, l) + 8 + rnd() * 12, s = 0.8 + rnd() * 0.9, ry = 0.3 + (rnd() - 0.5) * 0.5;
      const bd = new THREE.SphereGeometry(1, 8, 6); bd.scale(0.55 * s, 0.7 * s, 1.7 * s); k.add(bd, fm, { p: [lx, y, lz], r: [0, ry, 0] }); k.add(G.cone(0.9 * s, 1.6 * s, 4), fm, { p: [lx + Math.sin(ry) * -1.9 * s, y, lz + Math.cos(ry) * -1.9 * s], r: [-H, ry, 0], s: [1, 1, 0.3] }); k.add(G.sph(0.18 * s, 5, 4), fe, { p: [lx + Math.sin(ry) * 1.3 * s + 0.45 * s, y + 0.2 * s, lz + Math.cos(ry) * 1.3 * s] }); }
    frozen.add(k.build()); }
  wave.add(frozen);

  // tunnel : nervures de glace, luminaires, stalactites, portail de pierre ------------------------
  { const k = new Kit(), rib = mat('#cfeeff', { roughness: 0.2, emissive: '#5ab0e0', emissiveIntensity: 0.4, flatShading: true }), lamp = glow('#9fe8ff', 2.4), lampW = glow('#ffd9a0', 1.4), stone = mat('#59606a', { roughness: 0.9, flatShading: true }), steel = MAT.steel();
    const lo = -108, hi = 31;
    for (let lx = hi - 4; lx > lo; lx -= 9) { const t = track(lx), y = t[2]; k.add(G.tor(RT + 0.2, 0.42, 5, 18, PI), rib, { p: [lx, y - 0.2, t[1]], r: [0, H, 0] });
      for (const sz of [-1, 1]) { k.add(G.box(0.6, 3.2, 0.6), rib, { p: [lx, y + 1.4, t[1] + sz * (RT + 0.1)] }); }
      k.add(G.box(0.5, 0.25, 2.2), lamp, { p: [lx, y + RT + 0.15, t[1]] });
      for (const sz of [-1, 1]) k.add(G.box(0.3, 0.3, 0.3), lampW, { p: [lx - 0.4, y + 3.5, t[1] + sz * (RT - 0.4)] });
      for (let q = 0; q < 3; q++) k.add(G.cone(0.12 + rnd() * 0.12, 0.8 + rnd() * 2.2, 5), rib, { p: [lx + (rnd() - 0.5) * 6, y + RT - 0.6 - rnd() * 0.3, t[1] + (rnd() - 0.5) * 12], r: [PI, 0, 0] }); }
    // portail à l'entrée du tunnel (fond du porche)
    { const lx = 33.5, t = track(lx), y = t[2], zc = t[1];
      for (const sz of [-1, 1]) { k.add(G.box(3.4, 15, 4), stone, { p: [lx, y + 7, zc + sz * (RT + 2.0)] }); k.add(G.box(4.2, 1, 4.8), steel, { p: [lx, y + 14.8, zc + sz * (RT + 2.0)] }); k.add(G.box(0.6, 0.8, 0.5), lampW, { p: [lx + 1.8, y + 4.5, zc + sz * (RT + 0.2)] }); }
      k.add(G.box(3.4, 3.2, 2 * (RT + 3.6)), stone, { p: [lx, y + 13.4, zc] }); k.add(G.box(1.2, 0.9, 2 * (RT + 3.8)), steel, { p: [lx + 0.5, y + 15.4, zc] });
      for (let i = 0; i < 9; i++) k.add(G.cone(0.2, 1 + (i % 3) * 0.8, 5), rib, { p: [lx + 2, y + 11.6, zc - 8 + i * 2], r: [PI, 0, 0] });
      const sgn = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.2), new THREE.MeshBasicMaterial({ map: textSprite(['TUNNEL DU DÉFERLEMENT', 'ligne Gelure · prise dans la glace', 'vitesse limitée'], { w: 1024, h: 256, bg: '#10202c', fg: '#bfeaff', border: '#5ab0e0', font: 'bold 76px Georgia' }) }));
      sgn.position.set(lx + 1.8, y + 19, zc); sgn.rotation.y = H; wave.add(sgn); }
    wave.add(k.build({ shadow: false }));
  }

  // placement : origine sur la voie, repère tourné ----------------------------------------------
  wave.position.set(mid.x, oy, mid.z); wave.rotation.y = th;
  wave.traverse(o => { if (o.isMesh && !o.material.transparent && !o.isInstancedMesh) o.castShadow = o.castShadow || false; });
  scene.add(wave); wave.updateMatrixWorld(true);
  TSUNAMI_ZONE.set = true; TSUNAMI_ZONE.test = (x, z, m = 0) => { const dx = x - mid.x, dz = z - mid.z; const lx = dx * cth - dz * sth, lz = dx * sth + dz * cth; return lx > -118 - m && lx < 125 + m && Math.abs(lz) < 340 + m; };

  // collisions : corps de la vague en tronçons de part et d'autre du couloir du tunnel
  { const seg = 14, x0 = -108, x1 = 33, step = (x1 - x0) / seg;
    for (let s = 0; s < seg; s++) { const lx = x0 + (s + 0.5) * step, c = cAt(lx), hx = step / 2 + 0.3;
      for (const side of [-1, 1]) { const zA = c + side * (RT - 0.9), zB = side * 330, zc = (zA + zB) / 2, hz = Math.abs(zB - zA) / 2; const v = wave.localToWorld(new THREE.Vector3(lx, 0, zc)); COLLIDERS.box(v.x, v.z, hx, hz, th, 999, -99, false); } } }
  return wave;

  function taper() { // queue : pédoncule effilé
    const g = new THREE.CylinderGeometry(1.2, 5.8, 20, 12, 4); g.rotateX(-H); g.translate(0, 0, -6); return g;
  }
  function finShape() { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(9, 5); s.lineTo(8, 1); s.lineTo(10, -4); s.lineTo(0, -2); s.closePath(); return s; }
  function dorsalShape() { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(7, 0); s.lineTo(1, 5); s.closePath(); return s; }
}
