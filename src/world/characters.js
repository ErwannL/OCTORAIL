import * as THREE from 'three';
import { Kit, MAT, G, mat, glow } from './kit.js';

const PI = Math.PI, H = PI / 2;
const adder = (k) => (geo, m, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => k.add(geo, m, { p, r, s });

// ------------------------------------------------------------------ Passager (avatar) : combinaison spatiale rétro-futuriste
export function buildAvatarModel(color = '#e0703a') {
  const g = new THREE.Group();
  const suit = mat(color, { roughness: 0.55 }), dark = mat('#2a2b33', { roughness: 0.7 }), light = mat('#e9e3d6', { roughness: 0.4 });
  const brass = MAT.brass(), copper = MAT.copper(), steel = mat('#8a919b', { metalness: 0.7, roughness: 0.35 });
  const tan = mat('#5a4030', { roughness: 0.8 }), scarf = mat('#c94a3a', { roughness: 0.9 });
  const visor = mat('#0b1620', { metalness: 0.7, roughness: 0.12, emissive: '#2fb8e8', emissiveIntensity: 0.12 });
  const body = new THREE.Group(); body.position.y = 0.95; g.add(body);
  const bk = new Kit(), add = adder(bk);
  // torse + ceinture
  add(G.rbox(0.62, 0.72, 0.42, 0.16, 3), suit, [0, 0.12, 0]);
  add(G.rbox(0.66, 0.12, 0.46, 0.05), dark, [0, -0.2, 0]);
  add(G.rbox(0.16, 0.12, 0.05, 0.02), brass, [0, -0.2, 0.245]);
  for (const s of [-1, 1]) {
    add(G.rbox(0.16, 0.18, 0.1, 0.03), tan, [s * 0.22, -0.32, 0.22]); add(G.box(0.12, 0.03, 0.02), steel, [s * 0.22, -0.25, 0.275]);   // poches
    add(G.box(0.04, 0.6, 0.03), dark, [s * 0.18, 0.15, 0.215]);                                                                          // bretelles
    add(G.sph(0.17, 12, 8, 0, PI * 2, 0, H), dark, [s * 0.36, 0.42, 0], [0, 0, 0], [1.1, 0.7, 1]);                                      // épaulettes
    add(G.tor(0.12, 0.03, 5, 14), brass, [s * 0.38, 0.4, 0], [0, 0, s * 0.7 + H * 0]);
  }
  add(G.rbox(0.18, 0.24, 0.12, 0.03), tan, [-0.38 + 0.12, -0.38, -0.2]); // pochette dorsale basse
  add(G.cyl(0.07, 0.07, 0.22, 10), steel, [0.3, -0.34, 0.0], [0, 0, 0.2]); add(G.cyl(0.075, 0.075, 0.04, 10), brass, [0.31, -0.22, 0.0], [0, 0, 0.2]); // gourde
  // plastron : panneau de commande
  add(G.rbox(0.38, 0.26, 0.05, 0.03), light, [0.08, 0.28, 0.215]);
  for (const x of [-0.04, 0.08, 0.2]) { add(G.cyl(0.04, 0.04, 0.03, 10), dark, [x, 0.32, 0.245], [H, 0, 0]); add(G.cyl(0.028, 0.028, 0.03, 10), light, [x, 0.32, 0.255], [H, 0, 0]); add(G.box(0.01, 0.04, 0.01), mat('#c0392b'), [x + 0.005, 0.33, 0.272]); }
  for (const x of [0.0, 0.08, 0.16]) add(G.box(0.045, 0.025, 0.02), dark, [x, 0.22, 0.245]);
  add(G.rbox(0.16, 0.1, 0.06, 0.02), glow('#6fe39a', 1.5), [-0.18, 0.12, 0.22]);                                                          // voyant de vie
  add(G.cyl(0.05, 0.05, 0.05, 10), brass, [-0.18, 0.28, 0.245], [H, 0, 0]);                                                               // prise d'air
  // tuyaux souples plastron -> sac
  for (const s of [-1, 1]) add(G.tube([[s * 0.1, 0.4, 0.2], [s * 0.3, 0.52, 0.22], [s * 0.42, 0.55, 0.0], [s * 0.3, 0.52, -0.3], [s * 0.15, 0.34, -0.46]], 0.032, 16, 5), dark);
  // col, écharpe
  add(G.tor(0.36, 0.05, 6, 20), dark, [0, 0.5, 0], [H, 0, 0]);
  add(G.tor(0.3, 0.09, 8, 20), scarf, [0, 0.48, 0.02], [H + 0.15, 0, 0]);
  add(G.box(0.14, 0.42, 0.06), scarf, [0.16, 0.25, 0.28], [0.1, 0, 0.15]); add(G.box(0.14, 0.04, 0.062), light, [0.16, 0.1, 0.285], [0.1, 0, 0.15]);
  // sac à dos : bloc + deux bouteilles + antenne
  add(G.rbox(0.5, 0.62, 0.3, 0.08), dark, [0, 0.12, -0.34]);
  add(G.rbox(0.44, 0.1, 0.06, 0.02), steel, [0, 0.36, -0.5]);
  for (const x of [-0.15, 0.15]) {
    add(G.cyl(0.11, 0.11, 0.56, 14), copper, [x, 0.14, -0.52]); add(G.sph(0.11, 12, 6, 0, PI * 2, 0, H), copper, [x, 0.42, -0.52]); add(G.sph(0.11, 12, 6, 0, PI * 2, H, H), copper, [x, -0.14, -0.52]);
    add(G.tor(0.115, 0.02, 4, 14), brass, [x, 0.3, -0.52], [H, 0, 0]); add(G.tor(0.115, 0.02, 4, 14), brass, [x, -0.02, -0.52], [H, 0, 0]);
    add(G.cyl(0.03, 0.03, 0.1, 6), brass, [x, 0.55, -0.52]);
  }
  add(G.tube([[-0.15, 0.55, -0.52], [-0.05, 0.62, -0.5], [0.05, 0.62, -0.5], [0.15, 0.55, -0.52]], 0.02, 10, 4), brass);
  add(G.cyl(0.014, 0.014, 0.6, 5), steel, [-0.2, 0.7, -0.4], [0.2, 0, 0.1]);
  add(G.cyl(0.04, 0.04, 0.5, 6), copper, [0, 0.5, -0.45], [0.6, 0, 0]);                                                                   // tuyau d'air
  add(G.rbox(0.22, 0.22, 0.05, 0.02), mat('#9a7b2a', { metalness: 0.7, roughness: 0.4 }), [0, -0.02, -0.5]);                              // plaque de réacteur
  for (let i = 0; i < 4; i++) add(G.box(0.18, 0.012, 0.01), dark, [0, -0.07 + i * 0.045, -0.527]);
  body.add(bk.build());

  // casque
  const head = new THREE.Group(); head.position.y = 0.82; body.add(head);
  const hk = new Kit(), hadd = adder(hk);
  hadd(G.sph(0.34, 24, 18), light);
  hadd(G.sph(0.3, 24, 12, H - 1.05, 2.1, 0.95, 1.05), visor, [0, 0, 0.07]);
  hadd(G.tor(0.34, 0.035, 6, 24), dark);
  hadd(G.tor(0.285, 0.022, 5, 24, 2.0), brass, [0, 0.02, 0.1], [0, 0, 0], [1, 1, 1]);
    hadd(G.box(0.05, 0.12, 0.05), brass, [0, 0.33, 0.12]);
  hadd(G.cyl(0.015, 0.015, 0.35, 6), dark, [0.18, 0.38, -0.05]);
  for (const s of [-1, 1]) {
    hadd(G.cyl(0.09, 0.09, 0.08, 14), dark, [s * 0.33, 0, 0], [0, 0, H]); hadd(G.cyl(0.05, 0.05, 0.1, 10), brass, [s * 0.37, 0, 0], [0, 0, H]);
    hadd(G.tor(0.09, 0.015, 4, 12), brass, [s * 0.375, 0, 0], [0, H, 0]);
    hadd(G.rbox(0.08, 0.14, 0.16, 0.03), steel, [s * 0.18, -0.26, 0.04]);                             // valve de menton
  }
  hadd(G.rbox(0.2, 0.08, 0.12, 0.03), steel, [0, -0.3, 0.18]);                                       // bavette
  hadd(G.cyl(0.07, 0.09, 0.1, 10), dark, [0, 0.33, -0.18]); hadd(G.cyl(0.1, 0.07, 0.04, 10), brass, [0, 0.4, -0.18]);   // lampe de casque
  for (let i = 0; i < 3; i++) hadd(G.box(0.2, 0.015, 0.03), dark, [0, 0.12, -0.3 + 0], [0.0, 0, 0]);   // fentes arrière (discrètes)
  head.add(hk.build());
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glow('#ffb347', 3)); tip.position.set(0.18, 0.57, -0.05); head.add(tip);
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), glow('#ffffff', 2)); eye.position.set(s * 0.09, 0.02, 0.352); eye.scale.set(1, 1.3, 0.5); head.add(eye); }
  const hl = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), glow('#ffe7b0', 4)); hl.position.set(0, 0.34, -0.1); hl.rotation.x = -H; head.add(hl);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glow('#ffe0a0', 4)); lamp.position.set(0, 0.52, -0.52); body.add(lamp);

  // jambes (pivot à la hanche) et bras (pivot à l'épaule)
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.16, 0.72, 0); g.add(hip);
    const lk = new Kit(), ladd = adder(lk);
    ladd(G.cap(0.12, 0.38, 4, 10), dark, [0, -0.3, 0]);
    ladd(G.sph(0.11, 10, 8), suit, [0, -0.3, 0.07], [0, 0, 0], [1, 0.9, 0.7]);                          // genouillère
    ladd(G.tor(0.12, 0.025, 4, 12), brass, [0, -0.5, 0], [H, 0, 0]);
    ladd(G.box(0.03, 0.4, 0.02), suit, [s * 0.1, -0.3, 0.1]);                                           // bande latérale
    ladd(G.rbox(0.25, 0.22, 0.38, 0.07), mat('#4a3020'), [0, -0.62, 0.05]);                             // botte
    ladd(G.rbox(0.26, 0.1, 0.18, 0.05), mat('#3a2418'), [0, -0.68, 0.17]);                              // bout renforcé
    ladd(G.box(0.27, 0.05, 0.42), MAT.iron(), [0, -0.74, 0.07]);                                        // semelle
    ladd(G.tor(0.13, 0.03, 4, 12), brass, [0, -0.52, 0.0], [H, 0, 0]);                                  // collier de cheville
    for (let i = 0; i < 3; i++) ladd(G.box(0.18, 0.02, 0.02), brass, [0, -0.58 + i * 0.04, 0.24], [0, 0, 0]); // lacets
    hip.add(lk.build()); legs.push(hip);
    const sh = new THREE.Group(); sh.position.set(s * 0.4, 1.33, 0); g.add(sh);
    const ak = new Kit(), aadd = adder(ak);
    aadd(G.cap(0.1, 0.42, 4, 10), suit, [0, -0.27, 0]);
    aadd(G.tor(0.11, 0.03, 4, 12), dark, [0, -0.42, 0], [H, 0, 0]);
    aadd(G.tor(0.115, 0.025, 4, 12), brass, [0, -0.08, 0], [H, 0, 0]);
    aadd(G.rbox(0.2, 0.2, 0.18, 0.06), dark, [0, -0.56, 0]);                                           // gant
    aadd(G.tor(0.11, 0.025, 4, 12), steel, [0, -0.5, 0], [H, 0, 0]);                                   // manchette
    for (let i = -1; i <= 1; i++) aadd(G.cap(0.026, 0.07, 3, 6), dark, [i * 0.055, -0.66, 0.02]);        // doigts
    aadd(G.cap(0.035, 0.08, 3, 6), dark, [s * -0.12, -0.6, 0.05], [0, 0, s * 0.6]);                      // pouce
    if (s > 0) { aadd(G.rbox(0.12, 0.08, 0.14, 0.02), glow('#5fe0ff', 1.2), [0.08, -0.35, 0.02]); aadd(G.rbox(0.14, 0.03, 0.16, 0.01), steel, [0.09, -0.31, 0.02]); }
    else { aadd(G.rbox(0.07, 0.14, 0.1, 0.02), mat('#c94a3a'), [-0.1, -0.2, 0.02]); }                  // écusson
    sh.add(ak.build()); arms.push(sh);
  }
  g.userData = { legs, arms, body };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ------------------------------------------------------------------ SHÉRIF-7 : robot-cowboy en laiton sur monocycle
export function buildSheriffModel() {
  const g = new THREE.Group();
  const brass = MAT.brass(), dark = mat('#2a1d12', { metalness: 0.4, roughness: 0.6 }), red = mat('#b3262b', { roughness: 0.7 }), leather = mat('#5a3a1e', { roughness: 0.8 });
  const leather2 = mat('#3c2512', { roughness: 0.85 }), copper = MAT.copper(), steel = mat('#8d949c', { metalness: 0.85, roughness: 0.3 }), gold = mat('#f2c85a', { metalness: 0.95, roughness: 0.2, emissive: '#6a4a00', emissiveIntensity: 0.4 });
  const eye = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffcc33', emissiveIntensity: 3 });
  const rivet = G.sph(0.03, 4, 3);

  // ---- monocycle
  const wheelG = new THREE.Group(); wheelG.position.y = 0.6; g.add(wheelG);
  const wk = new Kit(), wadd = adder(wk);
  wadd(G.tor(0.52, 0.12, 10, 28), dark, [0, 0, 0], [0, H, 0]);
  for (let i = 0; i < 20; i++) { const a = i / 20 * PI * 2; wadd(G.box(0.2, 0.05, 0.08), leather2, [0, Math.cos(a) * 0.62, Math.sin(a) * 0.62], [a, 0, 0]); }  // crampons du pneu
  wadd(G.tor(0.43, 0.025, 5, 28), brass, [0, 0, 0], [0, H, 0]);
  wadd(G.cyl(0.14, 0.14, 0.3, 14), brass, [0, 0, 0], [0, 0, H]);
  wadd(G.cyl(0.07, 0.07, 0.4, 10), steel, [0, 0, 0], [0, 0, H]);
  for (let i = 0; i < 12; i++) wadd(G.box(0.03, 0.82, 0.03), brass, [0.07, 0, 0], [i * PI / 6, 0, 0]);
  for (let i = 0; i < 12; i++) wadd(G.box(0.03, 0.82, 0.03), brass, [-0.07, 0, 0], [i * PI / 6 + PI / 12, 0, 0]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; wadd(rivet, gold, [0.17, Math.cos(a) * 0.1, Math.sin(a) * 0.1]); }
  wheelG.add(wk.build());
  // fourche, ressorts, pédales
  const k = new Kit(), add = adder(k);
  for (const s of [-1, 1]) {
    add(G.box(0.07, 0.75, 0.1), brass, [s * 0.2, 0.95, 0], [0, 0, -s * 0.12]);
    add(G.tube([[s * 0.22, 0.8, 0.07], [s * 0.1, 0.95, 0.07], [s * 0.2, 1.05, 0.07], [s * 0.1, 1.2, 0.07], [s * 0.2, 1.3, 0.07]], 0.02, 20, 4), steel);   // ressort de suspension
    add(G.cyl(0.05, 0.05, 0.12, 8), brass, [s * 0.22, 0.6, 0], [0, 0, H]);
    add(G.box(0.05, 0.05, 0.34), steel, [s * 0.3, 0.45, 0.12], [0.5, 0, 0]);
    add(G.rbox(0.14, 0.04, 0.2, 0.01), dark, [s * 0.34, 0.34, 0.26]);                      // pédale
  }
  add(G.cyl(0.05, 0.05, 0.5, 8), steel, [0, 1.3, 0], [0, 0, H]);
  // bassin / garde-boue
  add(G.lathe([[0.3, 0], [0.5, 0.15], [0.58, 0.55], [0.52, 0.95], [0.36, 1.1], [0, 1.12]], 28), brass, [0, 1.45, 0]);          // torse en tonneau
  for (const y of [1.75, 2.1, 2.45]) add(G.tor(0.57 - (y - 1.75) * 0.02, 0.03, 5, 28), copper, [0, y, 0], [H, 0, 0]);
  for (let i = 0; i < 18; i++) { const a = i / 18 * PI * 2; add(rivet, gold, [Math.sin(a) * 0.59, 1.75, Math.cos(a) * 0.59]); add(rivet, gold, [Math.sin(a) * 0.55, 2.45, Math.cos(a) * 0.55]); }
  add(G.rbox(0.5, 0.5, 0.06, 0.03), leather, [0, 2.0, 0.55]);                                 // gilet de cuir (plastron)
  add(G.rbox(0.38, 0.16, 0.05, 0.03), dark, [0, 2.3, 0.5]);                                   // plaque d'état civil
  for (const x of [-0.1, 0.1]) add(G.cyl(0.04, 0.04, 0.04, 8), glow('#ffcc33', 1.4), [x, 2.3, 0.54], [H, 0, 0]);
  // ceinturon + holsters + revolvers
  add(G.tor(0.56, 0.06, 6, 24), leather, [0, 1.62, 0], [H, 0, 0]);
  add(G.rbox(0.2, 0.16, 0.06, 0.03), gold, [0, 1.62, 0.57]);
  for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.22; add(G.cyl(0.025, 0.025, 0.12, 6), brass, [Math.sin(a + PI) * 0.57 * -1, 1.72, Math.cos(a) * 0.57], [0, 0, 0]); }   // cartouches
  for (const s of [-1, 1]) {
    add(G.cyl(0.08, 0.1, 0.4, 10), leather2, [s * 0.52, 1.42, 0.22], [0.15, 0, -s * 0.12]);
    add(G.box(0.07, 0.12, 0.3), steel, [s * 0.52, 1.66, 0.28], [0.3, 0, 0]);                  // crosse/canon
    add(G.cyl(0.035, 0.035, 0.35, 8), steel, [s * 0.52, 1.28, 0.34], [H + 0.1, 0, 0]);
    add(G.rbox(0.09, 0.16, 0.08, 0.03), leather, [s * 0.52, 1.75, 0.18], [-0.3, 0, 0]);
  }
  add(G.cyl(0.08, 0.1, 0.36, 10), leather, [-0.01, 1.5, -0.55]);                              // gourde dorsale
  add(G.box(0.1, 0.5, 0.1), copper, [0.3, 2.2, -0.45], [0, 0, 0]);                           // échappement
  for (const s of [-1, 1]) { add(G.cyl(0.07, 0.09, 0.5, 8), copper, [s * 0.3, 2.3, -0.5], [-0.15, 0, 0]); add(G.cyl(0.1, 0.07, 0.06, 8), brass, [s * 0.3, 2.57, -0.54], [-0.15, 0, 0]); }
  // foulard rouge noué
  add(G.tor(0.34, 0.1, 6, 20), red, [0, 2.45, 0.02], [H + 0.2, 0, 0]);
  add(G.cone(0.26, 0.42, 4), red, [0, 2.2, 0.3], [PI + 0.3, PI / 4, 0]);
  add(G.sph(0.1, 8, 6), red, [0.2, 2.42, 0.28]);
  // étoile de shérif
  const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2 + H, r = i % 2 ? 0.07 : 0.17; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) star.lineTo(x, y); else star.moveTo(x, y); }
  add(new THREE.ExtrudeGeometry(star, { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 }), gold, [0.26, 2.0, 0.56]);
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2 + H; add(G.sph(0.022, 5, 4), gold, [0.26 + Math.cos(a) * 0.17, 2.0 + Math.sin(a) * 0.17, 0.62]); }
  // tête : boîte arrondie, cadrans, mâchoire, moustache en guidon
  add(G.rbox(0.72, 0.56, 0.62, 0.12, 3), brass, [0, 2.85, 0]);
  add(G.rbox(0.56, 0.1, 0.5, 0.04), copper, [0, 2.52, 0.02]);                                 // menton
  add(G.rbox(0.62, 0.06, 0.58, 0.02), copper, [0, 3.1, 0]);
  for (const x of [-0.17, 0.17]) { add(G.cyl(0.14, 0.14, 0.07, 18), dark, [x, 2.92, 0.31], [H, 0, 0]); add(G.tor(0.14, 0.025, 5, 18), gold, [x, 2.92, 0.34]); }
  add(G.box(0.2, 0.025, 0.02), dark, [0, 2.9, 0.33]);                                           // pont de nez
  add(G.rbox(0.1, 0.16, 0.1, 0.03), brass, [0, 2.8, 0.34]);                                    // nez
  // moustache : deux boucles en tube
  for (const s of [-1, 1]) add(G.tube([[s * 0.02, 2.67, 0.35], [s * 0.15, 2.64, 0.37], [s * 0.3, 2.66, 0.34], [s * 0.4, 2.73, 0.3], [s * 0.38, 2.8, 0.3]], 0.03, 18, 5), dark);
  add(G.rbox(0.28, 0.08, 0.04, 0.01), dark, [0, 2.58, 0.3]);
  for (let i = -3; i <= 3; i++) add(G.box(0.012, 0.06, 0.02), brass, [i * 0.035, 2.58, 0.325]);   // grille de bouche
  for (const x of [-0.38, 0.38]) { add(G.cyl(0.1, 0.1, 0.1, 12), dark, [x, 2.85, 0], [0, 0, H]); add(G.cyl(0.06, 0.06, 0.04, 10), gold, [x * 1.14, 2.85, 0], [0, 0, H]); add(G.tor(0.08, 0.015, 4, 10), brass, [x * 1.1, 2.85, 0], [0, H, 0]); }
  for (const x of [-0.25, 0.25]) add(G.cyl(0.03, 0.03, 0.3, 6), copper, [x, 3.28, -0.1], [0, 0, 0]);   // cheminées de refroidissement
  add(G.cyl(0.015, 0.015, 0.4, 6), dark, [0.25, 3.25, -0.2]);
  g.add(k.build());
  const star2 = null; void star2;
  for (const x of [-0.17, 0.17]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.085, 16), eye); e.position.set(x, 2.92, 0.346); g.add(e); }
  const ant = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glow('#ff2a2a', 3)); ant.position.set(0.25, 3.47, -0.2); g.add(ant);
  // chapeau (pivot global : hat[0])
  const hatK = new Kit(), hadd = adder(hatK);
  hadd(G.lathe([[0.84, 0.0], [0.82, 0.05], [0.7, 0.1], [0.5, 0.07], [0.44, 0.1], [0.43, 0.42], [0.36, 0.52], [0.18, 0.46], [0, 0.4]], 28), leather);
  hadd(G.tor(0.44, 0.04, 6, 24), red, [0, 0.14, 0], [H, 0, 0]);
  hadd(G.tor(0.82, 0.03, 4, 28), leather2, [0, 0.03, 0], [H, 0, 0]);
  for (const s of [-1, 1]) hadd(G.cone(0.08, 0.2, 6), gold, [s * 0.42, 0.14, 0.12], [0, 0, -s * H]);
  hadd(G.rbox(0.18, 0.12, 0.04, 0.02), gold, [0, 0.14, 0.44]);
  const hat = hatK.build(); hat.position.y = 3.12; hat.rotation.z = 0.1; g.add(hat);
  // bras articulés (pivot épaule) : piston, coude, main à trois doigts
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.6, 2.25, 0); g.add(sh);
    const ak = new Kit(), aadd = adder(ak);
    aadd(G.sph(0.14, 12, 8), dark);
    aadd(G.tor(0.12, 0.025, 4, 12), brass, [0, 0, 0], [0, 0, H]);
    aadd(G.cyl(0.07, 0.07, 0.6, 8), brass, [0, -0.3, 0]);
    aadd(G.cyl(0.095, 0.095, 0.16, 10), copper, [0, -0.2, 0]); aadd(G.cyl(0.04, 0.04, 0.5, 6), steel, [s * 0.09, -0.35, 0.02]);
    aadd(G.sph(0.1, 10, 8), dark, [0, -0.6, 0]);
    aadd(G.tor(0.09, 0.03, 6, 12), dark, [0, -0.68, 0]);
    for (let i = -1; i <= 1; i++) aadd(G.cap(0.025, 0.1, 3, 6), brass, [i * 0.05, -0.8, 0.03], [0.2, 0, 0]);
    aadd(G.cap(0.03, 0.08, 3, 6), brass, [-s * 0.1, -0.76, 0.02], [0, 0, -s * 0.7]);
    sh.add(ak.build()); sh.rotation.z = s * 0.35; arms.push(sh);
  }
  g.userData = { arms, wheel: wheelG, eyeMat: eye, hat: [hat, hat] };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
