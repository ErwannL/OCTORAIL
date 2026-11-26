import * as THREE from 'three';
import { Kit, G, mat, MAT, glow } from './kit.js';
import { textSprite } from './tracks.js';
import { mulberry } from '../util/noise.js';

// Bâtiments « endormis » du Moyeu : ce qui se réveillera avec les prochains gardiens.
// Bâchés, en ruine, couverts de toiles d'araignée… mais on voit qu'il y aura de la vie.
const PI = Math.PI, H = PI / 2;

// Drap posé sur une forme : plan subdivisé qui retombe sur la boîte (hx, h, hz) avec des plis
function drapeGeometry(hx, h, hz, seed) {
  const r = mulberry(seed), W = hx * 2 + 3, D = hz * 2 + 3;
  const geo = new THREE.PlaneGeometry(W, D, 28, 28); geo.rotateX(-H);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const ox = Math.max(0, Math.abs(x) - hx), oz = Math.max(0, Math.abs(z) - hz), out = Math.hypot(ox, oz);
    let y = h - out * 2.6 + Math.sin(x * 2.1 + seed) * 0.08 + Math.cos(z * 1.7 + seed) * 0.08;
    if (out > 0) y += Math.sin((x + z) * 3.3 + seed) * 0.15 * Math.min(1, out); // plis qui tombent
    y = Math.max(0.05 + r() * 0.04, y);
    // le bas du drap s'évase un peu
    const k = out > 0 ? 1 + Math.min(0.25, (h - y) * 0.06) : 1;
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// Toile d'araignée (traits fins sur un quart de disque), posée dans un coin
function cobweb(size = 1.2) {
  const pts = [], N = 7, R = 6;
  for (let i = 0; i <= N; i++) { const a = (i / N) * H; pts.push(0, 0, 0, Math.cos(a) * size, Math.sin(a) * size, 0); }
  for (let j = 1; j <= R; j++) { const rr = size * j / R; for (let i = 0; i < N; i++) { const a0 = (i / N) * H, a1 = ((i + 1) / N) * H, sag = 0.92; const m = (a0 + a1) / 2; pts.push(Math.cos(a0) * rr, Math.sin(a0) * rr, 0, Math.cos(m) * rr * sag, Math.sin(m) * rr * sag, 0, Math.cos(m) * rr * sag, Math.sin(m) * rr * sag, 0, Math.cos(a1) * rr, Math.sin(a1) * rr, 0); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#e8e4dc', transparent: true, opacity: 0.55 }));
  l.userData.noCollide = true; return l;
}

function plaque(title, sub) {
  const tex = textSprite([title, sub, 'se réveillera avec un gardien'], { w: 640, h: 256, bg: '#2a1f17', fg: '#e8d2a4', border: '#7a5a30', font: 'bold 52px Georgia' });
  const grp = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.3), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  board.position.y = 1.55; grp.add(board);
  const k = new Kit(); k.add(G.box(3.4, 1.45, 0.1), MAT.woodDark(), { p: [0, 1.55, -0.07] }); for (const x of [-1.5, 1.5]) k.add(G.box(0.12, 2.3, 0.12), MAT.woodDark(), { p: [x, 1.1, -0.1] });
  k.add(G.box(1.9, 0.12, 0.12), mat('#8a3a2a'), { p: [0, 1.6, 0.05], r: [0, 0, 0.35] }); // planche clouée en travers : « fermé »
  grp.add(k.build());
  const w = cobweb(0.7); w.position.set(-1.6, 2.25, 0.02); w.rotation.z = -H; grp.add(w);
  return grp;
}

export function buildDormant(scene, interact) {
  const out = [];
  const canvas = mat('#cdbf9f', { roughness: 0.95, side: THREE.DoubleSide }), canvas2 = mat('#a89878', { roughness: 0.95, side: THREE.DoubleSide });
  const place = (angle, r, build, name, sub) => {
    const g = new THREE.Group(); build(g);
    const x = Math.cos(angle) * r, z = -Math.sin(angle) * r;
    g.position.set(x, 0.25, z); g.rotation.y = angle - H; scene.add(g);
    const pl = plaque(name, sub); pl.position.set(0, 0, 5.2); g.add(pl);
    g.updateMatrixWorld(true);
    interact.add({ id: 'dormant', pos: g.localToWorld(new THREE.Vector3(0, 0, 6.2)), r: 4, label: `[E] Examiner : ${name} — endormi`, info: sub });
    out.push(g);
  };

  // 1) Atelier des wagons : grande forme bâchée, cordes, caisses scellées
  place(PI * 0.12, 31, g => {
    const k = new Kit();
    k.add(G.box(7.6, 0.3, 5.6), MAT.woodDark(), { p: [0, 0.15, 0] });
    for (const [x, z] of [[-3.4, -2.4], [3.4, -2.4], [-3.4, 2.4], [3.4, 2.4]]) k.add(G.cyl(0.14, 0.14, 0.5, 8), MAT.iron(), { p: [x, 0.35, z] });
    for (let i = 0; i < 4; i++) k.add(G.cyl(0.03, 0.03, 9, 5), mat('#7a6a4a'), { p: [-2.4 + i * 1.6, 2.6, 0], r: [H, 0, 0], s: [1, 1, 1] }); // cordes
    for (const [x, z, s] of [[5.2, 1.5, 1], [5.4, -0.6, 0.8], [-5.3, 2.0, 0.9]]) { k.add(G.rbox(1.2 * s, 1.0 * s, 1.0 * s, 0.05), mat('#8a6a42'), { p: [x, 0.5 * s, z] }); k.add(G.box(1.25 * s, 0.08, 0.08), MAT.iron(), { p: [x, 0.75 * s, z + 0.5 * s] }); }
    g.add(k.build());
    const drape = new THREE.Mesh(drapeGeometry(3.6, 3.4, 2.4, 3), canvas); drape.castShadow = true; drape.receiveShadow = true; g.add(drape);
    // une roue dépasse du drap : c'est bien un wagon
    const wh = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 8, 20), MAT.iron()); wh.position.set(3.75, 0.6, 1.2); wh.rotation.y = H; g.add(wh);
  }, 'ATELIER DES WAGONS', 'Construire de nouveaux wagons');

  // 2) Observatoire du réseau : coupole effondrée, échafaudage, lunette tombée
  place(PI * 1.42, 32, g => {
    const k = new Kit(), stone = mat('#9a8b74', { roughness: 0.95 });
    k.add(G.cyl(3.6, 3.9, 2.2, 16), stone, { p: [0, 1.1, 0] });
    for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; if (i === 2 || i === 3) continue; k.add(G.tor(3.5, 0.12, 6, 20, PI * (0.25 + (i % 3) * 0.12)), MAT.brass(), { p: [0, 2.2, 0], r: [0, a, 0] }); }
    k.add(G.cyl(0.35, 0.5, 3.6, 12), MAT.brass(), { p: [2.0, 1.0, 3.2], r: [0, 0.3, 1.35] }); // lunette tombée
    for (let i = 0; i < 10; i++) k.add(G.rbox(0.6 + (i % 3) * 0.3, 0.4, 0.6, 0.06), stone, { p: [-2 + (i % 5) * 1.0, 0.25 + Math.floor(i / 5) * 0.4, 4.2 - (i % 2)], r: [0, i, 0.1 * i] }); // gravats
    // échafaudage
    for (const x of [-4.2, -2.4]) for (const z of [-1.5, 1.5]) k.add(G.cyl(0.06, 0.06, 4.6, 6), MAT.wood(), { p: [x, 2.3, z] });
    for (const y of [1.5, 3.0, 4.4]) { k.add(G.box(2.0, 0.08, 0.3), MAT.wood(), { p: [-3.3, y, -1.5] }); k.add(G.box(2.0, 0.08, 0.3), MAT.wood(), { p: [-3.3, y, 1.5] }); k.add(G.box(0.3, 0.06, 3.2), MAT.wood(), { p: [-3.3, y + 0.05, 0] }); }
    g.add(k.build());
    const tarp = new THREE.Mesh(drapeGeometry(1.6, 2.6, 1.6, 7), canvas2); tarp.position.set(0.6, 0, -0.8); tarp.scale.setScalar(0.9); g.add(tarp);
    const w1 = cobweb(1.4); w1.position.set(-4.2, 4.4, -1.5); w1.rotation.set(0, H, -H); g.add(w1);
  }, 'OBSERVATOIRE', 'Voir les 8 mondes et leurs phénomènes');

  // 3) Serre des Bâtisseurs : verrière poussiéreuse, plantes mortes, toiles d'araignée
  place(PI * 1.68, 31, g => {
    const k = new Kit(), frame = MAT.iron(), dusty = mat('#8f9a8a', { roughness: 0.6, metalness: 0.2 });
    k.add(G.box(6.6, 0.4, 4.4), mat('#7d6c56'), { p: [0, 0.2, 0] });
    for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) { k.add(G.box(0.12, 2.6, 0.12), frame, { p: [x, 1.7, -2.1] }); k.add(G.box(0.12, 2.6, 0.12), frame, { p: [x, 1.7, 2.1] }); k.add(G.tor(2.1, 0.06, 4, 16, PI), frame, { p: [x, 3.0, 0], r: [0, H, 0] }); }
    // vitres sales (opaques) — deux carreaux cassés
    for (let i = 0; i < 4; i++) for (const z of [-2.1, 2.1]) { if (i === 1 && z > 0) continue; k.add(G.box(1.5, 2.4, 0.04), dusty, { p: [-2.4 + i * 1.6, 1.7, z] }); }
    for (let i = 0; i < 6; i++) { k.add(G.cyl(0.35, 0.28, 0.5, 8), mat('#8a5a3a'), { p: [-2.4 + i * 0.95, 0.65, (i % 2) - 0.5] }); k.add(G.cyl(0.02, 0.03, 1.1, 4), mat('#6a5a3a'), { p: [-2.4 + i * 0.95, 1.4, (i % 2) - 0.5], r: [0.4 - (i % 3) * 0.3, 0, 0.5] }); } // plantes mortes
    g.add(k.build());
    for (const [x, y, z, ry] of [[-3.15, 2.9, 2.0, 0], [3.15, 2.9, -2.0, PI], [0, 3.0, 2.05, 0]]) { const w = cobweb(1.1); w.position.set(x, y, z); w.rotation.set(0, ry, -H); g.add(w); }
  }, 'SERRE DES BÂTISSEURS', 'Faire pousser de quoi nourrir l\'équipage');

  // 4) Relais des gardiens : 8 niches vides sous des draps (une par robot)
  place(PI * 1.92, 31, g => {
    const k = new Kit(), stone = mat('#a8977c', { roughness: 0.95 });
    k.add(G.box(9, 0.5, 3), stone, { p: [0, 0.25, -0.6] });
    k.add(G.box(9.4, 3.6, 0.5), stone, { p: [0, 2.0, -1.9] });
    for (let i = 0; i < 8; i++) { const x = -3.9 + i * 1.12; k.add(G.box(0.95, 2.2, 0.3), mat('#5a4a38'), { p: [x, 1.6, -1.7] }); k.add(G.cyl(0.3, 0.36, 0.7, 10), MAT.brass(), { p: [x, 0.85, -0.6] }); }
    g.add(k.build());
    for (let i = 0; i < 8; i++) { if (i === 4) continue; const d = new THREE.Mesh(drapeGeometry(0.25, 1.9, 0.25, 11 + i), i % 2 ? canvas : canvas2); d.position.set(-3.9 + i * 1.12, 0.5, -0.6); d.scale.set(0.55, 0.65, 0.55); g.add(d); }
    // la niche de Poussière-sur-Rail (Shérif-7) est découverte : une étoile y brille déjà
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), glow('#ffd24a', 2)); star.position.set(-3.9 + 4 * 1.12, 1.7, -0.5); g.add(star);
    const w = cobweb(1.2); w.position.set(4.6, 3.7, -1.6); w.rotation.set(0, 0, PI); g.add(w);
  }, 'RELAIS DES GARDIENS', 'Les 8 robots y retrouveront leur place');

  return out;
}
