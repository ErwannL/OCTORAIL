import * as THREE from 'three';
import { G, mat, MAT, glow } from './kit.js';
import { textSprite } from './tracks.js';
import { COLLIDERS } from './colliders.js';
import { STUB_R, MERGE_R, RING_R } from './network.js';

// ------------------------------------------------------------------ Quais du Moyeu
// Repère d'un quai i (angle a = i·π/4) :
//   r = distance radiale (axe de la voie de quai, de STUB_R (butoir) à MERGE_R (aiguillage)),
//   d = décalage latéral vers le côté du quai (l'autre côté de la voie reçoit le raccord de l'anneau).
// Le quai longe donc la voie de quai sur toute sa longueur, bord à D0 de l'axe, sans qu'aucune autre voie ne le croise.
export const QUAI = {
  D0: 1.7, D1: 6.9,          // bord côté voie / bord extérieur (m depuis l'axe de la voie)
  R0: STUB_R + 1.3, R1: MERGE_R - 2, // début / fin de la plate-forme (m depuis le centre du Moyeu)
  TOP: 0.9,                  // hauteur du dessus du quai
  GATE_R: 47.4,              // rayon de la rambarde
};
const PI = Math.PI, H = PI / 2;
const GATE_D = [1.2, 7.4];   // poteaux d'entrée (latéral) : ouverture de 6,2 m devant l'escalier de 5,7 m

// angle (de l'axe i) du point de la rambarde situé à `d` m de l'axe de la voie
const gateAng = d => Math.asin(d / QUAI.GATE_R);

// secteur d'anneau (aplat extrudé) entre rayons r0..r1 et angles a0..a1 (convention at() : x = cos a, z = -sin a)
function arcSlab(r0, r1, a0, a1, h) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, a0, a1, false);
  s.absarc(0, 0, r0, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 14 });
  g.rotateX(-H);
  return g;
}

// ------------------------------------------------------------------ rambarde du pourtour, ouverte devant chaque quai
export function buildBalustrade(k, mats) {
  const { stone, stoneDark, brass, iron } = mats;
  const R = QUAI.GATE_R, th1 = gateAng(GATE_D[0]), th2 = gateAng(GATE_D[1]);
  const ptAt = (a, r) => [Math.cos(a) * r, -Math.sin(a) * r];
  // poteaux de pierre
  for (let n = 0; n < 64; n++) {
    const a = n / 64 * PI * 2;
    let skip = false;
    for (let i = 0; i < 8; i++) { const lo = i * PI / 4 + th1 - 0.045, hi = i * PI / 4 + th2 + 0.045; if (a > lo && a < hi) skip = true; }
    if (skip) continue;
    const [x, z] = ptAt(a, R);
    k.add(G.cyl(0.18, 0.22, 3.1, 8), stone, { p: [x, -0.25, z] }); // ancré profond : jamais en l'air
  }
  // mains courantes en laiton (haute + basse), entre deux entrées
  for (let i = 0; i < 8; i++) {
    const aS = i * PI / 4 + th2, aE = (i + 1) * PI / 4 + th1, arc = aE - aS;
    const top = G.tor(R, 0.12, 5, 28, arc); top.rotateX(H); top.rotateY(aE);
    k.add(top, brass, { p: [0, 1.32, 0] });
    const low = G.tor(R, 0.05, 4, 28, arc); low.rotateX(H); low.rotateY(aE);
    k.add(low, iron, { p: [0, 0.8, 0] });
  }
  // poteaux d'entrée ornés : pilier de pierre, chapiteau de laiton, lanterne
  const lantern = glow('#ffcf7a', 3);
  for (let i = 0; i < 8; i++) for (const d of GATE_D) {
    const th = gateAng(d), a = i * PI / 4 + th, [x, z] = ptAt(a, R);
    k.add(G.box(0.62, 2.4, 0.62), stoneDark, { p: [x, -0.8, z], r: [0, a, 0] }); // socle enterré
    k.add(G.box(0.46, 1.7, 0.46), stone, { p: [x, 1.15, z], r: [0, a, 0] });
    k.add(G.box(0.62, 0.14, 0.62), brass, { p: [x, 2.07, z], r: [0, a, 0] });
    k.add(G.cyl(0.05, 0.08, 0.3, 8), iron, { p: [x, 2.3, z] });
    k.add(G.box(0.3, 0.42, 0.3), iron, { p: [x, 2.65, z], r: [0, a, 0] });
    k.add(G.box(0.2, 0.32, 0.2), lantern, { p: [x, 2.65, z], r: [0, a, 0] });
    k.add(G.cone(0.26, 0.28, 4), brass, { p: [x, 3.0, z], r: [0, a + PI / 4, 0] });
    k.add(G.sph(0.07, 8, 6), brass, { p: [x, 3.2, z] });
  }
}

// ------------------------------------------------------------------ un quai complet (plate-forme, accès, auvent, mobilier)
export function buildQuai(k, signs, b, i, mats) {
  const { stone, stoneDark, brass, iron, wood } = mats;
  const a = i * PI / 4, cs = Math.cos(a), sn = Math.sin(a);
  const P = (r, d) => [cs * r - sn * d, -sn * r - cs * d];     // (radial, latéral) -> (x, z)
  const { D0, D1, R0, R1, TOP } = QUAI, W = D1 - D0, DC = (D0 + D1) / 2, L = R1 - R0, RM = (R0 + R1) / 2;
  // pose une géométrie alignée sur le repère du quai (x local = radial, z local = vers la voie)
  const put = (geo, m, r, d, y, ry = 0, rz = 0) => { const [x, z] = P(r, d); k.add(geo, m, { p: [x, y, z], r: [0, a + ry, rz] }); };
  const bx = (m, r, d, y, lr, h, wd, ry = 0, rz = 0) => put(G.box(lr, h, wd), m, r, d, y, ry, rz);

  const paving = mat('#b9a98a', { roughness: 0.95 }), joint = mat('#8d7c63', { roughness: 1 });
  const coping = mat('#d3c6a6', { roughness: 0.85 }), yellow = mat('#e8c84a', { roughness: 0.6 });
  const timber = mat('#6a4528', { roughness: 0.9 }), timberDark = mat('#4e2f19', { roughness: 0.9 });
  const roofM = mat(b.open ? '#3a5a4a' : '#4a4a4a', { roughness: 0.55, metalness: 0.35 });
  const accent = mat(b.skyBot, { roughness: 0.6 });
  const lantern = glow('#ffcf7a', 3);

  // ---- plate-forme : corps de pierre, dalles, joints, nez de quai en pierre claire + bande jaune
  bx(stone, RM, DC, (TOP - 0.06 - 1.2) / 2 + 0.0, L, TOP - 0.06 + 1.2, W);               // y de -1.2 à TOP-0.06
  bx(paving, RM, DC, TOP - 0.03, L, 0.06, W);
  for (let r = R0 + 1.5; r < R1 - 0.5; r += 1.5) bx(joint, r, DC, TOP + 0.004, 0.035, 0.012, W);
  for (const d of [D0 + 1.9, DC + 0.9]) bx(joint, RM, d, TOP + 0.004, L, 0.012, 0.035);
  bx(yellow, RM, D0 + 0.45, TOP + 0.006, L, 0.012, 0.4);                                   // bande jaune
  for (let r = R0 + 0.1; r < R1 - 0.1; r += 2.0) bx(coping, r + 0.98, D0 + 0.05, TOP - 0.07, 1.94, 0.14, 0.3);  // nez de quai (porte-à-faux de 10 cm)
  bx(joint, RM, D0 - 0.03, TOP - 0.55, L, 0.9, 0.06);                                       // plinthe sombre sous le nez
  for (let r = R0 + 3; r < R1 - 1; r += 6) bx(stoneDark, r, D0 - 0.07, TOP - 0.55, 0.5, 1.1, 0.12);  // pilastres de soutènement
  bx(stone, RM, D1 - 0.1, TOP + 0.08, L, 0.16, 0.2);                                        // petit rebord côté extérieur
  // rampe de sortie, côté monde (dalle inclinée de 0,5 m d'épaisseur, du dessus du quai au sol)
  { const run = 4.6, phi = Math.atan(TOP / run), len = Math.hypot(run, TOP), g = G.box(len, 0.5, W); g.rotateZ(-phi);
    put(g, paving, R1 + run / 2 - 0.25 * Math.sin(phi), DC, TOP / 2 - 0.25 * Math.cos(phi)); }

  // ---- accès depuis la place du Moyeu : volée de 3 marches (0,21 m), palier, passage à niveau sur l'anneau, palier, quai
  const A0 = 47.2, STEPS = [[45.4, 0.48], [46.3, 0.69], [47.2, TOP]];
  const dA0 = D0 - 0.25, dA1 = D1 + 0.25, dAc = (dA0 + dA1) / 2, dAw = dA1 - dA0;
  for (const [r, top] of STEPS) {
    bx(coping, (r + A0 + 1.2) / 2, dAc, top / 2 - 0.4, A0 + 1.2 - r, top + 0.8, dAw);
    bx(stoneDark, r - 0.03, dAc, top - 0.09, 0.08, 0.16, dAw + 0.02);
  }
  const R_X0 = RING_R - 2.0, R_X1 = RING_R + 2.0;  // 50 .. 54 : passage sur l'anneau
  bx(paving, (A0 + R_X0) / 2, DC, TOP / 2 - 0.65, R_X0 - A0, TOP + 1.3, W);
  bx(paving, (R_X1 + R0 + 0.3) / 2, DC, TOP / 2 - 0.65, R0 + 0.3 - R_X1, TOP + 1.3, W);
  // passage à niveau : planches courbes entre et de part et d'autre des rails de l'anneau (rails à RING_R ± 0,75)
  { const aLo = Math.asin((D0 - 0.2) / RING_R), aHi = Math.asin((D1 + 0.2) / RING_R), A = a;
    for (const [r0, r1] of [[R_X0, RING_R - 0.9], [RING_R - 0.6, RING_R + 0.6], [RING_R + 0.9, R_X1]])
      k.add(arcSlab(r0, r1, A + aLo, A + aHi, 0.5), timber, { p: [0, TOP - 0.5 - 0.04, 0] }); }
  // bordures latérales de l'accès
  for (const d of [D0 - 0.12, D1 + 0.12]) bx(coping, (A0 + R0 + 0.3) / 2, d, TOP / 2 - 0.1, R0 + 0.3 - A0, TOP + 0.2, 0.24);

  // ---- butoir de fin de voie (r = STUB_R)
  { const bm = mat('#8a1f1f', { roughness: 0.6 });
    bx(bm, STUB_R - 0.25, 0, 1.4, 0.4, 0.55, 2.8); bx(timberDark, STUB_R - 0.25, 0, 0.9, 0.5, 0.5, 0.35);
    for (const d of [-1.0, 1.0]) { bx(iron, STUB_R - 0.3, d, 1.0, 0.3, 0.8, 0.3); const c = G.cyl(0.17, 0.17, 0.3, 14); c.rotateZ(H); put(c, brass, STUB_R + 0.0, d * 0.8, 1.4); }
  }

  // ---- portique d'entrée : deux colonnes en fonte, plaque du monde, horloge
  { const rg = R0 - 1.0;
    for (const d of [D0 + 0.3, D1 - 0.3]) {
      put(G.cyl(0.16, 0.22, 6.6, 10), iron, rg, d, 0.9 + 3.3);
      put(G.cyl(0.3, 0.3, 0.25, 12), brass, rg, d, 1.1);
      put(G.cyl(0.2, 0.2, 0.15, 12), brass, rg, d, 6.45);
    }
    bx(brass, rg, DC, 4.1, 0.2, 0.14, W - 0.4); bx(brass, rg, DC, 6.35, 0.2, 0.18, W - 0.4);
    const lbl = textSprite([b.name, b.dir.toUpperCase()], { bg: '#20160f', fg: b.open ? '#ffe9b8' : '#8a7a66', border: b.skyBot, font: 'bold 48px Georgia' });
    const pn = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.9, (W - 0.9) / 2), new THREE.MeshBasicMaterial({ map: lbl, side: THREE.DoubleSide }));
    const [px, pz] = P(rg - 0.02, DC); pn.position.set(px, 5.2, pz); pn.rotation.y = Math.atan2(-cs, sn); pn.userData.noCollide = true; signs.push(pn);
    // horloge à deux faces au-dessus de la plaque
    const dial = G.cyl(0.8, 0.8, 0.3, 28); dial.rotateX(H);
    put(dial, brass, rg, DC, 7.5, H); put(G.cyl(0.08, 0.1, 0.9, 8), iron, rg, DC, 6.8);
    const face = G.cyl(0.68, 0.68, 0.34, 28); face.rotateX(H); put(face, mat('#f6ecd2'), rg, DC, 7.5, H);
    for (const s of [-1, 1]) {
      const z = s * 0.18;
      const hm = G.box(0.06, 0.5, 0.04); hm.translate(0, 0.25, 0); hm.rotateZ(0.5 + (i % 3) * 0.7);
      const hh = G.box(0.08, 0.34, 0.04); hh.translate(0, 0.17, 0); hh.rotateZ(-1.9 + i * 0.3);
      const [x, zz] = P(rg + z, DC);
      k.add(hm, iron, { p: [x, 7.5, zz], r: [0, a + H, 0] }); k.add(hh, iron, { p: [x, 7.5, zz], r: [0, a + H, 0] });
    }
  }

  // ---- auvent à double pente sur colonnes en fonte (au-dessus du quai seulement, pas au-dessus des rails)
  const COLS = [60, 66, 72, 78, 84, 90, 96], DIN = D0 + 1.2, DOUT = 2 * DC - DIN;  // rangées de colonnes
  const ER = 57.6, EL = 98.0 - ER, EM = (ER + 98.0) / 2;                         // étendue du toit en r
  const eaveY = 3.9, ridgeY = 5.0, dR = DC, dEi = D0 + 0.2, dEo = 2 * DC - dEi;   // sous-face du toit ; bord côté voie à D0+0,2 (jamais au-dessus des rails)
  const hi = dR - dEi, ho = dEo - dR, rise = ridgeY - eaveY;
  const colG = G.lathe([[0.26, 0], [0.26, 0.18], [0.16, 0.3], [0.12, 0.5], [0.12, 2.85], [0.16, 3.0], [0.22, 3.15], [0.0, 3.15]], 12);
  for (const r of COLS) for (const d of [DIN, DOUT]) {
    put(colG, iron, r, d, TOP);
    put(G.cyl(0.14, 0.14, 0.08, 12), brass, r, d, TOP + 0.62);
    put(G.cyl(0.14, 0.14, 0.08, 12), brass, r, d, TOP + 2.75);
    put(G.box(0.4, 0.1, 0.5), iron, r, d, TOP + 3.2);
  }
  // sablières longitudinales + lisses basses
  for (const d of [DIN, DOUT]) { bx(iron, EM, d, TOP + 3.34, EL - 0.6, 0.2, 0.2); bx(brass, EM, d, TOP + 3.46, EL - 0.6, 0.04, 0.26); }
  // fermes : entrait + deux arbalétriers + poinçon, une par colonne
  for (const r of COLS) {
    bx(iron, r, DC, TOP + 3.4, 0.14, 0.14, DOUT - DIN);
    const run1 = DC - DIN, y0 = TOP + 3.4, y1 = ridgeY - 0.1, ang = Math.atan2(y1 - y0, run1), ln = Math.hypot(run1, y1 - y0);
    for (const s of [1, -1]) { const g = G.box(0.1, 0.12, ln); g.rotateX(s * ang); put(g, iron, r, DC - s * run1 / 2, (y0 + y1) / 2); }
    bx(iron, r, DC, (y0 + y1) / 2, 0.1, y1 - y0, 0.1);
  }
  // arcs de décharge entre colonnes (fer forgé)
  for (let n = 0; n < COLS.length - 1; n++) {
    const rm = (COLS[n] + COLS[n + 1]) / 2;
    for (const d of [DIN, DOUT]) {
      const arc = G.tor(2.85, 0.05, 4, 24, PI); arc.scale(1, 0.2, 1); put(arc, iron, rm, d, TOP + 2.55, 0, 0);
      const arc2 = G.tor(2.6, 0.03, 4, 24, PI); arc2.scale(1, 0.2, 1); put(arc2, brass, rm, d, TOP + 2.53, 0, 0);
    }
  }
  // toit : deux pans de 0,3 m d'épaisseur (solides), chevrons dessous, couvre-joints, faîtage, bordure aux couleurs du monde
  for (const [s, hh] of [[1, hi], [-1, ho]]) {
    const ang = Math.atan2(rise, hh), wd = Math.hypot(hh, rise) + 0.16;
    const cy = (eaveY + ridgeY) / 2, cd = dR - s * hh / 2;   // (cy, cd) : milieu de la sous-face
    const slab = G.box(EL, 0.3, wd); slab.rotateX(s * ang); put(slab, roofM, EM, cd, cy + 0.15 / Math.cos(ang));
    for (let r = ER + 1.0; r < 98 - 0.2; r += 2.0) { const bat = G.box(0.08, 0.06, wd); bat.rotateX(s * ang); put(bat, brass, r, cd, cy + 0.33 / Math.cos(ang)); }
    for (let r = ER + 1.5; r < 98 - 1; r += 3.0) { const raf = G.box(0.06, 0.12, wd - 0.1); raf.rotateX(s * ang); put(raf, iron, r, cd, cy - 0.06); }
    const eaveD = dR - s * hh;
    put(G.box(EL, 0.34, 0.07), accent, EM, eaveD, eaveY + 0.1); put(G.box(EL, 0.05, 0.1), brass, EM, eaveD, eaveY + 0.3);
  }
  bx(iron, EM, dR, ridgeY + 0.38, EL, 0.16, 0.34); bx(brass, EM, dR, ridgeY + 0.48, EL, 0.04, 0.2);
  // bandeau du nom du quai sur la bordure côté voie
  { const t = textSprite([b.name], { w: 1024, h: 200, bg: '#20160f', fg: b.open ? '#ffe9b8' : '#8a7a66', border: b.skyBot, font: 'bold 96px Georgia' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.9), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
    const [x, z] = P(EM, dEi - 0.08); m.position.set(x, eaveY - 0.45, z); m.rotation.y = a; m.userData.noCollide = true; signs.push(m);
    for (const r of [EM - 2.15, EM + 2.15]) bx(iron, r, dEi - 0.04, eaveY - 0.05, 0.05, 0.5, 0.05); }
  // lanternes suspendues au centre de chaque travée
  for (let n = 0; n < COLS.length - 1; n++) {
    const rm = (COLS[n] + COLS[n + 1]) / 2;
    put(G.cyl(0.02, 0.02, 1.0, 4), iron, rm, DC, TOP + 3.6);
    put(G.box(0.34, 0.5, 0.34), iron, rm, DC, TOP + 2.7); put(G.box(0.24, 0.4, 0.24), lantern, rm, DC, TOP + 2.7);
    put(G.cone(0.3, 0.26, 4), brass, rm, DC, TOP + 3.08, PI / 4); put(G.cone(0.2, 0.18, 4), brass, rm, DC, TOP + 2.36, PI / 4, PI);
  }
  // ---- mobilier (entre les colonnes, contre le bord extérieur ; le passage central reste libre)
  const bench = (r) => {
    bx(wood, r, D1 - 0.85, TOP + 0.5, 1.9, 0.07, 0.5);
    bx(wood, r, D1 - 0.62, TOP + 0.9, 1.9, 0.5, 0.06);
    for (const dr of [-0.8, 0.8]) { bx(iron, r + dr, D1 - 0.85, TOP + 0.25, 0.08, 0.5, 0.42); bx(iron, r + dr, D1 - 0.6, TOP + 0.7, 0.08, 0.9, 0.06); }
  };
  [63, 75, 93].forEach(bench);
  // chariot à bagages + malles
  { const cartM = mat('#2a4a5a', { roughness: 0.6, metalness: 0.3 }), r = 69, d = D1 - 1.1;
    bx(cartM, r, d, TOP + 0.55, 2.6, 0.12, 1.3); bx(cartM, r, d + 0.6, TOP + 0.8, 2.6, 0.3, 0.08); bx(cartM, r, d - 0.6, TOP + 0.8, 2.6, 0.3, 0.08);
    bx(cartM, r + 1.25, d, TOP + 0.8, 0.08, 0.3, 1.3); bx(cartM, r - 1.25, d, TOP + 0.8, 0.08, 0.3, 1.3);
    for (const dr of [-0.9, 0.9]) for (const dd of [-0.65, 0.65]) { const w = G.cyl(0.3, 0.3, 0.1, 12); w.rotateX(H); put(w, iron, r + dr, d + dd, TOP + 0.3); }
    bx(iron, r - 2.2, d, TOP + 0.45, 1.4, 0.06, 0.06);
    put(G.rbox(0.9, 0.55, 0.6, 0.05), mat('#7a4a2a'), r + 0.3, d + 0.1, TOP + 0.98); put(G.rbox(0.7, 0.4, 0.5, 0.05), mat('#4a3a2a'), r - 0.7, d - 0.1, TOP + 0.92, 0.3);
    bx(brass, r + 0.3, d + 0.1, TOP + 1.28, 0.95, 0.05, 0.65); }
  // caisses + sacs + tonneau (collés au bord extérieur : le passage central reste libre)
  { const crateM = mat('#a07a48', { roughness: 0.9 }), canvas = mat('#c8b78a', { roughness: 1 }), r = 85.6, d = D1 - 0.55;
    bx(crateM, r, d, TOP + 0.4, 0.8, 0.8, 0.8, 0.2); bx(crateM, r + 0.95, d + 0.0, TOP + 0.35, 0.7, 0.7, 0.7, -0.2); bx(crateM, r, d, TOP + 1.1, 0.6, 0.6, 0.6, 0.5);
    put(G.sph(0.34, 8, 6), canvas, r + 1.9, d - 0.05, TOP + 0.3); put(G.sph(0.3, 8, 6), canvas, r + 2.4, d + 0.0, TOP + 0.27);
    put(G.lathe([[0.35, 0], [0.42, 0.4], [0.35, 0.85], [0, 0.85]], 12), wood, r + 3.2, d - 0.05, TOP); }
  // panneau d'horaires sur potence, à l'entrée du quai
  { const r = R0 + 2.4, d = D1 - 0.55;
    bx(iron, r, d, TOP + 1.15, 0.1, 2.3, 0.1); bx(mat('#1d1a14'), r, d, TOP + 1.7, 0.1, 1.1, 0.9);
    for (let n = 0; n < 4; n++) bx(glow(b.open ? '#8be0a0' : '#6a5a4a', 0.8), r - 0.06, d, TOP + 2.0 - n * 0.24, 0.04, 0.09, 0.7);
    bx(brass, r + 0.0, d, TOP + 2.3, 0.14, 0.06, 1.0); }
  // ---- volume « caméra » du toit (le joueur passe dessous, la caméra l'évite)
  { const [x, z] = P(EM, DC); COLLIDERS.camBox(x, z, EL / 2, (dEo - dEi) / 2, a, 4.2, 6.1); }
}
