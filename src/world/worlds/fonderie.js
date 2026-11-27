// Monde « fonderie » (index 6, Sud, axe +z) : Fonderie-Rêve.
// Le Moule-Mère (main ouverte géante), rivières de métal fondu qui se figent et refondent sur un cycle,
// ville en caramel des Bougeois, Gaufre le chien de caramel, le Fondeur muet, lac de cire (GIVRE-5), 6 plaques-fragments.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit, G, mat, glow } from '../kit.js';
import { mulberry } from '../../util/noise.js';
import { COLLIDERS } from '../colliders.js';
import { WORLD_LORE as LORE } from '../../data/lore.js';

const PI = Math.PI, H = PI / 2;
const CYCLE = 160; // s : un « jour » de fonte + une « nuit » de reprise
const sstep = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
const inSector = (x, z, pad = 0) => z > 120 && Math.abs(x) < z * 0.39 - pad && Math.hypot(x, z) < 1360;

// géométrie fusionnée AVEC groupes (InstancedMesh multi-matériaux : 1 draw call par matériau)
function multi(kit) {
  const geos = [], mats = [];
  for (const [m, list] of kit.parts) { geos.push(mergeGeometries(list, false)); mats.push(m); }
  return { geo: mergeGeometries(geos, true), mats };
}
// ruban qui épouse le terrain (rivières, berges)
function ribbon(terrain, pts, w, yOff, cols = 4) {
  const pos = [], uv = [], idx = []; let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const f = Math.min(1, i / 4, (pts.length - 1 - i) / 4), ww = w * (0.35 + 0.65 * f) * (0.85 + 0.15 * Math.sin(i * 0.7));
    for (let c = 0; c < cols; c++) {
      const v = c / (cols - 1), o = (v - 0.5) * ww, x = pts[i][0] - tz * o, z = pts[i][1] + tx * o;
      pos.push(x, terrain.heightAt(x, z) + yOff, z); uv.push(s / 14, v);
    }
    if (i) for (let c = 0; c < cols - 1; c++) { const p = (i - 1) * cols + c, q = p + cols; idx.push(p, p + 1, q, p + 1, q + 1, q); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function lavaTexture(rnd) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#ff6a1a'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) {
    const px = rnd() * 128, py = rnd() * 128, r = 6 + rnd() * 18, hot = rnd();
    for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) {
      const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
      g.addColorStop(0, hot > 0.45 ? 'rgba(255,240,150,1)' : hot > 0.15 ? 'rgba(255,170,50,0.9)' : 'rgba(90,22,8,0.75)');
      g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildWorld(scene, terrain, net, ctx) {
  const rnd = mulberry(6606);
  const lore = LORE.find(l => l.id === 'fonderie') || LORE[6];
  const root = new THREE.Group(); root.name = 'fonderie'; scene.add(root);
  const M4 = (x, y, z, ry = 0, s = 1, sy = s) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, sy, s));
  const minH = (x, z, r) => { let m = terrain.heightAt(x, z); for (let a = 0; a < 8; a++) m = Math.min(m, terrain.heightAt(x + Math.cos(a * PI / 4) * r, z + Math.sin(a * PI / 4) * r)); return m; };
  const clearOf = (x, z, r) => net.nearest(x, z, r) === null;
  const placed = []; // [x, z, rayon, base y] : pour le contrôle et l'exclusion
  const excl = []; const busy = (x, z, r) => excl.some(e => (e[0] - x) ** 2 + (e[1] - z) ** 2 < (e[2] + r) ** 2);

  // ---- décor provisoire (decor.js) déjà posé dans le secteur : on écarte ce qui chevauche nos grands ensembles
  const stand = [];
  { const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    scene.traverse(o => { if (!o.isInstancedMesh || o.parent !== scene) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.decompose(p, q, s); if (!inSector(p.x, p.z, -20)) continue; stand.push({ o, i, x: p.x, z: p.z, r: o.geometry.boundingSphere.radius * Math.max(s.x, s.z) * 0.8 }); } }); }
  const evict = (x, z, r) => { for (const e of stand) if (!e.gone && (e.x - x) ** 2 + (e.z - z) ** 2 < (r + e.r) ** 2) { e.gone = true; e.o.setMatrixAt(e.i, new THREE.Matrix4().makeScale(0, 0, 0)); e.o.instanceMatrix.needsUpdate = true; } };
  const standBusy = (x, z, r) => stand.some(e => !e.gone && (e.x - x) ** 2 + (e.z - z) ** 2 < (r + e.r) ** 2);
  const findSpot = (x0, z0, r, clear, search = 120) => { for (let t = 0; t < 400; t++) { const a = t * 2.4, d = Math.sqrt(t) * search / 20; const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
    if (!inSector(x, z, r) || busy(x, z, r)) continue; let ok = true; for (let k = 0; k < 12 && ok; k++) ok = clearOf(x + Math.cos(k * PI / 6) * r, z + Math.sin(k * PI / 6) * r, clear); if (ok && clearOf(x, z, clear + r)) return [x, z]; } return null; };

  // ===================================================================== MATÉRIAUX
  const bronze = mat('#6b3a1f', { metalness: 0.75, roughness: 0.42 }), bronzeD = mat('#3a1f12', { metalness: 0.6, roughness: 0.55, flatShading: true });
  const slag = mat('#2a1712', { roughness: 0.95, flatShading: true }), wax = mat('#ffb062', { roughness: 0.3, emissive: '#ff6a10', emissiveIntensity: 0.25 });
  const hot = glow('#ff6a1a', 2.6), hotY = glow('#ffc24a', 3.2), brass = mat('#d2a24c', { metalness: 0.9, roughness: 0.28 });
  const caramel = mat('#c8762a', { roughness: 0.35, metalness: 0.05 }), choco = mat('#4a2614', { roughness: 0.5 }), icing = mat('#f6e3c0', { roughness: 0.4 });
  const candle = mat('#f2dcb0', { roughness: 0.55 }), winG = glow('#ffb347', 1.6), iron = mat('#232124', { metalness: 0.6, roughness: 0.5 }), stone = mat('#5b3a2a', { roughness: 0.9, flatShading: true });

  // ===================================================================== 1. LE MOULE-MÈRE (main ouverte géante)
  const HAND = findSpot(150, 450, 26, 25) || findSpot(-160, 1120, 26, 25);
  let palm = new THREE.Vector3(), handInfo = null;
  if (HAND) {
    const [hx, hz] = HAND; excl.push([hx, hz, 34]); evict(hx, hz, 34);
    const k = new Kit(), base = minH(hx, hz, 22);
    // socle de scories, enfoncé
    k.add(G.lathe([[0, -3], [24, -3], [23, 0.6], [19, 2.4], [13, 3.6], [8, 4.2], [0, 4.3]], 18), slag);
    for (let i = 0; i < 14; i++) { const a = i / 14 * PI * 2 + rnd() * 0.3, d = 17 + rnd() * 5; k.add(new THREE.DodecahedronGeometry(1.6 + rnd() * 1.6, 0), slag, { p: [Math.cos(a) * d, 0.6, Math.sin(a) * d], r: [rnd() * 3, rnd() * 3, 0], s: [1, 0.6, 1] }); }
    // mare de métal tiède au pied
    k.add(G.cyl(9.5, 10, 0.3, 24), hot, { p: [0, 4.25, 0], s: [1, 1, 0.8] });
    // avant-bras + bracelets rivetés
    k.add(G.cyl(5.2, 6.4, 22, 18), bronze, { p: [0, 14, -2] });
    for (const y of [7, 12.5]) { k.add(G.tor(6.05 - y * 0.04, 0.55, 6, 22), brass, { p: [0, y, -2], r: [H, 0, 0] }); for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; k.add(G.sph(0.35, 6, 4), brass, { p: [Math.cos(a) * (6.3 - y * 0.04), y + 0.7, -2 + Math.sin(a) * (6.3 - y * 0.04)] }); } }
    // main dressée, paume ouverte face à la voie (+z local) : paume, moule incandescent, doigts écartés, pouce
    k.add(G.sph(6.4, 16, 10), bronze, { p: [0, 25, -2], s: [1.15, 0.9, 0.85] });
    k.add(G.rbox(18, 19, 6, 2.6, 3), bronze, { p: [0, 34, -1.5] });
    k.add(G.cyl(5.4, 5.4, 0.5, 24), hot, { p: [0, 33, 1.55], r: [H, 0, 0], s: [1, 1, 1.15] }); // le moule incandescent
    k.add(G.tor(5.5, 0.8, 6, 24), bronzeD, { p: [0, 33, 1.5], s: [1, 1.15, 1] });
    const fing = [[-6.6, 0.85, 1.6, -0.2], [-2.2, 1.05, 1.75, -0.06], [2.2, 1.0, 1.7, 0.06], [6.5, 0.78, 1.45, 0.2]];
    for (const [fx, ls, rad, spread] of fing) {
      let px = fx, py = 42.5, pz = -1.5, bend = 0; const L = [8 * ls, 6.5 * ls, 5 * ls];
      for (let j = 0; j < 3; j++) {
        bend += [0.08, 0.22, 0.3][j]; const d = new THREE.Vector3(Math.sin(spread), Math.cos(bend), Math.sin(bend)).normalize(), r = rad * (1.15 - j * 0.1) + 0.5;
        const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
        k.add(G.sph(r * 1.08, 12, 8), j ? bronze : bronzeD, { p: [px, py, pz] });
        k.add(G.cap(r, L[j], 4, 12), bronze, { p: [px + d.x * L[j] / 2, py + d.y * L[j] / 2, pz + d.z * L[j] / 2], r: [e.x, e.y, e.z] });
        px += d.x * L[j]; py += d.y * L[j]; pz += d.z * L[j];
      }
      k.add(G.cone(0.6, 3 + rnd() * 4, 6), wax, { p: [fx + 0.5, 40.5, 1.6], r: [PI, 0, 0] });
    }
    { let px = 9.5, py = 29, pz = 0; const dirs = [[0.85, 0.45, 0.3], [0.45, 0.85, 0.35]], L = [7, 6];
      for (let j = 0; j < 2; j++) { const [dx, dy, dz] = dirs[j], d = new THREE.Vector3(dx, dy, dz).normalize();
        const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
        k.add(G.sph(2.6, 12, 8), bronze, { p: [px, py, pz] }); k.add(G.cap(2.3, L[j], 4, 12), bronze, { p: [px + d.x * L[j] / 2, py + d.y * L[j] / 2, pz + d.z * L[j] / 2], r: [e.x, e.y, e.z] });
        px += d.x * L[j]; py += d.y * L[j]; pz += d.z * L[j]; } }
    // larmes de cire sur l'avant-bras et coulée de métal du bord de paume jusqu'à la mare
    for (let i = 0; i < 9; i++) { const a = rnd() * PI * 2; k.add(G.cap(0.45 + rnd() * 0.3, 3 + rnd() * 6, 3, 6), wax, { p: [Math.cos(a) * 5.6, 8 + rnd() * 12, -2 + Math.sin(a) * 5.6] }); }
    k.add(G.box(1.1, 26, 0.5), hot, { p: [-7.6, 17.5, 2.2] });
    // anneau de piliers-creusets (petits lingots dressés autour) : on y pose les bougies du rite
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2 + 0.2, d = 15; k.add(G.cyl(0.9, 1.1, 3.6, 8), candle, { p: [Math.cos(a) * d, 4.6 - 0.4, Math.sin(a) * d] }); k.add(G.cone(0.35, 1.1, 6), hotY, { p: [Math.cos(a) * d, 7.1 - 0.4, Math.sin(a) * d] }); }
    const g = k.build(); // doigts tournés vers la voie (−x)
    g.rotation.y = Math.atan2(-hx, 0) + 0.3; g.position.set(hx, base, hz); g.updateMatrixWorld(true); root.add(g);
    palm.set(0, 33, 3).applyMatrix4(g.matrixWorld);
    handInfo = { x: hx, z: hz, base, g }; placed.push([hx, hz, 24, base, 'Moule-Mère']);
    COLLIDERS.circle(hx, hz, 21, base + 4.2); COLLIDERS.circle(hx, hz, 7, base + 30);
  }

  // ===================================================================== 2. VILLE EN CARAMEL (Bougeois)
  const TOWN = findSpot(135, 915, 40, 22) || findSpot(-150, 260, 40, 22);
  const houses = [], townPts = [];
  let statue = null, fountainPos = null;
  if (TOWN) {
    const [tx, tz] = TOWN; excl.push([tx, tz, 48]); evict(tx, tz, 46);
    // maison qui fond : murs caramel, toit chocolat, glaçage qui coule, fenêtres chaudes ; cisaillement « fondu »
    const mkHouse = (w, h, d, lean) => {
      const k = new Kit();
      k.add(G.box(w + 0.6, 1.6, d + 0.6), choco, { p: [0, -0.3, 0] }); // soubassement (enfoncé)
      k.add(G.rbox(w, h, d, 0.6, 2), caramel, { p: [0, h / 2, 0] });
      const roof = G.cone(Math.max(w, d) * 0.78, h * 0.62, 4); k.add(roof, choco, { p: [0, h + h * 0.31, 0], r: [0, PI / 4, 0], s: [w / Math.max(w, d), 1, d / Math.max(w, d)] });
      k.add(G.box(w + 0.5, 0.45, d + 0.5), icing, { p: [0, h + 0.1, 0] });
      for (let i = 0; i < 10; i++) { const side = i % 4, t = (rnd() - 0.5) * 0.85, L = 0.6 + rnd() * 1.8;
        const px = side < 2 ? t * w : (side === 2 ? 1 : -1) * (w / 2 + 0.24), pz = side < 2 ? (side ? 1 : -1) * (d / 2 + 0.24) : t * d;
        k.add(G.cap(0.18, L, 3, 6), icing, { p: [px, h - L / 2, pz] }); }
      for (const sx of [-1, 1]) { k.add(G.box(1.1, 1.4, 0.2), winG, { p: [sx * w * 0.25, h * 0.62, d / 2 + 0.02] }); k.add(G.box(0.2, 1.4, 1.1), winG, { p: [w / 2 + 0.02, h * 0.62, sx * d * 0.22] }); }
      k.add(G.rbox(1.4, 2.4, 0.3, 0.12), choco, { p: [0, 1.2, d / 2 + 0.05] });
      k.add(G.cyl(0.5, 0.6, 2.4, 8), choco, { p: [w * 0.25, h + h * 0.45, -d * 0.15] });
      const m = multi(k), p = m.geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = Math.max(0, p.getY(i)); p.setX(i, p.getX(i) + lean * y * y / (h * 2)); p.setY(i, p.getY(i) - Math.abs(lean) * 0.1 * y * y / h); }
      m.geo.computeVertexNormals(); return m;
    };
    const HT = [mkHouse(6, 5, 5, 0.6), mkHouse(5, 7, 5, -0.45), mkHouse(8, 4.2, 6, 0.3)];
    const lists = HT.map(() => []);
    const N = 11;
    for (let i = 0; i < N; i++) {
      const a = i / N * PI * 2 + rnd() * 0.2, d = 24 + rnd() * 8, x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
      if (!clearOf(x, z, 16) || !inSector(x, z, 6)) continue;
      const y = minH(x, z, 4.5) - 0.05, ti = i % 3; lists[ti].push(M4(x, y, z, -a - H + PI, 1));
      houses.push([x, z]); placed.push([x, z, 4, y, 'maison']); COLLIDERS.circle(x, z, 3.8, y + 8);
    }
    HT.forEach((T, i) => { if (!lists[i].length) return; const im = new THREE.InstancedMesh(T.geo, T.mats, lists[i].length); lists[i].forEach((m, j) => im.setMatrixAt(j, m)); im.castShadow = true; im.receiveShadow = true; root.add(im); });
    // fontaine de caramel (« la rue du Caramel est maintenant une fontaine »)
    { const k = new Kit(), y = minH(tx, tz, 5) - 0.1;
      k.add(G.lathe([[0, -0.6], [5, -0.6], [5, 0.9], [4.4, 1.0], [4.4, 0.4], [0, 0.4]], 22), stone);
      k.add(G.cyl(4.4, 4.4, 0.15, 22), caramel, { p: [0, 0.78, 0] });
      k.add(G.cyl(0.6, 0.9, 3.4, 10), stone, { p: [0, 2.2, 0] });
      k.add(G.lathe([[0, 0], [2.2, 0.1], [2.4, 0.7], [2.1, 0.75], [0, 0.4]], 18), stone, { p: [0, 3.8, 0] });
      k.add(G.cyl(2.05, 2.05, 0.1, 18), caramel, { p: [0, 4.45, 0] });
      for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; k.add(G.cap(0.12, 2.6, 3, 6), caramel, { p: [Math.cos(a) * 2.35, 3.3, Math.sin(a) * 2.35] }); }
      k.add(G.sph(0.6, 10, 8), caramel, { p: [0, 4.9, 0] });
      const g = k.build(); g.position.set(tx, y, tz); root.add(g); fountainPos = new THREE.Vector3(tx, y + 4.9, tz);
      placed.push([tx, tz, 5, y, 'fontaine']); COLLIDERS.circle(tx, tz, 5, y + 1); }
    // le Fondeur muet : statue de cire sur socle, bras qui pointe (change de pose chaque « matin »)
    { const sx = tx + 9, sz = tz - 9, y = minH(sx, sz, 1.6) - 0.1, k = new Kit();
      k.add(G.box(2.6, 1.6, 2.6), stone, { p: [0, 0.5, 0] }); k.add(G.box(2.9, 0.3, 2.9), stone, { p: [0, 1.35, 0] });
      k.add(G.cyl(0.55, 0.75, 2.2, 10), wax, { p: [0, 2.6, 0] }); k.add(G.sph(0.85, 12, 10), wax, { p: [0, 4.2, 0], s: [1, 1.25, 1] });
      k.add(G.cap(0.33, 1.4, 3, 8), wax, { p: [0, 2.4, 0.5], r: [0.5, 0, 0] }); k.add(G.cyl(0.95, 1.1, 0.5, 12), wax, { p: [0, 3.55, 0] });
      k.add(G.cyl(0.18, 0.12, 0.8, 6), choco, { p: [0, 5.3, 0] });
      for (let i = 0; i < 6; i++) { const a = i * 1.05; k.add(G.cap(0.12, 0.5 + rnd() * 0.8, 3, 6), wax, { p: [Math.cos(a) * 0.7, 1.8, Math.sin(a) * 0.7] }); }
      const g = k.build(); g.position.set(sx, y, sz); root.add(g);
      const arm = new THREE.Group(); arm.position.set(0, 3.5, 0); g.add(arm);
      const am = new THREE.Mesh(G.cap(0.28, 2.2, 3, 8), wax); am.rotation.z = H; am.position.x = -1.5; am.castShadow = true; arm.add(am);
      const fg = new THREE.Mesh(G.cap(0.1, 0.5, 2, 6), wax); fg.rotation.z = H; fg.position.x = -3.1; arm.add(fg);
      statue = { g, arm, sx, sz }; placed.push([sx, sz, 1.5, y, 'Fondeur muet']); COLLIDERS.circle(sx, sz, 1.5, y + 5.5); }
    for (let i = 0; i < 7; i++) townPts.push([tx, tz]);
  }

  // ===================================================================== 3. LAC DE CIRE (là où GIVRE-5 est coincé : même calcul qu'octuor.js)
  let lake = null;
  { const sec = (x, z) => ((Math.round(Math.atan2(-z, x) / (PI / 4)) % 8) + 8) % 8, salt = 5;
    const edges = net.edges.filter(e => e.pts.length > 20 && e.tan && (e.biome === 6 || sec(e.pts[e.pts.length >> 1].x, e.pts[e.pts.length >> 1].z) === 6)).sort((a, b) => b.len - a.len);
    const e = edges[salt % Math.max(1, edges.length)];
    let spot = null, dir = null;
    if (e) for (const ee of [e, ...edges]) { if (spot) break; for (let k = 4; k < ee.pts.length - 4; k += 3) { const p = ee.pts[k], r = Math.hypot(p.x, p.z); if (r < 520 || r > 1000) continue;
      const t = ee.tan[k], x = p.x + t.z * 13, z = p.z - t.x * 13; if (net.nearest(x, z, 10)) continue; spot = [x, z]; dir = [t.z, -t.x]; break; } }
    if (spot) {
      const cx = spot[0] + dir[0] * 3, cz = spot[1] + dir[1] * 3, R = 8.5, pos = [], idx = [], RS = 6, AS = 28;
      pos.push(cx, terrain.heightAt(cx, cz) + 0.09, cz);
      for (let r = 1; r <= RS; r++) for (let a = 0; a < AS; a++) { const an = a / AS * PI * 2, rr = R * r / RS * (r === RS ? 0.92 + 0.16 * Math.sin(an * 3 + 1) : 1);
        let x = cx + Math.cos(an) * rr, z = cz + Math.sin(an) * rr; const nn = net.nearest(x, z, 4.5); if (nn) { x = cx + Math.cos(an) * rr * 0.6; z = cz + Math.sin(an) * rr * 0.6; }
        pos.push(x, terrain.heightAt(x, z) + 0.09, z); }
      for (let a = 0; a < AS; a++) idx.push(0, 1 + (a + 1) % AS, 1 + a);
      for (let r = 1; r < RS; r++) for (let a = 0; a < AS; a++) { const p = 1 + (r - 1) * AS + a, q = 1 + (r - 1) * AS + (a + 1) % AS; idx.push(p, q, p + AS, q, q + AS, p + AS); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const lm = new THREE.MeshStandardMaterial({ color: '#ff9a3c', emissive: '#ff5a00', emissiveIntensity: 0.35, roughness: 0.18, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(g, lm); mesh.receiveShadow = true; root.add(mesh);
      // bourrelets de cire figée autour
      const k = new Kit(); for (let a = 0; a < 16; a++) { const an = a / 16 * PI * 2, x = cx + Math.cos(an) * (R + 0.6), z = cz + Math.sin(an) * (R + 0.6); if (!clearOf(x, z, 5)) continue;
        k.add(G.sph(0.9 + rnd() * 0.7, 8, 6), wax, { p: [x - cx, terrain.heightAt(x, z) - terrain.heightAt(cx, cz) - 0.25, z - cz], s: [1.4, 0.55, 1] , r: [0, -an, 0] }); }
      if (k.parts.size) { const rg = k.build(); rg.position.set(cx, terrain.heightAt(cx, cz), cz); root.add(rg); }
      lake = { x: cx, z: cz, m: lm }; excl.push([cx, cz, R + 4]); evict(cx, cz, R + 2); placed.push([cx, cz, R, terrain.heightAt(cx, cz), 'lac de cire']);
    }
  }

  // ===================================================================== 4. PLAQUES-FRAGMENTS (6)
  const plaques = [];
  { const k = new Kit();
    k.add(G.box(1.3, 0.7, 0.9), stone, { p: [0, 0.05, 0] }); k.add(G.cyl(0.09, 0.12, 1.1, 8), iron, { p: [0, 0.9, 0] });
    k.add(G.rbox(1.05, 0.72, 0.1, 0.04), iron, { p: [0, 1.5, 0.05], r: [-0.6, 0, 0] }); k.add(G.box(0.88, 0.56, 0.04), brass, { p: [0, 1.53, 0.1], r: [-0.6, 0, 0] });
    k.add(G.sph(0.09, 8, 6), hot, { p: [0, 1.95, -0.12] }); k.add(G.cone(0.5, 0.5, 6), wax, { p: [0.45, 0.55, 0.3] });
    const m = multi(k), list = [];
    const main = net.edges.filter(e => (e.a + e.b).match(/^(S6P6|P6Q6|Q6R6|R6U6|U6V6|V6T6)$/));
    const want = [[230, 1], [470, 1], [700, -1], [930, 1], [1060, -1], [1245, -1]];
    want.forEach(([zz, side], i) => {
      let best = null; for (const e of main) for (let j = 2; j < e.pts.length - 2; j++) { const p = e.pts[j]; if (!best || Math.abs(p.z - zz) < Math.abs(best.p.z - zz)) best = { p, e, j }; }
      if (!best) return;
      for (let tr = 0; tr < 30; tr++) { const off = 13 + (tr % 5), dz = Math.floor(tr / 5) * 8 * (tr % 2 ? 1 : -1), x = best.p.x + side * off, z = best.p.z + dz;
        if (!clearOf(x, z, 11.5) || busy(x, z, 2) || standBusy(x, z, 1.5)) continue;
        const y = minH(x, z, 0.8) - 0.12, ry = Math.atan2(-side, 0); // plaque tournée vers la voie
        list.push(M4(x, y, z, ry)); plaques.push({ x, y, z, i, frag: lore.fragments[i] }); excl.push([x, z, 3]); placed.push([x, z, 0.8, y, 'plaque ' + i]); COLLIDERS.circle(x, z, 0.7, y + 1.8); break; }
    });
    const im = new THREE.InstancedMesh(m.geo, m.mats, Math.max(1, list.length)); list.forEach((mm, j) => im.setMatrixAt(j, mm)); im.count = list.length; im.castShadow = true; root.add(im);
  }
  const ringM = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Group(); ring.add(new THREE.Mesh(G.cyl(1.3, 1.6, 3.2, 20, true), ringM)); ring.children[0].position.y = 1.6; ring.visible = false; root.add(ring);

  // ===================================================================== 5. RIVIÈRES DE MÉTAL FONDU (cycle fonte / reprise)
  const lavaTex = lavaTexture(mulberry(61));
  const lavaM = new THREE.MeshBasicMaterial({ map: lavaTex, color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const bankM = new THREE.MeshStandardMaterial({ color: '#2b1610', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const riverPts = [], lavaG = [], bankG = [];
  { const seeds = [];
    if (handInfo) seeds.push([handInfo.x + 20, handInfo.z + 4, 0.2]);
    for (let i = 0; i < 26 && seeds.length < 9; i++) { const z = 200 + rnd() * 1080, x = (rnd() * 2 - 1) * z * 0.36; if (clearOf(x, z, 40) && !busy(x, z, 20)) seeds.push([x, z, rnd() * PI * 2]); }
    for (const [sx, sz, h0] of seeds) {
      let x = sx, z = sz, h = h0; const pts = [];
      for (let s = 0; s < 70; s++) {
        if (!inSector(x, z, 8) || !clearOf(x, z, 18) || (s > 2 && busy(x, z, 6))) break;
        pts.push([x, z]); h += Math.sin(s * 0.37 + sx) * 0.22 + (rnd() - 0.5) * 0.2; x += Math.cos(h) * 5; z += Math.sin(h) * 5;
      }
      if (pts.length < 10) continue;
      const w = 3.5 + rnd() * 3;
      lavaG.push(ribbon(terrain, pts, w, 0.16, 4)); bankG.push(ribbon(terrain, pts, w + 3.4, 0.09, 5));
      for (const p of pts) { riverPts.push(p); excl.push([p[0], p[1], w / 2 + 2]); }
      for (const p of pts) evict(p[0], p[1], w / 2 + 1);
    }
    if (lavaG.length) { const l = new THREE.Mesh(mergeGeometries(lavaG), lavaM), b = new THREE.Mesh(mergeGeometries(bankG), bankM); b.receiveShadow = true; root.add(b, l); }
  }

  // ===================================================================== 6. HABILLAGE DU SOL (instancié)
  const scatter = (geo, material, n, sMin, sMax, clear, sink, opts = {}) => {
    const list = [], inst = []; let t = 0;
    if (!geo.boundingBox) geo.computeBoundingBox(); const fp0 = Math.max(geo.boundingBox.max.x, -geo.boundingBox.min.x, geo.boundingBox.max.z, -geo.boundingBox.min.z);
    while (list.length < n && t++ < n * 30) {
      const z = 150 + rnd() * 1180, x = (rnd() * 2 - 1) * z * 0.38, s = sMin + rnd() * (sMax - sMin), fp = fp0 * s;
      if (!inSector(x, z, fp) || !clearOf(x, z, clear + fp) || busy(x, z, fp) || standBusy(x, z, fp)) continue;
      const y = minH(x, z, fp * 0.7) - sink * s, ry = rnd() * PI * 2, sy = s * (opts.sy ? 0.7 + rnd() * 0.6 : 1);
      list.push(M4(x, y, z, ry, s, sy)); inst.push({ x, z, y, ry, s, sy }); excl.push([x, z, fp * 0.8]); placed.push([x, z, fp, y + sink * s, opts.name || 'déco']);
      if (opts.collide) COLLIDERS.circle(x, z, fp * 0.7, y + opts.collide * sy);
    }
    const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length)); list.forEach((m, i) => im.setMatrixAt(i, m)); im.count = list.length; im.castShadow = !!opts.shadow; im.receiveShadow = true; root.add(im); im.userData.inst = inst; return im;
  };
  // rochers de « chocolat-métal » (dodécaèdres écrasés, veines chaudes)
  const rockK = new Kit(); rockK.add(new THREE.DodecahedronGeometry(1.2, 0), bronzeD, { p: [0, 0.55, 0], s: [1.3, 0.75, 1] }); rockK.add(new THREE.DodecahedronGeometry(0.7, 0), bronzeD, { p: [0.9, 0.35, 0.4], s: [1, 0.8, 1.2] });
  const rockM = multi(rockK); const rocks = scatter(rockM.geo, rockM.mats[0], 120, 0.8, 3.2, 9, 0.15, { shadow: true, collide: 1.2, name: 'rocher' });
  // grappes de bougies (petite échelle, flammes = glow)
  const cK = new Kit(); [[0, 0, 1.6], [0.55, 0.3, 1.0], [-0.45, 0.4, 1.25], [0.15, -0.5, 0.7]].forEach(([x, z, h]) => { cK.add(G.cyl(0.18, 0.2, h, 8), candle, { p: [x, h / 2, z] }); cK.add(G.cone(0.08, 0.28, 5), hotY, { p: [x, h + 0.2, z] }); cK.add(G.cyl(0.24, 0.26, 0.08, 8), wax, { p: [x, 0.04, z] }); });
  const cM = multi(cK); { const im = scatter(cM.geo, cM.mats[0], 70, 1, 2.2, 9, 0.02, { name: 'bougies' }); im.material = cM.mats; }
  // sculptures de cire : elles fondent le jour et se refigent la nuit dans une autre forme
  const scK = new Kit(); scK.add(G.cyl(1.1, 1.4, 1.0, 10), wax, { p: [0, 0.3, 0] }); scK.add(G.sph(1.0, 10, 8), wax, { p: [0, 1.4, 0] }); scK.add(G.sph(0.7, 10, 8), wax, { p: [0.3, 2.5, 0.1] }); scK.add(G.cone(0.5, 1.5, 8), wax, { p: [0.1, 3.5, 0] });
  const scul = scatter(scK.geometry(), wax, 36, 1.0, 2.2, 10, 0.25, { shadow: true, name: 'sculpture', collide: 3 }); scul.frustumCulled = false;
  scul.userData.inst.forEach((o, i) => { o.a = [1, 1, 0]; o.b = [1, 1, 0]; o.seed = i; });

  // ===================================================================== 7. HABITANTS
  // Bougeois (instanciés) : corps-bougie + flamme ; Madame Mèche a un chapeau
  const bodyK = new Kit();
  bodyK.add(G.lathe([[0, 0], [0.42, 0], [0.45, 0.2], [0.4, 1.3], [0.36, 1.45], [0, 1.5]], 12), candle);
  for (let i = 0; i < 5; i++) { const a = i * 1.25 + 0.3; bodyK.add(G.cap(0.06, 0.25 + (i % 3) * 0.15, 2, 5), candle, { p: [Math.cos(a) * 0.38, 1.25 - (i % 3) * 0.1, Math.sin(a) * 0.38] }); }
  bodyK.add(G.sph(0.055, 6, 4), iron, { p: [-0.13, 1.18, 0.37] }); bodyK.add(G.sph(0.055, 6, 4), iron, { p: [0.13, 1.18, 0.37] });
  bodyK.add(G.cap(0.07, 0.35, 2, 5), candle, { p: [0.45, 0.8, 0], r: [0, 0, 0.6] }); bodyK.add(G.cap(0.07, 0.35, 2, 5), candle, { p: [-0.45, 0.8, 0], r: [0, 0, -0.6] });
  bodyK.add(G.cyl(0.02, 0.02, 0.25, 4), iron, { p: [0, 1.6, 0] });
  const bodyM = multi(bodyK); const NB = TOWN ? 7 : 0;
  const bod = new THREE.InstancedMesh(bodyM.geo, bodyM.mats, Math.max(1, NB)), fl = new THREE.InstancedMesh(G.cone(0.13, 0.42, 6).translate(0, 0.21, 0), hotY, Math.max(1, NB));
  bod.count = fl.count = NB; bod.castShadow = true; bod.frustumCulled = fl.frustumCulled = false; root.add(bod, fl);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.4, 10).translate(0, 0.2, 0), choco); hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 12), choco)); hat.visible = NB > 0; root.add(hat);
  const folks = []; for (let i = 0; i < NB; i++) folks.push({ r: 9 + (i % 3) * 4.5, a: rnd() * PI * 2, w: (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.06), h: 0.85 + rnd() * 0.35, ph: rnd() * 10 });

  // Gaufre, chien de caramel : trotte le long de la voie près de la ville, suit les trains
  const dogPath = [];
  { const e = net.edges.find(e => e.a === 'R6' && e.b === 'U6');
    if (e && e.tan) for (let k = 0; k < e.pts.length; k++) { const p = e.pts[k], t = e.tan[k]; const x = p.x - t.z * 14, z = p.z + t.x * 14; // côté +x (vers la ville)
      if (net.nearest(x, z, 11) || busy(x, z, 1.2)) { if (dogPath.length > 20) break; dogPath.length = 0; continue; } dogPath.push([x, z]); } }
  const dog = new THREE.Group(); const legs = [];
  { const k = new Kit(), car2 = mat('#a85a1c', { roughness: 0.3 });
    k.add(G.cap(0.32, 0.8, 4, 10), caramel, { p: [0, 0.62, 0], r: [H, 0, 0] }); k.add(G.sph(0.3, 12, 8), caramel, { p: [0, 0.92, 0.62] });
    k.add(G.cap(0.15, 0.2, 3, 8), car2, { p: [0, 0.86, 0.9], r: [H, 0, 0] }); k.add(G.sph(0.06, 6, 4), iron, { p: [0, 0.88, 1.07] });
    for (const s of [-1, 1]) { k.add(G.cap(0.08, 0.22, 2, 6), car2, { p: [s * 0.2, 1.12, 0.55], r: [0.3, 0, s * 0.6] }); k.add(G.sph(0.045, 6, 4), iron, { p: [s * 0.12, 0.99, 0.84] }); }
    k.add(G.cap(0.05, 0.4, 2, 6), car2, { p: [0, 0.85, -0.6], r: [-0.7, 0, 0] });
    for (let i = 0; i < 4; i++) k.add(G.cone(0.06, 0.18, 4), caramel, { p: [(i - 1.5) * 0.15, 0.3, (i % 2) * 0.2 - 0.1], r: [PI, 0, 0] }); // gouttes collantes
    dog.add(k.build());
    const lg = G.cap(0.08, 0.35, 2, 6).translate(0, -0.22, 0);
    for (const [x, z] of [[-0.17, 0.35], [0.17, 0.35], [-0.17, -0.35], [0.17, -0.35]]) { const l = new THREE.Mesh(lg, caramel); l.position.set(x, 0.47, z); l.castShadow = true; dog.add(l); legs.push(l); }
    dog.visible = dogPath.length > 10; root.add(dog);
  }
  const dogS = { u: dogPath.length * 0.5, dir: 1, speed: 1.6, said: 0 };

  // ===================================================================== état du cycle
  let night = -1, gen = 0, emitT = 0, frame = 0, lastNear = -1;
  const cv = new THREE.Vector3(), cv2 = new THREE.Vector3(), mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(), pp = new THREE.Vector3(), eu = new THREE.Euler();
  const regen = () => { gen++; const r = mulberry(1000 + gen * 17);
    for (const o of scul.userData.inst) { o.a = o.b; o.b = [0.7 + r() * 0.8, 0.6 + r() * 1.1, (r() - 0.5) * 0.5]; }
    if (statue) statue.target = r() * PI * 2; };
  regen(); regen();

  if (typeof window !== 'undefined') window.__fonderie = { placed, plaques, HAND, TOWN, lake, rivers: riverPts.length, dogPath: dogPath.length, bod, fl, hat };

  return {
    update(dt, time, camPos) {
      const ph = (typeof window !== "undefined" && window.__fonderiePh != null) ? window.__fonderiePh : (time % CYCLE) / CYCLE, melt = sstep(0.0, 0.18, ph) * (1 - sstep(0.5, 0.68, ph)); // 1 = jour (tout fond), 0 = nuit (tout se refige)
      const isNight = melt < 0.05 ? 1 : 0;
      if (isNight !== night) { if (isNight && night === 0) { regen();
          try { if (camPos && inSector(camPos.x, camPos.z, -40)) ctx.ui.toast('🌙 Fonderie-Rêve se refige… <b>autrement</b>.'); } catch (e) { /* ui absente */ } }
        else if (!isNight && night === 1) { try { if (camPos && inSector(camPos.x, camPos.z, -40)) ctx.ui.toast('☀️ Le jour se lève : tout recommence à fondre.'); } catch (e) { /* */ } }
        night = isNight; }
      if (!camPos) return;
      // ne rien faire si la caméra est loin du secteur
      const cd = Math.hypot(camPos.x, camPos.z - 740) ; if (cd > 1300 && !inSector(camPos.x, camPos.z, -300)) return;
      const near = inSector(camPos.x, camPos.z, -250) || cd < 700;
      // rivières : coulent et brillent le jour, croûte sombre la nuit
      lavaTex.offset.x = (lavaTex.offset.x - dt * (0.04 + 0.22 * melt)) % 1; lavaTex.offset.y = Math.sin(time * 0.3) * 0.03;
      lavaM.color.setRGB(0.28 + 0.72 * melt, 0.14 + 0.86 * melt, 0.1 + 0.9 * melt);
      if (lake) lake.m.emissiveIntensity = 0.12 + 0.55 * melt;
      hot.emissiveIntensity = 1.4 + 1.6 * melt + Math.sin(time * 2.1) * 0.25; wax.emissiveIntensity = 0.12 + 0.3 * melt;
      if (!near) return;
      frame++;
      // sculptures : fondent (s'affaissent, s'étalent) le jour, reprennent une NOUVELLE forme la nuit
      if (frame % 3 === 0) {
        const k = 1 - melt, n = sstep(0.5, 0.95, ph); // n : progression du re-figeage
        for (let i = 0; i < scul.userData.inst.length; i++) { const o = scul.userData.inst[i], A = o.a, B = o.b;
          const sx = (A[0] + (B[0] - A[0]) * n) * (1 + 0.45 * melt), sy = (A[1] + (B[1] - A[1]) * n) * (0.35 + 0.65 * k), tw = A[2] + (B[2] - A[2]) * n;
          mm.compose(pp.set(o.x, o.y, o.z), qq.setFromEuler(eu.set(0, o.ry + tw, 0)), ss.set(o.s * sx, o.sy * sy, o.s * sx)); scul.setMatrixAt(i, mm); }
        scul.instanceMatrix.needsUpdate = true;
      }
      // Fondeur muet : tourne lentement vers sa nouvelle direction
      if (statue && statue.target !== undefined) { const d = Math.atan2(Math.sin(statue.target - statue.g.rotation.y), Math.cos(statue.target - statue.g.rotation.y)); statue.g.rotation.y += d * Math.min(1, dt * 0.4) * (1 - melt * 0.5); statue.arm.rotation.z = -0.25 + Math.sin(time * 0.1) * 0.05; }
      // Bougeois : flânent autour de la fontaine, raccourcissent en parlant le jour, se reforment la nuit
      if (TOWN) for (let i = 0; i < NB; i++) { const f = folks[i]; f.a += f.w * dt * (0.6 + Math.sin(time * 0.5 + f.ph) * 0.4);
        const x = TOWN[0] + Math.cos(f.a) * f.r, z = TOWN[1] + Math.sin(f.a) * f.r, y = terrain.heightAt(x, z), talk = Math.max(0, Math.sin(time * 0.7 + f.ph)), hh = f.h * (1 - 0.25 * melt * (0.5 + 0.5 * talk)) * (1 + 0.03 * Math.sin(time * 9 + f.ph) * talk);
        const ry = -f.a + (f.w > 0 ? 0 : PI) + Math.sin(time * 3 + f.ph) * 0.08;
        mm.compose(pp.set(x, y - 0.02 + Math.abs(Math.sin(time * 5 + f.ph)) * 0.05, z), qq.setFromEuler(eu.set(0, ry, Math.sin(time * 5 + f.ph) * 0.06)), ss.set(f.h, hh, f.h)); bod.setMatrixAt(i, mm);
        const fs = 1 + Math.sin(time * 13 + i) * 0.15 + talk * 0.35; mm.compose(pp.set(x, y + hh * 1.72, z), qq.setFromEuler(eu.set(Math.sin(time * 7 + i) * 0.1, 0, Math.sin(time * 6 + i) * 0.12)), ss.set(f.h * fs * 0.9, f.h * fs, f.h * fs * 0.9)); fl.setMatrixAt(i, mm);
        if (i === 0) { hat.position.set(x, y + hh * 1.5 + 0.02, z); hat.rotation.set(0, ry, 0); hat.scale.setScalar(f.h); } }
      bod.instanceMatrix.needsUpdate = fl.instanceMatrix.needsUpdate = true;
      // Gaufre
      if (dog.visible) { const N = dogPath.length; let tgt = null; const tr = ctx.train;
        if (tr && tr.head && Math.abs(tr.head.x - dogPath[N >> 1][0]) < 60 && tr.head.z > dogPath[0][1] - 80 && tr.head.z < dogPath[N - 1][1] + 80) { let bi = 0, bd = 1e9; for (let k2 = 0; k2 < N; k2 += 2) { const d = Math.abs(dogPath[k2][1] - tr.head.z); if (d < bd) { bd = d; bi = k2; } } tgt = bi; }
        let sp; if (tgt !== null) { const d = tgt - dogS.u; dogS.dir = Math.sign(d) || dogS.dir; sp = Math.min(Math.abs(d) * 2, 7.5); }
        else { if (dogS.u > N - 3) dogS.dir = -1; if (dogS.u < 2) dogS.dir = 1; sp = 1.4 + Math.sin(time * 0.3) * 0.6; }
        dogS.speed += (sp - dogS.speed) * Math.min(1, dt * 2); dogS.u = Math.max(0, Math.min(N - 1.001, dogS.u + dogS.dir * dogS.speed * dt / 2));
        const i0 = Math.floor(dogS.u), f = dogS.u - i0, a = dogPath[i0], b = dogPath[Math.min(N - 1, i0 + 1)], x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
        dog.position.set(x, terrain.heightAt(x, z), z); dog.rotation.y = Math.atan2((b[0] - a[0]) * dogS.dir, (b[1] - a[1]) * dogS.dir);
        const gait = time * (4 + dogS.speed * 2.2); legs.forEach((l, j) => { l.rotation.x = Math.sin(gait + (j === 0 || j === 3 ? 0 : PI)) * Math.min(0.7, 0.15 + dogS.speed * 0.12); });
        dog.children[0].position.y = Math.abs(Math.sin(gait)) * 0.04;
        const P = ctx.player; if (P && P.mode === 'foot' && P.pos.distanceTo(dog.position) < 3 && time - dogS.said > 12) { dogS.said = time; const n = lore.npcs[1]; try { ctx.ui.say([{ who: n.name, icon: '🐕', color: '#c8762a', text: n.lines[melt > 0.5 ? 1 : 0] }]); } catch (e) { /* */ } } }
      // étincelles / fumées (limitées par la distance)
      emitT += dt;
      if (emitT > 0.09) { emitT = 0;
        if (handInfo && camPos.distanceTo(palm) < 700) { const sp = ctx.sparks;
          cv.set(palm.x + (Math.random() - 0.5) * 9, palm.y, palm.z + (Math.random() - 0.5) * 9); cv2.set((Math.random() - 0.5) * 3, 6 + Math.random() * 8 * (0.4 + melt), (Math.random() - 0.5) * 3);
          sp?.emit(cv, cv2, { life: 1.6, size: 0.6, color: '#ffc24a' });
          if (Math.random() < 0.25) ctx.smoke?.emit(cv.set(palm.x, palm.y + 1, palm.z), cv2.set(0, 2.5, 0), { life: 5, size: 5, color: '#6a4a3a', alpha: 0.35 }); }
        if (riverPts.length && melt > 0.2) for (let t = 0; t < 2; t++) { const p = riverPts[(Math.random() * riverPts.length) | 0]; if (Math.hypot(p[0] - camPos.x, p[1] - camPos.z) > 260) continue;
          cv.set(p[0], terrain.heightAt(p[0], p[1]) + 0.3, p[1]); cv2.set((Math.random() - 0.5) * 1.5, 3 + Math.random() * 4, (Math.random() - 0.5) * 1.5); ctx.sparks?.emit(cv, cv2, { life: 1.1, size: 0.35, color: '#ff9a3c' }); }
        if (fountainPos && camPos.distanceTo(fountainPos) < 300 && Math.random() < 0.4) ctx.steam?.emit(cv.copy(fountainPos), cv2.set(0, 1.2, 0), { life: 3, size: 1.2, color: '#f0c890', alpha: 0.25 });
        if (lake && Math.random() < 0.2 * melt && Math.hypot(lake.x - camPos.x, lake.z - camPos.z) < 300) ctx.steam?.emit(cv.set(lake.x + (Math.random() - 0.5) * 8, terrain.heightAt(lake.x, lake.z) + 0.3, lake.z + (Math.random() - 0.5) * 8), cv2.set(0, 1, 0), { life: 3, size: 2, color: '#ffd9a0', alpha: 0.2 });
      }
      // plaques-fragments : halo quand on approche, lecture avec E
      const P = ctx.player; let nearP = null;
      if (P && P.pos) for (const q of plaques) { const d = Math.hypot(q.x - P.pos.x, q.z - P.pos.z); if (d < 8 && (!nearP || d < nearP.d)) nearP = { q, d }; }
      if (nearP) { ring.visible = true; ring.position.set(nearP.q.x, nearP.q.y + 0.1, nearP.q.z); ringM.opacity = (nearP.d < 3 ? 0.55 : 0.22) * (0.75 + 0.25 * Math.sin(time * 4)); ring.rotation.y = time * 0.5;
        if (nearP.d < 3 && P.mode === 'foot' && ctx.input?.ah('interact') && lastNear !== frame) { lastNear = frame; const f = nearP.q.frag;
          try { ctx.ui.say([{ who: f.title, icon: '✦', color: '#e9c46a', text: f.text }]); } catch (e) { /* */ }
          try { const S = ctx.S; if (S) { S.fragments = S.fragments || []; const id = 'fonderie:' + nearP.q.i; if (!S.fragments.includes(id)) S.fragments.push(id); } } catch (e) { /* */ } } }
      else ring.visible = false;
    },
  };
}
