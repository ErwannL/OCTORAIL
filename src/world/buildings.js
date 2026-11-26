import * as THREE from 'three';
import { Kit, G, mat, MAT, glow } from './kit.js';

const PI = Math.PI, H = PI / 2;

// Bâtiments western de Poussière-sur-Rail. Façade vers +Z, largeur w (X), profondeur d (Z).
// kind : saloon | bank | sheriff | hotel | forge | station | store | barber
export function buildWesternBuilding(name, w, h, d, colors, textSprite, kind = 'saloon') {
  const k = new Kit();
  const [c1, c2, c3] = colors.map(c => mat(c, { roughness: 0.85 }));
  const trim = mat('#efe2c4', { roughness: 0.7 }), dark = MAT.woodDark(), iron = MAT.iron(), brass = MAT.brass();
  const plank = mat('#6b4a2b', { roughness: 0.9 }), stoneM = mat('#b8a888', { roughness: 0.95 }), brick = mat('#8a4a32', { roughness: 0.95 });
  const glass = glow('#ffcf7a', 0.9), glassDim = mat('#2a3a44', { roughness: 0.2, emissive: '#3b5566', emissiveIntensity: 0.3 });
  const F = d / 2; // plan de façade
  const masonry = kind === 'bank' || kind === 'station' || kind === 'forge';
  const body = kind === 'bank' ? stoneM : kind === 'forge' ? brick : c1;
  const fh = h + 2.2; // hauteur façade (fausse façade)

  // --- corps + planches / joints
  k.add(G.box(w, h, d), body, { p: [0, h / 2, 0] });
  if (!masonry || kind === 'station') for (let y = 0.4; y < h; y += 0.45) k.add(G.box(w + 0.04, 0.04, d + 0.04), c2, { p: [0, y, 0] });
  else for (let y = 0.3; y < h; y += 0.6) k.add(G.box(w + 0.04, 0.04, d + 0.04), mat('#5a4636'), { p: [0, y, 0] });
  // toit en pente légère + corniche arrière
  k.add(G.box(w + 0.3, 0.2, d + 0.5), dark, { p: [0, h + 0.1, 0] });
  k.add(G.box(w + 0.3, 0.14, d + 0.6), mat('#5a5048', { roughness: 0.9 }), { p: [0, h + 0.28, 0], r: [0.04, 0, 0] });
  // poteaux d'angle
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(G.box(0.3, h, 0.3), trim, { p: [sx * w / 2, h / 2, sz * d / 2] });

  // --- fausse façade selon le type
  const front = (zz) => zz + F;
  k.add(G.box(w + 0.6, fh, 0.3), kind === 'bank' ? stoneM : kind === 'forge' ? brick : c2, { p: [0, fh / 2, F + 0.1] });
  if (kind === 'saloon' || kind === 'barber') { // fronton festonné
    k.add(G.box(w * 0.5, 1.0, 0.34), c2, { p: [0, fh + 0.5, F + 0.1] });
    k.add(G.cyl(w * 0.25, w * 0.25, 0.34, 3 + 9, false), c2, { p: [0, fh + 1.0, F + 0.1], r: [H, 0, 0], s: [1, 1, 0.3] });
    k.add(G.box(0.5, 1.0, 0.34), trim, { p: [0, fh + 1.9, F + 0.1] });
  } else if (kind === 'bank' || kind === 'station') { // fronton triangulaire
    const tri = new THREE.Shape(); tri.moveTo(-w / 2 - 0.5, 0); tri.lineTo(w / 2 + 0.5, 0); tri.lineTo(0, 2.0); tri.lineTo(-w / 2 - 0.5, 0);
    k.add(new THREE.ExtrudeGeometry(tri, { depth: 0.4, bevelEnabled: false }), kind === 'bank' ? stoneM : c2, { p: [0, fh, F - 0.1] });
    k.add(G.cyl(0.55, 0.55, 0.1, 20), kind === 'bank' ? brass : trim, { p: [0, fh + 0.9, F + 0.34], r: [H, 0, 0] });
    if (kind === 'station') { k.add(G.cyl(0.5, 0.5, 0.08, 20), mat('#f6ecd2'), { p: [0, fh + 0.9, F + 0.4], r: [H, 0, 0] }); k.add(G.box(0.05, 0.38, 0.03), iron, { p: [0, fh + 1.0, F + 0.46] }); k.add(G.box(0.3, 0.05, 0.03), iron, { p: [0.12, fh + 0.9, F + 0.46] }); }
  } else if (kind === 'sheriff') { // marches + étoile
    k.add(G.box(w * 0.6, 0.7, 0.34), c2, { p: [0, fh + 0.35, F + 0.1] });
    k.add(G.box(w * 0.3, 0.7, 0.34), c2, { p: [0, fh + 1.05, F + 0.1] });
    const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.32 : 0.8, a = i / 10 * PI * 2 + H; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    k.add(new THREE.ExtrudeGeometry(star, { depth: 0.1, bevelEnabled: false }), brass, { p: [0, fh + 2.0, F + 0.3] });
  } else if (kind === 'hotel' || kind === 'store') { // fronton à gradins
    for (let i = 0; i < 3; i++) k.add(G.box(w * (0.8 - i * 0.25), 0.55, 0.34), c2, { p: [0, fh + 0.27 + i * 0.55, F + 0.1] });
  } else if (kind === 'forge') { // fronton plat + cheminée
    k.add(G.box(w * 0.4, 0.6, 0.34), brick, { p: [0, fh + 0.3, F + 0.1] });
  }
  k.add(G.box(w + 0.95, 0.3, 0.55), trim, { p: [0, fh, F + 0.13] });
  k.add(G.box(w + 0.75, 0.16, 0.42), trim, { p: [0, fh - 0.45, F + 0.15] });
  for (const s of [-1, 1]) k.add(G.box(0.26, fh, 0.42), trim, { p: [s * (w / 2 + 0.2), fh / 2, F + 0.15] });
  // modillons sous corniche
  for (let x = -w / 2; x <= w / 2; x += 0.9) k.add(G.box(0.2, 0.3, 0.3), dark, { p: [x, fh - 0.75, F + 0.25] });

  // --- porte
  const doorY = 1.2;
  if (kind === 'saloon') { // portes battantes
    for (const s of [-1, 1]) { k.add(G.box(0.62, 1.1, 0.06), dark, { p: [s * 0.34, 1.15, F + 0.3], r: [0, s * 0.35, 0] }); for (let i = 0; i < 4; i++) k.add(G.box(0.05, 1.0, 0.07), plank, { p: [s * 0.34 + (i - 1.5) * 0.14, 1.15, F + 0.31], r: [0, s * 0.35, 0] }); }
    k.add(G.box(1.5, 0.7, 0.1), glassDim, { p: [0, 1.1 + 1.0, F + 0.27] }); // imposte
    k.add(G.box(1.55, 0.1, 0.14), trim, { p: [0, 2.4, F + 0.3] });
  } else if (kind === 'bank') { // porte forte + grille
    k.add(G.box(1.6, 2.6, 0.1), iron, { p: [0, 1.3, F + 0.27] });
    for (let i = -3; i <= 3; i++) k.add(G.box(0.05, 2.4, 0.06), brass, { p: [i * 0.2, 1.3, F + 0.36] });
    k.add(G.cyl(0.22, 0.22, 0.08, 14), brass, { p: [0.5, 1.2, F + 0.4], r: [H, 0, 0] });
  } else {
    k.add(G.box(1.3, 2.3, 0.1), dark, { p: [0, doorY, F + 0.27] });
    k.add(G.box(0.9, 0.9, 0.04), glass, { p: [0, 1.6, F + 0.33] });
    k.add(G.box(0.05, 0.9, 0.05), trim, { p: [0, 1.6, F + 0.36] }); k.add(G.box(0.9, 0.05, 0.05), trim, { p: [0, 1.6, F + 0.36] });
    k.add(G.sph(0.07, 6, 5), brass, { p: [0.45, 1.1, F + 0.36] });
    k.add(G.box(1.5, 0.15, 0.15), trim, { p: [0, 2.4, F + 0.3] });
  }

  // --- fenêtres rez + étage
  for (const s of [-1, 1]) {
    const x = s * Math.min(w / 2 - 1.2, 2.4);
    const barred = kind === 'sheriff' || kind === 'bank';
    k.add(G.box(1.2, 1.3, 0.06), glass, { p: [x, 1.6, F + 0.27] });
    k.add(G.box(1.4, 0.12, 0.12), trim, { p: [x, 2.3, F + 0.3] }); k.add(G.box(1.45, 0.12, 0.22), trim, { p: [x, 0.9, F + 0.32] });
    k.add(G.box(0.07, 1.3, 0.1), trim, { p: [x, 1.6, F + 0.3] }); k.add(G.box(1.2, 0.07, 0.1), trim, { p: [x, 1.6, F + 0.3] });
    if (barred) for (let i = -2; i <= 2; i++) k.add(G.cyl(0.025, 0.025, 1.3, 5), iron, { p: [x + i * 0.22, 1.6, F + 0.38] });
    else { k.add(G.box(0.4, 1.4, 0.06), c3, { p: [x - 0.85, 1.6, F + 0.3], r: [0, 0.4, 0] }); k.add(G.box(0.4, 1.4, 0.06), c3, { p: [x + 0.85, 1.6, F + 0.3], r: [0, -0.4, 0] }); }
    // jardinière
    if (kind === 'hotel' || kind === 'store' || kind === 'barber') { k.add(G.box(1.3, 0.22, 0.28), plank, { p: [x, 0.95, F + 0.45] }); for (let f = 0; f < 4; f++) k.add(G.sph(0.11, 6, 5), mat(['#e05a7a', '#ffd24a', '#ff8a5a', '#f6e0ff'][f]), { p: [x - 0.45 + f * 0.3, 1.15, F + 0.45] }); }
    // étage
    if (kind !== 'forge') {
      k.add(G.box(1.0, 1.1, 0.06), glow('#ffd88a', 0.5), { p: [x, h - 1.1, F + 0.27] });
      k.add(G.box(1.2, 1.3, 0.05), trim, { p: [x, h - 1.1, F + 0.25] });
      k.add(G.box(0.07, 1.1, 0.07), trim, { p: [x, h - 1.1, F + 0.31] });
      k.add(G.box(1.3, 0.14, 0.2), trim, { p: [x, h - 0.42, F + 0.32] });
    }
  }
  if ((kind === 'hotel' || kind === 'saloon') && w > 8.5) { k.add(G.box(1.0, 1.1, 0.06), glow('#ffd88a', 0.5), { p: [0, h - 1.1, F + 0.27] }); k.add(G.box(1.2, 1.3, 0.05), trim, { p: [0, h - 1.1, F + 0.25] }); }
  // fenêtres latérales (flancs)
  for (const sx of [-1, 1]) for (const z of [-d * 0.28, d * 0.12]) { k.add(G.box(0.05, 1.1, 0.9), glassDim, { p: [sx * (w / 2 + 0.02), 2.0, z] }); k.add(G.box(0.08, 0.1, 1.1), trim, { p: [sx * (w / 2 + 0.03), 1.4, z] }); }

  // --- trottoir en planches + auvent / balcon
  k.add(G.box(w + 0.8, 0.2, 3.1), plank, { p: [0, 0.1, F + 1.55] });
  for (let x = -w / 2 - 0.3; x < w / 2 + 0.4; x += 0.5) k.add(G.box(0.03, 0.02, 3.1), dark, { p: [x, 0.21, F + 1.55] });
  for (const x of [-w / 2 - 0.2, w / 2 + 0.2]) k.add(G.box(0.8, 0.12, 0.8), plank, { p: [x * 0.8 + (x > 0 ? 0.5 : -0.5), 0.0, F + 3.0] });
  const posts = [-w / 2, -w / 6, w / 6, w / 2];
  if (kind === 'saloon' || kind === 'hotel') {
    // balcon à l'étage, avec rambarde balustres
    const by = 3.4;
    k.add(G.box(w + 0.6, 0.14, 2.9), dark, { p: [0, by, F + 1.5] });
    for (const x of posts) k.add(G.box(0.2, by, 0.2), dark, { p: [x, by / 2 + 0.2, F + 2.85] });
    for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.45) k.add(G.cyl(0.04, 0.04, 0.9, 5), trim, { p: [x, by + 0.55, F + 2.85] });
    k.add(G.box(w + 0.6, 0.1, 0.14), trim, { p: [0, by + 1.05, F + 2.85] });
    for (const sx of [-1, 1]) { k.add(G.box(0.1, 0.1, 2.9), trim, { p: [sx * (w / 2 + 0.25), by + 1.05, F + 1.5] }); for (let z = 0; z < 2.9; z += 0.5) k.add(G.cyl(0.04, 0.04, 0.9, 5), trim, { p: [sx * (w / 2 + 0.25), by + 0.55, F + 0.1 + z] }); }
    // porte-fenêtre de balcon
    k.add(G.box(1.1, 1.9, 0.06), glassDim, { p: [0, by + 1.1, F + 0.27] });
    if (kind === 'hotel') k.add(G.box(w + 0.6, 0.12, 3.4), c3, { p: [0, by + 2.6, F + 1.6], r: [0.2, 0, 0] });
    else for (const x of posts) k.add(G.box(0.16, 1.9, 0.16), dark, { p: [x, by + 1.0, F + 2.85] });
  } else {
    // simple auvent incliné avec poteaux et tirants
    k.add(G.box(w + 0.7, 0.12, 2.8), kind === 'store' || kind === 'barber' ? c3 : dark, { p: [0, 3.2, F + 1.55], r: [0.13, 0, 0] });
    if (kind === 'store' || kind === 'barber') for (let x = -w / 2; x < w / 2; x += 0.8) k.add(G.box(0.4, 0.05, 2.82), x % 1.6 < 0.8 ? trim : c3, { p: [x + 0.4, 3.21, F + 1.55], r: [0.13, 0, 0] });
    for (const x of posts) { k.add(G.box(0.16, 3.1, 0.16), dark, { p: [x, 1.7, F + 2.9] }); k.add(G.box(0.1, 0.1, 0.9), dark, { p: [x, 3.0, F + 2.5], r: [0.8, 0, 0] }); }
  }
  // lanternes
  for (const x of [-w * 0.3, w * 0.3]) { k.add(G.cyl(0.015, 0.015, 0.4, 4), iron, { p: [x, 3.05, F + 2.6] }); k.add(G.box(0.2, 0.3, 0.2), iron, { p: [x, 2.7, F + 2.6] }); k.add(G.box(0.13, 0.2, 0.13), glow('#ffcf7a', 3), { p: [x, 2.7, F + 2.6] }); }

  // --- accessoires sur le trottoir et devant
  const barrel = (x, z, s = 1) => { k.add(G.lathe([[0.32 * s, 0], [0.4 * s, 0.4 * s], [0.32 * s, 0.85 * s], [0, 0.85 * s]], 12), mat('#6b4426'), { p: [x, 0.2, z] }); for (const y of [0.15, 0.55]) k.add(G.tor(0.37 * s, 0.025, 4, 12), iron, { p: [x, 0.2 + y * s, z], r: [H, 0, 0] }); };
  const crate = (x, z, s = 0.7, ry = 0) => { k.add(G.box(s, s, s), mat('#a07a48', { roughness: 0.9 }), { p: [x, 0.2 + s / 2, z], r: [0, ry, 0] }); k.add(G.box(s + 0.03, 0.06, s + 0.03), dark, { p: [x, 0.25 + s / 2, z], r: [0, ry, 0] }); };
  const hitch = (x, z) => { for (const dx of [-0.9, 0.9]) k.add(G.box(0.12, 1.1, 0.12), dark, { p: [x + dx, 0.55, z] }); k.add(G.cyl(0.05, 0.05, 2.0, 6), dark, { p: [x, 1.0, z], r: [0, 0, H] }); };
  const trough = (x, z) => { k.add(G.box(1.8, 0.5, 0.55), dark, { p: [x, 0.25, z] }); k.add(G.box(1.6, 0.05, 0.4), mat('#3a7a9a', { roughness: 0.2, metalness: 0.2 }), { p: [x, 0.5, z] }); };
  const bench = (x, z) => { k.add(G.box(1.8, 0.08, 0.5), plank, { p: [x, 0.65, z] }); k.add(G.box(1.8, 0.5, 0.06), plank, { p: [x, 0.95, z - 0.25] }); for (const dx of [-0.8, 0.8]) k.add(G.box(0.08, 0.45, 0.4), dark, { p: [x + dx, 0.42, z] }); };
  const sack = (x, z, c = '#c8b27a') => { k.add(G.sph(0.32, 8, 6), mat(c, { roughness: 1 }), { p: [x, 0.42, z], s: [1, 0.8, 0.8] }); };

  hitch(-w * 0.2, F + 4.3); hitch(w * 0.28, F + 4.3);
  barrel(-w / 2 + 0.5, F + 2.4); barrel(-w / 2 + 1.1, F + 2.6, 0.85);
  bench(w / 2 - 1.2, F + 0.8);
  switch (kind) {
    case 'saloon': // piano mécanique visible, tonneau, fût
      barrel(w / 2 - 0.5, F + 2.6, 1.1); trough(-w * 0.2, F + 5.0); break;
    case 'bank':
      for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) for (let i = 0; i < 2; i++) k.add(G.cyl(0.35, 0.4, fh - 0.8, 14), stoneM, { p: [x * (i ? 0.45 : 1), (fh - 0.8) / 2 + 0.3, F + 0.45] });
      crate(w / 2 - 0.7, F + 2.2, 0.6); k.add(G.box(0.7, 0.45, 0.5), iron, { p: [-w / 2 + 1.6, 0.45, F + 1.3] }); break;
    case 'sheriff':
      k.add(G.box(0.1, 1.4, 0.1), dark, { p: [w / 2 - 0.5, 0.9, F + 2.0] }); k.add(G.box(0.5, 0.7, 0.04), mat('#efe2c4'), { p: [w / 2 - 0.5, 1.2, F + 2.06] }); // avis de recherche
      trough(w * 0.2, F + 5.0); break;
    case 'hotel':
      for (const x of [-w * 0.2, w * 0.2]) { k.add(G.box(1.1, 0.5, 0.7), mat('#7a2a2a'), { p: [x, 0.5, F + 1.7] }); } // malles
      k.add(G.box(1.2, 0.2, 0.7), mat('#e9d9b4'), { p: [-w * 0.2, 0.9, F + 1.7] }); break;
    case 'forge':
      // grande cheminée en briques + lueur, enclume, soufflet
      k.add(G.box(1.8, h + 4.5, 1.8), brick, { p: [w / 2 - 1.3, (h + 4.5) / 2, -d / 2 + 1.4] });
      k.add(G.box(2.1, 0.3, 2.1), stoneM, { p: [w / 2 - 1.3, h + 4.6, -d / 2 + 1.4] });
      k.add(G.box(0.8, 0.7, 0.05), glow('#ff5a00', 3), { p: [w / 2 + 0.05, 1.2, F - 1.0], r: [0, H, 0] }); // âtre vu de l'ouverture
      k.add(G.box(1.2, 0.7, 0.9), iron, { p: [-w / 2 + 1.0, 0.6, F + 1.2] }); k.add(G.box(0.4, 0.3, 1.5), iron, { p: [-w / 2 + 1.0, 1.05, F + 1.2] }); k.add(G.cone(0.2, 0.7, 6), iron, { p: [-w / 2 + 1.0, 1.1, F + 2.05], r: [H, 0, 0] });
      k.add(G.cyl(0.55, 0.55, 0.12, 14), dark, { p: [w / 2 - 1.0, 0.8, F + 1.3], r: [H, 0, 0] }); // roue
      for (const dz of [0.18, 0.5, 0.8]) crate(w / 2 - 2.2 - dz * 0.0, F + 1.7 + dz * 0.0, 0.0);
      trough(-w * 0.15, F + 4.8); k.add(G.cyl(0.3, 0.3, 0.9, 10), iron, { p: [w * 0.15, 0.65, F + 2.2] }); break;
    case 'station':
      k.add(G.box(w + 0.4, 0.1, 3.4), plank, { p: [0, 0.35, F + 1.4] });
      for (let i = 0; i < 3; i++) crate(w / 2 - 1.0 - i * 0.2, F + 1.2 + i * 0.5, 0.55 + i * 0.1, i);
      k.add(G.rbox(0.7, 0.5, 0.35, 0.06), mat('#7a4a2a'), { p: [-w / 2 + 1.2, 0.55, F + 1.4] });
      k.add(G.cyl(0.04, 0.04, 2.0, 5), iron, { p: [-w / 2 + 2.2, 1.2, F + 2.0] }); break;
    case 'store':
      crate(-w / 2 + 1.0, F + 1.6, 0.7); crate(-w / 2 + 1.1, F + 1.6 - 0.05, 0.55, 0.5); sack(w / 2 - 0.8, F + 1.5); sack(w / 2 - 1.3, F + 1.9, '#b8a46a'); sack(w / 2 - 0.9, F + 2.3, '#d8c48a');
      for (let i = 0; i < 6; i++) k.add(G.sph(0.14, 6, 5), mat(['#c83a2a', '#e0a02a', '#6aa23a'][i % 3]), { p: [-w * 0.1 + (i % 3) * 0.28, 0.62 + Math.floor(i / 3) * 0.2, F + 2.2] });
      k.add(G.box(1.0, 0.45, 0.8), plank, { p: [-w * 0.1 + 0.28, 0.4, F + 2.2] }); break;
    case 'barber': {
      // enseigne tournante : poteau à bandes rouges/blanches
      const bx = w / 2 - 0.4, bz = F + 3.0;
      k.add(G.cyl(0.2, 0.2, 0.15, 12), brass, { p: [bx, 0.9, bz] }); k.add(G.cyl(0.2, 0.2, 0.15, 12), brass, { p: [bx, 2.3, bz] });
      for (let i = 0; i < 8; i++) k.add(G.cyl(0.17, 0.17, 0.17, 12), i % 2 ? mat('#f2f0ea') : mat('#c42a2a'), { p: [bx, 1.0 + i * 0.16, bz] });
      k.add(G.sph(0.2, 10, 8), brass, { p: [bx, 2.5, bz] });
      crate(-w / 2 + 1.2, F + 1.5, 0.5); trough(-w * 0.2, F + 5.0); break; }
  }
  // enseigne suspendue perpendiculaire (sur potence)
  k.add(G.box(0.1, 0.1, 1.2), iron, { p: [-w / 2 - 0.45, 2.9, F + 0.9] }); k.add(G.box(0.05, 0.5, 0.9), trim, { p: [-w / 2 - 0.45, 2.45, F + 1.0] });
  // cheminée / évents sur le toit
  if (kind !== 'forge') { k.add(G.box(0.9, 1.8, 0.9), brick, { p: [-w / 4, h + 0.9, -d / 4] }); k.add(G.box(1.1, 0.14, 1.1), stoneM, { p: [-w / 4, h + 1.8, -d / 4] }); }
  if (kind === 'station') { k.add(G.cyl(0.04, 0.04, 2.4, 5), iron, { p: [w / 3, h + 1.2, 0] }); k.add(G.box(0.7, 0.3, 0.04), mat('#9c1f1f'), { p: [w / 3 + 0.36, h + 2.1, 0] }); }
  if (kind === 'hotel' || kind === 'sheriff') k.add(G.cyl(0.25, 0.3, 0.7, 8), mat('#6b4426'), { p: [w / 3, h + 0.6, -d / 4] }); // réservoir d'eau
  // sacs, caisses côté (arrière)
  barrel(w / 2 + 0.7, -d / 2 + 1.0); barrel(w / 2 + 0.7, -d / 2 + 1.7, 0.9);

  const grp = k.build();
  // enseigne : panneau en relief au-dessus de l'auvent
  const tex = textSprite(name, { w: 512, h: 128, bg: '#3a2412', fg: '#f3d9a0', border: '#d9a35a', font: 'bold 70px Georgia' });
  const sw = w * 0.8, sh = w * 0.2;
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: tex }));
  sg.position.set(0, fh - 1.35 - (kind === 'sheriff' ? 0 : 0.0), F + 0.35); grp.add(sg);
  const fk = new Kit(); fk.add(G.box(sw + 0.3, 0.12, 0.2), trim, { p: [0, fh - 1.35 + sh / 2 + 0.06, F + 0.33] }); fk.add(G.box(sw + 0.3, 0.12, 0.2), trim, { p: [0, fh - 1.35 - sh / 2 - 0.06, F + 0.33] });
  for (const s of [-1, 1]) fk.add(G.box(0.12, sh + 0.24, 0.2), trim, { p: [s * (sw / 2 + 0.09), fh - 1.35, F + 0.33] });
  grp.add(fk.build());
  return grp;
}
