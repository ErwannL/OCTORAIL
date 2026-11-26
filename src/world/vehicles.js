import * as THREE from 'three';
import { Kit, MAT, G, mat, glow } from './kit.js';

const PI = Math.PI, H = PI / 2;

// petit utilitaire : add(geo, matériau, position, rotation, échelle)
const adder = (k) => (geo, m, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => k.add(geo, m, { p, r, s });

// plaques gravées (canvas -> texture, mises en cache)
const plateCache = new Map();
function plateMat(key, w, h, draw) {
  if (!plateCache.has(key)) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    plateCache.set(key, new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0.5 }));
  }
  return plateCache.get(key);
}
function brassPlate(key, lines, w = 256, h = 96, bg = '#7d1a1a', fg = '#f2cf7a') {
  return plateMat(key, w, h, (x) => {
    x.fillStyle = '#c99a3c'; x.fillRect(0, 0, w, h); x.fillStyle = bg; x.fillRect(5, 5, w - 10, h - 10);
    x.strokeStyle = fg; x.lineWidth = 2; x.strokeRect(9, 9, w - 18, h - 18);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach(([t, sz, y]) => { x.font = `bold ${sz}px Georgia, serif`; x.fillText(t, w / 2, y); });
  });
}

// ------------------------------------------------------------------ Roues à rayons (axe X)
const wheelCache = new Map();
export function wheel(r = 0.75, { spokes = 12, paint = '#9c1f1f', counter = true } = {}) {
  const key = r + paint + spokes + counter;
  if (!wheelCache.has(key)) {
    const k = new Kit(), add = adder(k), red = mat(paint, { roughness: 0.45, metalness: 0.2 }), steel = MAT.steel(), brass = MAT.brass();
    add(G.tor(r * 0.9, r * 0.09, 8, 32), red, [0, 0, 0], [0, H, 0]);
    add(G.cyl(r, r, 0.16, 32), steel, [0, 0, 0], [0, 0, H]);                                   // bandage
    add(G.cyl(r * 1.06, r * 1.06, 0.05, 32), steel, [-0.08, 0, 0], [0, 0, H]);                  // boudin
    add(G.cyl(r * 0.22, r * 0.22, 0.24, 16), red, [0, 0, 0], [0, 0, H]);
    add(G.cyl(r * 0.12, r * 0.12, 0.3, 12), brass, [0, 0, 0], [0, 0, H]);
    add(G.tor(r * 0.2, r * 0.025, 4, 12), brass, [0.13, 0, 0], [0, H, 0]);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * PI * 2;
      add(G.box(0.06, r * 0.75, r * 0.07), red, [0, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5], [a, 0, 0]);
    }
    if (r > 0.6) for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2 + 0.2; add(G.sph(r * 0.035, 4, 3), brass, [0.1, Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82]); } // rivets
    if (counter) add(G.cyl(r * 0.6, r * 0.6, 0.08, 16, false), red, [0, r * 0.45, 0], [0, 0, H], [1, 1, 0.45]);
    wheelCache.set(key, k);
  }
  return wheelCache.get(key).build();
}

// ------------------------------------------------------------------ Locomotive à vapeur « Vieille-Bouilloire »
export function buildSteamLoco(tint = '#8b1e1e') {
  const g = new THREE.Group();
  const k = new Kit(), add = adder(k);
  const body = mat(tint, { roughness: 0.42, metalness: 0.25 });
  const black = MAT.iron(), steel = MAT.steel(), brass = MAT.brass(), red = MAT.red(), wood = MAT.woodDark(), copper = MAT.copper();
  const cream = mat('#ecd9a6', { roughness: 0.5 }), sootBlack = mat('#101114', { roughness: 0.8, metalness: 0.3 });
  const green = mat('#2f5a3f', { roughness: 0.5, metalness: 0.2 });
  const lampAmber = glow('#ffb347', 2.4), lampRed = glow('#ff3a2a', 2.2);
  const rivet = G.sph(0.03, 4, 3);
  const ring = (z, R, n, y0, m = brass, a0 = 0) => { for (let i = 0; i < n; i++) { const a = a0 + i / n * PI * 2; add(rivet, m, [Math.sin(a) * R, y0 + Math.cos(a) * R, z]); } };

  // ---- châssis, longerons, traverses
  add(G.rbox(2.1, 0.36, 8.6, 0.05), black, [0, 1.0, 0.2]);
  for (const s of [-1, 1]) { add(G.box(0.08, 0.34, 8.4), steel, [s * 1.07, 1.0, 0.2]); add(G.box(0.04, 0.04, 8.4), brass, [s * 1.1, 1.17, 0.2]); }
  add(G.rbox(2.7, 0.55, 0.28, 0.05), red, [0, 1.05, 4.45]);                       // traverse de tête
  add(G.rbox(2.7, 0.45, 0.26, 0.05), red, [0, 1.0, -4.0]);                        // traverse arrière
  add(G.box(2.5, 0.05, 0.05), cream, [0, 1.2, 4.6]);                              // liseré crème
  for (let i = -5; i <= 5; i++) add(rivet, brass, [i * 0.23, 1.2, 4.6]);
  for (const x of [-0.85, 0.85]) {                                                 // tampons
    add(G.cyl(0.13, 0.13, 0.4, 12), steel, [x, 1.05, 4.75], [H, 0, 0]);
    add(G.cyl(0.24, 0.24, 0.06, 18), steel, [x, 1.05, 4.96], [H, 0, 0]);
    add(G.cyl(0.1, 0.1, 0.4, 12), steel, [x, 1.0, -4.2], [H, 0, 0]);
    add(G.cyl(0.21, 0.21, 0.06, 18), steel, [x, 1.0, -4.42], [H, 0, 0]);
  }
  // attelage avant et arrière : crochet + maillon
  add(G.box(0.14, 0.14, 0.5), steel, [0, 0.95, 4.82]); add(G.tor(0.13, 0.03, 5, 12), steel, [0, 0.95, 5.1], [0, H, 0]);
  add(G.box(0.14, 0.14, 0.5), steel, [0, 0.95, -4.2]);

  // ---- chasse-pierres (cow-catcher en lattes)
  for (const s of [-1, 1]) add(G.box(0.07, 0.5, 0.75), red, [s * 1.1, 0.78, 4.78]);
  add(G.box(2.2, 0.05, 1.3), red, [0, 0.66, 5.0], [-0.62, 0, 0]);                  // plan incliné
  for (let i = -4; i <= 4; i++) add(G.box(0.07, 0.05, 1.3), black, [i * 0.25, 0.7, 5.0], [-0.62, 0, 0]);
  for (const t of [0.2, 0.55, 0.9]) add(G.box(2.2, 0.06, 0.06), black, [0, 0.95 - 0.5 * t, 4.55 + 0.7 * t]);

  // ---- chaudière effilée avec viroles
  const boiler = [[1.04, 0], [1.04, 0.3], [1.0, 0.3], [1.0, 1.5], [0.98, 1.5], [0.98, 3.0], [0.96, 3.0], [0.96, 4.6]];
  add(G.lathe(boiler, 40), body, [0, 2.25, -1.3], [H, 0, 0]);
  for (const z of [-0.9, 0.3, 1.5, 2.7]) { add(G.tor(1.015, 0.045, 6, 32), brass, [0, 2.25, z]); add(G.tor(1.0, 0.018, 4, 32), cream, [0, 2.25, z + 0.11]); add(G.tor(1.0, 0.018, 4, 32), cream, [0, 2.25, z - 0.11]); }
  add(G.tor(1.045, 0.04, 6, 32), brass, [0, 2.25, -1.28]);
  ring(-1.3, 1.06, 28, 2.25); ring(0.3, 1.04, 22, 2.25, brass, 0.1); ring(2.7, 1.0, 22, 2.25, brass, 0.1);
  // boîte à fumée + porte
  add(G.cyl(1.06, 1.06, 0.95, 32), sootBlack, [0, 2.25, 3.65], [H, 0, 0]);
  add(G.tor(1.065, 0.035, 6, 32), steel, [0, 2.25, 3.2]); add(G.tor(1.065, 0.035, 6, 32), steel, [0, 2.25, 4.12]);
  ring(4.1, 1.0, 24, 2.25, steel);
  add(G.lathe([[0, 0.18], [0.5, 0.15], [0.92, 0.05], [1.02, 0]], 32), black, [0, 2.25, 4.12], [H, 0, 0]);
  add(G.tor(0.34, 0.03, 6, 24), brass, [0, 2.25, 4.31]);
  add(G.cyl(0.3, 0.3, 0.05, 24), brass, [0, 2.25, 4.3], [H, 0, 0]);
  add(G.tor(0.17, 0.022, 4, 16), black, [0, 2.25, 4.35]);                                    // volant de porte
  for (let i = 0; i < 3; i++) add(G.box(0.34, 0.025, 0.03), black, [0, 2.25, 4.35], [0, 0, i * PI / 3]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; add(G.box(0.07, 0.07, 0.06), steel, [Math.sin(a) * 0.78, 2.25 + Math.cos(a) * 0.78, 4.28]); } // verrous
  add(G.box(1.8, 0.07, 0.06), black, [0, 2.6, 4.27]); add(G.box(1.8, 0.07, 0.06), black, [0, 1.9, 4.27]); // charnières
  add(G.box(0.55, 0.3, 0.05), mat('#ecd9a6', { roughness: 0.4, metalness: 0.4 }), [0, 1.62, 4.2]);        // petite plaque basse

  // ---- cheminée diamant avec pare-étincelles
  add(G.lathe([[0.3, 0], [0.3, 0.7], [0.36, 0.9], [0.72, 1.45], [0.78, 1.62], [0.6, 1.7], [0.5, 1.68], [0.5, 1.3], [0, 1.3]], 28), black, [0, 3.1, 3.6]);
  add(G.tor(0.75, 0.04, 6, 28), brass, [0, 4.72, 3.6], [H, 0, 0]);
  add(G.tor(0.34, 0.035, 5, 16), brass, [0, 3.4, 3.6], [H, 0, 0]);
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; add(G.box(0.02, 0.4, 0.02), brass, [Math.sin(a) * 0.62, 4.5, 3.6 + Math.cos(a) * 0.62], [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5]); }

  // ---- dômes : vapeur (laiton), sable (rouge), cloche, soupapes
  add(G.lathe([[0.58, 0], [0.55, 0.06], [0.5, 0.25], [0.42, 0.5], [0.3, 0.62], [0, 0.66]], 28), brass, [0, 3.1, 1.2]);
  add(G.tor(0.56, 0.035, 5, 24), copper, [0, 3.15, 1.2], [H, 0, 0]);
  add(G.cyl(0.03, 0.03, 0.2, 6), brass, [0, 3.85, 1.2]); add(G.sph(0.06, 8, 6), brass, [0, 3.97, 1.2]);
  add(G.lathe([[0.5, 0], [0.48, 0.05], [0.42, 0.25], [0.32, 0.42], [0, 0.46]], 24), body, [0, 3.08, 2.4]);
  add(G.tor(0.48, 0.03, 5, 24), brass, [0, 3.15, 2.4], [H, 0, 0]); add(G.sph(0.07, 8, 6), brass, [0, 3.56, 2.4]);
  // cloche sur chevalet
  for (const s of [-1, 1]) add(G.box(0.05, 0.4, 0.05), black, [s * 0.2, 3.4, 0.1], [0, 0, -s * 0.12]);
  add(G.box(0.5, 0.05, 0.06), black, [0, 3.6, 0.1]);
  add(G.lathe([[0.22, 0], [0.18, 0.08], [0.12, 0.3], [0.04, 0.36], [0, 0.4]], 16), brass, [0, 3.28, 0.1], [PI, 0, 0], [1, 1, 1]);
  add(G.sph(0.045, 6, 5), brass, [0, 3.42, 0.1]);
  // soupapes de sûreté + sifflet
  for (const z of [-0.45, -0.2]) { add(G.cyl(0.07, 0.09, 0.2, 10), brass, [0, 3.3, z]); add(G.sph(0.08, 8, 6), brass, [0, 3.44, z]); }
  add(G.cyl(0.05, 0.05, 0.4, 8), brass, [0.4, 3.35, -1.0]); add(G.cyl(0.09, 0.07, 0.24, 10), brass, [0.4, 3.58, -1.0]); add(G.sph(0.04, 6, 5), brass, [0.4, 3.72, -1.0]);
  add(G.cyl(0.015, 0.015, 0.25, 4), brass, [0.4, 3.5, -0.86], [0.4, 0, 0]);

  // ---- phare à réflecteur
  add(G.rbox(0.62, 0.62, 0.62, 0.06), black, [0, 3.55, 4.0]);
  add(G.box(0.7, 0.06, 0.7), brass, [0, 3.89, 4.0]);
  add(G.cone(0.08, 0.25, 8), black, [0, 4.0, 4.0]); add(G.sph(0.06, 6, 5), brass, [0, 4.15, 4.0]);
  add(G.cyl(0.22, 0.26, 0.2, 18), brass, [0, 3.55, 4.36], [H, 0, 0]);
  add(G.tor(0.26, 0.035, 5, 20), brass, [0, 3.55, 4.43]);
  add(G.box(0.8, 0.05, 0.06), black, [0, 3.2, 3.95]); add(G.cyl(0.04, 0.04, 0.2, 6), brass, [0, 3.28, 3.7]);     // support
  for (const s of [-1, 1]) { add(G.rbox(0.16, 0.22, 0.16, 0.03), black, [s * 1.0, 2.95, 3.95]); add(G.box(0.18, 0.04, 0.18), brass, [s * 1.0, 3.08, 3.95]); } // veilleuses
  add(G.rbox(0.14, 0.18, 0.14, 0.03), black, [0, 1.12, 5.05]);

  // ---- cylindres, glissières, distribution
  for (const s of [-1, 1]) {
    add(G.cyl(0.34, 0.34, 1.2, 20), black, [s * 1.18, 1.18, 3.3], [H, 0, 0]);
    add(G.cyl(0.36, 0.36, 0.08, 20), brass, [s * 1.18, 1.18, 3.92], [H, 0, 0]);
    add(G.cyl(0.36, 0.36, 0.08, 20), brass, [s * 1.18, 1.18, 2.68], [H, 0, 0]);
    add(G.cyl(0.2, 0.2, 0.9, 14), black, [s * 1.18, 1.62, 3.3], [H, 0, 0]);                   // boîte à tiroir
    add(G.cyl(0.21, 0.21, 0.05, 14), brass, [s * 1.18, 1.62, 3.78], [H, 0, 0]); add(G.cyl(0.21, 0.21, 0.05, 14), brass, [s * 1.18, 1.62, 2.82], [H, 0, 0]);
    add(G.box(0.12, 0.12, 1.6), steel, [s * 1.18, 1.18, 2.0]);                             // glissière
    add(G.box(0.12, 0.06, 1.5), steel, [s * 1.18, 1.36, 2.0]);
    for (const z of [3.0, 3.6]) add(G.cyl(0.025, 0.025, 0.2, 5), brass, [s * 1.18, 0.82, z]);   // purgeurs
    add(G.cyl(0.035, 0.035, 0.7, 6), steel, [s * 1.2, 1.4, 1.4], [0.5, 0, 0]);               // bielle de relevage
    add(G.box(0.05, 0.5, 0.05), steel, [s * 1.21, 1.2, 0.75], [0, 0, 0.25]);                  // tringle d'excentrique
    // tablier + rebord crénelé
    add(G.box(0.5, 0.06, 5.2), black, [s * 1.3, 1.5, 1.2]);
    add(G.box(0.05, 0.12, 5.2), red, [s * 1.54, 1.5, 1.2]); add(G.box(0.02, 0.04, 5.2), cream, [s * 1.565, 1.52, 1.2]);
    for (let i = 0; i < 16; i++) add(G.box(0.46, 0.015, 0.035), steel, [s * 1.3, 1.535, -1.2 + i * 0.32]);
    // garde-corps de tablier
    add(G.cyl(0.028, 0.028, 4.1, 6), brass, [s * 1.2, 2.72, 1.55], [H, 0, 0]);
    for (const z of [-0.3, 1.2, 2.7, 3.55]) { add(G.cyl(0.02, 0.02, 1.25, 6), brass, [s * 1.2, 2.1, z]); add(G.sph(0.04, 6, 5), brass, [s * 1.2, 2.74, z]); }
    // main courante sur chaudière
    add(G.cyl(0.03, 0.03, 4.6, 6), brass, [s * 0.9, 3.02, 1.0], [H, 0, 0]);
    for (const z of [-0.8, 0.8, 2.4]) add(G.cyl(0.02, 0.02, 0.2, 6), brass, [s * 0.95, 2.93, z], [0, 0, s * 0.7]);
    // tuyau d'injecteur
    add(G.tube([[s * 0.9, 1.7, -1.3], [s * 1.05, 1.9, 0], [s * 1.02, 1.6, 1.6], [s * 0.7, 1.35, 2.8]], 0.05, 24, 6), copper);
    // sablière : tuyaux de descente vers les roues
    add(G.tube([[s * 0.5, 3.15, 2.4], [s * 0.98, 2.5, 2.4], [s * 1.13, 1.62, 2.35], [s * 1.1, 0.95, 2.1], [s * 1.08, 0.5, 2.06]], 0.032, 22, 5), brass);
    // plaques nominatives de chaudière
    // marchepieds : cabine + avant
    add(G.box(0.4, 0.05, 0.4), steel, [s * 1.25, 0.6, -3.2]); add(G.box(0.05, 0.6, 0.05), steel, [s * 1.25, 0.9, -3.0]);
    add(G.box(0.36, 0.05, 0.4), steel, [s * 1.25, 0.92, -3.2]);
    add(G.box(0.4, 0.05, 0.5), steel, [s * 1.35, 0.95, 3.9]);                                 // marche avant
    // lanternes de tampon
    add(G.rbox(0.2, 0.26, 0.2, 0.04), black, [s * 0.52, 1.5, 4.7]); add(G.box(0.22, 0.04, 0.22), brass, [s * 0.52, 1.65, 4.7]);
    add(G.box(0.14, 0.18, 0.02), s > 0 ? lampAmber : lampRed, [s * 0.52, 1.5, 4.81]);
    // réservoirs d'air + pompe à air
    add(G.cyl(0.18, 0.18, 1.4, 14), green, [s * 0.98, 1.38, -0.55], [H, 0, 0]);
    for (const z of [-1.0, -0.1]) add(G.tor(0.185, 0.02, 4, 14), brass, [s * 0.98, 1.38, z]);
  }
  // pompe à air (côté droit) devant la cabine
  add(G.cyl(0.14, 0.14, 0.55, 12), black, [-1.1, 1.85, 0.2]); add(G.cyl(0.1, 0.14, 0.12, 12), brass, [-1.1, 2.17, 0.2]);

  // ---- cabine
  const cz = -2.45, cw = 2.6, ch = 2.5, cy = 1.2;
  add(G.box(cw, ch, 0.12), body, [0, cy + ch / 2, cz + 1.15]);               // façade
  add(G.box(cw - 0.2, 0.06, 0.14), cream, [0, cy + 0.9, cz + 1.17]);
  for (const x of [-0.65, 0.65]) { add(G.tor(0.26, 0.05, 6, 20), brass, [x, cy + 1.75, cz + 1.22]); add(G.cyl(0.25, 0.25, 0.02, 20), MAT.glass(), [x, cy + 1.75, cz + 1.22], [H, 0, 0]); ring(cz + 1.24, 0, 0, 0); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; add(rivet, brass, [x + Math.sin(a) * 0.33, cy + 1.75 + Math.cos(a) * 0.33, cz + 1.22]); } }
  add(G.box(cw + 0.1, 0.1, 0.18), black, [0, cy + 0.05, cz + 1.15]);        // soubassement
  for (const s of [-1, 1]) {
    const x = s * (cw / 2 - 0.06);
    add(G.box(0.12, 1.2, 2.4), body, [x, cy + 0.6, cz]);                      // bas
    add(G.box(0.12, 0.35, 2.4), body, [x, cy + ch - 0.18, cz]);               // linteau
    add(G.box(0.12, ch - 1.55, 0.35), body, [x, cy + 1.48 + (ch - 1.55) / 2 - 0.25, cz + 1.0]);
    add(G.box(0.12, ch - 1.55, 0.25), body, [x, cy + 1.48 + (ch - 1.55) / 2 - 0.25, cz - 1.1]);
    add(G.box(0.14, 0.05, 2.4), brass, [x, cy + 1.2, cz]);
    add(G.box(0.14, 0.04, 2.4), cream, [x, cy + 0.12, cz]);                   // liseré bas
    add(G.box(0.14, 0.04, 0.4), cream, [x, cy + 0.9, cz]);
    // cadre de baie
    add(G.box(0.16, 0.05, 1.5), brass, [x, cy + 1.5, cz]);
    add(G.box(0.16, 0.05, 1.5), brass, [x, cy + 2.15, cz]);
    // rails de pavillon + volets
    add(G.box(0.05, 0.6, 0.04), wood, [x + s * 0.08, cy + 1.82, cz + 0.62], [0, 0, 0]);
    // plaque n° (texture)
    const pm = brassPlate('num7', [['N°', 32, 28], ['07', 46, 68]], 128, 128, '#7d1a1a');
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), pm); pl.position.set(x + s * 0.075, cy + 0.6, cz - 0.0); pl.rotation.y = s * H; pl.userData.plate = true; g.add(pl);
    add(G.rbox(0.05, 0.78, 0.78, 0.03), brass, [x + s * 0.045, cy + 0.6, cz]);
    // poignée de porte + garde-corps d'accès
    add(G.cyl(0.025, 0.025, 1.4, 6), brass, [x + s * 0.12, cy + 0.9, cz + 1.2]); add(G.cyl(0.025, 0.025, 1.4, 6), brass, [x + s * 0.12, cy + 0.9, cz - 1.2]);
    add(G.cyl(0.02, 0.02, 0.6, 5), steel, [x + s * 0.1, cy + 1.2, cz - 1.45], [0, H, 0]);
    // lanterne de cabine
    add(G.rbox(0.18, 0.22, 0.18, 0.03), black, [x + s * 0.15, cy + 2.1, cz + 1.3]); add(G.box(0.12, 0.14, 0.02), lampAmber, [x + s * 0.15, cy + 2.1, cz + 1.4]);
  }
  // plafond, plancher, intérieur
  add(G.box(2.45, 0.05, 2.5), wood, [0, 1.23, cz - 0.08]);
  for (let i = 0; i < 7; i++) add(G.box(2.45, 0.012, 0.02), black, [0, 1.26, cz - 1.2 + i * 0.36]);
  add(G.box(2.2, 1.6, 0.1), black, [0, 2.2, cz + 1.05]);                      // plaque de façade du foyer
  add(G.rbox(0.9, 0.7, 0.12, 0.04), brass, [0, 1.85, cz + 0.98]);
  add(G.tor(0.34, 0.04, 6, 20, PI), copper, [0, 1.85, cz + 0.92], [0, 0, 0]); add(G.box(0.8, 0.05, 0.07), copper, [0, 1.52, cz + 0.9]);
  add(G.box(0.94, 0.06, 0.07), steel, [0, 1.52, cz + 0.88]);
  add(G.cyl(0.03, 0.03, 0.6, 6), steel, [0.4, 1.65, cz + 0.88], [0, 0, 0]);
  for (const [x, y] of [[-0.55, 2.7], [0.55, 2.7], [0, 2.85]]) { add(G.cyl(0.17, 0.17, 0.08, 18), brass, [x, y, cz + 0.97], [H, 0, 0]); add(G.cyl(0.14, 0.14, 0.09, 18), mat('#f6ecd2'), [x, y, cz + 0.96], [H, 0, 0]); add(G.box(0.02, 0.11, 0.02), red, [x + 0.03, y + 0.03, cz + 0.91], [0, 0, -0.6]); }
  add(G.cyl(0.04, 0.04, 0.5, 8), glow('#9fe0ff', 1.0), [-1.0, 2.2, cz + 0.98]); add(G.tor(0.05, 0.015, 4, 8), brass, [-1.0, 2.46, cz + 0.98]); add(G.tor(0.05, 0.015, 4, 8), brass, [-1.0, 1.96, cz + 0.98]); // niveau d'eau
  add(G.box(0.06, 0.06, 0.7), brass, [0.4, 2.4, cz + 0.6], [0.5, 0, 0]); add(G.sph(0.07, 8, 6), red, [0.4, 2.55, cz + 0.3]);   // régulateur
  add(G.box(0.05, 0.05, 0.6), steel, [-0.3, 2.3, cz + 0.7], [0.9, 0, 0]); add(G.sph(0.05, 6, 5), black, [-0.3, 2.5, cz + 0.45]);  // inverseur
  add(G.cyl(0.02, 0.02, 0.5, 5), copper, [0.9, 2.4, cz + 0.85], [0, 0, 0]);
  for (const x of [-0.85, 0.85]) { add(G.rbox(0.5, 0.12, 0.5, 0.04), mat('#5a3a1e'), [x, 2.0, cz - 0.6]); add(G.box(0.08, 0.7, 0.08), black, [x, 1.6, cz - 0.6]); add(G.rbox(0.5, 0.5, 0.06, 0.03), mat('#5a3a1e'), [x, 2.25, cz - 0.85]); }
  add(G.cyl(0.03, 0.03, 1.1, 6), wood, [-0.6, 1.9, cz + 0.2], [0.4, 0, 0.3]); add(G.box(0.3, 0.03, 0.35), steel, [-0.75, 1.42, cz + 0.55], [0.4, 0, 0.3]);  // pelle
  add(G.cyl(0.05, 0.05, 0.5, 8), steel, [0.9, 1.5, cz + 0.4], [0, 0, 0]);                       // seau
  // montants arrière + corniche
  for (const s of [-1, 1]) { add(G.box(0.1, ch - 0.1, 0.1), body, [s * 1.2, cy + ch / 2, cz - 1.17]); }
  add(G.box(cw - 0.1, 0.1, 0.1), body, [0, cy + ch - 0.1, cz - 1.17]);
  g.add(k.build());
  // toit bombé (arc) avec débord
  const rk = new Kit(), radd = adder(rk), roofMat = mat('#1a1b1e', { metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide });
  radd(new THREE.CylinderGeometry(1.75, 1.75, 3.0, 24, 1, true, PI - 0.85, 1.7), roofMat, [0, cy + ch + 0.15 - 1.75, cz], [H, 0, 0]);
  radd(new THREE.CylinderGeometry(1.76, 1.76, 0.1, 24, 1, true, PI - 0.85, 1.7), brass, [0, cy + ch + 0.15 - 1.75, cz + 1.52], [H, 0, 0]);
  radd(new THREE.CylinderGeometry(1.76, 1.76, 0.1, 24, 1, true, PI - 0.85, 1.7), brass, [0, cy + ch + 0.15 - 1.75, cz - 1.52], [H, 0, 0]);
    radd(G.cyl(0.1, 0.12, 0.35, 10), black, [0.7, cy + ch + 0.2, cz - 0.7]); radd(G.cyl(0.14, 0.1, 0.06, 10), brass, [0.7, cy + ch + 0.4, cz - 0.7]);
  radd(G.cyl(0.02, 0.02, 0.7, 5), brass, [-0.7, cy + ch + 0.32, cz + 0.3]); radd(G.sph(0.05, 6, 5), glow('#ff6a3a', 3), [-0.7, cy + ch + 0.68, cz + 0.3]);
  const roof = rk.build(); roof.children.forEach(m => { m.castShadow = true; }); g.add(roof);

  // plaque nominative de chaudière
  const npm = brassPlate('nameplate', [['VIEILLE-', 40, 34], ['BOUILLOIRE', 38, 72]], 256, 108, '#2d5a3a');
  for (const sd of [-1, 1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), npm); pl.position.set(sd * 1.0, 2.1, 1.0); pl.rotation.y = sd * H; pl.rotation.x = 0; pl.rotation.z = sd * 0.0; g.add(pl); }
  // foyer lumineux
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), glow('#ff5a00', 3)); fire.position.set(0, 1.85, cz + 1.08); fire.rotation.y = PI; g.add(fire);
  g.userData.firebox = fire;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18), glow('#ffe7b0', 5)); lens.position.set(0, 3.55, 4.47); g.add(lens);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.5, 26, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.035, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide }));
  beam.rotation.x = -H; beam.position.set(0, 3.0, 4.5 + 13); g.add(beam);
  g.userData.beam = beam;

  // roues
  const wheels = [];
  for (const [z, r] of [[3.1, 0.48], [1.25, 0.78], [-0.4, 0.78], [-2.05, 0.78]]) for (const s of [-1, 1]) {
    const w = wheel(r, { spokes: r > 0.6 ? 14 : 8, counter: r > 0.6 }); w.position.set(s * 0.95, r, z); g.add(w); wheels.push(w);
  }
  // bielles (animées) : conservent leur position de base lue par train.js
  const rods = [];
  const rodMat = MAT.steel();
  for (const s of [-1, 1]) {
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 3.4), rodMat); rod.position.set(s * 1.1, 0.78, -0.4); rod.castShadow = true; g.add(rod); rods.push(rod);
    const main = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 2.2), rodMat); main.position.set(s * 1.16, 0.95, 1.95); main.castShadow = true; g.add(main); rods.push(main);
  }
  g.userData.rods = rods;
  g.userData.wheels = wheels;
  g.userData.chimney = new THREE.Vector3(0, 4.85, 3.6);
  g.userData.whistle = new THREE.Vector3(0.4, 3.6, -1.0);
  g.userData.cab = new THREE.Vector3(0, 1.45, cz);
  g.userData.length = 9.4;
  g.traverse(o => { if (o.isMesh) o.castShadow = !o.material.transparent; });
  return g;
}

// ------------------------------------------------------------------ Draisine à bras
export function buildDraisine() {
  const g = new THREE.Group(), k = new Kit(), add = adder(k);
  const wood = MAT.wood(), woodD = MAT.woodDark(), dark = MAT.iron(), brass = MAT.brass(), steel = MAT.steel(), red = MAT.red(), cream = mat('#ecd9a6', { roughness: 0.5 });
  add(G.rbox(1.9, 0.18, 3.4, 0.04), dark, [0, 0.78, 0]);
  for (const s of [-1, 1]) add(G.box(0.08, 0.3, 3.4), steel, [s * 0.95, 0.72, 0]);
  for (let i = 0; i < 7; i++) add(G.rbox(2.3, 0.1, 0.42, 0.03), i % 2 ? wood : mat('#8a5a32', { roughness: 0.85 }), [0, 0.92, -1.45 + i * 0.48]);
  for (const z of [-1.75, 1.75]) { add(G.rbox(2.4, 0.25, 0.18, 0.03), red, [0, 0.8, z]); add(G.box(2.3, 0.04, 0.04), cream, [0, 0.9, z + Math.sign(z) * 0.1]); for (const x of [-0.8, 0.8]) { add(G.cyl(0.09, 0.09, 0.3, 10), steel, [x, 0.8, z + Math.sign(z) * 0.2], [H, 0, 0]); add(G.cyl(0.17, 0.17, 0.05, 14), steel, [x, 0.8, z + Math.sign(z) * 0.36], [H, 0, 0]); } }
  add(G.box(0.12, 0.12, 0.45), steel, [0, 0.8, 1.98]); add(G.tor(0.1, 0.025, 5, 10), steel, [0, 0.8, 2.25], [0, H, 0]);
  // chevalet de pompe : deux portiques en A + axe
  for (const z of [-0.25, 0.25]) for (const s of [-1, 1]) add(G.box(0.1, 1.3, 0.1), dark, [s * 0.18, 1.5, z], [0, 0, -s * 0.18]);
  for (const z of [-0.25, 0.25]) add(G.box(0.5, 0.06, 0.08), dark, [0, 1.25, z]);
  add(G.cyl(0.07, 0.07, 0.7, 10), brass, [0, 2.12, 0], [H, 0, 0]);
  for (const z of [-0.36, 0.36]) add(G.tor(0.09, 0.02, 4, 10), brass, [0, 2.12, z]);
  // garde-corps
  for (const s of [-1, 1]) { add(G.cyl(0.03, 0.03, 3.0, 6), brass, [s * 1.1, 1.45, 0], [H, 0, 0]); for (const z of [-1.4, 0, 1.4]) { add(G.cyl(0.03, 0.03, 0.5, 6), brass, [s * 1.1, 1.2, z]); add(G.sph(0.05, 6, 5), brass, [s * 1.1, 1.46, z]); } add(G.cyl(0.02, 0.02, 3.0, 6), brass, [s * 1.1, 1.0, 0], [H, 0, 0]); }
  // caisse à outils + lampe + banc
  add(G.rbox(0.5, 0.35, 0.5, 0.04), dark, [0, 1.15, 1.6]); add(G.box(0.52, 0.04, 0.52), brass, [0, 1.34, 1.6]);
  add(G.rbox(0.7, 0.3, 0.4, 0.05), woodD, [0.55, 1.12, -1.4]); add(G.box(0.72, 0.04, 0.42), steel, [0.55, 1.28, -1.4]); add(G.box(0.2, 0.08, 0.04), brass, [0.55, 1.15, -1.2]);
  add(G.cyl(0.03, 0.03, 0.9, 6), dark, [-0.75, 1.5, 1.55]); add(G.rbox(0.22, 0.26, 0.22, 0.04), dark, [-0.75, 2.0, 1.55]); add(G.box(0.26, 0.04, 0.26), brass, [-0.75, 2.15, 1.55]); // lampadaire
  // frein à levier : sabots
  for (const s of [-1, 1]) { add(G.box(0.05, 0.05, 0.6), dark, [s * 0.58, 0.9, 1.0]); add(G.box(0.06, 0.22, 0.28), woodD, [s * 0.66, 0.5, 1.2]); }
  add(G.cyl(0.03, 0.03, 0.9, 6), brass, [0.6, 1.3, 0.8], [0.5, 0, 0]); add(G.sph(0.06, 6, 5), red, [0.6, 1.72, 0.6]);
  // petit fanion
  add(G.cyl(0.015, 0.015, 1.0, 5), steel, [0.95, 1.9, -1.55]); add(G.box(0.02, 0.22, 0.34), red, [0.95, 2.28, -1.7]);
  g.add(k.build());
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), glow('#ffd27a', 4)); lamp.position.set(-0.75, 2.0, 1.67); g.add(lamp);
  const lamp2 = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), glow('#ffd27a', 3)); lamp2.position.set(0, 1.15, 1.86); g.add(lamp2);
  // balancier (pivot animé)
  const lever = new THREE.Group(); lever.position.set(0, 2.12, 0);
  const lk = new Kit(), ladd = adder(lk);
  ladd(G.rbox(0.12, 0.12, 2.6, 0.03), wood);
  ladd(G.box(0.16, 0.16, 0.3), brass);
  for (const z of [-1.0, 1.0]) ladd(G.box(0.14, 0.05, 0.12), dark, [0, 0.09, z]);
  for (const z of [-1.25, 1.25]) {
    ladd(G.cyl(0.05, 0.05, 1.3, 8), brass, [0, 0, z], [0, 0, H]);
    for (const x of [-0.5, 0.5]) ladd(G.cyl(0.075, 0.075, 0.4, 10), woodD, [x, 0, z], [0, 0, H]);   // poignées en bois
    for (const x of [-0.7, 0.7]) ladd(G.sph(0.08, 8, 6), red, [x, 0, z]);
    ladd(G.box(0.06, 0.1, 0.06), dark, [0, 0.07, z]);
  }
  lever.add(lk.build());
  g.add(lever); g.userData.lever = lever;
  const wheels = [];
  for (const z of [-1.2, 1.2]) for (const s of [-1, 1]) { const w = wheel(0.42, { spokes: 8, counter: false, paint: '#3a3a3a' }); w.position.set(s * 0.75, 0.42, z); g.add(w); wheels.push(w); }
  g.userData.wheels = wheels; g.userData.cab = new THREE.Vector3(0, 1.0, -0.9); g.userData.length = 3.8;
  g.traverse(o => { if (o.isMesh) o.castShadow = !o.material.transparent; });
  return g;
}

// ------------------------------------------------------------------ Wagons
function bogies(k, len) {
  const add = adder(k), iron = MAT.iron(), steel = MAT.steel(), brass = MAT.brass();
  for (const z of [-len / 2 + 1.2, len / 2 - 1.2]) {
    add(G.rbox(1.9, 0.35, 1.9, 0.05), iron, [0, 0.55, z]);
    for (const s of [-1, 1]) {
      add(G.box(0.08, 0.3, 1.6), steel, [s * 0.96, 0.5, z]);
      add(G.box(0.1, 0.1, 1.2), steel, [s * 0.88, 0.78, z]);                                // ressort à lames
      for (let i = 0; i < 3; i++) add(G.box(0.08, 0.025, 1.2 - i * 0.28), steel, [s * 0.88, 0.72 - i * 0.03, z]);
      for (const dz of [-0.45, 0.45]) { add(G.rbox(0.18, 0.28, 0.2, 0.03), iron, [s * 1.0, 0.45, z + dz]); add(G.cyl(0.05, 0.05, 0.02, 8), brass, [s * 1.11, 0.45, z + dz], [0, 0, H]); } // boîtes d'essieu
      add(G.box(0.05, 0.14, 0.34), mat('#3a2418', { roughness: 0.9 }), [s * 0.62, 0.5, z + 0.62]);   // sabot de frein
    }
    add(G.cyl(0.2, 0.2, 0.08, 14), steel, [0, 0.76, z]);                                      // pivot
  }
}
function underframe(k, len, color) {
  const add = adder(k), steel = MAT.steel(), iron = MAT.iron(), brass = MAT.brass();
  add(G.rbox(2.3, 0.3, len, 0.04), iron, [0, 0.95, 0]);
  for (const s of [-1, 1]) add(G.box(0.07, 0.3, len + 0.2), steel, [s * 1.14, 0.95, 0]);
  // tirants (bielles de renfort sous caisse)
  for (const s of [-1, 1]) add(G.cyl(0.025, 0.025, len - 1.2, 5), steel, [s * 0.5, 0.74, 0], [H, 0, 0]);
  add(G.cyl(0.14, 0.14, 0.8, 12), mat('#4a3a28', { metalness: 0.5 }), [0.5, 0.72, 0.2], [0, 0, H]);     // cylindre de frein
  for (const z of [-len / 2 - 0.2, len / 2 + 0.2]) {
    add(G.box(0.25, 0.25, 0.5), steel, [0, 0.95, z]);
    add(G.tor(0.13, 0.03, 5, 12), steel, [0, 0.95, z + Math.sign(z) * 0.35], [0, H, 0]);
    add(G.cyl(0.035, 0.035, 0.3, 5), brass, [0.35, 1.0, z + Math.sign(z) * 0.1], [0, H, 0]);          // tuyau de frein
    for (const x of [-0.8, 0.8]) { add(G.cyl(0.1, 0.1, 0.35, 10), steel, [x, 0.95, z + Math.sign(z) * 0.1], [H, 0, 0]); add(G.cyl(0.2, 0.2, 0.05, 14), steel, [x, 0.95, z + Math.sign(z) * 0.3], [H, 0, 0]); }
  }
  add(G.box(2.32, 0.08, len), mat(color, { roughness: 0.5 }), [0, 1.12, 0]);
  for (const s of [-1, 1]) for (const z of [-len / 2 + 0.2, len / 2 - 0.2]) { add(G.box(0.3, 0.06, 0.4), steel, [s * 1.2, 0.76, z]); add(G.box(0.05, 0.4, 0.05), steel, [s * 1.2, 0.95, z - Math.sign(z) * 0.1]); } // marchepieds
}
// échelle à crinoline sur le bout du wagon
function ladder(add, steel, x, z, y0 = 1.2, h = 1.9) {
  for (const s of [-0.15, 0.15]) add(G.box(0.035, h, 0.035), steel, [x + s, y0 + h / 2, z]);
  for (let i = 0; i < 6; i++) add(G.box(0.3, 0.03, 0.03), steel, [x, y0 + 0.2 + i * (h - 0.3) / 5, z]);
}
function lamp(add, m, x, y, z, color) { add(G.rbox(0.16, 0.2, 0.16, 0.03), MAT.iron(), [x, y, z]); add(G.box(0.18, 0.03, 0.18), MAT.brass(), [x, y + 0.11, z]); add(G.box(0.1, 0.12, 0.02), color, [x, y, z + Math.sign(z) * 0.09]); }

export function buildWagonModel(type, colorHint) {
  const g = new THREE.Group(), k = new Kit(), add = adder(k); const L = 6.2;
  const iron = MAT.iron(), steel = MAT.steel(), brass = MAT.brass(), woodD = MAT.woodDark(), cream = mat('#ecd9a6', { roughness: 0.5 });
  const rivet = G.sph(0.028, 4, 3);
  underframe(k, L, '#3a2a20'); bogies(k, L);
  const extra = {};
  if (type === 'charbon') {
    // tender : caisse à eau en U autour de la soute à charbon
    const body = mat('#4d463f', { roughness: 0.65, metalness: 0.25 });
    const fy = 1.2;
    add(G.box(2.3, 0.1, L - 0.3), iron, [0, fy + 0.05, 0]);                                // plancher de soute
    for (const s of [-1, 1]) {
      add(G.rbox(0.3, 1.45, L - 0.2, 0.06), body, [s * 1.1, fy + 0.72, 0]);                  // flancs
      add(G.box(0.34, 0.06, L - 0.1), brass, [s * 1.1, fy + 1.47, 0]);                       // liseré
      add(G.box(0.34, 0.2, L - 0.1), mat('#8b1e1e', { roughness: 0.5 }), [s * 1.1, fy + 0.45, 0]);
      for (let i = -3; i <= 3; i++) { add(G.box(0.04, 1.4, 0.09), iron, [s * 1.27, fy + 0.72, i * 0.8]); }
      for (let i = -11; i <= 11; i++) { add(rivet, brass, [s * 1.27, fy + 1.4, i * 0.26]); add(rivet, brass, [s * 1.27, fy + 0.12, i * 0.26]); }
      add(G.rbox(0.1, 0.45, 0.8, 0.03), brass, [s * 1.27, fy + 0.8, 0]);                         // plaque
      add(G.box(0.34, 0.5, 0.06), body, [s * 1.1, fy + 1.7, L / 2 - 0.1]);                      // rehausse avant
    }
    add(G.rbox(2.3, 1.1, 0.3, 0.05), body, [0, fy + 0.62, -L / 2 + 0.2]);                      // paroi arrière
    add(G.rbox(2.3, 1.9, 0.3, 0.05), body, [0, fy + 1.0, L / 2 - 0.2]);                        // paroi avant (haute : abri du chauffeur)
    add(G.box(2.34, 0.06, 0.34), brass, [0, fy + 1.97, L / 2 - 0.2]);
    for (let i = -4; i <= 4; i++) add(rivet, brass, [i * 0.25, fy + 1.8, L / 2 - 0.02]);
    // pont de passage devant : plaque + garde-corps
    add(G.box(2.2, 0.05, 0.7), steel, [0, fy + 1.0, L / 2 + 0.25]);
    // trappes à eau sur le dessus de la paroi arrière
    add(G.cyl(0.3, 0.3, 0.1, 18), steel, [0.5, fy + 1.2, -L / 2 + 0.2]); add(G.sph(0.08, 6, 5), brass, [0.5, fy + 1.28, -L / 2 + 0.2]);
    add(G.tor(0.3, 0.03, 5, 18), brass, [0.5, fy + 1.15, -L / 2 + 0.2], [H, 0, 0]);
    // volant de frein à main + lanterne + échelle
    add(G.cyl(0.04, 0.04, 0.9, 6), steel, [-0.7, fy + 1.55, -L / 2 + 0.05]); add(G.tor(0.22, 0.025, 4, 14), steel, [-0.7, fy + 2.0, -L / 2 + 0.05], [H, 0, 0]);
    for (let i = 0; i < 3; i++) add(G.box(0.4, 0.02, 0.02), steel, [-0.7, fy + 2.0, -L / 2 + 0.05], [0, i * PI / 3, 0]);
    lamp(add, null, 0.8, fy + 1.4, -L / 2 - 0.05, glow('#ff3a2a', 2.2));
    ladder(add, steel, -0.2, -L / 2 - 0.1, 1.2, 1.7);
    // garde-corps sur les flancs
    for (const s of [-1, 1]) { add(G.cyl(0.02, 0.02, 3.0, 5), brass, [s * 1.3, fy + 1.0, -0.2], [H, 0, 0]); for (const z of [-1.6, 1.2]) add(G.cyl(0.018, 0.018, 0.25, 5), brass, [s * 1.26, fy + 1.0, z], [0, 0, s * H]); }
    // injecteurs d'eau, tuyau d'alimentation
    add(G.tube([[0.3, fy + 0.3, L / 2 + 0.1], [0.3, fy + 0.6, L / 2 + 0.5], [0.0, fy + 0.8, L / 2 + 0.8]], 0.05, 10, 5), MAT.copper());
    g.add(k.build());
    // tas de charbon (mise à l'échelle selon le stock) : tas pointu fait de gros morceaux
    const pk = new Kit(); const rnd = (a) => Math.abs(Math.sin(a * 12.9898 + 4.1) * 43758.5453) % 1;
    const chunk = new THREE.IcosahedronGeometry(0.27, 0);
    for (let i = 0; i < 70; i++) {
      const u = (rnd(i) - 0.5) * 1.9, v = -1.2 + rnd(i + 3) * 3.5 + 0.0, vc = (v - 0.55) / 1.9, uc = u / 0.95;
      const hgt = Math.max(0, 1 - uc * uc * 0.8 - vc * vc * 0.9) * 1.0;
      pk.add(chunk, MAT.coal(), { p: [u * (0.85 + 0.15 * (1 - hgt)), hgt * 1.15 + rnd(i + 8) * 0.12, v], r: [rnd(i + 1) * 3, rnd(i + 2) * 3, 0], s: [0.8 + rnd(i + 4) * 1.0, 0.7 + rnd(i + 6) * 0.7, 0.8 + rnd(i + 5) * 1.0] });
    }
    for (let i = 0; i < 5; i++) pk.add(new THREE.IcosahedronGeometry(0.12, 0), mat('#3b3a42', { metalness: 0.9, roughness: 0.25, flatShading: true }), { p: [(rnd(i + 30) - 0.5) * 1.2, 0.35 + rnd(i + 31) * 0.5, -0.5 + rnd(i + 32) * 2.2] }); // éclats de minerai brillants
    const pile = pk.build(); pile.position.y = fy + 0.1; g.add(pile); extra.pile = pile;
  } else if (type === 'vitrine') {
    const gold = MAT.brass(), velvet = mat('#6b1e2a', { roughness: 0.55 }), gold2 = mat('#f0c860', { metalness: 0.85, roughness: 0.25 });
    add(G.rbox(2.4, 0.5, L - 0.3, 0.08), velvet, [0, 1.4, 0]);
    add(G.box(2.46, 0.06, L - 0.2), gold2, [0, 1.17, 0]); add(G.box(2.46, 0.06, L - 0.2), gold2, [0, 1.66, 0]);
    for (let i = -5; i <= 5; i++) for (const s of [-1, 1]) add(G.sph(0.045, 6, 4), gold2, [s * 1.21, 1.4, i * 0.5]);
    // piédestal de présentation
    add(G.cyl(1.0, 1.1, 0.12, 24), gold2, [0, 1.61, 0]); add(G.tor(1.0, 0.04, 6, 24), gold, [0, 1.68, 0], [H, 0, 0]);
    for (const x of [-1.1, 1.1]) for (const z of [-2.2, -0.75, 0.75, 2.2]) { add(G.cyl(0.06, 0.06, 2.6, 8), gold, [x, 2.95, z]); add(G.sph(0.09, 8, 6), gold2, [x, 4.3, z]); add(G.cyl(0.11, 0.11, 0.1, 10), gold2, [x, 1.72, z]); }
    for (const s of [-1, 1]) { add(G.box(0.06, 0.08, L - 0.5), gold, [s * 1.1, 4.22, 0]); add(G.box(0.06, 0.08, L - 0.5), gold, [s * 1.1, 1.78, 0]); add(G.box(0.04, 2.5, 0.05), gold, [s * 1.1, 2.98, 0]); }
    for (const z of [-L / 2 + 0.25, L / 2 - 0.25]) { add(G.box(2.2, 0.08, 0.08), gold, [0, 4.22, z]); add(G.box(0.05, 2.5, 0.05), gold, [0, 2.98, z]); } // cadres d'extrémité
    add(G.rbox(2.5, 0.18, L - 0.4, 0.05), gold, [0, 4.3, 0]);
    add(G.lathe([[1.0, 0], [0.8, 0.3], [0.4, 0.5], [0, 0.55]], 20), gold, [0, 4.38, 0]);
    for (const z of [-1.8, 1.8]) add(G.lathe([[0.6, 0], [0.5, 0.2], [0.2, 0.34], [0, 0.4]], 16), gold, [0, 4.38, z]);
    add(G.sph(0.15, 10, 8), gold2, [0, 4.95, 0]); add(G.cone(0.05, 0.3, 6), gold2, [0, 5.15, 0]);
    // frises décoratives sur la corniche
    for (let i = -5; i <= 5; i++) for (const s of [-1, 1]) add(G.cone(0.1, 0.2, 4), gold2, [s * 1.25, 4.15, i * 0.5], [PI, PI / 4, 0]);
    // spots de présentation
    for (const z of [-1.6, 1.6]) { add(G.cyl(0.14, 0.2, 0.15, 12), gold, [0, 4.12, z]); add(G.cyl(0.11, 0.11, 0.02, 12), glow('#fff2c0', 3), [0, 4.04, z]); }
    g.add(k.build());
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, L - 0.5), new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.3, depthWrite: false }));
    glass.position.y = 2.95; g.add(glass);
    extra.slot = new THREE.Vector3(0, 1.65, 0);
  } else if (type === 'dortoir') {
    const c = mat('#2f4f6b', { roughness: 0.45 }), c2 = mat('#223a50', { roughness: 0.5 }), warm = glow('#ffcf7a', 1.4), curtain = mat('#c9503a', { roughness: 0.9 });
    add(G.rbox(2.5, 2.4, L, 0.15), c, [0, 2.35, 0]);
    add(G.box(2.52, 0.12, L), brass, [0, 1.75, 0]);
    add(G.box(2.52, 0.08, L), brass, [0, 3.45, 0]);
    add(G.box(2.54, 0.06, L), cream, [0, 1.9, 0]);
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) add(G.box(0.04, 0.5, 0.06), c2, [s * 1.27, 2.0, -L / 2 + 0.45 + i * (L - 0.9) / 8]);   // joints de lambris
    for (const z of [-2.0, -0.7, 0.6, 1.9]) for (const s of [-1, 1]) {
      add(G.rbox(0.06, 0.8, 0.9, 0.03), brass, [s * 1.26, 2.6, z]);
      add(G.box(0.04, 0.68, 0.78), warm, [s * 1.28, 2.6, z]);
      add(G.box(0.05, 0.66, 0.04), brass, [s * 1.3, 2.6, z]); add(G.box(0.05, 0.04, 0.76), brass, [s * 1.3, 2.6, z]);
      add(G.box(0.05, 0.32, 0.3), curtain, [s * 1.3, 2.78, z - 0.2]); add(G.box(0.05, 0.32, 0.3), curtain, [s * 1.3, 2.78, z + 0.2]);
      add(G.rbox(0.12, 0.08, 1.0, 0.02), woodD, [s * 1.3, 2.15, z]);                       // jardinière
    }
    for (const s of [-1, 1]) { add(G.rbox(0.08, 1.9, 0.9, 0.03), c2, [s * 1.27, 2.2, L / 2 - 0.55]); add(G.sph(0.05, 6, 5), brass, [s * 1.33, 2.2, L / 2 - 0.8]); } // portes
    for (const z of [-L / 2 - 0.05, L / 2 + 0.05]) { add(G.rbox(1.0, 1.9, 0.08, 0.03), c2, [0, 2.2, z]); add(G.box(0.7, 0.5, 0.04), warm, [0, 2.8, z + Math.sign(z) * 0.03]); for (const s of [-1, 1]) add(G.cyl(0.02, 0.02, 1.5, 5), brass, [s * 0.65, 2.1, z + Math.sign(z) * 0.08]); }
    add(G.cyl(1.4, 1.4, L + 0.1, 24, false), mat('#3a3a3a', { roughness: 0.7 }), [0, 3.5, 0], [H, 0, 0], [0.9, 1, 0.3]);
    for (let i = -5; i <= 5; i++) add(G.box(1.0, 0.03, 0.05), iron, [0, 3.9, i * 0.5], [0, 0, 0]);
    add(G.rbox(0.4, 0.1, L - 1.0, 0.02), woodD, [0, 3.96, 0]);                               // passerelle de toit
    for (const z of [-1.5, 1.5]) { add(G.cyl(0.12, 0.15, 0.4, 10), iron, [0.4, 4.1, z]); add(G.cyl(0.19, 0.12, 0.08, 10), brass, [0.4, 4.33, z]); }
    add(G.cyl(0.09, 0.09, 0.6, 8), iron, [-0.5, 4.15, 0.2]); add(G.cone(0.14, 0.14, 8), iron, [-0.5, 4.5, 0.2]);   // cheminée de poêle
    for (const s of [-1, 1]) lamp(add, null, s * 1.35, 2.2, -L / 2 + 0.35, warm);
    for (let i = 0; i < 3; i++) add(G.rbox(0.2, 0.3, 0.02, 0.01), brass, [0, 2.6, 0]); // (neutre)
    g.add(k.build());
  } else { // stockage / isotherme
    const white = type === 'isotherme';
    const c = mat(white ? '#dfeef5' : '#7a4a24', { roughness: 0.75 });
    const dr = white ? mat('#8fd0ee') : mat('#5a3418'), band = white ? mat('#9ec9dc') : MAT.woodDark();
    add(G.rbox(2.5, 2.4, L, 0.08), c, [0, 2.35, 0]);
    for (let i = 0; i < 14; i++) for (const s of [-1, 1]) add(G.box(0.03, 2.3, 0.05), band, [s * 1.26, 2.35, -L / 2 + 0.25 + i * (L - 0.5) / 13]);
    for (const s of [-1, 1]) {
      add(G.rbox(0.08, 2.0, 1.6, 0.03), dr, [s * 1.27, 2.25, 0]); add(G.box(0.1, 0.06, 2.4), iron, [s * 1.3, 3.35, 0]);
      for (const z of [-0.8, 0.8]) add(G.box(0.12, 2.1, 0.05), iron, [s * 1.3, 2.25, z]);            // chambranles
      add(G.box(0.12, 0.05, 1.7), iron, [s * 1.3, 1.22, 0]);
      add(G.box(0.14, 0.05, 1.7), iron, [s * 1.3, 2.25, 0], [0, 0, 0]);
      add(G.cyl(0.03, 0.03, 0.4, 6), brass, [s * 1.35, 2.2, 0.5]); add(G.sph(0.06, 6, 5), brass, [s * 1.37, 2.4, 0.5]);   // poignée
      add(G.cyl(0.015, 0.015, 0.2, 5), iron, [s * 1.34, 2.35, -0.55], [H, 0, 0]);
      add(G.rbox(0.05, 0.3, 0.4, 0.02), mat('#f3e3c0', { roughness: 0.6 }), [s * 1.285, 2.75, -1.7]);   // étiquette de destination
      for (const z of [-1.65, 1.65]) { add(G.box(0.1, 0.18, 0.5), steel, [s * 1.28, 3.0, z]); }
    }
    add(G.cyl(1.5, 1.5, L + 0.1, 24, false), mat('#3a3a3a', { roughness: 0.7 }), [0, 3.5, 0], [H, 0, 0], [0.85, 1, 0.3]);
    add(G.rbox(0.4, 0.1, L - 1.0, 0.02), woodD, [0, 3.96, 0]);
    for (const z of [-2.0, 0, 2.0]) add(G.box(0.8, 0.03, 0.05), iron, [0, 3.9, z]);
    for (const z of [-1.9, 1.9]) { add(G.cyl(0.1, 0.12, 0.3, 8), iron, [0, 4.1, z]); add(G.cyl(0.15, 0.1, 0.05, 8), steel, [0, 4.28, z]); }
    ladder(add, steel, 0.6, -L / 2 - 0.1, 1.2, 2.1); ladder(add, steel, -0.6, L / 2 + 0.1, 1.2, 2.1);
    for (const z of [-L / 2 - 0.05, L / 2 + 0.05]) add(G.rbox(1.0, 1.9, 0.06, 0.03), dr, [0, 2.25, z]);
    lamp(add, null, 0, 3.2, -L / 2 - 0.15, glow('#ff3a2a', 2));
    if (white) {
      add(G.box(2.56, 0.25, L), glow('#5fd0ff', 0.6), [0, 1.9, 0]);
      for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const z = -2.2 + i * 1.1; add(G.cone(0.08, 0.3, 5), mat('#eafaff', { roughness: 0.2 }), [s * 1.3, 1.7, z], [PI, 0, 0]); } // glaçons sous la bande
      add(G.rbox(0.9, 0.5, 0.06, 0.02), mat('#2a7aa0'), [0, 3.2, L / 2 + 0.06]);
      for (const s of [-1, 1]) { add(G.cyl(0.18, 0.18, 0.5, 10), steel, [s * 0.5, 4.2, 0]); add(G.cyl(0.2, 0.2, 0.05, 10), iron, [s * 0.5, 4.48, 0]); }   // groupe de refroidissement
    } else {
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(G.rbox(0.12, 0.22, 0.4, 0.03), mat('#a8743c'), [s * 1.32, 1.6, -1.7 + i * 0.4 + 0.0]); // sacs posés
    }
    g.add(k.build());
  }
  const wheels = [];
  for (const z of [-L / 2 + 0.75, -L / 2 + 1.65, L / 2 - 1.65, L / 2 - 0.75]) for (const s of [-1, 1]) { const w = wheel(0.45, { spokes: 8, counter: false, paint: '#2b2b2b' }); w.position.set(s * 0.95, 0.45, z); g.add(w); wheels.push(w); }
  g.userData = { ...extra, wheels, length: L + 0.9 };
  g.traverse(o => { if (o.isMesh) o.castShadow = !o.material.transparent; });
  return g;
}
